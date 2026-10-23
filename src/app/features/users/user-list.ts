import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { InfiniteScrollSentinel } from '../../shared/infinite-scroll/infinite-scroll-sentinel';
import { UserApi } from './user-api';
import { ACCOUNT_STATUSES, ROLE_FILTERS, RoleFilter, StatusFilter, UserAccount, statusLabel } from './user.models';
import { SearchableSelect, SelectOption } from '../../shared/searchable-select/searchable-select';

/**
 * The Admin account directory: every portal account, searched by email or user ID and filtered by role and status, loaded in
 * bounded batches as the user scrolls. Each row opens the account's detail and maintenance view. The service authorizes every
 * request; this screen only presents what it returns.
 */
@Component({
  selector: 'app-user-list',
  imports: [ReactiveFormsModule, RouterLink, InfiniteScrollSentinel, SearchableSelect, SelectOption],
  templateUrl: './user-list.html',
})
export class UserList {
  private readonly api = inject(UserApi);
  private readonly router = inject(Router);
  private static readonly PageSize = 25;

  protected readonly statuses = ACCOUNT_STATUSES;
  protected readonly roles = ROLE_FILTERS;
  protected readonly statusLabel = statusLabel;

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly role = new FormControl<RoleFilter>('', { nonNullable: true });
  protected readonly status = new FormControl<StatusFilter>('', { nonNullable: true });

  protected readonly items = signal<UserAccount[]>([]);
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
    this.role.setValue('');
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
    this.announcement.set(append ? 'Loading more accounts…' : 'Loading accounts…');
    this.filtered.set(!!this.search.value.trim() || !!this.role.value || !!this.status.value);

    try {
      const result = await firstValueFrom(
        this.api.list({
          search: this.search.value,
          role: this.role.value,
          status: this.status.value,
          page: requestedPage,
          pageSize: UserList.PageSize,
        }),
      );
      const loadedItems = append ? [...this.items(), ...result.items] : result.items;
      this.items.set(loadedItems);
      this.page.set(result.page);
      this.hasMore.set(result.page < result.totalPages && result.items.length > 0);
      this.loaded.set(true);
      this.announcement.set(
        loadedItems.length === 0
          ? 'No accounts match.'
          : this.hasMore()
            ? `Loaded ${loadedItems.length} accounts. More accounts are available below.`
            : `All ${loadedItems.length} matching accounts loaded.`,
      );
    } catch (error) {
      if (!append) {
        this.items.set([]);
        this.hasMore.set(false);
      }
      this.announcement.set('');
      this.errorMessage.set(
        problemMessage(error, append ? 'More accounts could not be loaded. Try again.' : 'The accounts could not be loaded. Try again.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
