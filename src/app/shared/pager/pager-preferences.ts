import { Injectable, signal } from '@angular/core';

/** The page sizes every paged table offers. The services accept 1 to 100. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export const DEFAULT_PAGE_SIZE = 25;

/**
 * The reader's chosen number of rows per page, shared by every paged table so one choice carries across them while the
 * app is open. It is held in memory only: a reload goes back to the default.
 */
@Injectable({ providedIn: 'root' })
export class PagerPreferences {
  readonly pageSize = signal<number>(DEFAULT_PAGE_SIZE);

  set(size: number): void {
    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(size)) {
      this.pageSize.set(size);
    }
  }
}
