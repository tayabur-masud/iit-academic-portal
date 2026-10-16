import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../core/http/problem';
import { InfiniteScrollSentinel } from '../../shared/infinite-scroll/infinite-scroll-sentinel';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { toUtcInstant } from '../audit/audit.models';
import { NotificationApi } from './notification-api';
import { NotificationSearchState } from './notification-search-state';
import { NotificationSections } from './notification-sections';
import {
  EMPTY_NOTIFICATION_FILTERS,
  EVENT_TYPES,
  NOTIFICATION_STATUSES,
  NotificationFilters,
  NotificationRow,
  eventLabel,
  hasNotificationFilters,
  statusBadgeClass,
  statusLabel,
} from './notification.models';

/** Query parameter the service reports a problem under, mapped to the form field that holds it. */
const FIELD_FOR_PARAMETER: Record<string, keyof NotificationFilters> = { fromUtc: 'from', toUtc: 'to' };
const PARAMETERS = ['recipient', 'eventType', 'status', 'fromUtc', 'toUtc', 'cursor', 'pageSize'];

/**
 * Admin search of the permanent notification history: combined filters, newest first, loaded in batches as the reader reaches the
 * end. A failed load keeps the rows already shown. Rows hold delivery facts only; message content is on the detail screen and only
 * for ordinary messages. The service re-checks the Admin role on every request.
 */
@Component({
  selector: 'app-notification-history',
  imports: [ReactiveFormsModule, RouterLink, InfiniteScrollSentinel, UtcTimestamp, NotificationSections],
  templateUrl: './notification-history.html',
})
export class NotificationHistory implements OnInit {
  private readonly api = inject(NotificationApi);
  private readonly state = inject(NotificationSearchState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly eventTypes = EVENT_TYPES;
  protected readonly statuses = NOTIFICATION_STATUSES;
  protected readonly eventLabel = eventLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusBadgeClass = statusBadgeClass;

  protected readonly form = inject(NonNullableFormBuilder).group({
    recipient: [''],
    eventType: [''],
    status: ['' as NotificationFilters['status']],
    from: [''],
    to: [''],
  });

  protected readonly items = signal<NotificationRow[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly hasMore = signal(false);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');
  protected readonly filtered = signal(false);

  private applied: NotificationFilters = { ...EMPTY_NOTIFICATION_FILTERS };

  ngOnInit(): void {
    const snapshot = this.state.restore();
    this.applied = snapshot ? { ...snapshot.filters } : { ...EMPTY_NOTIFICATION_FILTERS };
    this.form.setValue(this.applied);
    if (snapshot?.items.length) {
      this.items.set(snapshot.items);
      this.nextCursor.set(snapshot.nextCursor);
      this.hasMore.set(!!snapshot.nextCursor);
      this.loaded.set(true);
      this.filtered.set(hasNotificationFilters(this.applied));
      this.announcement.set(`Loaded ${snapshot.items.length} notifications.`);
    } else {
      void this.load();
    }
  }

  protected errorsFor(field: string): string[] {
    return this.problems()[field] ?? [];
  }

  protected describedBy(field: string): string | null {
    return this.errorsFor(field).length > 0 ? `${field}-error` : null;
  }

  protected whom(row: NotificationRow): string {
    return row.destination ?? row.recipientUserId;
  }

  protected apply(): void {
    this.problems.set({});
    const values = this.form.getRawValue();

    // The service validates too; this catches the common mistake before a round trip.
    const from = toUtcInstant(values.from);
    const to = toUtcInstant(values.to);
    if (from && to && new Date(to) <= new Date(from)) {
      this.problems.set({ to: ['The end of the range must be later than its start.'] });
      this.focusFirstInvalid();
      return;
    }

    this.applied = values;
    this.nextCursor.set(null);
    this.hasMore.set(false);
    this.state.clear();
    void this.load();
  }

  protected clear(): void {
    this.problems.set({});
    this.form.setValue({ ...EMPTY_NOTIFICATION_FILTERS });
    this.applied = { ...EMPTY_NOTIFICATION_FILTERS };
    this.nextCursor.set(null);
    this.hasMore.set(false);
    this.state.clear();
    void this.load();
  }

  protected loadMore(): void {
    if (!this.loading() && this.nextCursor()) {
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

  private async load(append = false): Promise<void> {
    if (this.loading()) {
      return;
    }

    const cursor = append ? this.nextCursor() : null;
    if (append && !cursor) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set(append ? 'Loading more notifications…' : 'Loading notifications…');
    this.filtered.set(hasNotificationFilters(this.applied));

    try {
      const result = await firstValueFrom(this.api.search(this.applied, cursor, 25));
      const loadedItems = append ? [...this.items(), ...result.items] : result.items;
      this.items.set(loadedItems);
      this.nextCursor.set(result.nextCursor);
      this.hasMore.set(!!result.nextCursor);
      this.loaded.set(true);
      this.state.save(this.applied, loadedItems, result.nextCursor);
      this.announcement.set(
        loadedItems.length === 0
          ? 'No notifications match these filters.'
          : `Loaded ${loadedItems.length} notifications${result.nextCursor ? '. More are available below.' : '.'}`,
      );
    } catch (error) {
      this.handleFailure(error, append);
    } finally {
      this.loading.set(false);
    }
  }

  private handleFailure(error: unknown, append: boolean): void {
    if (!append) {
      this.items.set([]);
      this.nextCursor.set(null);
      this.hasMore.set(false);
    }
    this.announcement.set('');

    if (error instanceof HttpErrorResponse && error.status === 400) {
      const found: Record<string, string[]> = {};
      for (const parameter of PARAMETERS) {
        const messages = fieldErrors(error, parameter);
        if (messages.length > 0) {
          found[FIELD_FOR_PARAMETER[parameter] ?? parameter] = messages;
        }
      }
      this.problems.set(found);
      this.errorMessage.set('Some filters need attention. Correct them and apply the filters again.');
      this.focusFirstInvalid();
      return;
    }

    this.errorMessage.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your current role cannot review notifications. Switch to the Admin role and try again.'
        : problemMessage(error, append ? 'More notifications could not be loaded. Try again.' : 'The notifications could not be loaded. Try again.'),
    );
  }

  private focusFirstInvalid(): void {
    // After the next render, because aria-invalid is only set once the errors have been drawn.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}
