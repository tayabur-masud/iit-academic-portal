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

  function switcher(): HTMLSelectElement {
    return page.querySelector<HTMLSelectElement>('#role-switcher')!;
  }

  async function chooseRole(role: string): Promise<void> {
    switcher().value = role;
    switcher().dispatchEvent(new Event('change'));
    await flushCsrf(http);
  }

  function accountSection(): HTMLElement {
    return page.querySelector<HTMLElement>('aside section[aria-label="Your account"]')!;
  }

  it('keeps the active role and sign-out at the bottom of the menu, not in the header', async () => {
    await render(context(['Teacher', 'Coordinator'], 'Teacher'));

    const sidebar = page.querySelector('aside')!;
    expect(sidebar.lastElementChild).toBe(accountSection());
    expect(accountSection().querySelector('#role-switcher')).not.toBeNull();
    expect(accountSection().textContent).toContain('Sign out');
    expect(page.querySelector('header')?.textContent).not.toContain('Sign out');
    expect(page.querySelector('header #role-switcher')).toBeNull();
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
    expect(page.querySelector('#role-switcher')).toBeNull();
    expect(page.querySelector('nav')?.textContent).toContain('Student Module');
  });

  it('offers only the assigned roles and marks the active one', async () => {
    await render(context(['Teacher', 'Coordinator'], 'Teacher'));

    const options = Array.from(switcher().options).map((o) => o.value);
    expect(options).toEqual(['Teacher', 'Coordinator']);
    expect(switcher().value).toBe('Teacher');
    expect(page.querySelector('label[for=role-switcher]')?.textContent).toContain('Active role');
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
    expect(page.querySelector('nav')?.textContent).toContain('Coordinator Module');
    expect(page.querySelector('nav')?.textContent).not.toContain('Teacher Module');
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
    expect(switcher().value).toBe('Teacher');
    expect(TestBed.inject(AuthSession).activeRole()).toBe('Teacher');
  });
});
