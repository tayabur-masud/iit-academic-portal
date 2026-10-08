import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthSession } from '../../core/auth/auth-session';
import { routeForSession } from '../../core/auth/auth.models';
import { AuthBrand } from '../../shared/auth-brand/auth-brand';

/** Access denied in the current role. Discloses nothing about the requested resource. */
@Component({
  selector: 'app-unauthorized',
  imports: [RouterLink],
  template: `
    <section class="max-w-[40rem]" aria-labelledby="unauthorized-title">
      <h1 id="unauthorized-title">Access denied</h1>
      <p>Your current role does not have access to this page.</p>
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
  template: `
    <section class="max-w-[40rem]" aria-labelledby="no-role-title">
      <h1 id="no-role-title">No portal role assigned</h1>
      <p>
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
