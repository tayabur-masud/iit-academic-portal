import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthSession } from '../../../core/auth/auth-session';
import { Role, routeForSession } from '../../../core/auth/auth.models';
import { problemMessage } from '../../../core/http/problem';
import { AuthBrand } from '../../../shared/auth-brand/auth-brand';

/** The role-selection step for accounts with more than one assigned role. */
@Component({
  selector: 'app-select-role',
  imports: [AuthBrand],
  templateUrl: './select-role.html',
})
export class SelectRole {
  protected readonly session = inject(AuthSession);
  private readonly router = inject(Router);

  protected readonly selected = signal<Role | null>(this.session.activeRole());
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.submitting()) {
      return;
    }
    this.submitted.set(true);
    this.errorMessage.set(null);
    const role = this.selected();
    if (!role) {
      return;
    }

    this.submitting.set(true);
    try {
      const context = await this.session.selectRole(role);
      await this.router.navigateByUrl(routeForSession(context));
    } catch (error) {
      this.errorMessage.set(problemMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.session.signOut().catch(() => undefined);
    await this.router.navigateByUrl('/login');
  }
}
