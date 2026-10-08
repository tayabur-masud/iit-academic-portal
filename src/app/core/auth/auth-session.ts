import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthApi } from './auth-api';
import { Role, SessionContext } from './auth.models';
import { CsrfToken } from './csrf-token';

/**
 * Client-side view of the server session. It drives navigation and presentation only; every access
 * decision is made by the service on each request.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly api = inject(AuthApi);
  private readonly csrf = inject(CsrfToken);

  /** undefined = not loaded yet; null = signed out. */
  private readonly state = signal<SessionContext | null | undefined>(undefined);

  readonly context = this.state.asReadonly();
  readonly isAuthenticated = computed(() => !!this.state());
  readonly activeRole = computed(() => this.state()?.activeRole ?? null);
  readonly availableRoles = computed(() => this.state()?.availableRoles ?? []);

  async ensureLoaded(): Promise<SessionContext | null> {
    if (this.state() === undefined) {
      try {
        await this.refresh();
      } catch {
        // Service unreachable: treat as signed out for now; the next navigation retries.
        return null;
      }
    }
    return this.state() ?? null;
  }

  async refresh(): Promise<SessionContext | null> {
    try {
      this.state.set(await firstValueFrom(this.api.getCurrentSession()));
    } catch (error) {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        throw error;
      }
      this.state.set(null);
    }
    return this.state() ?? null;
  }

  async signIn(email: string, password: string): Promise<SessionContext> {
    const context = await firstValueFrom(this.api.createSession(email, password));
    this.csrf.reset();
    this.state.set(context);
    return context;
  }

  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.api.revokeCurrentSession());
    } finally {
      this.markSignedOut();
    }
  }

  async selectRole(role: Role): Promise<SessionContext> {
    const context = await firstValueFrom(this.api.setActiveRole(role));
    this.state.set(context);
    return context;
  }

  /** Forget the local session after the server ended it (logout, reset, or revocation). */
  markSignedOut(): void {
    this.csrf.reset();
    this.state.set(null);
  }
}
