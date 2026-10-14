import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../../testing/auth-testing';
import { PagerPreferences } from '../../../shared/pager/pager-preferences';
import { ConfigurationItem, ConfigurationPage } from '../configuration.models';
import { CatalogList } from './catalog-list';

const ROOT = '/api/admin/configuration';

function item(id: string, name: string, extra: Partial<ConfigurationItem> = {}): ConfigurationItem {
  return { id, name, isActive: true, createdAtUtc: '2026-10-09T08:30:00Z', lastModifiedAtUtc: '2026-10-09T08:30:00Z', ...extra };
}

describe('CatalogList', () => {
  let fixture: ComponentFixture<CatalogList>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(resource: string): Promise<void> {
    TestBed.configureTestingModule({ imports: [CatalogList], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(CatalogList);
    fixture.componentRef.setInput('resource', resource);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => http.verify());

  function listRequest(path: string, match: (r: TestRequest['request']) => boolean = () => true): TestRequest {
    return http.expectOne((r) => r.url === `${ROOT}/${path}` && match(r));
  }

  async function respond(
    request: TestRequest,
    items: ConfigurationItem[],
    totals: { page?: number; totalCount?: number; totalPages?: number } = {},
  ): Promise<void> {
    const count = totals.totalCount ?? items.length;
    request.flush({
      items,
      nextCursor: null,
      page: totals.page ?? 1,
      totalCount: count,
      totalPages: totals.totalPages ?? Math.ceil(count / 25),
    } satisfies ConfigurationPage);
    await settle();
    fixture.detectChanges();
  }

  function rows(): string[] {
    return Array.from(page.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  it('lists active records first with their code and a status badge, and offers a way to create one', async () => {
    await open('degrees');
    const first = listRequest('degrees');
    expect(first.request.params.get('status')).toBe('active');
    expect(first.request.params.get('pageSize')).toBe('25');
    await respond(first, [item('1', 'Bachelor of IT', { code: 'BIT' }), item('2', 'Master of IT')]);

    expect(page.querySelector('h1')?.textContent).toContain('Degrees');
    expect(rows()[0]).toContain('Bachelor of IT');
    expect(rows()[0]).toContain('BIT');
    expect(rows()[0]).toContain('Active');
    expect(page.querySelector('tbody a')?.getAttribute('href')).toBe('/admin/configuration/degrees/1');
    expect(page.querySelector('a.btn-primary')?.getAttribute('href')).toBe('/admin/configuration/degrees/new');
    expect(page.textContent).not.toContain('normalized');
  });

  it('shows an inactive record as inactive in text', async () => {
    await open('semesters');
    await respond(listRequest('semesters'), [item('1', 'Spring', { isActive: false })]);

    expect(rows()[0]).toContain('Inactive');
  });

  it('explains an empty list differently from a list with no match', async () => {
    await open('degrees');
    await respond(listRequest('degrees'), []);
    expect(page.textContent).toContain('No degrees yet');

    const input = page.querySelector<HTMLInputElement>('#search')!;
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await respond(listRequest('degrees', (r) => r.params.get('search') === 'zzz'), []);

    expect(page.textContent).toContain('No degrees match');
  });

  function pager(): HTMLElement {
    return page.querySelector<HTMLElement>('nav[aria-label="Pages of results"]')!;
  }

  function pageButtons(): string[] {
    return Array.from(pager().querySelectorAll('li')).map((li) => li.textContent!.trim());
  }

  function current(): string | undefined {
    return pager().querySelector('[aria-current="page"]')?.textContent?.trim();
  }

  it('asks for numbered pages and shows the range, the total and the page numbers', async () => {
    await open('degrees');
    const first = listRequest('degrees');
    expect(first.request.params.get('page')).toBe('1');
    expect(first.request.params.has('cursor')).toBe(false);
    await respond(first, [item('1', 'A')], { totalCount: 1000, totalPages: 40 });

    expect(pageButtons()).toEqual(['Previous page', '1', '2', '3', '…', '40', 'Next page']);
    expect(page.textContent).toContain('Showing 1 to 25 of 1000 degrees');
    expect(current()).toBe('1');
    expect(button('Previous').disabled).toBe(true);
  });

  it('jumps to a numbered page, the next page, the previous page and the last page', async () => {
    await open('degrees');
    await respond(listRequest('degrees'), [item('1', 'A')], { totalCount: 1000, totalPages: 40 });

    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    await respond(listRequest('degrees', (r) => r.params.get('page') === '3'), [item('3', 'C')], { page: 3, totalCount: 1000, totalPages: 40 });
    expect(current()).toBe('3');
    expect(page.textContent).toContain('Showing 51 to 75 of 1000 degrees');

    button('Next').click();
    await respond(listRequest('degrees', (r) => r.params.get('page') === '4'), [item('4', 'D')], { page: 4, totalCount: 1000, totalPages: 40 });
    button('Previous').click();
    await respond(listRequest('degrees', (r) => r.params.get('page') === '3'), [item('3', 'C')], { page: 3, totalCount: 1000, totalPages: 40 });

    pager().querySelector<HTMLButtonElement>('[aria-label="Page 40"]')!.click();
    await respond(listRequest('degrees', (r) => r.params.get('page') === '40'), [item('9', 'Z')], { page: 40, totalCount: 1000, totalPages: 40 });
    expect(button('Next').disabled).toBe(true);
    expect(page.textContent).toContain('Showing 976 to 1000 of 1000 degrees');
  });

  it('starts again from page 1 when the search or the status changes', async () => {
    await open('degrees');
    await respond(listRequest('degrees'), [item('1', 'A')], { totalCount: 100, totalPages: 4 });
    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    await respond(listRequest('degrees', (r) => r.params.get('page') === '3'), [item('3', 'C')], { page: 3, totalCount: 100, totalPages: 4 });

    const input = page.querySelector<HTMLInputElement>('#search')!;
    input.value = '  bit ';
    input.dispatchEvent(new Event('input'));
    const status = page.querySelector<HTMLSelectElement>('#status')!;
    status.value = 'inactive';
    status.dispatchEvent(new Event('change'));
    const request = listRequest('degrees', (r) => r.params.get('status') === 'inactive');
    expect(request.request.params.get('search')).toBe('bit');
    expect(request.request.params.get('page')).toBe('1');
    await respond(request, [item('5', 'Archived', { isActive: false })]);

    expect(current()).toBe('1');
  });

  it('changes how many records a page holds, starts again from page 1, and remembers the choice', async () => {
    await open('degrees');
    const first = listRequest('degrees');
    expect(first.request.params.get('pageSize')).toBe('25');
    await respond(first, [item('1', 'A')], { totalCount: 1000, totalPages: 40 });
    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    await respond(listRequest('degrees', (r) => r.params.get('page') === '3'), [item('3', 'C')], { page: 3, totalCount: 1000, totalPages: 40 });

    const select = page.querySelector<HTMLSelectElement>('#page-size')!;
    select.value = '100';
    select.dispatchEvent(new Event('change'));
    const request = listRequest('degrees', (r) => r.params.get('pageSize') === '100');
    expect(request.request.params.get('page')).toBe('1');
    await respond(request, [item('1', 'A')], { totalCount: 1000, totalPages: 10 });

    expect(page.textContent).toContain('Showing 1 to 100 of 1000 degrees');
    expect(current()).toBe('1');
    expect(pageButtons().filter((b) => /^\d+$/.test(b)).at(-1)).toBe('10');
    expect(TestBed.inject(PagerPreferences).pageSize()).toBe(100);
  });

  it('shows the last existing page when the requested page is past the end', async () => {
    await open('degrees');
    await respond(listRequest('degrees'), [item('1', 'A')], { totalCount: 60, totalPages: 3 });
    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    await respond(listRequest('degrees', (r) => r.params.get('page') === '3'), [], { page: 3, totalCount: 30, totalPages: 2 });
    await respond(listRequest('degrees', (r) => r.params.get('page') === '2'), [item('2', 'B')], { page: 2, totalCount: 30, totalPages: 2 });

    expect(current()).toBe('2');
  });

  it('keeps the rows on screen, marked busy, while another page loads, and ignores a second click', async () => {
    await open('degrees');
    await respond(listRequest('degrees'), [item('1', 'A')], { totalCount: 100, totalPages: 4 });

    pager().querySelector<HTMLButtonElement>('[aria-label="Page 2"]')!.click();
    fixture.detectChanges();

    expect(rows().length).toBe(1);
    expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    await respond(listRequest('degrees', (r) => r.params.get('page') === '2'), [item('2', 'B')], { page: 2, totalCount: 100, totalPages: 4 });
  });

  it('shows an error with a retry and no stale rows', async () => {
    await open('degrees');
    listRequest('degrees').flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Something went wrong');
    expect(page.querySelector('tbody')).toBeNull();

    button('Try again').click();
    await respond(listRequest('degrees'), [item('1', 'Recovered')]);
    expect(rows()[0]).toContain('Recovered');
  });

  it('resolves the names of a batch degree, semester and session', async () => {
    await open('batches');
    const batch = item('b1', 'Batch 12', { degreeId: 'd1', startingSemesterId: 's1', academicSessionId: 'a1' });
    await respond(listRequest('batches'), [batch]);
    await respond(listRequest('degrees', (r) => r.params.get('status') === 'all'), [item('d1', 'BSc')]);
    await respond(listRequest('semesters', (r) => r.params.get('status') === 'all'), [item('s1', 'Spring')]);
    await respond(listRequest('academic-sessions', (r) => r.params.get('status') === 'all'), [item('a1', '2026')]);

    const headers = Array.from(page.querySelectorAll('thead th')).map((h) => h.textContent!.trim());
    expect(headers).toEqual(['Name', 'Degree', 'Starting semester', 'Academic session', 'Status']);
    expect(rows()[0]).toContain('BSc');
    expect(rows()[0]).toContain('Spring');
    expect(rows()[0]).toContain('2026');
  });

  it('narrows upazilas by division and then district', async () => {
    await open('upazilas');
    await respond(listRequest('geography/upazilas'), [item('u1', 'Sadar', { districtId: 'g1' })]);
    await respond(listRequest('geography/divisions', (r) => r.params.get('status') === 'all'), [item('v1', 'Dhaka')]);
    await respond(listRequest('geography/districts', (r) => r.params.get('status') === 'all' && !r.params.has('divisionId')), [item('g1', 'Gazipur')]);

    const division = page.querySelector<HTMLSelectElement>('#division-filter')!;
    division.value = 'v1';
    division.dispatchEvent(new Event('change'));
    await settle();
    await respond(listRequest('geography/districts', (r) => r.params.get('divisionId') === 'v1'), [item('g1', 'Gazipur')]);
    await respond(listRequest('geography/upazilas'), [item('u1', 'Sadar', { districtId: 'g1' })]);

    const district = page.querySelector<HTMLSelectElement>('#district-filter')!;
    district.value = 'g1';
    district.dispatchEvent(new Event('change'));
    const request = listRequest('geography/upazilas', (r) => r.params.get('districtId') === 'g1');
    await respond(request, [item('u1', 'Sadar', { districtId: 'g1' })]);
    expect(rows()[0]).toContain('Sadar');
  });

  it('says so when the resource does not exist', async () => {
    await open('no-such-resource');

    expect(page.querySelector('[role=alert]')?.textContent).toContain('no such configuration resource');
  });
});
