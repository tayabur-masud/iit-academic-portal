import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthApi } from '../../../core/auth/auth-api';
import { AuthSession } from '../../../core/auth/auth-session';
import { fieldErrors, problemMessage } from '../../../core/http/problem';
import { AuthBrand } from '../../../shared/auth-brand/auth-brand';

/** The approved rule, mirrored for feedback; the service enforces it. */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { id: 'letter', label: 'At least one letter', test: (v: string) => /[A-Za-z]/.test(v) },
  { id: 'number', label: 'At least one number', test: (v: string) => /[0-9]/.test(v) },
] as const;

function passwordPolicy(control: AbstractControl<string>): ValidationErrors | null {
  return PASSWORD_RULES.every((rule) => rule.test(control.value)) ? null : { policy: true };
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, AuthBrand],
  templateUrl: './reset-password.html',
})
export class ResetPassword implements OnInit {
  private readonly api = inject(AuthApi);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly rules = PASSWORD_RULES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    newPassword: ['', [Validators.required, passwordPolicy]],
    confirmPassword: ['', Validators.required],
  });
  private readonly newPassword = toSignal(this.form.controls.newPassword.valueChanges, {
    initialValue: '',
  });
  protected readonly ruleStates = computed(() =>
    this.rules.map((rule) => ({ ...rule, met: rule.test(this.newPassword()) })),
  );

  protected email = '';
  private proof = '';
  protected readonly linkIncomplete = signal(false);
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly completed = signal(false);
  protected readonly proofRejected = signal<string | null>(null);
  protected readonly serverPasswordErrors = signal<string[]>([]);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.email = params.get('email') ?? '';
    this.proof = params.get('proof') ?? '';
    this.linkIncomplete.set(!this.email || !this.proof);

    // Drop the one-use proof from the address bar and history; it stays only in memory.
    if (this.proof) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  protected showPasswordError(): boolean {
    const control = this.form.controls.newPassword;
    return (control.invalid && (control.touched || this.submitted())) || this.serverPasswordErrors().length > 0;
  }

  protected showConfirmError(): boolean {
    const { newPassword, confirmPassword } = this.form.controls;
    return (
      (confirmPassword.touched || this.submitted()) &&
      (confirmPassword.invalid || confirmPassword.value !== newPassword.value)
    );
  }

  async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitted.set(true);
    this.errorMessage.set(null);
    this.serverPasswordErrors.set([]);
    if (this.form.invalid || this.showConfirmError()) {
      this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    this.submitting.set(true);
    try {
      await firstValueFrom(
        this.api.completePasswordReset({
          email: this.email,
          proof: this.proof,
          newPassword: this.form.getRawValue().newPassword,
        }),
      );
      // The service revokes the session used for the reset, if this browser had one.
      this.session.markSignedOut();
      this.completed.set(true);
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.submitting.set(false);
    }
  }

  private handleFailure(error: unknown): void {
    const passwordErrors = fieldErrors(error, 'newPassword');
    if (passwordErrors.length > 0) {
      this.serverPasswordErrors.set(passwordErrors);
    } else if (error instanceof HttpErrorResponse && error.status === 400) {
      this.proofRejected.set(problemMessage(error));
    } else {
      this.errorMessage.set(problemMessage(error));
    }
  }
}
