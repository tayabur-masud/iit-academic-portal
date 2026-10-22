import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

/** The browser storage key; index.html reads the same key before the first paint so a dark page never flashes light. */
export const THEME_STORAGE_KEY = 'iit-theme';

/**
 * The viewer's light or dark theme. "System" follows the operating system and is the default. The choice is a per-browser
 * convenience kept in localStorage; when storage is unavailable the theme still works for the visit. Applying a theme only
 * toggles the `dark` class on <html>, which re-points the semantic color tokens (styles/tokens.css).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;

  readonly mode = signal<ThemeMode>(this.stored());

  constructor() {
    this.media?.addEventListener?.('change', () => {
      if (this.mode() === 'system') {
        this.apply();
      }
    });
    this.apply();
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      if (mode === 'system') {
        this.document.defaultView?.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        this.document.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, mode);
      }
    } catch {
      // Storage can be blocked (private mode, site data cleared); the choice then lasts for this visit only.
    }
    this.apply();
  }

  /** Whether the page is dark right now (the chosen mode, or the system preference under "system"). */
  isDark(): boolean {
    const mode = this.mode();
    return mode === 'dark' || (mode === 'system' && !!this.media?.matches);
  }

  private apply(): void {
    this.document.documentElement.classList.toggle('dark', this.isDark());
  }

  private stored(): ThemeMode {
    try {
      const value = this.document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch {
      return 'system';
    }
  }
}
