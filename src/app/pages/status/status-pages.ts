import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroLockClosed, heroUserMinus } from '@ng-icons/heroicons/outline';

import { AuthSession } from '../../core/auth/auth-session';
import { routeForSession } from '../../core/auth/auth.models';
import { AuthBrand } from '../../shared/auth-brand/auth-brand';

/** Access denied in the current role. Discloses nothing about the requested resource. */
@Component({
  selector: 'app-unauthorized',
  imports: [RouterLink, NgIcon],
  viewProviders: [provideIcons({ heroLockClosed })],
  template: `
    <section class="empty-state mt-6" aria-labelledby="unauthorized-title">
      <ng-icon name="heroLockClosed" />
      <h1 id="unauthorized-title" class="empty-state-title text-heading">Access denied</h1>
      <p class="empty-state-text">Your current role does not have access to this page.</p>
      <a class="btn btn-primary" [routerLink]="home()">Go to your home page</a>
    </section>
  `,
})
export class Unauthorized {
  private readonly session = inject(AuthSession);
  protected readonly home = computed(() => {
    const context = this.session.context();
    return context ? routeForSession(context) : '/login';
  });
}

/** Signed in, but the account has no supported role assigned. */
@Component({
  selector: 'app-no-role',
  imports: [NgIcon],
  viewProviders: [provideIcons({ heroUserMinus })],
  template: `
    <section class="empty-state mt-6" aria-labelledby="no-role-title">
      <ng-icon name="heroUserMinus" />
      <h1 id="no-role-title" class="empty-state-title text-heading">No portal role assigned</h1>
      <p class="empty-state-text">
        Your account does not have a portal role yet, so there is nothing you can open. Contact the
        IIT office to request access, then sign in again.
      </p>
    </section>
  `,
})
export class NoRole {}

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, AuthBrand],
  template: `
    <main class="auth-page" id="main">
      <section class="auth-card card" aria-labelledby="not-found-title">
        <app-auth-brand />
        <h1 id="not-found-title">Page not found</h1>
        <p>The page you requested could not be found.</p>
        <a class="btn btn-primary" routerLink="/">Return to the portal</a>
      </section>
    </main>
  `,
})
export class NotFound {}
