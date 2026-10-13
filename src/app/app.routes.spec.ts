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
