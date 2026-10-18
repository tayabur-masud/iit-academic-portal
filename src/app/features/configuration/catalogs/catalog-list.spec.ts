import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../../testing/auth-testing';
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

  async function respond(request: TestRequest, items: ConfigurationItem[], nextCursor: string | null = null): Promise<void> {
    request.flush({
      items,
      nextCursor,
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
    expect(first.request.params.has('page')).toBe(false);
    expect(first.request.params.has('cursor')).toBe(false);
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

  function loadMoreButton(): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Load more'))!;
  }

  it('appends cursor batches and replaces numbered pagination with a load-more fallback', async () => {
    await open('degrees');
    const first = listRequest('degrees');
    await respond(first, [item('1', 'A')], 'cursor-2');
    expect(page.querySelector('nav[aria-label="Pages of results"]')).toBeNull();
    expect(page.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(page.textContent).toContain('Load more');

    loadMoreButton().click();
    const second = listRequest('degrees', (r) => r.params.get('cursor') === 'cursor-2');
    expect(second.request.params.has('page')).toBe(false);
    await respond(second, [item('2', 'B')]);

    expect(page.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(rows()[0]).toContain('A');
    expect(rows()[1]).toContain('B');
    expect(page.textContent).toContain('All 2 matching records loaded');
    expect(page.querySelector('nav[aria-label="Pages of results"]')).toBeNull();
  });

  it('resets the cursor and replaces rows when search or status changes', async () => {
    await open('degrees');
    await respond(listRequest('degrees'), [item('1', 'A')], 'cursor-2');
    loadMoreButton().click();
    await respond(listRequest('degrees', (r) => r.params.get('cursor') === 'cursor-2'), [item('2', 'B')], 'cursor-3');
    expect(page.querySelectorAll('tbody tr')).toHaveLength(2);

    const input = page.querySelector<HTMLInputElement>('#search')!;
    input.value = '  bit ';
    input.dispatchEvent(new Event('input'));
    const status = page.querySelector<HTMLSelectElement>('#status')!;
    status.value = 'inactive';
    status.dispatchEvent(new Event('change'));
    const request = listRequest('degrees', (r) => r.params.get('status') === 'inactive');
    expect(request.request.params.get('search')).toBe('bit');
    expect(request.request.params.has('cursor')).toBe(false);
    await respond(request, [item('5', 'Archived', { isActive: false })]);

    expect(page.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(rows()[0]).toContain('Archived');
  });

  it('keeps existing rows while another cursor loads and prevents a second request', async () => {
    await open('degrees');
    await respond(listRequest('degrees'), [item('1', 'A')], 'cursor-2');

    loadMoreButton().click();
    fixture.detectChanges();

    expect(rows().length).toBe(1);
    expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(page.textContent).toContain('Loading more degrees');
    http.expectNone((r) => r.params.get('cursor') === 'cursor-3');
    await respond(listRequest('degrees', (r) => r.params.get('cursor') === 'cursor-2'), [item('2', 'B')], 'cursor-3');
    expect(rows()).toHaveLength(2);
  });

  it('shows an initial-load error with retry and no stale rows', async () => {
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

  it('keeps loaded rows and retries a failed later cursor', async () => {
    await open('degrees');
    await respond(listRequest('degrees'), [item('1', 'A')], 'cursor-2');
    loadMoreButton().click();
    listRequest('degrees', (r) => r.params.get('cursor') === 'cursor-2').flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(rows()).toHaveLength(1);
    expect(page.querySelector('[role=alert]')?.textContent).toContain('More records not shown');
    button('Try again').click();
    await respond(listRequest('degrees', (r) => r.params.get('cursor') === 'cursor-2'), [item('2', 'B')]);
    expect(rows()).toHaveLength(2);
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
