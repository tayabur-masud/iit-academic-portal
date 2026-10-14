import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Pager } from './pager';

@Component({
  imports: [Pager],
  template: `
    <app-pager
      [page]="page()"
      [totalPages]="totalPages()"
      [totalCount]="totalCount()"
      [pageSize]="pageSize()"
      [loading]="loading()"
      noun="widgets"
      (pageChange)="chosen.push($event)"
      (pageSizeChange)="sizes.push($event)"
    />
  `,
})
class Host {
  readonly page = signal(2);
  readonly totalPages = signal(40);
  readonly totalCount = signal(1000);
  readonly loading = signal(false);
  readonly pageSize = signal(25);
  readonly chosen: number[] = [];
  readonly sizes: number[] = [];
}

describe('Pager', () => {
  async function render(): Promise<{ host: Host; page: HTMLElement; fixture: ReturnType<typeof TestBed.createComponent<Host>> }> {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { host: fixture.componentInstance, page: fixture.nativeElement, fixture };
  }

  it('describes the range with the noun it is given and marks the current page', async () => {
    const { page } = await render();

    expect(page.textContent).toContain('Showing 26 to 50 of 1000 widgets');
    expect(page.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2');
    expect(page.querySelector('nav')?.getAttribute('aria-label')).toBe('Pages of results');
  });

  it('reports the chosen page and never the current one', async () => {
    const { host, page } = await render();

    page.querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    page.querySelector<HTMLButtonElement>('[aria-label="Page 2"]')!.click();
    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Previous'))!.click();
    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))!.click();

    expect(host.chosen).toEqual([3, 1, 3]);
  });

  it('shows a spinner instead of the range and ignores clicks while loading', async () => {
    const { host, page, fixture } = await render();
    host.loading.set(true);
    fixture.detectChanges();

    expect(page.textContent).toContain('Loading…');
    expect(page.textContent).not.toContain('Showing');
    page.querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();

    expect(host.chosen).toEqual([]);
  });

  describe('items per page', () => {
    const select = (page: HTMLElement) => page.querySelector<HTMLSelectElement>('#page-size')!;

    function choose(page: HTMLElement, value: string): void {
      select(page).value = value;
      select(page).dispatchEvent(new Event('change'));
    }

    it('offers 10, 25, 50 and 100 with a visible label and the current size selected', async () => {
      const { page } = await render();

      expect(page.querySelector('label[for="page-size"]')?.textContent).toContain('Items per page');
      expect(Array.from(select(page).options).map((o) => o.value)).toEqual(['10', '25', '50', '100']);
      expect(select(page).value).toBe('25');
    });

    it('reports a different size and not the one already in use', async () => {
      const { host, page } = await render();

      choose(page, '50');
      choose(page, '25');

      expect(host.sizes).toEqual([50]);
    });

    it('uses the size it is given for the range shown', async () => {
      const { host, page, fixture } = await render();
      host.pageSize.set(100);
      fixture.detectChanges();

      expect(select(page).value).toBe('100');
      expect(page.textContent).toContain('Showing 101 to 200 of 1000 widgets');
    });

    it('ignores a change while a page loads and puts the box back', async () => {
      const { host, page, fixture } = await render();
      host.loading.set(true);
      fixture.detectChanges();

      choose(page, '10');

      expect(host.sizes).toEqual([]);
      expect(select(page).value).toBe('25');
    });
  });

  it('disables Previous on the first page and Next on the last', async () => {
    const { host, page, fixture } = await render();
    host.page.set(1);
    fixture.detectChanges();
    const previous = Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Previous'))!;
    expect(previous.disabled).toBe(true);

    host.page.set(40);
    fixture.detectChanges();
    const next = Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'))!;
    expect(next.disabled).toBe(true);
    expect(page.textContent).toContain('Showing 976 to 1000 of 1000 widgets');
  });
});
