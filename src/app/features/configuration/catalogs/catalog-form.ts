import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../../core/http/problem';
import { UtcTimestamp } from '../../../shared/utc-timestamp/utc-timestamp';
import { ConfigurationApi } from '../configuration-api';
import {
  ConfigurationItem,
  ConfigurationRequest,
  INSTITUTION_TYPES,
  ReferenceField,
  ReferenceName,
  ResourceDescriptor,
  descriptorFor,
} from '../configuration.models';

const FIELDS = [
  'name',
  'code',
  'type',
  'address',
  'creditsToBeCompleted',
  'creditHours',
  'theoryCreditHours',
  'labCreditHours',
  'prerequisiteCourseId',
  'degreeId',
  'startingSemesterId',
  'academicSessionId',
  'divisionId',
  'districtId',
] as const;


/** A credit value: up to six digits and two decimal places. */
const CREDIT_PATTERN = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;

/**
 * Create or edit one configuration record, built from the resource's descriptor. A record is deactivated by turning
 * off Active, never cascaded; a record in use cannot be deleted and the screen offers deactivation instead. A course
 * adds credit hours with optional theory and lab parts and an optional prerequisite chosen from the active courses of
 * the selected degree; courses are only deactivated, never deleted.
 */
@Component({
  selector: 'app-catalog-form',
  imports: [ReactiveFormsModule, RouterLink, UtcTimestamp],
  templateUrl: './catalog-form.html',
})
export class CatalogForm {
  private readonly api = inject(ConfigurationApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Bound from the route. */
  readonly resource = input.required<string>();
  readonly id = input<string>();

  protected readonly descriptor = computed(() => descriptorFor(this.resource()));
  protected readonly isNew = computed(() => !this.id());
  protected readonly types = computed<readonly string[]>(() => this.descriptor()?.typeOptions ?? INSTITUTION_TYPES);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [''],
    code: [''],
    type: [''],
    address: [''],
    creditsToBeCompleted: [''],
    creditHours: [''],
    theoryCreditHours: [''],
    labCreditHours: [''],
    prerequisiteCourseId: [''],
    isActive: [true],
    degreeId: [''],
    startingSemesterId: [''],
    academicSessionId: [''],
    divisionId: [''],
    districtId: [''],
    /** An Upazila's Division. It only narrows the District choices and is not sent. */
    cascadeDivisionId: [''],
  });

  protected readonly original = signal<ConfigurationItem | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly deleteConflict = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');

  /** Every record of each referenced resource, for the selectors. */
  private readonly referenced = signal<Record<string, ConfigurationItem[]>>({});
  protected readonly districtsOfDivision = signal<ConfigurationItem[]>([]);

  /** A course's prerequisite choices: the active courses of the selected degree, other than this one. */
  protected readonly prerequisiteChoices = signal<ConfigurationItem[]>([]);

  constructor() {
    effect(() => {
      const descriptor = this.descriptor();
      const id = this.id();
      if (descriptor) {
        untracked(() => void this.initialize(descriptor, id));
      }
    });
  }

  /** Who made a change: the account's email, "(account removed)" if it no longer exists, or "System" when no account did. */
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

  /** The records a selector offers: active ones, plus the one this record already uses even if it is inactive. */
  protected choices(reference: ReferenceField): ConfigurationItem[] {
    const current = (this.original() as unknown as Record<string, string | undefined> | null)?.[reference.name];
    return (this.referenced()[reference.resource] ?? []).filter((item) => item.isActive || item.id === current);
  }

  protected divisionChoices(): ConfigurationItem[] {
    const current = this.cascadeStart;
    return (this.referenced()['divisions'] ?? []).filter((item) => item.isActive || item.id === current);
  }

  protected districtChoices(): ConfigurationItem[] {
    const current = this.original()?.districtId;
    return this.districtsOfDivision().filter((item) => item.isActive || item.id === current);
  }

  /** The Division of the District an Upazila was loaded with, so an inactive one stays selectable. */
  private cascadeStart: string | undefined;

  /** A course's degree decides which courses can be its prerequisite. */
  protected async referencePicked(name: ReferenceName): Promise<void> {
    if (name === 'degreeId' && this.descriptor()?.isCourse) {
      await this.loadPrerequisites(this.form.controls.degreeId.value);
    }
  }

  protected async divisionPicked(): Promise<void> {
    this.form.controls.districtId.setValue('');
    await this.loadDistricts(this.form.controls.cascadeDivisionId.value);
  }

  protected async submit(): Promise<void> {
    const descriptor = this.descriptor();
    if (!descriptor || this.saving()) {
      return;
    }

    this.errorMessage.set(null);
    const clientErrors = this.validate(descriptor);
    this.problems.set(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      this.focusFirstInvalid();
      return;
    }

    await this.save(descriptor, this.buildRequest(descriptor, this.form.controls.isActive.value));
  }

  protected askDelete(): void {
    this.deleteConflict.set(null);
    this.confirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
    this.deleteConflict.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const descriptor = this.descriptor();
    const id = this.id();
    if (!descriptor || !id) {
      return;
    }

    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.api.remove(descriptor, id));
      await this.leave(descriptor, `The ${descriptor.singular} "${this.original()?.name}" was deleted.`);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        // In use: nothing was changed. Deactivating is the safe alternative.
        this.deleteConflict.set(problemMessage(error));
      } else {
        this.confirmingDelete.set(false);
        this.errorMessage.set(problemMessage(error, `The ${descriptor.singular} could not be deleted. Try again.`));
      }
    } finally {
      this.deleting.set(false);
    }
  }

  /** The safe alternative to a blocked delete: save the record as inactive. */
  protected async deactivateInstead(): Promise<void> {
    const descriptor = this.descriptor();
    if (!descriptor) {
      return;
    }

    this.confirmingDelete.set(false);
    this.deleteConflict.set(null);
    this.form.controls.isActive.setValue(false);
    await this.save(descriptor, this.buildRequest(descriptor, false));
  }

  private validate(descriptor: ResourceDescriptor): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    const v = this.form.getRawValue();
    if (!v.name.trim()) {
      errors['name'] = ['Enter a name.'];
    }
    if (descriptor.codeRequired && !v.code.trim()) {
      errors['code'] = [`Enter a ${descriptor.singular} code.`];
    }
    if (descriptor.hasType && !v.type) {
      errors['type'] = ['Select a type.'];
    }
    if (descriptor.isCourse) {
      Object.assign(errors, this.validateCourseCredits(v.creditHours, v.theoryCreditHours, v.labCreditHours));
    }
    if (descriptor.hasCredits) {
      const raw = String(v.creditsToBeCompleted).trim();
      const value = Number(raw);
      if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw) || !Number.isFinite(value) || value <= 0 || value > 999_999.99) {
        errors['creditsToBeCompleted'] = ['Enter a positive credit total with no more than two decimal places.'];
      }
    }
    for (const reference of descriptor.references) {
      if (!v[reference.name]) {
        errors[reference.name] = [`Select a ${reference.label.toLowerCase()}.`];
      }
    }
    if (descriptor.cascadeFrom && !v.cascadeDivisionId) {
      errors['cascadeDivisionId'] = ['Select a division.'];
    }
    return errors;
  }

  /** The same credit rules the service applies, for quick feedback: a positive total, parts between zero and it, and a matching sum. */
  private validateCourseCredits(totalRaw: unknown, theoryRaw: unknown, labRaw: unknown): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    const text = (value: unknown) => String(value ?? '').trim();
    const total = text(totalRaw);
    const totalValue = Number(total);
    const totalValid = CREDIT_PATTERN.test(total) && totalValue > 0 && totalValue <= 999_999.99;
    if (!totalValid) {
      errors['creditHours'] = ['Enter positive credit hours with no more than two decimal places.'];
    }
    const part = (raw: unknown, field: string, label: string): number | null => {
      const value = text(raw);
      if (!value) {
        return null;
      }
      if (!CREDIT_PATTERN.test(value)) {
        errors[field] = [`Enter ${label} credit hours of zero or more, with no more than two decimal places.`];
        return null;
      }
      const parsed = Number(value);
      if (totalValid && parsed > totalValue) {
        errors[field] = [`The ${label} credit hours cannot be more than the total credit hours.`];
        return null;
      }
      return parsed;
    };
    const theory = part(theoryRaw, 'theoryCreditHours', 'theory');
    const lab = part(labRaw, 'labCreditHours', 'lab');
    // Compared in hundredths so 0.1 + 0.2 style rounding never decides it.
    if (totalValid && theory !== null && lab !== null && Math.round(theory * 100) + Math.round(lab * 100) !== Math.round(totalValue * 100)) {
      errors['labCreditHours'] = ['Theory and lab credit hours must add up to the total credit hours.'];
    }
    return errors;
  }

  private buildRequest(descriptor: ResourceDescriptor, isActive: boolean): ConfigurationRequest {
    const v = this.form.getRawValue();
    const body: ConfigurationRequest = { name: v.name.trim(), isActive };
    if (descriptor.hasCode) {
      body.code = v.code.trim();
    }
    if (descriptor.hasType) {
      body.type = v.type;
    }
    if (descriptor.hasAddress) {
      body.address = v.address.trim();
    }
    if (descriptor.hasCredits) {
      body.creditsToBeCompleted = Number(v.creditsToBeCompleted);
    }
    if (descriptor.isCourse) {
      const optional = (value: unknown) => (String(value ?? '').trim() ? Number(value) : null);
      body.creditHours = Number(v.creditHours);
      body.theoryCreditHours = optional(v.theoryCreditHours);
      body.labCreditHours = optional(v.labCreditHours);
      body.prerequisiteCourseId = v.prerequisiteCourseId || null;
    }
    for (const reference of descriptor.references) {
      body[reference.name] = v[reference.name];
    }
    return body;
  }

  private async save(descriptor: ResourceDescriptor, body: ConfigurationRequest): Promise<void> {
    this.saving.set(true);
    this.announcement.set('Saving…');
    try {
      const id = this.id();
      const saved = await firstValueFrom(id ? this.api.update(descriptor, id, body) : this.api.create(descriptor, body));
      await this.leave(descriptor, `The ${descriptor.singular} "${saved.name}" was ${id ? 'saved' : 'created'}.`);
    } catch (error) {
      this.announcement.set('');
      this.handleFailure(error, descriptor);
    } finally {
      this.saving.set(false);
    }
  }

  private handleFailure(error: unknown, descriptor: ResourceDescriptor): void {
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
          : problemMessage(error, `The ${descriptor.singular} could not be saved.`),
      );
      this.focusFirstInvalid();
      return;
    }

    this.errorMessage.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your current role cannot change configuration. Switch to the Admin role and try again.'
        : error instanceof HttpErrorResponse && error.status === 404
          ? `This ${descriptor.singular} no longer exists.`
          : problemMessage(error, `The ${descriptor.singular} could not be saved. Try again.`),
    );
  }

  private async leave(descriptor: ResourceDescriptor, notice: string): Promise<void> {
    await this.router.navigate(['/admin/configuration', descriptor.slug], { state: { notice } });
  }

  private async initialize(descriptor: ResourceDescriptor, id: string | undefined): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.problems.set({});
    this.errorMessage.set(null);
    this.confirmingDelete.set(false);
    this.deleteConflict.set(null);
    this.original.set(null);
    this.prerequisiteChoices.set([]);
    this.form.reset({ isActive: true });

    try {
      const lists: Record<string, ConfigurationItem[]> = {};
      const needed = new Set(descriptor.references.map((reference) => reference.resource));
      if (descriptor.cascadeFrom) {
        needed.add(descriptor.cascadeFrom);
        needed.delete('districts');
      }
      await Promise.all(
        [...needed].map(async (slug) => {
          const target = descriptorFor(slug);
          if (target) {
            lists[slug] = await this.api.listAll(target, 'all');
          }
        }),
      );
      this.referenced.set(lists);

      if (id) {
        const item = await firstValueFrom(this.api.get(descriptor, id));
        this.original.set(item);
        this.form.patchValue({
          name: item.name,
          code: item.code ?? '',
          type: item.type ?? '',
          address: item.address ?? '',
          creditsToBeCompleted: item.creditsToBeCompleted?.toString() ?? '',
          creditHours: item.creditHours?.toString() ?? '',
          theoryCreditHours: item.theoryCreditHours?.toString() ?? '',
          labCreditHours: item.labCreditHours?.toString() ?? '',
          isActive: item.isActive,
          degreeId: item.degreeId ?? '',
          startingSemesterId: item.startingSemesterId ?? '',
          academicSessionId: item.academicSessionId ?? '',
          divisionId: item.divisionId ?? '',
          districtId: item.districtId ?? '',
        });
        if (descriptor.isCourse && item.degreeId) {
          await this.loadPrerequisites(item.degreeId, item.prerequisiteCourseId);
        }
        if (descriptor.cascadeFrom && item.districtId) {
          const district = await firstValueFrom(this.api.get(descriptorFor('districts')!, item.districtId));
          this.cascadeStart = district.divisionId;
          this.form.controls.cascadeDivisionId.setValue(district.divisionId ?? '');
          await this.loadDistricts(district.divisionId ?? '', item.districtId);
        }
      }
    } catch (error) {
      this.loadError.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? `This ${descriptor.singular} was not found.`
          : problemMessage(error, `The ${descriptor.singular} could not be loaded. Try again.`),
      );
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Loads the active courses of a degree as prerequisite choices, never this course itself. The prerequisite already saved stays
   * selectable even if it was deactivated since; any other choice that is not in the new degree is cleared.
   */
  private async loadPrerequisites(degreeId: string, keep?: string): Promise<void> {
    const courses = descriptorFor('courses')!;
    const self = this.id();
    const choices = degreeId ? (await this.api.listAll(courses, 'active', degreeId)).filter((course) => course.id !== self) : [];
    const saved = this.original()?.prerequisiteCourseId;
    if (saved && degreeId === this.original()?.degreeId && !choices.some((course) => course.id === saved)) {
      choices.push(await firstValueFrom(this.api.get(courses, saved)));
    }
    this.prerequisiteChoices.set(choices);
    const wanted = keep ?? this.form.controls.prerequisiteCourseId.value;
    this.form.controls.prerequisiteCourseId.setValue(choices.some((course) => course.id === wanted) ? wanted : '');
  }

  private async loadDistricts(divisionId: string, keepDistrict?: string): Promise<void> {
    const districts = descriptorFor('districts')!;
    this.districtsOfDivision.set(divisionId ? await this.api.listAll(districts, 'all', divisionId) : []);
    if (keepDistrict) {
      this.form.controls.districtId.setValue(keepDistrict);
    }
  }

  private focusFirstInvalid(): void {
    // After the next render, because aria-invalid is only set once the errors have been drawn.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}

