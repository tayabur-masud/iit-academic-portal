import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { CredentialSetupReissue, UserAccount } from './user.models';
import { UserMaintenance } from './user-maintenance';

const ROOT = '/api/admin/users';

function account(extra: Partial<UserAccount> = {}): UserAccount {
  return {
    userId: 'u-1',
    email: 'student@iit.test',
    accountStatus: 'Active',
    roles: ['Student'],
    defaultRole: 'Student',
    concurrencyStamp: 'stamp-1',
    createdAtUtc: '2026-10-18T08:00:00Z',
    createdByUserId: 'admin-1',
    createdBy: 'admin@iit.test',
    lastModifiedAtUtc: '2026-10-18T09:00:00Z',
    lastModifiedByUserId: 'admin-1',
    lastModifiedBy: 'admin@iit.test',
    ...extra,
  };
}

describe('UserMaintenance', () => {
  let fixture: ComponentFixture<UserMaintenance>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(loaded: UserAccount = account()): Promise<void> {
    TestBed.configureTestingModule({ imports: [UserMaintenance], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(UserMaintenance);
    fixture.componentRef.setInput('userId', loaded.userId);
    page = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne({ method: 'GET', url: `${ROOT}/${loaded.userId}` }).flush(loaded);
    await render();
  }

  afterEach(() => http.verify());

  async function render(): Promise<void> {
    await settle();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }

  async function writeRequest(method: string, path: string): Promise<TestRequest> {
    await settle();
    const tokens = http.match('/api/auth/anti-forgery-token');
    if (tokens.length > 0) {
      tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
      await settle();
    }
    return http.expectOne({ method, url: `${ROOT}${path}` });
  }

  function section(id: string): HTMLElement {
    return page.querySelector<HTMLElement>(`section[aria-labelledby="${id}"]`)!;
  }

  it('shows identity, status, roles, default role and history, and no secret', async () => {
    await open();

    expect(page.textContent).toContain('student@iit.test');
    expect(page.textContent).toContain('u-1');
    expect(page.textContent).toContain('Active');
    expect(page.textContent).toContain('admin@iit.test');
    expect(page.textContent).not.toMatch(/password hash|proof|stamp-1/i);
    expect(section('setup-title')).toBeNull();
  });

  it('changes the email with the loaded concurrency stamp and shows the saved address', async () => {
    await open();
    type('#email', '  renamed@iit.test ');

    section('email-title').querySelector('form')!.dispatchEvent(new Event('submit'));
    const request = await writeRequest('PUT', '/u-1/email');
    expect(request.request.body).toEqual({ email: 'renamed@iit.test', expectedConcurrencyStamp: 'stamp-1' });
    request.flush(account({ email: 'renamed@iit.test', concurrencyStamp: 'stamp-2' }));
    await render();

    expect(page.querySelector('[role=status].alert')?.textContent).toContain('renamed@iit.test');
    expect(page.querySelector<HTMLInputElement>('#email')?.value).toBe('renamed@iit.test');
  });

  it('explains a stale or duplicate email conflict and offers a reload', async () => {
    await open();
    type('#email', 'other@iit.test');

    section('email-title').querySelector('form')!.dispatchEvent(new Event('submit'));
    (await writeRequest('PUT', '/u-1/email')).flush(...problem(409, 'The account was changed by someone else. Reload it and try again.'));
    await render();

    expect(section('email-title').querySelector('[role=alert]')?.textContent).toContain('changed by someone else');
    button('Reload the account').click();
    http.expectOne({ method: 'GET', url: `${ROOT}/u-1` }).flush(account({ concurrencyStamp: 'stamp-3' }));
    await render();
    expect(section('email-title').querySelector('[role=alert]')).toBeNull();
  });

  it('marks an invalid email field from a validation problem', async () => {
    await open();
    type('#email', 'bad');

    section('email-title').querySelector('form')!.dispatchEvent(new Event('submit'));
    (await writeRequest('PUT', '/u-1/email')).flush(...problem(400, 'Invalid', { email: ['Enter a valid email address.'] }));
    await render();

    expect(page.querySelector('#email')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.querySelector('#email-error')?.textContent).toContain('Enter a valid email address.');
  });

  it('keeps a Student account Student-only with no role controls', async () => {
    await open();

    expect(section('roles-title').textContent).toContain('only the Student role');
    expect(section('roles-title').querySelector('select, input[type=checkbox]')).toBeNull();
  });

  it('lets an Admin who also holds Coordinator choose a default role but never sends Coordinator', async () => {
    await open(account({ userId: 'u-2', email: 'a@iit.test', roles: ['Admin', 'Coordinator'], defaultRole: 'Admin' }));

    expect(section('roles-title').textContent).toContain('Coordinator follows batch-coordinator assignments');
    const select = page.querySelector<HTMLSelectElement>('#defaultRole')!;
    select.value = 'Coordinator';
    select.dispatchEvent(new Event('change'));
    section('roles-title').querySelector('form')!.dispatchEvent(new Event('submit'));
    const request = await writeRequest('PUT', '/u-2/roles');

    expect(request.request.body).toEqual({ roles: ['Admin'], defaultRole: 'Coordinator' });
    request.flush(account({ userId: 'u-2', email: 'a@iit.test', roles: ['Admin', 'Coordinator'], defaultRole: 'Coordinator' }));
    await render();
    expect(page.textContent).toContain('default role was saved');
  });

  it('sends teacher changes to Teacher Management and offers no generic roles or deactivation for them', async () => {
    await open(account({ userId: 'u-3', email: 't@iit.test', roles: ['Teacher'], defaultRole: 'Teacher', teacherId: 'tp-9' }));

    expect(page.querySelector('a[href="/admin/teachers/tp-9"]')?.textContent).toContain('Open in Teachers');
    expect(section('roles-title')).toBeNull();
    expect(section('deactivate-title')).toBeNull();
  });

  it('asks for confirmation before deactivating, and the confirmation is keyboard reachable', async () => {
    await open();

    button('Deactivate account').click();
    fixture.detectChanges();
    const confirm = button('Yes, deactivate');
    expect(confirm.type).toBe('button');
    expect(page.querySelector('.alert-warning[role=alert]')?.textContent).toContain('Deactivate student@iit.test?');
    expect(http.match(`${ROOT}/u-1/deactivation`)).toHaveLength(0);

    button('Cancel').click();
    fixture.detectChanges();
    expect(page.querySelector('.alert-warning')).toBeNull();
  });

  it('deactivates after confirmation and shows the result', async () => {
    await open();

    button('Deactivate account').click();
    fixture.detectChanges();
    button('Yes, deactivate').click();
    (await writeRequest('POST', '/u-1/deactivation')).flush(account({ accountStatus: 'Deactivated' }));
    await render();

    expect(page.textContent).toContain('was deactivated');
    expect(page.textContent).toContain('This account is deactivated');
    expect(section('deactivate-title')).toBeNull();
  });

  it('shows the service refusal for self-deactivation or the last Admin without changing the account', async () => {
    await open(account({ roles: ['Admin'], defaultRole: 'Admin' }));

    button('Deactivate account').click();
    fixture.detectChanges();
    button('Yes, deactivate').click();
    (await writeRequest('POST', '/u-1/deactivation')).flush(...problem(409, 'You cannot deactivate your own account. Ask another Admin to do it.'));
    await render();

    expect(page.querySelector('.alert-warning')?.textContent).toContain('You cannot deactivate your own account');
    expect(page.textContent).not.toContain('This account is deactivated');
  });

  it('offers a confirmed setup-email reissue only while pending and never shows a link', async () => {
    await open(account({ accountStatus: 'PendingCredentialSetup' }));

    expect(section('setup-title').textContent).toContain('Earlier setup links stop working');
    button('Send a new setup email').click();
    fixture.detectChanges();
    button('Yes, send it').click();
    const request = await writeRequest('POST', '/u-1/credential-setup-reissues');
    request.flush({
      account: account({ accountStatus: 'PendingCredentialSetup' }),
      setupEmailRequested: true,
      message: 'A new setup email was requested. Earlier setup links no longer work.',
    } satisfies CredentialSetupReissue);
    await render();

    expect(page.textContent).toContain('A new setup email was requested');
    expect(page.textContent).not.toMatch(/https?:|proof/i);
  });

  it('reports a reissue the service could not queue', async () => {
    await open(account({ accountStatus: 'PendingCredentialSetup' }));

    button('Send a new setup email').click();
    fixture.detectChanges();
    button('Yes, send it').click();
    (await writeRequest('POST', '/u-1/credential-setup-reissues')).flush({
      account: account({ accountStatus: 'PendingCredentialSetup' }),
      setupEmailRequested: false,
      message: 'Earlier setup links no longer work, but the new setup email could not be queued. Try again shortly.',
    } satisfies CredentialSetupReissue);
    await render();

    expect(section('setup-title').querySelector('[role=alert]')?.textContent).toContain('could not be queued');
  });

  it('shows a not-found account as an alert with a way back', async () => {
    TestBed.configureTestingModule({ imports: [UserMaintenance], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(UserMaintenance);
    fixture.componentRef.setInput('userId', 'missing');
    page = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne(`${ROOT}/missing`).flush(...problem(404, 'No account has that identifier.'));
    await render();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('This account was not found.');
    expect(page.querySelector('a[href="/admin/users"]')).not.toBeNull();
  });
});
