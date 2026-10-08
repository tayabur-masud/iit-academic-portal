import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthSession } from '../../core/auth/auth-session';
import { ROLE_AREAS, Role, landingWithin } from '../../core/auth/auth.models';
import { problemMessage } from '../../core/http/problem';

/** Authenticated application shell: identity, active role, role switching, navigation, sign-out. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly session = inject(AuthSession);
  private readonly router = inject(Router);

  protected readonly navOpen = signal(false);
  protected readonly switching = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly switchError = signal<string | null>(null);
  protected readonly announcement = signal('');

  /** Navigation is filtered by the active role for presentation; the service still authorizes. */
  protected readonly navItems = computed(() => {
    const role = this.session.activeRole();
    return role ? [{ path: ROLE_AREAS[role].path, label: ROLE_AREAS[role].module }] : [];
  });

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  async switchRole(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const role = select.value as Role;
    if (role === this.session.activeRole() || this.switching()) {
      return;
    }

    this.switching.set(true);
    this.switchError.set(null);
    try {
      await this.session.selectRole(role);
      // Leave any page from the previous role; stay only if the page belongs to the new role's area.
      await this.router.navigateByUrl(landingWithin(this.router.url, role));
      this.navOpen.set(false);
      this.announcement.set(`Switched to the ${role} role.`);
    } catch (error) {
      select.value = this.session.activeRole() ?? '';
      this.switchError.set(problemMessage(error, 'The role could not be switched. Try again.'));
    } finally {
      this.switching.set(false);
    }
  }

  async signOut(): Promise<void> {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    try {
      await this.session.signOut();
    } catch {
      // The local session is cleared regardless; the service rejects any later use of a revoked session.
    } finally {
      this.signingOut.set(false);
    }
    await this.router.navigateByUrl('/login');
  }
}
