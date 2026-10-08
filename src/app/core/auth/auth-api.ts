import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { PasswordResetCompletion, Role, SessionContext } from './auth.models';

/** Client for contracts/authentication.openapi.json. Cookies are same-origin; the browser sends them. */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  getAntiForgeryToken(): Observable<string> {
    return this.http
      .get<{ requestToken: string }>('/api/auth/anti-forgery-token')
      .pipe(map((response) => response.requestToken));
  }

  createSession(email: string, password: string): Observable<SessionContext> {
    return this.http.post<SessionContext>('/api/auth/sessions', { email, password });
  }

  getCurrentSession(): Observable<SessionContext> {
    return this.http.get<SessionContext>('/api/auth/sessions/current');
  }

  revokeCurrentSession(): Observable<void> {
    return this.http.delete<void>('/api/auth/sessions/current');
  }

  setActiveRole(role: Role): Observable<SessionContext> {
    return this.http.put<SessionContext>('/api/auth/sessions/current/active-role', { role });
  }

  requestPasswordReset(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/password-reset-requests', { email });
  }

  completePasswordReset(request: PasswordResetCompletion): Observable<void> {
    return this.http.post<void>('/api/auth/password-resets', request);
  }
}
