import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSession } from './auth-session';
import { Role, routeForSession } from './auth.models';

// Route guards improve navigation only. They never substitute for server-side authorization.

export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const session = await inject(AuthSession).ensureLoaded();
  return session ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Sign-in and recovery-request pages: a signed-in user goes to their own area instead. */
export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const session = await inject(AuthSession).ensureLoaded();
  return session ? router.parseUrl(routeForSession(session)) : true;
};

/** Sends "/" to the right place for the current session. */
export const homeRedirectGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const session = await inject(AuthSession).ensureLoaded();
  return router.parseUrl(session ? routeForSession(session) : '/login');
};

/** The role-selection step is only for signed-in users with more than one assigned role. */
export const roleSelectionGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const session = await inject(AuthSession).ensureLoaded();
  if (!session) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return session.availableRoles.length > 1 ? true : router.parseUrl(routeForSession(session));
};

/** A role area opens only when that role is the session's active role. */
export function activeRoleGuard(role: Role): CanActivateFn {
  return async () => {
    const router = inject(Router);
    const session = await inject(AuthSession).ensureLoaded();
    if (!session) {
      return router.parseUrl('/login');
    }
    if (!session.activeRole) {
      return router.parseUrl(routeForSession(session));
    }
    return session.activeRole === role ? true : router.parseUrl('/unauthorized');
  };
}
