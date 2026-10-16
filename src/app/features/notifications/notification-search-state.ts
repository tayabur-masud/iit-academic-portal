import { Injectable } from '@angular/core';

import { EMPTY_NOTIFICATION_FILTERS, NotificationFilters, NotificationRow } from './notification.models';

export interface NotificationSearchSnapshot {
  filters: NotificationFilters;
  items: NotificationRow[];
  nextCursor: string | null;
}

/**
 * Remembers the reviewer's filters and loaded rows while they open a notification, so going back does not restart the search.
 * It lives only in memory and is dropped when the page is reloaded.
 */
@Injectable({ providedIn: 'root' })
export class NotificationSearchState {
  private snapshot: NotificationSearchSnapshot | null = null;

  restore(): NotificationSearchSnapshot | null {
    return this.snapshot
      ? { ...this.snapshot, filters: { ...this.snapshot.filters }, items: [...this.snapshot.items] }
      : null;
  }

  save(filters: NotificationFilters, items: NotificationRow[], nextCursor: string | null): void {
    this.snapshot = { filters: { ...filters }, items: [...items], nextCursor };
  }

  clear(): void {
    this.snapshot = { filters: { ...EMPTY_NOTIFICATION_FILTERS }, items: [], nextCursor: null };
  }
}
