import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { InfiniteScrollSentinel } from '../../shared/infinite-scroll/infinite-scroll-sentinel';
import { statusLabel } from '../teachers/teacher.models';
import { StaffApi } from './staff-api';
import { StaffProfile } from './staff.models';

/**
 * The Admin staff directory: one row per Admin account's staff profile, searchable by name, email, mobile number, or designation, loading
 * bounded batches as the user scrolls. An Admin's own profile is opened and changed from here like any other. A staff member is
 * deactivated from their row after an in-row confirmation; the service refuses the signed-in Admin's own account and the last active
 * Admin, and that refusal is shown in the row. The service authorizes every request; this screen only presents what it returns.
 */
@Component({
  selector: 'app-staff-list',
  imports: [ReactiveFormsModule, RouterLink, InfiniteScrollSentinel],
  templateUrl: './staff-list.html',
})
export class StaffList {
  private readonly api = inject(StaffApi);
  private readonly router = inject(Router);
  private static readonly PageSize = 25;

  protected readonly statusLabel = statusLabel;
  protected readonly search = new FormControl('', { nonNullable: true });

  protected readonly items = signal<StaffProfile[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly announcement = signal('');
  protected readonly filtered = signal(false);
  /** The row whose deactivation is being confirmed, the one being sent, and the last refusal with the row it belongs to. */
  protected readonly confirming = signal<string | null>(null);
  protected readonly deactivating = signal<string | null>(null);
  protected readonly rowError = signal<{ id: string; message: string } | null>(null);

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

  /** Whether the row offers deactivation: an active staff member whose account is not already deactivated. */
  protected canDeactivate(staff: StaffProfile): boolean {
    return staff.isActive && staff.accountStatus !== 'Deactivated';
  }

  protected askDeactivate(id: string): void {
    this.rowError.set(null);
    this.confirming.set(id);
  }

  protected cancelDeactivate(): void {
    this.confirming.set(null);
    this.rowError.set(null);
  }

  protected async confirmDeactivate(staff: StaffProfile): Promise<void> {
    if (this.deactivating()) {
      return;
    }

    this.deactivating.set(staff.id);
    this.rowError.set(null);
    this.announcement.set(`Deactivating ${staff.name}…`);
    try {
      const updated = await firstValueFrom(this.api.deactivate(staff.id));
      this.items.set(this.items().map((item) => (item.id === updated.id ? updated : item)));
      this.confirming.set(null);
      this.notice.set(`${updated.name} was deactivated. Their account can no longer sign in, and their sessions were ended.`);
      this.announcement.set(`${updated.name} was deactivated.`);
    } catch (error) {
      this.announcement.set('');
      this.rowError.set({
        id: staff.id,
        message:
          error instanceof HttpErrorResponse && error.status === 403
            ? 'Your current role cannot manage staff. Switch to the Admin role and try again.'
            : problemMessage(error, `${staff.name} could not be deactivated. Try again.`),
      });
    } finally {
      this.deactivating.set(null);
    }
  }

  private async load(append = false): Promise<void> {
    if (this.loading()) {
      return;
    }

    const requestedPage = append ? this.page() + 1 : 1;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set(append ? 'Loading more staff…' : 'Loading staff…');
    this.filtered.set(!!this.search.value.trim());

    try {
      const result = await firstValueFrom(this.api.list({ search: this.search.value, page: requestedPage, pageSize: StaffList.PageSize }));
      const loadedItems = append ? [...this.items(), ...result.items] : result.items;
      this.items.set(loadedItems);
      this.page.set(result.page);
      this.hasMore.set(result.page < result.totalPages && result.items.length > 0);
      this.loaded.set(true);
      this.announcement.set(
        loadedItems.length === 0
          ? 'No staff profiles match.'
          : this.hasMore()
            ? `Loaded ${loadedItems.length} staff profiles. More are available below.`
            : `All ${loadedItems.length} matching staff profiles loaded.`,
      );
    } catch (error) {
      if (!append) {
        this.items.set([]);
        this.hasMore.set(false);
      }
      this.announcement.set('');
      this.errorMessage.set(
        problemMessage(error, append ? 'More staff could not be loaded. Try again.' : 'The staff could not be loaded. Try again.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
