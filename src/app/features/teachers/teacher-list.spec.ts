import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { Teacher, TeacherPage } from './teacher.models';
import { TeacherList } from './teacher-list';

const ROOT = '/api/admin/teachers';

function teacher(id: string, name: string, extra: Partial<Teacher> = {}): Teacher {
  return {
    id,
    userId: `u-${id}`,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@iit.test`,
    displayName: name,
    isActive: true,
    accountStatus: 'Active',
    roles: ['Teacher'],
    defaultRole: 'Teacher',
    createdAtUtc: '2026-10-14T08:30:00Z',
    lastModifiedAtUtc: '2026-10-14T08:30:00Z',
    ...extra,
  };
}

describe('TeacherList', () => {
  let fixture: ComponentFixture<TeacherList>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(): Promise<void> {
    TestBed.configureTestingModule({ imports: [TeacherList], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(TeacherList);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => http.verify());

  function listRequest(match: (r: TestRequest['request']) => boolean = () => true): TestRequest {
    return http.expectOne((r) => r.url === ROOT && match(r));
  }

  async function respond(request: TestRequest, items: Teacher[], totals: { page?: number; totalCount?: number; totalPages?: number } = {}): Promise<void> {
    const count = totals.totalCount ?? items.length;
    request.flush({
      items,
      page: totals.page ?? 1,
      totalCount: count,
      totalPages: totals.totalPages ?? Math.ceil(count / 25),
    } satisfies TeacherPage);
    await settle();
    fixture.detectChanges();
  }

  function rows(): string[] {
    return Array.from(page.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  function submitSearch(value: string): void {
    const input = page.querySelector<HTMLInputElement>('#search')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  it('shows a loading state, then the teachers with status text, roles, designation and a way to add one', async () => {
    await open();
    expect(page.textContent).toContain('Loading teachers');
    const first = listRequest();
    expect(first.request.params.get('page')).toBe('1');
    expect(first.request.params.get('pageSize')).toBe('25');
    expect(first.request.params.has('status')).toBe(false);
    await respond(first, [
      teacher('1', 'Ada Lovelace', { employeeStaffId: 'EMP-1', designationName: 'Lecturer', roles: ['Admin', 'Teacher'] }),
      teacher('2', 'Alan Turing', { accountStatus: 'PendingCredentialSetup' }),
      teacher('3', 'Grace Hopper', { accountStatus: 'Deactivated', isActive: false }),
    ]);

    expect(page.querySelector('h1')?.textContent).toContain('Teachers');
    expect(rows()[0]).toContain('Ada Lovelace');
    expect(rows()[0]).toContain('EMP-1');
    expect(rows()[0]).toContain('Lecturer');
    expect(rows()[0]).toContain('Admin, Teacher');
    expect(rows()[0]).toContain('Active');
    expect(rows()[1]).toContain('Pending setup');
    expect(rows()[2]).toContain('Deactivated');
    expect(page.querySelector('tbody a')?.getAttribute('href')).toBe('/admin/teachers/1');
    expect(page.querySelector('a.btn-primary')?.getAttribute('href')).toBe('/admin/teachers/new');
    expect(page.querySelector('nav[aria-label="Pages of results"]')).toBeNull();
    expect(page.textContent).not.toMatch(/password|hash/i);
  });

  it('explains an empty directory differently from a search with no match', async () => {
    await open();
    await respond(listRequest(), []);
    expect(page.textContent).toContain('No teachers yet');

    submitSearch('zzz');
    await respond(listRequest((r) => r.params.get('search') === 'zzz'), []);

    expect(page.textContent).toContain('No teachers match');
  });

  it('searches and filters by account status, resetting the sequential request to page one', async () => {
    await open();
    await respond(listRequest(), [teacher('1', 'Ada')], { totalCount: 80, totalPages: 4 });

    const select = page.querySelector<HTMLSelectElement>('#status')!;
    select.value = 'Deactivated';
    select.dispatchEvent(new Event('change'));
    await respond(listRequest((r) => r.params.get('status') === 'Deactivated' && r.params.get('page') === '1'), [
      teacher('9', 'Gone', { accountStatus: 'Deactivated', isActive: false }),
    ]);

    expect(rows()[0]).toContain('Gone');
    expect(page.querySelector('nav[aria-label="Pages of results"]')).toBeNull();
  });

  it('appends sequential server batches without showing numbered pagination', async () => {
    await open();
    await respond(listRequest(), [teacher('1', 'Ada')], { totalCount: 60, totalPages: 3 });
    expect(page.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(page.querySelector('nav[aria-label="Pages of results"]')).toBeNull();
    expect(page.textContent).toContain('Load more teachers');

    button('Load more teachers').click();
    await respond(listRequest((r) => r.params.get('page') === '2'), [teacher('26', 'Bob')], { page: 2, totalCount: 60, totalPages: 3 });
    expect(page.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(rows()[0]).toContain('Ada');
    expect(rows()[1]).toContain('Bob');

    button('Load more teachers').click();
    await respond(listRequest((r) => r.params.get('page') === '3'), [teacher('51', 'Grace')], { page: 3, totalCount: 60, totalPages: 3 });

    expect(page.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(page.textContent).toContain('All 3 matching teachers loaded');
    expect(page.querySelector('nav[aria-label="Pages of results"]')).toBeNull();
  });

  it('keeps rows visible while the next batch loads and preserves them when that batch fails', async () => {
    await open();
    await respond(listRequest(), [teacher('1', 'Ada')], { totalCount: 50, totalPages: 2 });

    button('Load more teachers').click();
    fixture.detectChanges();
    expect(page.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(page.textContent).toContain('Loading more teachers');

    listRequest((r) => r.params.get('page') === '2').flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(page.querySelector('[role=alert]')?.textContent).toContain('More teachers not shown');
    button('Try again').click();
    await respond(listRequest((r) => r.params.get('page') === '2'), [teacher('26', 'Bob')], { page: 2, totalCount: 50, totalPages: 2 });
    expect(page.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('shows the service error with a way to retry', async () => {
    await open();
    listRequest().flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Teachers not shown');

    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again'))!.click();
    await respond(listRequest(), [teacher('1', 'Ada')]);

    expect(rows()[0]).toContain('Ada');
    expect(page.querySelector('[role=alert]')).toBeNull();
  });
});
