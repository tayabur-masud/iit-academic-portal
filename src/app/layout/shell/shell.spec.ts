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
import { Shell, initialsOf } from './shell';

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
    return page.querySelector<HTMLElement>('header section[aria-label="Your account"]')!;
  }

  it('keeps the account menu (active role, My Profile, sign-out) at the right of the header and the theme at the bottom of the sidebar', async () => {
    await render(context(['Teacher', 'Coordinator'], 'Teacher'));

    const header = page.querySelector('header')!;
    expect(header.lastElementChild).toBe(accountSection());
    expect(roleInputs()).toHaveLength(2);
    expect(accountSection().textContent).toContain('Sign out');
    expect(accountSection().textContent).toContain('My Profile');
    const sidebar = page.querySelector('aside')!;
    expect(sidebar.textContent).not.toContain('Sign out');
    expect(sidebar.querySelector('input[name="active-role"]')).toBeNull();
    expect(sidebar.lastElementChild?.querySelector('[role=group][aria-labelledby="theme-label"]')).not.toBeNull();
    expect(header.querySelector('[aria-labelledby="theme-label"]')).toBeNull();
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
    expect(menu.querySelector('a.account-dropdown-item')?.getAttribute('href')).toBe('/profile');
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

  it('shows a single-role account no role or role switch in the menu (the role is only read out on the trigger)', async () => {
    await render(context(['Student'], 'Student'));

    expect(page.querySelector('details.account-dropdown .badge')).toBeNull();
    expect(page.querySelector('.account-dropdown-panel')?.textContent).not.toContain('Student');
    expect(page.querySelector('.account-dropdown-panel .account-dropdown-divider')).toBeNull();
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

  it.each(['Admin', 'Student', 'Teacher', 'Coordinator'] as const)(
    'offers My Profile to an active %s as a link to the shared profile page, and closes the menu once chosen',
    async (role) => {
      await render(context([role], role));
      const menu = page.querySelector<HTMLDetailsElement>('details.account-dropdown')!;
      menu.querySelector<HTMLElement>('summary')!.click();

      const myProfile = Array.from(menu.querySelectorAll<HTMLElement>('button, a')).find((e) => e.textContent?.includes('My Profile'))!;
      expect(myProfile.tagName).toBe('A');
      expect(myProfile.getAttribute('href')).toBe('/profile');
      expect(menu.querySelector('a[href*="/admin/staff"]')).toBeNull();
      expect(menu.querySelector('form, input:not([name="active-role"])')).toBeNull();

      myProfile.click();
      await settle();
      fixture.detectChanges();

      expect(TestBed.inject(Router).url).toBe('/profile');
      expect(menu.open).toBe(false);
      expect(myProfile.getAttribute('aria-current')).toBe('page');
    },
  );

  it('stays on My Profile after a role switch, so it shows the new role, while other pages of the old role are left', async () => {
    await render(context(['Teacher', 'Coordinator'], 'Teacher'));
    await TestBed.inject(Router).navigateByUrl('/profile');

    await chooseRole('Coordinator');
    http.expectOne('/api/auth/sessions/current/active-role').flush(context(['Teacher', 'Coordinator'], 'Coordinator'));
    await settle();
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/profile');
    expect(TestBed.inject(AuthSession).activeRole()).toBe('Coordinator');
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

  it('offers Light, Dark, and System as labelled toggle buttons at the bottom of the sidebar that switch the page theme', async () => {
    await render(context(['Student'], 'Student'));

    const group = page.querySelector<HTMLElement>('aside [role=group][aria-labelledby="theme-label"]')!;
    expect(page.querySelector('#theme-label')?.textContent?.trim()).toBe('Theme');
    const option = (label: string) => Array.from(group.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Light', 'Dark', 'System']);

    option('Dark').click();
    fixture.detectChanges();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(option('Dark').getAttribute('aria-pressed')).toBe('true');
    expect(option('Light').getAttribute('aria-pressed')).toBe('false');

    option('Light').click();
    fixture.detectChanges();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    option('System').click();
  });

  it('labels the icon-only menu button and its state', async () => {
    await render(context(['Student'], 'Student'));
    const button = page.querySelector<HTMLButtonElement>('header button[aria-controls="app-sidebar"]')!;

    expect(button.getAttribute('aria-label')).toBe('Open menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Close menu');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('greets the signed-in person by name on the header account menu, with initials and the full greeting as a tooltip', async () => {
    await render(context(['Admin'], 'Admin', 'Farhana Akter'));

    const trigger = page.querySelector('header details.account-dropdown summary')!;
    const label = trigger.querySelector<HTMLElement>('.account-dropdown-label')!;
    expect(label.textContent?.trim()).toBe('Welcome, Farhana Akter');
    expect(label.title).toBe('Welcome, Farhana Akter');
    expect(trigger.querySelector(':scope > .sr-only')?.textContent?.trim()).toBe('Welcome, Farhana Akter, role Admin');
    expect(page.querySelector('.account-dropdown-greeting')?.textContent?.trim()).toBe('Welcome, Farhana Akter');
    expect(trigger.querySelector('.account-dropdown-avatar')?.textContent?.trim()).toBe('FA');
    expect(trigger.querySelector('.account-dropdown-role')?.textContent).toContain('Role: Admin');
    expect(trigger.textContent).not.toContain('Account');
  });

  it('gives a long name a tooltip with the full name (the label itself is cut with an ellipsis by .account-dropdown-label)', async () => {
    const long = 'Mohammad Abdullah Al Mamun Chowdhury Bin Rahman Talukder';
    await render(context(['Teacher'], 'Teacher', long));

    const label = page.querySelector<HTMLElement>('.account-dropdown-label')!;
    expect(label.title).toBe(`Welcome, ${long}`);
    expect(page.querySelector('.account-dropdown-avatar')?.textContent?.trim()).toBe('MT');
  });

  it('says just "Welcome" with the role letter when the session has no name', async () => {
    await render(context(['Student'], 'Student'));

    expect(page.querySelector('.account-dropdown-label')?.textContent?.trim()).toBe('Welcome');
    expect(page.querySelector('.account-dropdown-avatar')?.textContent?.trim()).toBe('S');
  });

  it('shows the new role profile name after a role switch', async () => {
    await render(context(['Admin', 'Teacher'], 'Admin', 'Farhana Akter'));

    await chooseRole('Teacher');
    http.expectOne('/api/auth/sessions/current/active-role').flush(context(['Admin', 'Teacher'], 'Teacher', 'Dr Farhana Akter'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('.account-dropdown-label')?.textContent?.trim()).toBe('Welcome, Dr Farhana Akter');
    expect(page.querySelector('.account-dropdown-avatar')?.textContent?.trim()).toBe('FA');
  });

  it('shows no role under the name for a single-role account, but still reads it out', async () => {
    await render(context(['Student'], 'Student', 'Ayesha Rahman'));

    const role = page.querySelector<HTMLElement>('.account-dropdown-role')!;
    expect(role.classList).toContain('sr-only');
    expect(role.textContent?.trim()).toBe('Role: Student');
    expect(page.querySelector('.account-dropdown-label')?.textContent?.trim()).toBe('Welcome, Ayesha Rahman');
  });

  it('shows the active role under the name for a multi-role account, and the new one after a switch', async () => {
    await render(context(['Admin', 'Teacher'], 'Admin', 'Farhana Akter'));

    const role = () => page.querySelector<HTMLElement>('.account-dropdown-role')!;
    expect(role().classList).not.toContain('sr-only');
    expect(role().textContent?.trim()).toBe('Role: Admin');
    expect(role().querySelector('.sr-only')?.textContent).toBe('Role: ');

    await chooseRole('Teacher');
    http.expectOne('/api/auth/sessions/current/active-role').flush(context(['Admin', 'Teacher'], 'Teacher', 'Dr Farhana Akter'));
    await settle();
    fixture.detectChanges();

    expect(role().textContent?.trim()).toBe('Role: Teacher');
  });
});

describe('initialsOf', () => {
  it('takes the first and last words, skips titles, and uses the first letter of an email', () => {
    expect(initialsOf('Farhana Akter')).toBe('FA');
    expect(initialsOf('Dr Rezvi Shahariar')).toBe('RS');
    expect(initialsOf('Prof. Kazi Muheymin-Us-Sakib')).toBe('KM');
    expect(initialsOf('Mohammad Selim Mia')).toBe('MM');
    expect(initialsOf('Ayesha')).toBe('A');
    expect(initialsOf('Dr')).toBe('D');
    expect(initialsOf('student.personal@example.test')).toBe('S');
    expect(initialsOf('  ')).toBe('');
    expect(initialsOf(null)).toBe('');
  });
});
