import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { STUB_ROUTES, TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { UserAccount } from './user.models';
import { UserProvisioning } from './user-provisioning';

@Component({ selector: 'app-account-destination', template: '' })
class Destination {}

const ROOT = '/api/admin/users';

describe('UserProvisioning', () => {
  let fixture: ComponentFixture<UserProvisioning>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [UserProvisioning],
      providers: provideAuthTesting([...STUB_ROUTES, { path: 'admin/users/:userId', component: Destination }]),
    });
    http = httpMock();
    fixture = TestBed.createComponent(UserProvisioning);
    page = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }

  function pick(type: 'Admin' | 'Student'): void {
    const radio = page.querySelector<HTMLInputElement>(`#accountType-${type}`)!;
    radio.click();
    radio.dispatchEvent(new Event('change'));
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  async function createRequest(): Promise<TestRequest> {
    await settle();
    const tokens = http.match('/api/auth/anti-forgery-token');
    if (tokens.length > 0) {
      tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
      await settle();
    }
    return http.expectOne({ method: 'POST', url: ROOT });
  }

  async function render(): Promise<void> {
    await settle();
    fixture.detectChanges();
    await settle();
  }

  it('offers only Admin and Student, explains the setup email, and points teachers to Teacher Management', async () => {
    await open();

    const types = Array.from(page.querySelectorAll<HTMLInputElement>('input[type=radio]')).map((r) => r.id);
    expect(types).toEqual(['accountType-Admin', 'accountType-Student']);
    expect(page.textContent).not.toMatch(/Coordinator account|password field/i);
    expect(page.querySelector('input[type=password]')).toBeNull();
    expect(page.textContent).toContain('one-time link to choose a password');
    expect(page.querySelector('a[href="/admin/teachers/new"]')).not.toBeNull();
    expect(page.querySelector('label[for="email"]')?.textContent).toContain('Email address');
    expect(page.querySelector('fieldset legend')?.textContent).toContain('Account type');
  });

  it('checks the required fields before sending anything and marks them invalid', async () => {
    await open();

    submit();
    await render();

    expect(page.querySelector('#email')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.querySelector('#email-error')?.textContent).toContain('Enter the email address');
    expect(page.querySelector('#accountType-error')?.textContent).toContain('Choose Admin or Student');
    expect(http.match(ROOT)).toHaveLength(0);
  });

  it('creates a Student with only email and type, then opens the account with a pending-setup notice', async () => {
    await open();
    type('#email', '  new.student@iit.test ');
    pick('Student');

    submit();
    const request = await createRequest();
    expect(request.request.body).toEqual({ email: 'new.student@iit.test', accountType: 'Student' });
    expect(request.request.headers.get('X-CSRF-Token')).toBe(TEST_CSRF_TOKEN);
    request.flush({
      userId: 'u-9',
      email: 'new.student@iit.test',
      accountStatus: 'PendingCredentialSetup',
      roles: ['Student'],
      defaultRole: 'Student',
      concurrencyStamp: 's',
    } satisfies UserAccount);
    await render();

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/admin/users/u-9');
    const notice = router.lastSuccessfulNavigation()?.extras.state?.['notice'] as string;
    expect(notice).toContain('setup email was requested');
    expect(notice).toContain('pending');
    expect(notice).not.toMatch(/proof|http/i);
  });

  it('shows a duplicate email conflict on the email field without leaving the page', async () => {
    await open();
    type('#email', 'taken@iit.test');
    pick('Admin');

    submit();
    (await createRequest()).flush(...problem(409, 'An account with this email already exists.'));
    await render();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Account not added');
    expect(page.querySelector('#email-error')?.textContent).toContain('already exists');
    expect(page.querySelector('#email')?.getAttribute('aria-invalid')).toBe('true');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('maps field-keyed validation problems to their fields', async () => {
    await open();
    type('#email', 'bad');
    pick('Admin');

    submit();
    (await createRequest()).flush(...problem(400, 'Invalid', { email: ['Enter a valid email address.'] }));
    await render();

    expect(page.querySelector('#email-error')?.textContent).toContain('Enter a valid email address.');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Some fields need attention');
  });

  it('explains a 403 as a role problem', async () => {
    await open();
    type('#email', 'x@iit.test');
    pick('Admin');

    submit();
    (await createRequest()).flush(...problem(403, 'Forbidden'));
    await render();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Switch to the Admin role');
  });
});
