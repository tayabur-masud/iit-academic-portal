import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import {
  TEST_CSRF_TOKEN,
  context,
  httpMock,
  provideAuthTesting,
} from '../../../testing/auth-testing';
import { activeRoleGuard } from './auth.guards';
import { AuthSession } from './auth-session';
import { SessionContext, landingWithin, routeForSession } from './auth.models';
import { CsrfToken } from './csrf-token';

describe('auth models', () => {
  it('routes a session to its active role, role selection, or the no-role page', () => {
    expect(routeForSession(context(['Admin'], 'Admin'))).toBe('/admin');
    expect(routeForSession(context(['Teacher', 'Coordinator'], null))).toBe('/select-role');
    expect(routeForSession(context([], null))).toBe('/no-role');
  });

  it('keeps a location only when it belongs to the role area', () => {
    expect(landingWithin('/teacher/courses', 'Teacher')).toBe('/teacher/courses');
    expect(landingWithin('/teacher/courses', 'Coordinator')).toBe('/coordinator');
    expect(landingWithin('/teachers-lounge', 'Teacher')).toBe('/teacher');
    expect(landingWithin(null, 'Student')).toBe('/student');
  });
});

describe('activeRoleGuard', () => {
  async function run(session: SessionContext | null): Promise<string | boolean> {
    TestBed.configureTestingModule({
      providers: [
        ...provideAuthTesting(),
        { provide: AuthSession, useValue: { ensureLoaded: () => Promise.resolve(session) } },
      ],
    });
    const result = await TestBed.runInInjectionContext(() =>
      activeRoleGuard('Teacher')({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : (result as boolean);
  }

  it('allows the active role', async () => expect(await run(context(['Teacher'], 'Teacher'))).toBe(true));
  it('sends signed-out users to sign in', async () => expect(await run(null)).toBe('/login'));
  it('asks multi-role users to choose first', async () =>
    expect(await run(context(['Teacher', 'Coordinator'], null))).toBe('/select-role'));
  it('denies another active role', async () =>
    expect(await run(context(['Teacher', 'Coordinator'], 'Coordinator'))).toBe('/unauthorized'));
});

describe('csrfInterceptor', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: provideAuthTesting() }));

  it('adds the token only to state-changing API requests and reuses it', () => {
    const client = TestBed.inject(HttpClient);
    const http = httpMock();

    client.get('/api/auth/sessions/current').subscribe();
    expect(http.expectOne('/api/auth/sessions/current').request.headers.has('X-CSRF-Token')).toBe(false);

    client.post('/api/auth/sessions', {}).subscribe();
    http.expectOne('/api/auth/anti-forgery-token').flush({ requestToken: TEST_CSRF_TOKEN });
    expect(http.expectOne('/api/auth/sessions').request.headers.get('X-CSRF-Token')).toBe(TEST_CSRF_TOKEN);

    client.delete('/api/auth/sessions/current').subscribe();
    http.expectNone('/api/auth/anti-forgery-token');
    http.expectOne({ method: 'DELETE', url: '/api/auth/sessions/current' });

    TestBed.inject(CsrfToken).reset();
    client.put('/api/auth/sessions/current/active-role', {}).subscribe();
    http.expectOne('/api/auth/anti-forgery-token').flush({ requestToken: 'fresh' });
    expect(http.expectOne('/api/auth/sessions/current/active-role').request.headers.get('X-CSRF-Token')).toBe('fresh');
    http.verify();
  });
});
