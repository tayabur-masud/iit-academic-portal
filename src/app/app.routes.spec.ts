import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';

import { AuthSession } from './core/auth/auth-session';
import { SessionContext } from './core/auth/auth.models';
import { routes } from './app.routes';

describe('Configuration routes', () => {
  async function navigate(url: string, session: SessionContext | null): Promise<string> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSession, useValue: { ensureLoaded: () => Promise.resolve(session) } },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  }

  const admin: SessionContext = { availableRoles: ['Admin'], activeRole: 'Admin' };

  it.each(['/admin/configuration', '/admin/configuration/degrees', '/admin/configuration/degrees/new', '/admin/configuration/degrees/abc'])(
    'opens %s for the active Admin',
    async (url) => expect(await navigate(url, admin)).toBe(url),
  );

  it.each(['/admin/teachers', '/admin/teachers/new', '/admin/teachers/abc'])('opens teacher page %s for the active Admin', async (url) =>
    expect(await navigate(url, admin)).toBe(url),
  );

  it.each(['/admin/users', '/admin/users/new', '/admin/users/3f0c1a2b-user'])('opens account page %s for the active Admin', async (url) =>
    expect(await navigate(url, admin)).toBe(url),
  );

  it.each(
    (['Student', 'Teacher', 'Coordinator'] as const).flatMap((role) =>
      ['/admin/users', '/admin/users/new', '/admin/users/abc'].map((url) => [role, url] as const),
    ),
  )('denies an active %s direct navigation to %s', async (role, url) => {
    const session: SessionContext = { availableRoles: [role], activeRole: role };

    expect(await navigate(url, session)).toBe('/unauthorized');
  });

  it('denies account management to an Admin who is acting as another role', async () => {
    const acting: SessionContext = { availableRoles: ['Admin', 'Teacher'], activeRole: 'Teacher' };

    expect(await navigate('/admin/users', acting)).toBe('/unauthorized');
  });

  it.each([null, admin])('opens the public account setup page with or without a session', async (session) =>
    expect(await navigate('/account-setup', session)).toBe('/account-setup'),
  );

  it.each([
    '/admin/notifications',
    '/admin/notifications/templates',
    '/admin/notifications/templates/password-reset',
    '/admin/notifications/settings',
    '/admin/notifications/0b1e5c3a-0000-4000-8000-000000000001',
  ])('opens notification page %s for the active Admin', async (url) => expect(await navigate(url, admin)).toBe(url));

  it.each(
    (['Student', 'Teacher', 'Coordinator'] as const).flatMap((role) =>
      ['/admin/notifications', '/admin/notifications/templates', '/admin/notifications/settings'].map((url) => [role, url] as const),
    ),
  )('denies an active %s direct navigation to %s', async (role, url) => {
    const session: SessionContext = { availableRoles: [role], activeRole: role };

    expect(await navigate(url, session)).toBe('/unauthorized');
  });

  it('denies notification pages to an Admin who is acting as another role', async () => {
    const acting: SessionContext = { availableRoles: ['Admin', 'Teacher'], activeRole: 'Teacher' };

    expect(await navigate('/admin/notifications/templates/password-reset', acting)).toBe('/unauthorized');
  });

  it.each(['Student', 'Teacher', 'Coordinator'] as const)('denies direct navigation to teachers by an active %s', async (role) => {
    const session: SessionContext = { availableRoles: [role], activeRole: role };

    expect(await navigate('/admin/teachers', session)).toBe('/unauthorized');
  });

  it('denies teacher management to an Admin who is acting as another role', async () => {
    const acting: SessionContext = { availableRoles: ['Admin', 'Teacher'], activeRole: 'Teacher' };

    expect(await navigate('/admin/teachers/new', acting)).toBe('/unauthorized');
  });

  it.each(['Student', 'Teacher', 'Coordinator'] as const)('denies direct navigation by an active %s', async (role) => {
    const session: SessionContext = { availableRoles: [role], activeRole: role };

    expect(await navigate('/admin/configuration', session)).toBe('/unauthorized');
  });

  it('denies an Admin who is acting as another role, until they switch back', async () => {
    const acting: SessionContext = { availableRoles: ['Admin', 'Teacher'], activeRole: 'Teacher' };

    expect(await navigate('/admin/configuration/batches', acting)).toBe('/unauthorized');
  });

  it('sends a signed-out visitor to sign in', async () => {
    expect(await navigate('/admin/configuration', null)).toContain('/login');
  });
});
