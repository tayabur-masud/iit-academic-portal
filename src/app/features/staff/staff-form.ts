import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../core/http/problem';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { ConfigurationApi } from '../configuration/configuration-api';
import { ConfigurationItem, descriptorFor } from '../configuration/configuration.models';
import { statusLabel } from '../teachers/teacher.models';
import { StaffApi } from './staff-api';
import { StaffProfile, StaffProfileRequest, createdNotice } from './staff.models';

const FIELDS = ['email', 'name', 'mobileNumber', 'designationId', 'manualVerificationConfirmed'] as const;

/**
 * Add a staff member by email, or change a profile, including the signed-in Admin's own. A new email gets a pending Admin account and a
 * credential setup email; the email of an existing Admin account without a profile gets the profile only. Name, Mobile number, and
 * Designation are required, and every save needs the Admin to confirm the values were checked against the institution's records; the
 * confirmation is recorded with the change in the audit history and is cleared after each save. Roles are not changed here.
 */
@Component({
  selector: 'app-staff-form',
  imports: [ReactiveFormsModule, RouterLink, UtcTimestamp],
  templateUrl: './staff-form.html',
})
export class StaffForm {
  private readonly api = inject(StaffApi);
  private readonly configuration = inject(ConfigurationApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Bound from the route; absent when adding. */
  readonly id = input<string>();

  protected readonly isNew = computed(() => !this.id());
  protected readonly statusLabel = statusLabel;

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: [''],
    name: [''],
    mobileNumber: [''],
    designationId: [''],
    manualVerificationConfirmed: [false],
  });

  protected readonly profile = signal<StaffProfile | null>(null);
  protected readonly designations = signal<ConfigurationItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');

  /** Active designations, plus the one this profile already has even if it was deactivated. */
  protected readonly designationChoices = computed(() => {
    const current = this.profile()?.designationId;
    return this.designations().filter((d) => d.isActive || d.id === current);
  });

  /** A deactivated staff member, or a profile whose account was deactivated or lost the Admin role, stays readable but cannot be changed. */
  protected readonly locked = computed(() => {
    const current = this.profile();
    return !!current && (!current.isActive || current.accountStatus === 'Deactivated' || !current.hasAdminRole);
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.initialize(id));
    });
  }

  /** Who made a change: the account email, "(account removed)" if it no longer exists, or "System" when no account did. */
  protected who(display: string | undefined, userId: string | undefined): string {
    return display ?? (userId ? '(account removed)' : 'System');
  }

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
    this.notice.set(null);
    const clientErrors = this.validate();
    this.problems.set(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      this.errorMessage.set('Some fields need attention. Correct them and save again.');
      this.focusFirstInvalid();
      return;
    }

    this.saving.set(true);
    this.announcement.set('Saving…');
    try {
      const body = this.buildRequest();
      const id = this.id();
      if (id) {
        const saved = await firstValueFrom(this.api.update(id, body));
        this.apply(saved);
        this.notice.set(`The staff profile of ${saved.name} was saved.`);
        this.announcement.set('Saved.');
      } else {
        const created = await firstValueFrom(this.api.create(body));
        await this.router.navigate(['/admin/staff'], { state: { notice: createdNotice(created) } });
      }
    } catch (error) {
      this.announcement.set('');
      this.handleFailure(error);
    } finally {
      this.saving.set(false);
    }
  }

  private validate(): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    const v = this.form.getRawValue();
    if (this.isNew()) {
      const email = v.email.trim();
      if (!email) {
        errors['email'] = ["Enter the staff member's email address."];
      } else if (email.length > 256 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors['email'] = ['Enter a valid email address.'];
      }
    }
    if (!v.name.trim()) {
      errors['name'] = ["Enter the staff member's name."];
    } else if (v.name.trim().length > 200) {
      errors['name'] = ['The name can have at most 200 characters.'];
    }
    if (!v.mobileNumber.trim()) {
      errors['mobileNumber'] = ['Enter the mobile number.'];
    } else if (v.mobileNumber.trim().length > 50) {
      errors['mobileNumber'] = ['The mobile number can have at most 50 characters.'];
    }
    if (!v.designationId) {
      errors['designationId'] = ['Choose a designation.'];
    }
    if (!v.manualVerificationConfirmed) {
      errors['manualVerificationConfirmed'] = ["Confirm that you manually verified this information against the institution's records."];
    }
    return errors;
  }

  private buildRequest(): StaffProfileRequest {
    const v = this.form.getRawValue();
    return {
      ...(this.isNew() ? { email: v.email.trim() } : {}),
      name: v.name.trim(),
      mobileNumber: v.mobileNumber.trim(),
      designationId: v.designationId,
      manualVerificationConfirmed: v.manualVerificationConfirmed,
    };
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
        Object.keys(found).length > 0
          ? 'Some fields need attention. Correct them and save again.'
          : problemMessage(error, 'The staff profile could not be saved. Try again.'),
      );
      this.focusFirstInvalid();
      return;
    }

    this.errorMessage.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your current role cannot manage staff. Switch to the Admin role and try again.'
        : problemMessage(error, 'The staff profile could not be saved. Try again.'),
    );
  }

  /** Shows a saved profile. The confirmation is cleared: each save needs a fresh one. */
  private apply(profile: StaffProfile): void {
    this.profile.set(profile);
    this.form.reset({
      email: profile.email,
      name: profile.name,
      mobileNumber: profile.mobileNumber,
      designationId: profile.designationId,
      manualVerificationConfirmed: false,
    });
    this.problems.set({});
    this.errorMessage.set(null);
  }

  private async initialize(id: string | undefined): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.problems.set({});
    this.errorMessage.set(null);
    this.notice.set(null);
    this.profile.set(null);
    this.form.reset({ email: '', name: '', mobileNumber: '', designationId: '', manualVerificationConfirmed: false });

    try {
      const [designations, profile] = await Promise.all([
        this.configuration.listAll(descriptorFor('designations')!, 'all'),
        id ? firstValueFrom(this.api.get(id)) : Promise.resolve(null),
      ]);
      this.designations.set(designations);
      if (profile) {
        this.apply(profile);
      }
    } catch (error) {
      this.loadError.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This staff profile was not found.'
          : problemMessage(error, 'The staff profile could not be loaded. Try again.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  private focusFirstInvalid(): void {
    // After the next render, because aria-invalid is only set once the errors have been drawn.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}
