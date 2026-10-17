import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../core/http/problem';
import { AuthBrand } from '../../shared/auth-brand/auth-brand';
import { PASSWORD_RULES } from '../auth/reset-password/reset-password';
import { UserApi } from './user-api';

function passwordPolicy(control: AbstractControl<string>): ValidationErrors | null {
  return PASSWORD_RULES.every((rule) => rule.test(control.value)) ? null : { policy: true };
}

/**
 * The public page behind the setup email: the account holder chooses a first password, which activates the account. The account ID
 * and one-use proof come from the link; they are removed from the address bar at once, kept only in memory, sent only to the setup
 * endpoint, and never shown. Every invalid, expired, or used link gets the same message, which reveals nothing about the account.
 */
@Component({
  selector: 'app-account-credential-setup',
  imports: [ReactiveFormsModule, RouterLink, AuthBrand],
  templateUrl: './account-credential-setup.html',
})
export class AccountCredentialSetup implements OnInit {
  private readonly api = inject(UserApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly rules = PASSWORD_RULES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    newPassword: ['', [Validators.required, passwordPolicy]],
    confirmPassword: ['', Validators.required],
  });
  private readonly newPassword = toSignal(this.form.controls.newPassword.valueChanges, { initialValue: '' });
  protected readonly ruleStates = computed(() => this.rules.map((rule) => ({ ...rule, met: rule.test(this.newPassword()) })));

  private userId = '';
  private proof = '';
  protected readonly linkIncomplete = signal(false);
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly completed = signal(false);
  protected readonly linkRejected = signal<string | null>(null);
  protected readonly serverPasswordErrors = signal<string[]>([]);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.userId = params.get('userId') ?? '';
    this.proof = params.get('proof') ?? '';
    this.linkIncomplete.set(!this.userId || !this.proof);

    // Drop the one-use proof from the address bar and history; it stays only in memory.
    if (this.proof || this.userId) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  protected showPasswordError(): boolean {
    const control = this.form.controls.newPassword;
    return (control.invalid && (control.touched || this.submitted())) || this.serverPasswordErrors().length > 0;
  }

  protected showConfirmError(): boolean {
    const { newPassword, confirmPassword } = this.form.controls;
    return (confirmPassword.touched || this.submitted()) && (confirmPassword.invalid || confirmPassword.value !== newPassword.value);
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
      await firstValueFrom(this.api.completeSetup({ userId: this.userId, proof: this.proof, newPassword: this.form.getRawValue().newPassword }));
      this.proof = '';
      this.completed.set(true);
    } catch (error) {
      const passwordErrors = fieldErrors(error, 'newPassword');
      if (passwordErrors.length > 0) {
        this.serverPasswordErrors.set(passwordErrors);
      } else if (error instanceof HttpErrorResponse && error.status === 400) {
        this.proof = '';
        this.linkRejected.set(problemMessage(error));
      } else {
        this.errorMessage.set(problemMessage(error));
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
