import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroAcademicCap,
  heroArrowLeftStartOnRectangle,
  heroBars3,
  heroBell,
  heroBriefcase,
  heroClipboardDocumentList,
  heroCog6Tooth,
  heroComputerDesktop,
  heroHome,
  heroMoon,
  heroSun,
  heroUserCircle,
  heroUserGroup,
  heroUsers,
  heroXMark,
} from '@ng-icons/heroicons/outline';

import { AuthSession } from '../../core/auth/auth-session';
import { ROLE_AREAS, Role, landingWithin } from '../../core/auth/auth.models';
import { problemMessage } from '../../core/http/problem';
import { ThemeMode, ThemeService } from '../../core/theme/theme';

interface NavItem {
  path: string;
  label: string;
  /** A Heroicons outline icon name, shown before the label; decorative. */
  icon: string;
  /** True when only the exact path counts as the current page, not its sub-pages. */
  exact: boolean;
}

/** Pages that belong to one role only, listed under its module. */
const ROLE_PAGES: Partial<Record<Role, NavItem[]>> = {
  Admin: [
    { path: '/admin/users', label: 'Accounts', icon: 'heroUsers', exact: false },
    { path: '/admin/teachers', label: 'Teachers', icon: 'heroAcademicCap', exact: false },
    { path: '/admin/staff', label: 'Staff', icon: 'heroBriefcase', exact: false },
    { path: '/admin/students', label: 'Students', icon: 'heroUserGroup', exact: false },
    { path: '/admin/configuration', label: 'Configuration', icon: 'heroCog6Tooth', exact: false },
    { path: '/admin/notifications', label: 'Notifications', icon: 'heroBell', exact: false },
    { path: '/admin/audit', label: 'Audit history', icon: 'heroClipboardDocumentList', exact: false },
  ],
};

/** Authenticated application shell: identity, active role, role switching, theme, navigation, sign-out. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  templateUrl: './shell.html',
  viewProviders: [
    provideIcons({
      heroAcademicCap,
      heroArrowLeftStartOnRectangle,
      heroBars3,
      heroBell,
      heroBriefcase,
      heroClipboardDocumentList,
      heroCog6Tooth,
      heroComputerDesktop,
      heroHome,
      heroMoon,
      heroSun,
      heroUserCircle,
      heroUserGroup,
      heroUsers,
      heroXMark,
    }),
  ],
})
export class Shell {
  protected readonly session = inject(AuthSession);
  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'light', label: 'Light', icon: 'heroSun' },
    { mode: 'dark', label: 'Dark', icon: 'heroMoon' },
    { mode: 'system', label: 'System', icon: 'heroComputerDesktop' },
  ];
  private readonly router = inject(Router);

  @ViewChild('accountMenu') private accountMenu?: ElementRef<HTMLDetailsElement>;

  protected readonly navOpen = signal(false);
  protected readonly switching = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly switchError = signal<string | null>(null);
  protected readonly announcement = signal('');

  /** Navigation is filtered by the active role for presentation; the service still authorizes. */
  protected readonly navItems = computed<NavItem[]>(() => {
    const role = this.session.activeRole();
    if (!role) {
      return [];
    }
    const area: NavItem = { path: ROLE_AREAS[role].path, label: ROLE_AREAS[role].module, icon: 'heroHome', exact: true };
    return [area, ...(ROLE_PAGES[role] ?? [])];
  });

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  /** After choosing a menu destination: close the menu, and the mobile drawer it sits in. */
  protected closeAccountMenu(): void {
    if (this.accountMenu) {
      this.accountMenu.nativeElement.open = false;
    }
    this.navOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected closeAccountMenuOnOutsideClick(event: MouseEvent): void {
    const menu = this.accountMenu?.nativeElement;
    if (menu?.open && !menu.contains(event.target as Node)) {
      menu.open = false;
    }
  }

  @HostListener('document:keydown.escape')
  protected closeAccountMenuOnEscape(): void {
    const menu = this.accountMenu?.nativeElement;
    if (menu?.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  }

  async switchRole(event: Event): Promise<void> {
    const radio = event.target as HTMLInputElement;
    const role = radio.value as Role;
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
      if (this.accountMenu) {
        this.accountMenu.nativeElement.open = false;
      }
      this.announcement.set(`Switched to the ${role} role.`);
    } catch (error) {
      const activeRole = this.session.activeRole();
      this.accountMenu?.nativeElement.querySelectorAll<HTMLInputElement>('input[name="active-role"]').forEach((option) => {
        option.checked = option.value === activeRole;
      });
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
