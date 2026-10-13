import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../../core/http/problem';
import { Pager } from '../../../shared/pager/pager';
import { ConfigurationApi } from '../configuration-api';
import {
  ConfigurationItem,
  ConfigurationStatus,
  PAGE_SIZE,
  ResourceDescriptor,
  descriptorFor,
  RESOURCES,
} from '../configuration.models';

/**
 * Search and browse one configuration resource: catalogs, batches, or a geography level. Cursor paging, a status
 * filter that defaults to active records, and a clear loading, empty, error, and inactive state. The service
 * authorizes every request; this screen only presents what it returns.
 */
@Component({
  selector: 'app-catalog-list',
  imports: [ReactiveFormsModule, RouterLink, Pager],
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

  protected readonly items = signal<ConfigurationItem[]>([]);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(0);
  protected readonly totalCount = signal(0);
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

  protected readonly firstShown = computed(() => (this.page() - 1) * PAGE_SIZE + 1);
  protected readonly lastShown = computed(() => (this.page() - 1) * PAGE_SIZE + this.items().length);
  protected readonly columns = computed(() => {
    const descriptor = this.descriptor();
    return {
      code: !!descriptor?.hasCode,
      type: !!descriptor?.hasType,
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

  protected applyFilters(): void {
    this.page.set(1);
    void this.load();
  }

  protected clearFilters(): void {
    this.search.setValue('');
    this.status.setValue('active');
    this.division.setValue('');
    this.district.setValue('');
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

  protected goTo(target: number): void {
    if (!this.loading() && target !== this.page() && target >= 1 && target <= this.totalPages()) {
      this.page.set(target);
      void this.load();
    }
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
    this.districts.set([]);
    this.items.set([]);
    this.loaded.set(false);
    this.page.set(1);
    this.totalPages.set(0);
    this.totalCount.set(0);
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
        } catch {
          // A missing name shows as "Unknown"; the list itself reports its own errors.
        }
      }),
    );
    this.names.set(lookups);
  }

  private async load(): Promise<void> {
    const descriptor = this.descriptor();
    if (!descriptor) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set(`Loading ${descriptor.label.toLowerCase()}…`);
    const parentId = descriptor.cascadeFrom ? this.district.value : this.division.value;
    this.filtered.set(
      !!this.search.value.trim() || this.status.value !== 'active' || !!this.division.value || !!this.district.value,
    );

    try {
      const result = await firstValueFrom(
        this.api.list(descriptor, {
          search: this.search.value,
          status: this.status.value,
          page: this.page(),
          parentId: parentId || undefined,
        }),
      );
      const totalPages = result.totalPages ?? 0;
      if (result.items.length === 0 && totalPages > 0 && this.page() > totalPages) {
        // Records were removed from the match (or the page was stale): show the last page that exists.
        this.page.set(totalPages);
        await this.load();
        return;
      }
      this.items.set(result.items);
      this.totalPages.set(totalPages);
      this.totalCount.set(result.totalCount ?? result.items.length);
      this.loaded.set(true);
      this.announcement.set(
        result.items.length === 0
          ? 'No records match.'
          : `Showing ${this.firstShown()} to ${this.lastShown()} of ${this.totalCount()} ${descriptor.label.toLowerCase()}. Page ${this.page()} of ${totalPages}.`,
      );
    } catch (error) {
      this.items.set([]);
      this.totalPages.set(0);
      this.totalCount.set(0);
      this.announcement.set('');
      this.errorMessage.set(problemMessage(error, `The ${descriptor.label.toLowerCase()} could not be loaded. Try again.`));
    } finally {
      this.loading.set(false);
    }
  }
}
