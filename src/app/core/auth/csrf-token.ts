import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, shareReplay, switchMap, throwError } from 'rxjs';

import { AuthApi } from './auth-api';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * Caches the anti-forgery request token. The service binds tokens to the signed-in identity, so the
 * cache is reset whenever the user signs in or out.
 */
@Injectable({ providedIn: 'root' })
export class CsrfToken {
  private readonly api = inject(AuthApi);
  private token$: Observable<string> | null = null;

  get(): Observable<string> {
    this.token$ ??= this.api.getAntiForgeryToken().pipe(
      catchError((error) => {
        this.token$ = null;
        return throwError(() => error);
      }),
      shareReplay(1),
    );
    return this.token$;
  }

  reset(): void {
    this.token$ = null;
  }
}

/** Adds the X-CSRF-Token header to state-changing API requests. */
export const csrfInterceptor: HttpInterceptorFn = (request, next) => {
  if (SAFE_METHODS.has(request.method) || !request.url.startsWith('/api/')) {
    return next(request);
  }

  return inject(CsrfToken)
    .get()
    .pipe(
      switchMap((token) => next(request.clone({ setHeaders: { 'X-CSRF-Token': token } }))),
    );
};
