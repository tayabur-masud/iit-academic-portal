import { Injectable } from '@angular/core';

import { AuditFilters, EMPTY_FILTERS } from './audit.models';

/**
 * Remembers the reviewer's filters and page while they open an event, so returning to the list shows what they
 * were looking at. It lives only in memory and is dropped when the page is reloaded.
 */
@Injectable({ providedIn: 'root' })
export class AuditSearchState {
  filters: AuditFilters = { ...EMPTY_FILTERS };

  page = 1;

  save(filters: AuditFilters, page: number): void {
    this.filters = { ...filters };
    this.page = page;
  }

  clear(): void {
    this.filters = { ...EMPTY_FILTERS };
    this.page = 1;
  }
}
