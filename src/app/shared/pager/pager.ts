import { Component, computed, input, output } from '@angular/core';

import { pageList } from './page-list';

/**
 * The footer of a paged table: "Showing X to Y of N", Previous, numbered pages with the first and last page and an
 * ellipsis where pages are skipped, and Next. Every paged list uses it so they all behave the same (design-system §8).
 * It only reports which page was chosen; the list loads it.
 */
@Component({
  selector: 'app-pager',
  templateUrl: './pager.html',
})
export class Pager {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly totalCount = input.required<number>();
  readonly pageSize = input(25);
  /** The plural noun in "Showing 1 to 25 of 400 events". */
  readonly noun = input('records');
  /** While a page loads, the summary shows a spinner and clicks on the pager are ignored (focus stays put). */
  readonly loading = input(false);

  readonly pageChange = output<number>();

  protected readonly pages = computed(() => pageList(this.page(), this.totalPages()));
  protected readonly firstShown = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly lastShown = computed(() => Math.min(this.page() * this.pageSize(), this.totalCount()));

  protected go(target: number): void {
    if (!this.loading() && target !== this.page() && target >= 1 && target <= this.totalPages()) {
      this.pageChange.emit(target);
    }
  }
}
