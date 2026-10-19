import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { InfiniteScrollSentinel } from '../../shared/infinite-scroll/infinite-scroll-sentinel';
import { ConfigurationApi } from '../configuration/configuration-api';
import { ConfigurationItem, descriptorFor } from '../configuration/configuration.models';
import { statusLabel } from '../users/user.models';
import { StudentApi } from './student-api';
import { StudentListItem } from './student.models';

/**
 * The Admin student directory: one row per program admission (a returning Student appears once per admission), searched by name,
 * email, mobile, exam roll, class roll, or registration number and filtered by degree and batch, loaded in bounded batches as the
 * user scrolls. The
 * service authorizes every request; this screen only presents what it returns.
 */
@Component({
  selector: 'app-student-list',
  imports: [ReactiveFormsModule, RouterLink, InfiniteScrollSentinel],
  templateUrl: './student-list.html',
})
export class StudentList {
  private readonly api = inject(StudentApi);
  private readonly configuration = inject(ConfigurationApi);
  private readonly router = inject(Router);
  private static readonly PageSize = 25;

  protected readonly statusLabel = statusLabel;
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly degree = new FormControl('', { nonNullable: true });
  protected readonly batch = new FormControl('', { nonNullable: true });

  protected readonly degrees = signal<ConfigurationItem[]>([]);
  protected readonly batches = signal<ConfigurationItem[]>([]);
  private readonly selectedDegree = signal('');

  /** The batches of the chosen degree, or every batch when no degree is chosen. */
  protected readonly batchChoices = computed(() => {
    const degreeId = this.selectedDegree();
    return degreeId ? this.batches().filter((b) => b.degreeId === degreeId) : this.batches();
  });
  protected readonly items = signal<StudentListItem[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly filtered = signal(false);

  constructor() {
    this.notice.set((this.router.getCurrentNavigation()?.extras.state?.['notice'] as string | undefined) ?? null);
    void this.loadFilters();
    void this.load();
  }

  protected applyFilters(): void {
    if (this.loading()) {
      return;
    }

    this.page.set(1);
    this.hasMore.set(false);
    this.items.set([]);
    this.loaded.set(false);
    void this.load();
  }

  protected clearFilters(): void {
    this.search.setValue('');
    this.degree.setValue('');
    this.batch.setValue('');
    this.selectedDegree.set('');
    this.applyFilters();
  }

  /** A batch belongs to one degree, so a batch of another degree is cleared when the degree changes. */
  protected degreeChanged(): void {
    this.selectedDegree.set(this.degree.value);
    if (this.batch.value && !this.batchChoices().some((b) => b.id === this.batch.value)) {
      this.batch.setValue('');
    }
    this.applyFilters();
  }

  protected loadMore(): void {
    if (!this.loading() && this.hasMore()) {
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

  private async loadFilters(): Promise<void> {
    try {
      const [degrees, batches] = await Promise.all([
        this.configuration.listAll(descriptorFor('degrees')!, 'all'),
        this.configuration.listAll(descriptorFor('batches')!, 'all'),
      ]);
      this.degrees.set(degrees);
      this.batches.set(batches);
    } catch {
      // The filters are a convenience; the list still works without them.
      this.degrees.set([]);
      this.batches.set([]);
    }
  }

  private async load(append = false): Promise<void> {
    if (this.loading()) {
      return;
    }

    const requestedPage = append ? this.page() + 1 : 1;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set(append ? 'Loading more students…' : 'Loading students…');
    this.filtered.set(!!this.search.value.trim() || !!this.degree.value || !!this.batch.value);

    try {
      const result = await firstValueFrom(
        this.api.list({
          search: this.search.value,
          degreeId: this.degree.value,
          batchId: this.batch.value,
          page: requestedPage,
          pageSize: StudentList.PageSize,
        }),
      );
      const loadedItems = append ? [...this.items(), ...result.items] : result.items;
      this.items.set(loadedItems);
      this.page.set(result.page);
      this.hasMore.set(result.page < result.totalPages && result.items.length > 0);
      this.loaded.set(true);
      this.announcement.set(
        loadedItems.length === 0
          ? 'No admissions match.'
          : this.hasMore()
            ? `Loaded ${loadedItems.length} admissions. More admissions are available below.`
            : `All ${loadedItems.length} matching admissions loaded.`,
      );
    } catch (error) {
      if (!append) {
        this.items.set([]);
        this.hasMore.set(false);
      }
      this.announcement.set('');
      this.errorMessage.set(
        problemMessage(error, append ? 'More admissions could not be loaded. Try again.' : 'The students could not be loaded. Try again.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
