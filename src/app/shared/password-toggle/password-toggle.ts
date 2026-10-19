import { Component, input, signal } from '@angular/core';

/**
 * The eye button inside a password field that shows or hides what was typed. Place it after the input, both inside a
 * `.password-field` wrapper, and pass the input as `target`. It is a real button (keyboard and screen-reader operable), says what it
 * will do ("Show password" / "Hide password") and reports its state with `aria-pressed`. The password is hidden again whenever the
 * page is left, because the input starts as `type="password"`.
 */
@Component({
  selector: 'app-password-toggle',
  template: `
    <button
      type="button"
      class="password-toggle"
      [attr.aria-label]="(visible() ? 'Hide ' : 'Show ') + label()"
      [attr.title]="(visible() ? 'Hide ' : 'Show ') + label()"
      [attr.aria-pressed]="visible()"
      [attr.aria-controls]="target().id || null"
      (click)="toggle()"
    >
      @if (visible()) {
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      } @else {
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      }
    </button>
  `,
})
export class PasswordToggle {
  /** The password input this button controls. */
  readonly target = input.required<HTMLInputElement>();

  /** What the field holds, for the button's accessible name: "Show password", "Show new password", and so on. */
  readonly label = input('password');

  protected readonly visible = signal(false);

  protected toggle(): void {
    const show = !this.visible();
    this.visible.set(show);
    this.target().type = show ? 'text' : 'password';
  }
}
