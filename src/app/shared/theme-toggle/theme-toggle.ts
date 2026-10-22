import { Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroMoon, heroSun } from '@ng-icons/heroicons/outline';

import { ThemeService } from '../../core/theme/theme';

/**
 * A single light/dark switch for screens without the account menu (sign-in and password screens). It sets an explicit theme;
 * the account menu also offers "System".
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [NgIcon],
  viewProviders: [provideIcons({ heroMoon, heroSun })],
  template: `
    <button
      type="button"
      class="btn-icon"
      [attr.aria-label]="theme.isDark() ? 'Use the light theme' : 'Use the dark theme'"
      (click)="theme.setMode(theme.isDark() ? 'light' : 'dark')"
    >
      <ng-icon [name]="theme.isDark() ? 'heroSun' : 'heroMoon'" />
    </button>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}
