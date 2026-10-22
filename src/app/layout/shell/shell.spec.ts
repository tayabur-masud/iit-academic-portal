import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { AuthSession } from '../../core/auth/auth-session';
import { SessionContext } from '../../core/auth/auth.models';
import {
  context,
  flushCsrf,
  httpMock,
  problem,
  provideAuthTesting,
  settle,
} from '../../../testing/auth-testing';
import { Shell } from './shell';

describe('Shell', () => {
  let fixture: ComponentFixture<Shell>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function render(session: SessionContext): Promise<void> {
    TestBed.configureTestingModule({ imports: [Shell], providers: provideAuthTesting() });
    http = httpMock();
    const loaded = TestBed.inject(AuthSession).refresh();
    http.expectOne('/api/auth/sessions/current').flush(session);
    await loaded;
    fixture = TestBed.createComponent(Shell);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => http.verify());

  function roleInputs(): HTMLInputElement[] {
    return Array.from(page.querySelectorAll<HTMLInputElement>('input[name="active-role"]'));
  }

  async function chooseRole(role: string): Promise<void> {
    const input = roleInputs().find((item) => item.value === role)!;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushCsrf(http);
  }

  function accountSection(): HTMLElement {
    return page.querySelector<HTMLElement>('aside section[aria-label="Your account"]')!;
  }

  it('keeps the active role and sign-out at the bottom of the menu, not in the header', async () => {
    await render(context(['Teacher', 'Coordinator'], 'Teacher'));

    const sidebar = page.querySelector('aside')!;
    expect(sidebar.lastElementChild).toBe(accountSection());
    expect(roleInputs()).toHaveLength(2);
    expect(accountSection().textContent).toContain('Sign out');
    expect(page.querySelector('header')?.textContent).not.toContain('Sign out');
    expect(page.querySelector('header input[name="active-role"]')).toBeNull();
  });

  it('opens account actions from a profile dropdown and closes on Escape or an outside click', async () => {
    await render(context(['Teacher', 'Coordinator'], 'Teacher'));

    const menu = page.querySelector<HTMLDetailsElement>('details.account-dropdown')!;
    const trigger = menu.querySelector<HTMLElement>('summary')!;

    expect(menu.open).toBe(false);
    trigger.click();
    expect(menu.open).toBe(true);
    expect(menu.querySelectorAll('input[name="active-role"]')).toHaveLength(2);
    expect(menu.textContent).toContain('Sign out');
    expect(menu.querySelector<HTMLButtonElement>('.account-dropdown-item')).toMatchObject({ disabled: true });
    expect(menu.textContent).toContain('My Profile');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.open).toBe(false);

    trigger.click();
    expect(menu.open).toBe(true);
    page.querySelector('main')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.open).toBe(false);
  });

  it('always offers an explicit sign-out', async () => {
    await render(context(['Student'], 'Student'));

    Array.from(accountSection().querySelectorAll('button')).find((b) => b.textContent?.includes('Sign out'))!.click();
    await flushCsrf(http);
    http.expectOne({ method: 'DELETE', url: '/api/auth/sessions/current' }).flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(TestBed.inject(AuthSession).isAuthenticated()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('identifies the active role of a single-role account without offering a switch', async () => {
    await render(context(['Student'], 'Student'));

    expect(page.querySelector('.badge')?.textContent).toContain('Role: Student');
    expect(roleInputs()).toHaveLength(0);
    expect(page.querySelector('nav')?.textContent).toContain('Dashboard');
  });

  it('shows the IIT logo and portal name in the header', async () => {
    await render(context(['Student'], 'Student'));

    const logo = page.querySelector<HTMLImageElement>('header img')!;
    expect(logo.getAttribute('src')).toBe('images/iit-logo.png');
    expect(logo.alt).toBe('IIT, University of Dhaka');
    expect(page.querySelector('header')?.textContent).toContain('IIT Academic Portal');
  });

  it('lists Accounts, Teachers, Staff, Students, Configuration, Notifications and audit history under the Admin module only', async () => {
    await render(context(['Admin', 'Teacher'], 'Admin'));
    const links = Array.from(page.querySelectorAll('nav a')).map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([
      ['Dashboard', '/admin'],
      ['Accounts', '/admin/users'],
      ['Teachers', '/admin/teachers'],
      ['Staff', '/admin/staff'],
      ['Students', '/admin/students'],
      ['Configuration', '/admin/configuration'],
      ['Notifications', '/admin/notifications'],
      ['Audit history', '/admin/audit'],
    ]);
  });

  it('shows no Accounts, Teachers, Staff, Students, Configuration, Notifications or audit navigation to other roles, even an Admin acting as another role', async () => {
    await render(context(['Admin', 'Teacher'], 'Teacher'));
    const text = page.querySelector('nav')?.textContent;
    expect(text).not.toContain('Accounts');
    expect(text).not.toContain('Teachers');
    expect(text).not.toContain('Staff');
    expect(text).not.toContain('Students');
    expect(text).not.toContain('Configuration');
    expect(text).not.toContain('Notifications');
    expect(text).not.toContain('Audit');
  });

  it('keeps My Profile view-only for an Admin: a disabled action with no link to a staff-profile editor', async () => {
    await render(context(['Admin'], 'Admin'));
    const menu = page.querySelector<HTMLDetailsElement>('details.account-dropdown')!;
    menu.querySelector<HTMLElement>('summary')!.click();

    const myProfile = Array.from(menu.querySelectorAll<HTMLElement>('button, a')).find((e) => e.textContent?.includes('My Profile'))!;
    expect(myProfile.tagName).toBe('BUTTON');
    expect((myProfile as HTMLButtonElement).disabled).toBe(true);
    expect(menu.querySelector('a[href*="/admin/staff"]')).toBeNull();
    expect(menu.querySelector('form, input:not([name="active-role"])')).toBeNull();
  });

  it('offers only the assigned roles and marks the active one', async () => {
    await render(context(['Teacher', 'Coordinator'], 'Teacher'));

    const inputs = roleInputs();
    expect(inputs.map((input) => input.value)).toEqual(['Teacher', 'Coordinator']);
    expect(inputs.map((input) => input.checked)).toEqual([true, false]);
    expect(page.querySelector('.account-role-group legend')?.textContent).toContain('Active role');
  });

  it('switches role through the service and opens the new role landing page', async () => {
    await render(context(['Teacher', 'Coordinator'], 'Teacher'));

    await chooseRole('Coordinator');
    const request = http.expectOne('/api/auth/sessions/current/active-role');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ role: 'Coordinator' });
    request.flush(context(['Teacher', 'Coordinator'], 'Coordinator'));
    await settle();
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/coordinator');
    expect(page.querySelector('nav')?.textContent).toContain('Dashboard');
    expect(page.querySelector('[role=status]')?.textContent).toContain('Switched to the Coordinator role');
  });

  it('keeps the current role and explains when a switch is rejected', async () => {
    await render(context(['Teacher', 'Coordinator'], 'Teacher'));

    await chooseRole('Coordinator');
    http
      .expectOne('/api/auth/sessions/current/active-role')
      .flush(...problem(403, 'You can only switch to a role assigned to your account.'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Role not switched');
    expect(roleInputs().find((input) => input.value === 'Teacher')?.checked).toBe(true);
    expect(TestBed.inject(AuthSession).activeRole()).toBe('Teacher');
  });
});
