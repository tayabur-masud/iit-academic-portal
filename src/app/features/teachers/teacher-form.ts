import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Role } from '../../core/auth/auth.models';
import { fieldErrors, problemMessage } from '../../core/http/problem';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { ConfigurationApi } from '../configuration/configuration-api';
import { ConfigurationItem, descriptorFor } from '../configuration/configuration.models';
import { TeacherApi } from './teacher-api';
import { Teacher, TeacherRequest, statusLabel } from './teacher.models';
import { SearchableSelect, SelectOption } from '../../shared/searchable-select/searchable-select';

const PROFILE_FIELDS = ['displayName', 'email', 'employeeStaffId', 'phone', 'designationId'] as const;
const ROLE_FIELDS = ['roles', 'defaultRole'] as const;

/**
 * Add a teacher, or edit one: profile fields, the roles an Admin may change (Admin; Teacher stays while active; Coordinator is
 * assigned automatically and only shown), and deactivation. A new teacher is created pending: it cannot sign in until the teacher
 * completes the setup email that the service requests. The service authorizes and validates everything; this screen only presents it.
 */
@Component({
  selector: 'app-teacher-form',
  imports: [ReactiveFormsModule, RouterLink, UtcTimestamp, SearchableSelect, SelectOption],
  templateUrl: './teacher-form.html',
})
export class TeacherForm {
  private readonly api = inject(TeacherApi);
  private readonly configuration = inject(ConfigurationApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Bound from the route; absent when adding. */
  readonly id = input<string>();

  protected readonly isNew = computed(() => !this.id());
  protected readonly statusLabel = statusLabel;

  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: [''],
    email: [''],
    employeeStaffId: [''],
    phone: [''],
    designationId: [''],
  });

  protected readonly rolesForm = inject(NonNullableFormBuilder).group({
    admin: [false],
    defaultRole: [''],
  });

  protected readonly teacher = signal<Teacher | null>(null);
  protected readonly designations = signal<ConfigurationItem[]>([]);
  protected readonly adminSelected = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly savingRoles = signal(false);
  protected readonly deactivating = signal(false);
  protected readonly confirmingDeactivate = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly rolesError = signal<string | null>(null);
  protected readonly deactivateError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');

  /** Designations to choose: active ones, plus the one this teacher already has even if it was deactivated. */
  protected readonly designationChoices = computed(() => {
    const current = this.teacher()?.designationId;
    return this.designations().filter((d) => d.isActive || d.id === current);
  });

  /** The roles the default can be: Teacher, Admin when ticked, and Coordinator when the teacher holds it. */
  protected readonly defaultChoices = computed<Role[]>(() => {
    const roles: Role[] = [];
    if (this.adminSelected()) {
      roles.push('Admin');
    }
    roles.push('Teacher');
    if (this.teacher()?.roles.includes('Coordinator')) {
      roles.push('Coordinator');
    }
    return roles;
  });

  protected readonly holdsCoordinator = computed(() => !!this.teacher()?.roles.includes('Coordinator'));
  protected readonly isDeactivated = computed(() => this.teacher()?.accountStatus === 'Deactivated');

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

  protected adminChanged(): void {
    this.adminSelected.set(this.rolesForm.controls.admin.value);
    if (!this.defaultChoices().includes(this.rolesForm.controls.defaultRole.value as Role)) {
      this.rolesForm.controls.defaultRole.setValue('Teacher');
    }
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
        this.notice.set(`The details of ${saved.displayName} were saved.`);
        this.announcement.set('Saved.');
      } else {
        const created = await firstValueFrom(this.api.create(body));
        await this.router.navigate(['/admin/teachers'], {
          state: { notice: `${created.displayName} was added. A setup email was requested; the account stays pending until the teacher sets a password.` },
        });
      }
    } catch (error) {
      this.announcement.set('');
      this.handleFailure(error, PROFILE_FIELDS, 'The teacher could not be saved. Try again.', this.errorMessage);
    } finally {
      this.saving.set(false);
    }
  }

  protected async saveRoles(): Promise<void> {
    const id = this.id();
    if (!id || this.savingRoles()) {
      return;
    }

    this.rolesError.set(null);
    this.notice.set(null);
    this.problems.update((all) => ({ ...all, roles: [], defaultRole: [] }));
    this.savingRoles.set(true);
    try {
      const v = this.rolesForm.getRawValue();
      const saved = await firstValueFrom(
        this.api.updateRoles(id, {
          roles: v.admin ? ['Teacher', 'Admin'] : ['Teacher'],
          defaultRole: (v.defaultRole || null) as Role | null,
        }),
      );
      this.apply(saved);
      this.notice.set(`The roles of ${saved.displayName} were saved.`);
    } catch (error) {
      this.handleFailure(error, ROLE_FIELDS, 'The roles could not be saved. Try again.', this.rolesError);
    } finally {
      this.savingRoles.set(false);
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
    const id = this.id();
    if (!id || this.deactivating()) {
      return;
    }

    this.deactivating.set(true);
    this.deactivateError.set(null);
    try {
      const saved = await firstValueFrom(this.api.deactivate(id));
      this.apply(saved);
      this.confirmingDeactivate.set(false);
      this.notice.set(`${saved.displayName} was deactivated. Their sessions were ended and they can no longer sign in.`);
    } catch (error) {
      // A conflict (the last active Admin) changed nothing; the service explains why.
      this.deactivateError.set(problemMessage(error, 'The teacher could not be deactivated. Try again.'));
    } finally {
      this.deactivating.set(false);
    }
  }

  private validate(): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    const v = this.form.getRawValue();
    if (!v.displayName.trim()) {
      errors['displayName'] = ['Enter the name of the teacher.'];
    }
    if (!v.email.trim()) {
      errors['email'] = ['Enter the email address of the teacher.'];
    }
    return errors;
  }

  private buildRequest(): TeacherRequest {
    const v = this.form.getRawValue();
    return {
      displayName: v.displayName.trim(),
      email: v.email.trim(),
      employeeStaffId: v.employeeStaffId.trim(),
      phone: v.phone.trim(),
      designationId: v.designationId || null,
    };
  }

  private handleFailure(
    error: unknown,
    fields: readonly string[],
    fallback: string,
    target: { set(message: string | null): void },
  ): void {
    if (error instanceof HttpErrorResponse && error.status === 400) {
      const found: Record<string, string[]> = {};
      for (const field of fields) {
        const messages = fieldErrors(error, field);
        if (messages.length > 0) {
          found[field] = messages;
        }
      }
      this.problems.update((all) => ({ ...all, ...found }));
      target.set(
        Object.keys(found).length > 0 ? 'Some fields need attention. Correct them and save again.' : problemMessage(error, fallback),
      );
      this.focusFirstInvalid();
      return;
    }

    target.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your current role cannot manage teachers. Switch to the Admin role and try again.'
        : error instanceof HttpErrorResponse && error.status === 404
          ? 'This teacher no longer exists.'
          : problemMessage(error, fallback),
    );
  }

  private apply(teacher: Teacher): void {
    this.teacher.set(teacher);
    this.form.reset({
      displayName: teacher.displayName,
      email: teacher.email,
      employeeStaffId: teacher.employeeStaffId ?? '',
      phone: teacher.phone ?? '',
      designationId: teacher.designationId ?? '',
    });
    this.rolesForm.reset({ admin: teacher.roles.includes('Admin'), defaultRole: teacher.defaultRole ?? 'Teacher' });
    this.adminSelected.set(teacher.roles.includes('Admin'));
    this.problems.set({});
    this.errorMessage.set(null);
    this.rolesError.set(null);
  }

  private async initialize(id: string | undefined): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.problems.set({});
    this.errorMessage.set(null);
    this.rolesError.set(null);
    this.notice.set(null);
    this.confirmingDeactivate.set(false);
    this.teacher.set(null);
    this.form.reset();
    this.rolesForm.reset({ admin: false, defaultRole: 'Teacher' });
    this.adminSelected.set(false);

    try {
      const designations = descriptorFor('designations')!;
      const [all, teacher] = await Promise.all([
        this.configuration.listAll(designations, 'all'),
        id ? firstValueFrom(this.api.get(id)) : Promise.resolve(null),
      ]);
      this.designations.set(all);
      if (teacher) {
        this.apply(teacher);
      }
    } catch (error) {
      this.loadError.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This teacher was not found.'
          : problemMessage(error, 'The teacher could not be loaded. Try again.'),
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
