import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { Pager } from '../../shared/pager/pager';
import { PagerPreferences } from '../../shared/pager/pager-preferences';
import { TeacherApi } from './teacher-api';
import { ACCOUNT_STATUSES, Teacher, TeacherStatusFilter, statusLabel } from './teacher.models';

/**
 * The Admin teacher directory: search by name, email, or staff ID, filter by account status, numbered pages, and a clear loading,
 * empty, error, and status state. The service authorizes every request; this screen only presents what it returns.
 */
@Component({
  selector: 'app-teacher-list',
  imports: [ReactiveFormsModule, RouterLink, Pager],
  templateUrl: './teacher-list.html',
})
export class TeacherList {
  private readonly api = inject(TeacherApi);
  private readonly router = inject(Router);
  private readonly preferences = inject(PagerPreferences);

  protected readonly statuses = ACCOUNT_STATUSES;
  protected readonly statusLabel = statusLabel;

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly status = new FormControl<TeacherStatusFilter>('', { nonNullable: true });

  protected readonly items = signal<Teacher[]>([]);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(0);
  protected readonly totalCount = signal(0);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly filtered = signal(false);

  protected readonly pageSize = this.preferences.pageSize;
  protected readonly firstShown = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly lastShown = computed(() => (this.page() - 1) * this.pageSize() + this.items().length);

  constructor() {
    this.notice.set((this.router.getCurrentNavigation()?.extras.state?.['notice'] as string | undefined) ?? null);
    void this.load();
  }

  protected applyFilters(): void {
    this.page.set(1);
    void this.load();
  }

  protected clearFilters(): void {
    this.search.setValue('');
    this.status.setValue('');
    this.applyFilters();
  }

  protected setPageSize(size: number): void {
    // A different size changes which rows fall on each page, so go back to the first page.
    this.preferences.set(size);
    this.page.set(1);
    void this.load();
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

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set('Loading teachers…');
    this.filtered.set(!!this.search.value.trim() || !!this.status.value);

    try {
      const result = await firstValueFrom(
        this.api.list({ search: this.search.value, status: this.status.value, page: this.page(), pageSize: this.pageSize() }),
      );
      if (result.items.length === 0 && result.totalPages > 0 && this.page() > result.totalPages) {
        // The page no longer exists (teachers were removed from the match): show the last one.
        this.page.set(result.totalPages);
        await this.load();
        return;
      }
      this.items.set(result.items);
      this.totalPages.set(result.totalPages);
      this.totalCount.set(result.totalCount);
      this.loaded.set(true);
      this.announcement.set(
        result.items.length === 0
          ? 'No teachers match.'
          : `Showing ${this.firstShown()} to ${this.lastShown()} of ${this.totalCount()} teachers. Page ${this.page()} of ${result.totalPages}.`,
      );
    } catch (error) {
      this.items.set([]);
      this.totalPages.set(0);
      this.totalCount.set(0);
      this.announcement.set('');
      this.errorMessage.set(problemMessage(error, 'The teachers could not be loaded. Try again.'));
    } finally {
      this.loading.set(false);
    }
  }
}
