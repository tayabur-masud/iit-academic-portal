import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../core/http/problem';
import { UserApi } from './user-api';
import { ACCOUNT_TYPES, AccountType } from './user.models';

const FIELDS = ['email', 'accountType'] as const;

/**
 * Add a generic Admin or Student account. The Admin never sets or sees a password: the account is created pending and its holder
 * gets a setup email to choose one. Teachers are added through Teacher Management, and Coordinator access comes from batch-coordinator
 * assignments, so neither is offered here. The service authorizes and validates everything.
 */
@Component({
  selector: 'app-user-provisioning',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './user-provisioning.html',
})
export class UserProvisioning {
  private readonly api = inject(UserApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly accountTypes = ACCOUNT_TYPES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: [''],
    accountType: ['' as AccountType | ''],
  });

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');

  protected errorsFor(field: string): string[] {
    return this.problems()[field] ?? [];
  }

  protected describedBy(field: string, help = false): string | null {
    const ids = [help ? `${field}-help` : '', this.errorsFor(field).length > 0 ? `${field}-error` : ''].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : null;
  }

  protected async submit(): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.errorMessage.set(null);
    const v = this.form.getRawValue();
    const errors: Record<string, string[]> = {};
    if (!v.email.trim()) {
      errors['email'] = ['Enter the email address of the account.'];
    }
    if (!v.accountType) {
      errors['accountType'] = ['Choose Admin or Student.'];
    }
    this.problems.set(errors);
    if (Object.keys(errors).length > 0) {
      this.focusFirstInvalid();
      return;
    }

    this.saving.set(true);
    this.announcement.set('Adding the account…');
    try {
      const created = await firstValueFrom(this.api.create({ email: v.email.trim(), accountType: v.accountType as AccountType }));
      await this.router.navigate(['/admin/users', created.userId], {
        state: {
          notice: `${created.email} was added as ${v.accountType}. A setup email was requested; the account stays pending until its holder sets a password.`,
        },
      });
    } catch (error) {
      this.announcement.set('');
      this.handleFailure(error);
    } finally {
      this.saving.set(false);
    }
  }

  private handleFailure(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 400) {
      const found: Record<string, string[]> = {};
      for (const field of FIELDS) {
        const messages = fieldErrors(error, field);
        if (messages.length > 0) {
          found[field] = messages;
        }
      }
      this.problems.set(found);
      this.errorMessage.set(
        Object.keys(found).length > 0 ? 'Some fields need attention. Correct them and try again.' : problemMessage(error),
      );
      this.focusFirstInvalid();
      return;
    }

    if (error instanceof HttpErrorResponse && error.status === 409) {
      // A duplicate email, or an account type owned by another feature. Nothing was created.
      this.problems.set({ email: [problemMessage(error)] });
      this.errorMessage.set(problemMessage(error));
      this.focusFirstInvalid();
      return;
    }

    this.errorMessage.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your current role cannot manage accounts. Switch to the Admin role and try again.'
        : problemMessage(error, 'The account could not be added. Try again.'),
    );
  }

  private focusFirstInvalid(): void {
    // After the next render, because aria-invalid is only set once the errors have been drawn.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}
