import { Injectable } from '@angular/core';

import { AuditFilters, EMPTY_FILTERS } from './audit.models';

/**
 * Remembers the reviewer's filters and place in the results while they open an event, so returning to the list
 * shows what they were looking at. It lives only in memory and is dropped when the page is reloaded.
 */
@Injectable({ providedIn: 'root' })
export class AuditSearchState {
  filters: AuditFilters = { ...EMPTY_FILTERS };

  /** The cursors that led to each page already visited; the first page has none. */
  cursors: (string | null)[] = [null];

  save(filters: AuditFilters, cursors: (string | null)[]): void {
    this.filters = { ...filters };
    this.cursors = [...cursors];
  }

  clear(): void {
    this.filters = { ...EMPTY_FILTERS };
    this.cursors = [null];
  }
}
