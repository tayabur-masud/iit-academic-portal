import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../../testing/auth-testing';
import { ConfigurationItem, ConfigurationPage } from '../configuration.models';
import { CatalogList } from './catalog-list';
import { chooseOption, optionLabels, selectedValue } from '../../../../testing/select-testing';

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

  it('lists courses with code, type, degree, credit hours, and status, filtered by degree', async () => {
    await open('courses');
    await respond(listRequest('degrees'), [item('d1', 'EMIT'), item('d2', 'PGDIT', { isActive: false })]);
    await respond(listRequest('courses', (r) => !r.params.has('degreeId')), [
      item('c1', 'Algorithms', { code: 'CSE-201', type: 'Mandatory', degreeId: 'd1', creditHours: 3, theoryCreditHours: 2, labCreditHours: 1 }),
      item('c2', 'Seminar', { code: 'SEM-1', type: 'Elective', degreeId: 'd2', creditHours: 1.5, isActive: false }),
    ]);

    const headers = Array.from(page.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Code', 'Name', 'Type', 'Credit hours', 'Degree', 'Status']);
    const link = page.querySelector<HTMLAnchorElement>('tbody tr th[scope=row] a')!;
    expect(link.textContent?.trim()).toBe('CSE-201');
    expect(link.getAttribute('href')).toBe('/admin/configuration/courses/c1');
    expect(page.querySelector('tbody tr td')?.textContent?.trim()).toBe('Algorithms');
    expect(rows()[0]).toContain('CSE-201');
    expect(rows()[0]).toContain('Mandatory');
    expect(rows()[0]).toContain('3 (2 theory + 1 lab)');
    expect(rows()[0]).toContain('EMIT');
    expect(rows()[1]).toContain('1.5');
    expect(rows()[1]).toContain('Inactive');
    expect(page.querySelector('a.btn-primary')?.textContent).toContain('New course');

    expect(optionLabels(page, '#degree-filter')).toEqual(['All degrees', 'EMIT', 'PGDIT (inactive)']);
    chooseOption(page, '#degree-filter', 'd1');
    await respond(listRequest('courses', (r) => r.params.get('degreeId') === 'd1'), []);

    expect(page.textContent).toContain('No courses match');
  });

  it('filters courses by type together with the degree', async () => {
    await open('courses');
    await respond(listRequest('degrees'), [item('d1', 'EMIT')]);
    await respond(listRequest('courses', (r) => !r.params.has('type')), []);

    expect(page.querySelector('label[for="type-filter"]')?.textContent?.trim()).toBe('Type');
    expect(optionLabels(page, '#type-filter')).toEqual(['All types', 'Mandatory', 'Elective']);
    chooseOption(page, '#type-filter', 'Elective');
    await respond(listRequest('courses', (r) => r.params.get('type') === 'Elective' && !r.params.has('degreeId')), []);

    chooseOption(page, '#degree-filter', 'd1');
    await respond(listRequest('courses', (r) => r.params.get('type') === 'Elective' && r.params.get('degreeId') === 'd1'), []);

    button('Clear').click();
    await respond(listRequest('courses', (r) => !r.params.has('type') && !r.params.has('degreeId')), []);
    expect(selectedValue(page, '#type-filter')).toBe('');
  });

  it('offers institution types as the type filter and no type filter on an untyped catalog', async () => {
    await open('institutions');
    await respond(listRequest('institutions', (r) => !r.params.has('type')), []);
    expect(optionLabels(page, '#type-filter')).toEqual(['All types', 'School', 'College', 'University']);
    chooseOption(page, '#type-filter', 'College');
    await respond(listRequest('institutions', (r) => r.params.get('type') === 'College'), []);
    TestBed.resetTestingModule();

    await open('semesters');
    await respond(listRequest('semesters'), []);
    expect(page.querySelector('#type-filter')).toBeNull();
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
    chooseOption(page, '#status', 'inactive');
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

    chooseOption(page, '#division-filter', 'v1');
    await settle();
    await respond(listRequest('geography/districts', (r) => r.params.get('divisionId') === 'v1'), [item('g1', 'Gazipur')]);
    await respond(listRequest('geography/upazilas'), [item('u1', 'Sadar', { districtId: 'g1' })]);

    chooseOption(page, '#district-filter', 'g1');
    const request = listRequest('geography/upazilas', (r) => r.params.get('districtId') === 'g1');
    await respond(request, [item('u1', 'Sadar', { districtId: 'g1' })]);
    expect(rows()[0]).toContain('Sadar');
  });

  it('lists city corporations with their district and narrows them by division and then district', async () => {
    await open('city-corporations');
    await respond(listRequest('geography/city-corporations'), [item('c1', 'Gazipur City Corporation', { districtId: 'g1' })]);
    await respond(listRequest('geography/divisions', (r) => r.params.get('status') === 'all'), [item('v1', 'Dhaka')]);
    await respond(listRequest('geography/districts', (r) => r.params.get('status') === 'all' && !r.params.has('divisionId')), [item('g1', 'Gazipur')]);

    expect(page.querySelector('h1')?.textContent).toContain('City corporations');
    const headers = Array.from(page.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    expect(headers).toContain('District');
    expect(headers).not.toContain('Code');
    expect(rows()[0]).toContain('Gazipur City Corporation');
    expect(rows()[0]).toContain('Gazipur');
    expect(page.querySelector('#type-filter')).toBeNull();

    chooseOption(page, '#division-filter', 'v1');
    await settle();
    await respond(listRequest('geography/districts', (r) => r.params.get('divisionId') === 'v1'), [item('g1', 'Gazipur')]);
    await respond(listRequest('geography/city-corporations', (r) => !r.params.has('districtId')), []);

    chooseOption(page, '#district-filter', 'g1');
    await respond(listRequest('geography/city-corporations', (r) => r.params.get('districtId') === 'g1'), []);
    expect(page.textContent).toContain('No city corporations match');
  });

  it('leaves the Grade scale to its own editor', async () => {
    await open('grades');

    expect(page.querySelector('[role=alert]')?.textContent).toContain('no such configuration resource');
  });

  it('says so when the resource does not exist', async () => {
    await open('no-such-resource');

    expect(page.querySelector('[role=alert]')?.textContent).toContain('no such configuration resource');
  });
});
