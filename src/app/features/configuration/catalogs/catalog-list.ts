import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../../core/http/problem';
import { InfiniteScrollSentinel } from '../../../shared/infinite-scroll/infinite-scroll-sentinel';
import { ConfigurationApi } from '../configuration-api';
import {
  ConfigurationItem,
  ConfigurationStatus,
  ResourceDescriptor,
  descriptorFor,
  INSTITUTION_TYPES,
  RESOURCES,
} from '../configuration.models';

/**
 * Search and browse one configuration resource: catalogs, batches, or a geography level. Cursor loading, a status
 * filter that defaults to active records, and a clear loading, empty, error, and inactive state. The service
 * authorizes every request; this screen only presents what it returns.
 */
@Component({
  selector: 'app-catalog-list',
  imports: [ReactiveFormsModule, RouterLink, InfiniteScrollSentinel],
  templateUrl: './catalog-list.html',
})
export class CatalogList {
  private readonly api = inject(ConfigurationApi);
  private readonly router = inject(Router);

  /** Bound from the route. */
  readonly resource = input.required<string>();

  protected readonly descriptor = computed(() => descriptorFor(this.resource()));

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly status = new FormControl<ConfigurationStatus>('active', { nonNullable: true });
  protected readonly division = new FormControl('', { nonNullable: true });
  protected readonly district = new FormControl('', { nonNullable: true });
  protected readonly degree = new FormControl('', { nonNullable: true });
  protected readonly type = new FormControl('', { nonNullable: true });

