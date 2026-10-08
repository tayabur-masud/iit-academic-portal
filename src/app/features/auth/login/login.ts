import { Component, ElementRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthSession } from '../../../core/auth/auth-session';
import { SessionContext, landingWithin, routeForSession } from '../../../core/auth/auth.models';
import { problemMessage } from '../../../core/http/problem';
import { AuthBrand } from '../../../shared/auth-brand/auth-brand';

const SIGN_IN_FAILED =
  'The email or password is incorrect. Check both and try again, or reset your password.';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthBrand],
  templateUrl: './login.html',
})
export class Login {
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected showError(field: 'email' | 'password'): boolean {
    const control = this.form.controls[field];
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
      this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    try {
      const context = await this.session.signIn(email, password);
      await this.router.navigateByUrl(this.destinationFor(context));
    } catch (error) {
      // Keep the email; never keep a rejected password.
      this.form.controls.password.reset('');
      this.errorMessage.set(problemMessage(error, SIGN_IN_FAILED));
    } finally {
      this.submitting.set(false);
    }
  }

  private destinationFor(context: SessionContext): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const safeReturnUrl = returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : null;
    return context.activeRole
      ? landingWithin(safeReturnUrl, context.activeRole)
      : routeForSession(context);
  }
}
