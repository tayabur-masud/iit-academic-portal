import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Role } from '../../core/auth/auth.models';
import { fieldErrors, problemMessage } from '../../core/http/problem';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { UserApi } from './user-api';
import { UserAccount, statusLabel } from './user.models';
import { SearchableSelect, SelectOption } from '../../shared/searchable-select/searchable-select';

/**
 * One account's detail and the access changes an Admin may make: the registered email, the default role among the assigned roles,
 * a fresh setup email while the account is pending, and deactivation after confirmation. Teacher profile data and Teacher roles are
 * changed in Teacher Management; Coordinator follows batch-coordinator assignments and is only shown. Every rule (Student-only,
 * last active Admin, no self-deactivation, stale edits) is enforced by the service; this screen presents its answers.
 */
@Component({
  selector: 'app-user-maintenance',
  imports: [ReactiveFormsModule, RouterLink, UtcTimestamp, SearchableSelect, SelectOption],
  templateUrl: './user-maintenance.html',
})
export class UserMaintenance {
  private readonly api = inject(UserApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Bound from the route. */
  readonly userId = input.required<string>();

  protected readonly statusLabel = statusLabel;
  protected readonly emailForm = inject(NonNullableFormBuilder).group({ email: [''] });
  protected readonly rolesForm = inject(NonNullableFormBuilder).group({ defaultRole: [''] });

  protected readonly account = signal<UserAccount | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly announcement = signal('');

  protected readonly savingEmail = signal(false);
  protected readonly emailError = signal<string | null>(null);
  protected readonly emailStale = signal(false);
  protected readonly emailFieldErrors = signal<string[]>([]);

  protected readonly savingRoles = signal(false);
  protected readonly rolesError = signal<string | null>(null);

  protected readonly confirmingReissue = signal(false);
  protected readonly reissuing = signal(false);
  protected readonly reissueError = signal<string | null>(null);

  protected readonly confirmingDeactivate = signal(false);
  protected readonly deactivating = signal(false);
  protected readonly deactivateError = signal<string | null>(null);

  protected readonly isTeacher = computed(() => !!this.account()?.teacherId);
  protected readonly isStudent = computed(() => !!this.account()?.roles.includes('Student'));
  protected readonly isPending = computed(() => this.account()?.accountStatus === 'PendingCredentialSetup');
  protected readonly isDeactivated = computed(() => this.account()?.accountStatus === 'Deactivated');
  protected readonly holdsCoordinator = computed(() => !!this.account()?.roles.includes('Coordinator'));

  /** A default role can be chosen only when the account holds more than one role. */
  protected readonly defaultChoices = computed<Role[]>(() => this.account()?.roles ?? []);

  constructor() {
    this.notice.set((this.router.getCurrentNavigation()?.extras.state?.['notice'] as string | undefined) ?? null);
    effect(() => {
      const id = this.userId();
      untracked(() => void this.load(id));
    });
  }

  /** Who made a change: the account email, "(account removed)" if it no longer exists, or "System" when no account did. */
  protected who(display: string | undefined, userId: string | undefined): string {
    return display ?? (userId ? '(account removed)' : 'System');
  }

  protected reload(): void {
    void this.load(this.userId(), true);
  }

  protected async saveEmail(): Promise<void> {
    const current = this.account();
    if (!current || this.savingEmail()) {
      return;
    }

    this.emailError.set(null);
    this.emailStale.set(false);
    this.notice.set(null);
    const email = this.emailForm.getRawValue().email.trim();
    if (!email) {
      this.emailFieldErrors.set(['Enter the email address of the account.']);
      this.focusFirstInvalid();
      return;
    }

    this.emailFieldErrors.set([]);
    this.savingEmail.set(true);
    try {
      const saved = await firstValueFrom(this.api.updateEmail(current.userId, { email, expectedConcurrencyStamp: current.concurrencyStamp }));
      this.apply(saved);
      this.notice.set(`The email address was changed to ${saved.email}.`);
    } catch (error) {
      const messages = fieldErrors(error, 'email');
      if (messages.length > 0) {
        this.emailFieldErrors.set(messages);
        this.focusFirstInvalid();
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        // A duplicate address, or the account changed since it was loaded. Nothing was saved.
        this.emailStale.set(true);
        this.emailError.set(problemMessage(error));
      } else {
        this.emailError.set(this.failure(error, 'The email address could not be changed. Try again.'));
      }
    } finally {
      this.savingEmail.set(false);
    }
  }

  protected async saveRoles(): Promise<void> {
    const current = this.account();
    if (!current || this.savingRoles()) {
      return;
    }

    this.rolesError.set(null);
    this.notice.set(null);
    this.savingRoles.set(true);
    try {
      // Coordinator is assignment-derived: the service keeps it, so it is never sent.
      const roles = current.roles.filter((r) => r !== 'Coordinator');
      const saved = await firstValueFrom(
        this.api.updateRoles(current.userId, { roles, defaultRole: (this.rolesForm.getRawValue().defaultRole || null) as Role | null }),
      );
      this.apply(saved);
      this.notice.set('The default role was saved.');
    } catch (error) {
      const messages = [...fieldErrors(error, 'roles'), ...fieldErrors(error, 'defaultRole')];
      this.rolesError.set(messages.length > 0 ? messages.join(' ') : this.failure(error, 'The roles could not be saved. Try again.'));
    } finally {
      this.savingRoles.set(false);
    }
  }

  protected askReissue(): void {
    this.reissueError.set(null);
    this.confirmingReissue.set(true);
  }

  protected cancelReissue(): void {
    this.confirmingReissue.set(false);
    this.reissueError.set(null);
  }

  protected async confirmReissue(): Promise<void> {
    const current = this.account();
    if (!current || this.reissuing()) {
      return;
    }

    this.reissuing.set(true);
    this.reissueError.set(null);
    try {
      const result = await firstValueFrom(this.api.reissueSetup(current.userId));
      this.apply(result.account);
      this.confirmingReissue.set(false);
      if (result.setupEmailRequested) {
        this.notice.set(result.message);
      } else {
        this.reissueError.set(result.message);
      }
    } catch (error) {
      this.reissueError.set(this.failure(error, 'A new setup email could not be requested. Try again.'));
    } finally {
      this.reissuing.set(false);
    }
  }

  protected askDeactivate(): void {
    this.deactivateError.set(null);
    this.confirmingDeactivate.set(true);
  }

  protected cancelDeactivate(): void {
    this.confirmingDeactivate.set(false);
    this.deactivateError.set(null);
  }

  protected async confirmDeactivate(): Promise<void> {
    const current = this.account();
    if (!current || this.deactivating()) {
      return;
    }

    this.deactivating.set(true);
    this.deactivateError.set(null);
    try {
      const saved = await firstValueFrom(this.api.deactivate(current.userId));
      this.apply(saved);
      this.confirmingDeactivate.set(false);
      this.notice.set(`${saved.email} was deactivated. Their sessions were ended and they can no longer sign in.`);
    } catch (error) {
      // Self-deactivation and the last active Admin are refused by the service and change nothing; it explains why.
      this.deactivateError.set(this.failure(error, 'The account could not be deactivated. Try again.'));
    } finally {
      this.deactivating.set(false);
    }
  }

  private failure(error: unknown, fallback: string): string {
    return error instanceof HttpErrorResponse && error.status === 403
      ? 'Your current role cannot manage accounts. Switch to the Admin role and try again.'
      : error instanceof HttpErrorResponse && error.status === 404
        ? 'This account no longer exists.'
        : problemMessage(error, fallback);
  }

  private apply(account: UserAccount): void {
    this.account.set(account);
    this.emailForm.reset({ email: account.email });
    this.rolesForm.reset({ defaultRole: account.defaultRole ?? account.roles[0] ?? '' });
    this.emailFieldErrors.set([]);
  }

  private async load(userId: string, keepNotice = false): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.emailError.set(null);
    this.emailStale.set(false);
    this.rolesError.set(null);
    this.confirmingReissue.set(false);
    this.confirmingDeactivate.set(false);
    if (!keepNotice) {
      this.account.set(null);
    }
    this.announcement.set('Loading the account…');
    try {
      this.apply(await firstValueFrom(this.api.get(userId)));
      this.announcement.set('Account loaded.');
    } catch (error) {
      this.announcement.set('');
      this.loadError.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This account was not found.'
          : problemMessage(error, 'The account could not be loaded. Try again.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  private focusFirstInvalid(): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}
