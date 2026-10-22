import { TestBed } from '@angular/core/testing';

import { THEME_STORAGE_KEY, ThemeService } from './theme';

describe('ThemeService', () => {
  let systemDark: boolean;
  let listeners: (() => void)[];

  beforeEach(() => {
    systemDark = false;
    listeners = [];
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
    // jsdom has no matchMedia; this stand-in reports the test's system preference.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) =>
        ({
          get matches() {
            return systemDark;
          },
          media: query,
          addEventListener: (_: string, listener: () => void) => listeners.push(listener),
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    });
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
  });

  it('follows the system preference by default, including later changes', () => {
    systemDark = true;
    const theme = TestBed.inject(ThemeService);

    expect(theme.mode()).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    systemDark = false;
    listeners.forEach((listener) => listener());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies and remembers an explicit choice, and forgets it for "system"', () => {
    const theme = TestBed.inject(ThemeService);

    theme.setMode('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    theme.setMode('light');
    systemDark = true;
    listeners.forEach((listener) => listener());
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    theme.setMode('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('starts from the stored choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    expect(TestBed.inject(ThemeService).mode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
