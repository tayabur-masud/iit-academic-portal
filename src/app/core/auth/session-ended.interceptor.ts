import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthSession } from './auth-session';

/**
 * A 401 on a protected API call means the server no longer recognizes this session (signed out or
 * revoked elsewhere). Clear local state and return to sign-in so no protected view stays on screen.
 * Sign-in and session-lookup requests handle their own 401s.
 */
export const sessionEndedInterceptor: HttpInterceptorFn = (request, next) => {
  const handlesOwn401 =
    request.url === '/api/auth/sessions' || request.url === '/api/auth/sessions/current';
  if (!request.url.startsWith('/api/') || handlesOwn401) {
    return next(request);
  }

  const session = inject(AuthSession);
  const router = inject(Router);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        session.markSignedOut();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
