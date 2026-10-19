import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PasswordToggle } from './password-toggle';

@Component({
  imports: [PasswordToggle],
  template: `
    <div class="password-field">
      <input #pw id="pw" class="field-input" type="password" value="Secret-pass9" />
      <app-password-toggle [target]="pw" label="new password" />
    </div>
  `,
})
class Host {}

describe('PasswordToggle', () => {
  let fixture: ComponentFixture<Host>;
  let input: HTMLInputElement;
  let button: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('#pw');
    button = fixture.nativeElement.querySelector('button');
  });

  it('starts hidden, with an accessible name that says what it will do', () => {
    expect(input.type).toBe('password');
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Show new password');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('pw');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the password and switches back on the next press, keeping what was typed', () => {
    button.click();
    fixture.detectChanges();

    expect(input.type).toBe('text');
    expect(input.value).toBe('Secret-pass9');
    expect(button.getAttribute('aria-label')).toBe('Hide new password');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    button.click();
    fixture.detectChanges();

    expect(input.type).toBe('password');
    expect(button.getAttribute('aria-label')).toBe('Show new password');
  });

  it('does not submit the surrounding form', () => {
    const form = document.createElement('form');
    const submitted = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener('submit', submitted);
    form.appendChild(fixture.nativeElement);
    document.body.appendChild(form);

    button.click();

    expect(submitted).not.toHaveBeenCalled();
    form.remove();
  });
});
