import { Injectable } from '@angular/core';

import { AuditEvent, AuditFilters, EMPTY_FILTERS } from './audit.models';

export interface AuditSearchSnapshot {
  filters: AuditFilters;
  items: AuditEvent[];
  nextCursor: string | null;
}

/**
 * Remembers the reviewer's filters and loaded audit rows while they open an event. It lives only in memory and is dropped
 * when the page is reloaded.
 */
@Injectable({ providedIn: 'root' })
export class AuditSearchState {
  private snapshot: AuditSearchSnapshot | null = null;

  restore(): AuditSearchSnapshot | null {
    return this.snapshot
      ? { ...this.snapshot, filters: { ...this.snapshot.filters }, items: [...this.snapshot.items] }
      : null;
  }

  save(filters: AuditFilters, items: AuditEvent[], nextCursor: string | null): void {
    this.snapshot = { filters: { ...filters }, items: [...items], nextCursor };
  }

  clear(): void {
    this.snapshot = { filters: { ...EMPTY_FILTERS }, items: [], nextCursor: null };
  }
}
