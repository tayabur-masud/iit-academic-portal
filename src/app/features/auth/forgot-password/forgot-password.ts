import { Component, ElementRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthApi } from '../../../core/auth/auth-api';
import { problemMessage } from '../../../core/http/problem';
import { AuthBrand } from '../../../shared/auth-brand/auth-brand';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, AuthBrand],
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  private readonly api = inject(AuthApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  /** The service's generic confirmation, identical whether or not an account exists. */
  protected readonly confirmation = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected showError(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.touched || this.submitted());
  }

  protected emailError(): string {
    return this.form.controls.email.hasError('required')
      ? 'Enter your email address.'
      : 'Enter an email address in the format name@example.com.';
  }

  async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitted.set(true);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.host.nativeElement.querySelector<HTMLElement>('#email')?.focus();
      return;
    }

    this.submitting.set(true);
    try {
      const response = await firstValueFrom(
        this.api.requestPasswordReset(this.form.getRawValue().email),
      );
      this.confirmation.set(response.message);
    } catch (error) {
      this.errorMessage.set(problemMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
