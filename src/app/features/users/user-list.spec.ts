import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { UserAccount, UserAccountPage } from './user.models';
import { UserList } from './user-list';
import { chooseOption } from '../../../testing/select-testing';

const ROOT = '/api/admin/users';

function account(id: string, email: string, extra: Partial<UserAccount> = {}): UserAccount {
  return {
    userId: id,
    email,
    accountStatus: 'Active',
    roles: ['Student'],
    defaultRole: 'Student',
    concurrencyStamp: `stamp-${id}`,
    ...extra,
  };
}

describe('UserList', () => {
  let fixture: ComponentFixture<UserList>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(): Promise<void> {
    TestBed.configureTestingModule({ imports: [UserList], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(UserList);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => http.verify());

  function listRequest(match: (r: TestRequest['request']) => boolean = () => true): TestRequest {
    return http.expectOne((r) => r.url === ROOT && match(r));
  }

  async function respond(request: TestRequest, items: UserAccount[], totals: { page?: number; totalCount?: number; totalPages?: number } = {}): Promise<void> {
    const count = totals.totalCount ?? items.length;
    request.flush({ items, page: totals.page ?? 1, totalCount: count, totalPages: totals.totalPages ?? Math.ceil(count / 25) } satisfies UserAccountPage);
    await settle();
    fixture.detectChanges();
  }

  function rows(): string[] {
    return Array.from(page.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  function choose(selector: string, value: string): void {
    chooseOption(page, selector, value);
  }

  function submitSearch(value: string): void {
    const input = page.querySelector<HTMLInputElement>('#search')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  it('loads a bounded first batch, then shows every role with status text and a link to each account', async () => {
    await open();
    expect(page.textContent).toContain('Loading accounts');
    const first = listRequest();
    expect(first.request.params.get('page')).toBe('1');
    expect(first.request.params.get('pageSize')).toBe('25');
    expect(first.request.params.has('role')).toBe(false);
    expect(first.request.params.has('status')).toBe(false);
    await respond(first, [
      account('a1', 'admin@iit.test', { roles: ['Admin'], defaultRole: 'Admin' }),
      account('s1', 'student@iit.test', { accountStatus: 'PendingCredentialSetup' }),
      account('t1', 'teacher@iit.test', { roles: ['Teacher', 'Coordinator'], defaultRole: 'Teacher', teacherId: 'tp-1' }),
      account('x1', 'gone@iit.test', { accountStatus: 'Deactivated' }),
    ]);

    expect(page.querySelector('h1')?.textContent).toContain('Accounts');
    expect(rows()[0]).toContain('admin@iit.test');
    expect(rows()[0]).toContain('Admin');
    expect(rows()[1]).toContain('Pending setup');
    expect(rows()[2]).toContain('Teacher, Coordinator');
    expect(rows()[3]).toContain('Deactivated');
    expect(page.querySelector('tbody a')?.getAttribute('href')).toBe('/admin/users/a1');
    expect(page.querySelector('a.btn-primary')?.getAttribute('href')).toBe('/admin/users/new');
    expect(page.querySelector('nav[aria-label="Pages of results"]')).toBeNull();
  });

  it('never renders secret material even if a response carried it', async () => {
    await open();
    await respond(listRequest(), [{ ...account('a1', 'a@iit.test'), passwordHash: 'HASH', proof: 'PROOF' } as unknown as UserAccount]);

    expect(page.textContent).not.toMatch(/password|hash|proof|stamp-a1/i);
  });

  it('sends the search, role and status filters and resets to the first batch', async () => {
    await open();
    await respond(listRequest(), [account('1', 'a@iit.test')], { totalCount: 80, totalPages: 4 });

    choose('#role', 'Coordinator');
    await respond(listRequest((r) => r.params.get('role') === 'Coordinator' && r.params.get('page') === '1'), []);
    expect(page.textContent).toContain('No accounts match');

    choose('#status', 'PendingCredentialSetup');
    await respond(listRequest((r) => r.params.get('role') === 'Coordinator' && r.params.get('status') === 'PendingCredentialSetup'), []);

    submitSearch('  user-id-42 ');
    await respond(listRequest((r) => r.params.get('search') === 'user-id-42' && r.params.get('page') === '1'), [account('user-id-42', 'z@iit.test')]);
    expect(rows()[0]).toContain('z@iit.test');

    button('Clear filters').click();
    await respond(listRequest((r) => !r.params.has('search') && !r.params.has('role') && !r.params.has('status')), [account('1', 'a@iit.test')]);
  });

  it('explains an empty directory differently from a search with no match', async () => {
    await open();
    await respond(listRequest(), []);
    expect(page.textContent).toContain('No accounts yet');

    submitSearch('zzz');
    await respond(listRequest((r) => r.params.get('search') === 'zzz'), []);
    expect(page.textContent).toContain('No accounts match');
  });

  it('appends sequential batches with a keyboard-reachable fallback and announces progress', async () => {
    await open();
    await respond(listRequest(), [account('1', 'a@iit.test')], { totalCount: 30, totalPages: 2 });
    expect(page.querySelector('[role=status].sr-only')?.textContent).toContain('More accounts are available');

    const more = button('Load more accounts');
    expect(more.type).toBe('button');
    more.click();
    await respond(listRequest((r) => r.params.get('page') === '2'), [account('2', 'b@iit.test')], { page: 2, totalCount: 30, totalPages: 2 });

    expect(rows()).toHaveLength(2);
    expect(page.textContent).toContain('All 2 matching accounts loaded');
  });

  it('keeps loaded rows when a later batch fails and retries it', async () => {
    await open();
    await respond(listRequest(), [account('1', 'a@iit.test')], { totalCount: 30, totalPages: 2 });

    button('Load more accounts').click();
    listRequest((r) => r.params.get('page') === '2').flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(rows()).toHaveLength(1);
    expect(page.querySelector('[role=alert]')?.textContent).toContain('More accounts not shown');
    button('Try again').click();
    await respond(listRequest((r) => r.params.get('page') === '2'), [account('2', 'b@iit.test')], { page: 2, totalCount: 30, totalPages: 2 });
    expect(rows()).toHaveLength(2);
  });

  it('shows a denied or failed load as an alert with a retry', async () => {
    await open();
    listRequest().flush(...problem(403, 'Your active role cannot do this.'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Accounts not shown');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Your active role cannot do this.');
    button('Try again').click();
    await respond(listRequest(), [account('1', 'a@iit.test')]);
    expect(page.querySelector('[role=alert]')).toBeNull();
  });

  it('labels every filter and keeps the table in a scrollable container for narrow screens', async () => {
    await open();
    await respond(listRequest(), [account('1', 'a@iit.test')]);

    for (const id of ['search', 'role', 'status']) {
      expect(page.querySelector(`label[for="${id}"]`)?.textContent?.trim().length).toBeGreaterThan(0);
    }
    expect(page.querySelector('#search')?.getAttribute('aria-describedby')).toBe('search-help');
    expect(page.querySelector('.data-table-container table caption')?.textContent).toContain('Accounts, 1 loaded');
    expect(page.querySelector('tbody th[scope=row]')).not.toBeNull();
  });
});
