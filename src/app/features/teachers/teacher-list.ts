import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { InfiniteScrollSentinel } from '../../shared/infinite-scroll/infinite-scroll-sentinel';
import { TeacherApi } from './teacher-api';
import { ACCOUNT_STATUSES, Teacher, TeacherStatusFilter, statusLabel } from './teacher.models';
import { SearchableSelect, SelectOption } from '../../shared/searchable-select/searchable-select';

/**
 * The Admin teacher directory: search by name, email, or staff ID and filter by account status while loading bounded batches as
 * the user scrolls. The service authorizes every request; this screen only presents what it returns.
 */
@Component({
  selector: 'app-teacher-list',
  imports: [ReactiveFormsModule, RouterLink, InfiniteScrollSentinel, SearchableSelect, SelectOption],
  templateUrl: './teacher-list.html',
})
export class TeacherList {
  private readonly api = inject(TeacherApi);
  private readonly router = inject(Router);
  private static readonly PageSize = 25;

  protected readonly statuses = ACCOUNT_STATUSES;
  protected readonly statusLabel = statusLabel;

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly status = new FormControl<TeacherStatusFilter>('', { nonNullable: true });

  protected readonly items = signal<Teacher[]>([]);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(0);
  protected readonly hasMore = signal(false);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly filtered = signal(false);

  constructor() {
    this.notice.set((this.router.getCurrentNavigation()?.extras.state?.['notice'] as string | undefined) ?? null);
    void this.load();
  }

  protected applyFilters(): void {
    if (this.loading()) {
      return;
    }

    this.page.set(1);
    this.totalPages.set(0);
    this.hasMore.set(false);
    this.items.set([]);
    this.loaded.set(false);
    void this.load();
  }

  protected clearFilters(): void {
    this.search.setValue('');
    this.status.setValue('');
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

  private async load(append = false): Promise<void> {
    if (this.loading()) {
      return;
    }

    const requestedPage = append ? this.page() + 1 : 1;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set(append ? 'Loading more teachers…' : 'Loading teachers…');
    this.filtered.set(!!this.search.value.trim() || !!this.status.value);

    try {
      const result = await firstValueFrom(
        this.api.list({ search: this.search.value, status: this.status.value, page: requestedPage, pageSize: TeacherList.PageSize }),
      );
      if (append && result.items.length === 0) {
        this.page.set(result.page);
        this.totalPages.set(result.totalPages);
        this.hasMore.set(false);
        this.loaded.set(true);
        this.announcement.set(`All ${this.items().length} matching teachers loaded.`);
        return;
      }
      const loadedItems = append ? [...this.items(), ...result.items] : result.items;
      this.items.set(loadedItems);
      this.page.set(result.page);
      this.totalPages.set(result.totalPages);
      this.hasMore.set(result.page < result.totalPages && result.items.length > 0);
      this.loaded.set(true);
      this.announcement.set(
        loadedItems.length === 0
          ? 'No teachers match.'
          : this.hasMore()
            ? `Loaded ${loadedItems.length} teachers. More teachers are available below.`
            : `All ${loadedItems.length} matching teachers loaded.`,
      );
    } catch (error) {
      if (!append) {
        this.items.set([]);
        this.totalPages.set(0);
        this.hasMore.set(false);
      }
      this.announcement.set('');
      this.errorMessage.set(
        problemMessage(error, append ? 'More teachers could not be loaded. Try again.' : 'The teachers could not be loaded. Try again.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