  protected readonly items = signal<ConfigurationItem[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly hasMore = signal(false);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly filtered = signal(false);

  /** Names of the records this list refers to, by resource slug then identifier. */
  protected readonly names = signal<Record<string, Record<string, string>>>({});
  protected readonly divisions = signal<ConfigurationItem[]>([]);
  protected readonly districts = signal<ConfigurationItem[]>([]);
  protected readonly degrees = signal<ConfigurationItem[]>([]);

  /** The type filter's choices, for a resource that has a type. */
  protected readonly types = computed<readonly string[]>(() => this.descriptor()?.typeOptions ?? INSTITUTION_TYPES);

  protected readonly columns = computed(() => {
    const descriptor = this.descriptor();
    return {
      code: !!descriptor?.hasCode,
      /** A required code identifies the record, so it is the first column and the link to it. */
      codeFirst: !!descriptor?.codeRequired,
      type: !!descriptor?.hasType,
      credits: !!descriptor?.isCourse,
      references: descriptor?.references ?? [],
    };
  });

  constructor() {
    this.notice.set((this.router.getCurrentNavigation()?.extras.state?.['notice'] as string | undefined) ?? null);
    effect(() => {
      const descriptor = this.descriptor();
      if (descriptor) {
        untracked(() => void this.reset(descriptor));
      }
    });
  }

  protected nameOf(slug: string, id: string | undefined): string {
    return id ? (this.names()[slug]?.[id] ?? 'Unknown') : '';
  }

  protected referenceId(item: ConfigurationItem, name: string): string | undefined {
    return (item as unknown as Record<string, string | undefined>)[name];
  }

  /** A course's credit hours with its theory and lab split when given, for example "3 (2 theory + 1 lab)". */
  protected credits(item: ConfigurationItem): string {
    if (item.creditHours === undefined) {
      return '';
    }
    const parts = [
      item.theoryCreditHours !== undefined ? `${item.theoryCreditHours} theory` : '',
      item.labCreditHours !== undefined ? `${item.labCreditHours} lab` : '',
    ].filter(Boolean);
    return parts.length > 0 ? `${item.creditHours} (${parts.join(' + ')})` : `${item.creditHours}`;
  }

  protected applyFilters(): void {
    this.cursor.set(null);
    this.hasMore.set(false);
    void this.load(false);
  }

  protected clearFilters(): void {
    this.search.setValue('');
    this.status.setValue('active');
    this.division.setValue('');
    this.district.setValue('');
    this.degree.setValue('');
    this.type.setValue('');
    this.districts.set([]);
    this.applyFilters();
  }

  protected async divisionChanged(): Promise<void> {
    this.district.setValue('');
    const descriptor = this.descriptor();
    const parent = this.division.value;
    if (descriptor?.cascadeFrom) {
      const districts = RESOURCES.find((resource) => resource.slug === 'districts')!;
      this.districts.set(parent ? await this.api.listAll(districts, 'all', parent) : []);
    }
    this.applyFilters();
  }

  protected loadMore(): void {
    if (!this.loading() && this.cursor()) {
      void this.load(true);
    }
  }

  protected retryMore(): void {
    this.errorMessage.set(null);
    this.loadMore();
  }

  protected reload(): void {
    void this.load();
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  private async reset(descriptor: ResourceDescriptor): Promise<void> {
    this.search.setValue('');
    this.status.setValue('active');
    this.division.setValue('');
    this.district.setValue('');
    this.degree.setValue('');
    this.type.setValue('');
    this.districts.set([]);
    this.items.set([]);
    this.loaded.set(false);
    this.cursor.set(null);
    this.hasMore.set(false);
    this.errorMessage.set(null);

    // Reference names and the parent filter choices load alongside the first page.
    void this.loadLookups(descriptor);
    await this.load();
  }

  private async loadLookups(descriptor: ResourceDescriptor): Promise<void> {
    const wanted = new Set(descriptor.references.map((reference) => reference.resource));
    const needsDivisions = descriptor.parentFilter === 'divisionId' || !!descriptor.cascadeFrom;
    if (needsDivisions) {
      wanted.add('divisions');
    }
    const lookups: Record<string, Record<string, string>> = {};
    await Promise.all(
      [...wanted].map(async (slug) => {
        const target = descriptorFor(slug);
        if (!target) {
          return;
        }
        try {
          const all = await this.api.listAll(target, 'all');
          lookups[slug] = Object.fromEntries(all.map((item) => [item.id, item.name]));
          if (slug === 'divisions') {
            this.divisions.set(all.filter((item) => item.isActive));
          }
          if (slug === 'degrees' && descriptor.parentFilter === 'degreeId') {
            this.degrees.set(all);
          }
        } catch {
          // A missing name shows as "Unknown"; the list itself reports its own errors.
        }
      }),
    );
    this.names.set(lookups);
  }

  private async load(append = false): Promise<void> {
    const descriptor = this.descriptor();
    if (!descriptor || this.loading()) {
      return;
    }

    const cursor = append ? this.cursor() : null;
    if (append && !cursor) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set(append ? `Loading more ${descriptor.label.toLowerCase()}…` : `Loading ${descriptor.label.toLowerCase()}…`);
    const parentId = descriptor.cascadeFrom
      ? this.district.value
      : descriptor.parentFilter === 'degreeId'
        ? this.degree.value
        : this.division.value;
    this.filtered.set(
      !!this.search.value.trim() || this.status.value !== 'active' || !!this.division.value || !!this.district.value || !!this.degree.value ||
        !!this.type.value,
    );

    try {
      const result = await firstValueFrom(
        this.api.list(descriptor, {
          search: this.search.value,
          status: this.status.value,
          cursor,
          pageSize: 25,
          parentId: parentId || undefined,
          type: this.type.value || undefined,
        }),
      );
      const loadedItems = append ? [...this.items(), ...result.items] : result.items;
      this.items.set(loadedItems);
      this.cursor.set(result.nextCursor);
      this.hasMore.set(!!result.nextCursor);
      this.loaded.set(true);
      this.announcement.set(
        loadedItems.length === 0
          ? 'No records match.'
          : `Loaded ${loadedItems.length} ${descriptor.label.toLowerCase()}${result.nextCursor ? '. More records are available below.' : '.'}`,
      );
    } catch (error) {
      if (!append) {
        this.items.set([]);
        this.cursor.set(null);
        this.hasMore.set(false);
      }
      this.announcement.set('');
      this.errorMessage.set(
        problemMessage(error, append ? `More ${descriptor.label.toLowerCase()} could not be loaded. Try again.` : `The ${descriptor.label.toLowerCase()} could not be loaded. Try again.`),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
