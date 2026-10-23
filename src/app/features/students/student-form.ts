import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormArray, FormGroup, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { ConfigurationApi } from '../configuration/configuration-api';
import { ConfigurationItem, descriptorFor } from '../configuration/configuration.models';
import { statusLabel } from '../users/user.models';
import { GraduationEligibility } from './graduation-eligibility';
import { StudentApi } from './student-api';
import {
  AcademicHistoryCategory,
  AcademicHistoryEntry,
  HISTORY_CATEGORIES,
  CATALOG_FIELDS,
  CatalogField,
  HISTORY_FIELDS,
  HistoryField,
  StudentAddress,
  StudentAddressRequest,
  StudentAdmission,
  StudentAdmissionRequest,
  StudentLookup,
  StudentProfile,
  isCatalogField,
} from './student.models';
import { SearchableSelect, SelectOption } from '../../shared/searchable-select/searchable-select';

/** The choice that reveals a text box for a name that is not in the catalog. */
export const NOT_LISTED = '__not-listed__';

type AddressKind = 'mailing' | 'permanent';

/** Prefixes of the locality selector's values, which tell an Upazila from a City Corporation. */
const UPAZILA = 'upazila:';
const CITY = 'city:';

/** The history fields that apply to each category on the paper form. Values in other fields are kept, just not shown. */
const APPLICABLE: Record<AcademicHistoryCategory, readonly HistoryField[]> = {
  SscOLevel: ['examination', 'schoolOrCollege', 'board', 'group', 'year', 'marksObtained', 'marksPercentage', 'cgpa', 'division'],
  HscALevel: ['examination', 'schoolOrCollege', 'board', 'group', 'year', 'marksObtained', 'marksPercentage', 'cgpa', 'division'],
  BachelorGraduation: ['examination', 'university', 'department', 'subject', 'year', 'marksObtained', 'marksPercentage', 'cgpa', 'class', 'division'],
  Master: ['examination', 'university', 'department', 'subject', 'year', 'marksObtained', 'marksPercentage', 'cgpa', 'class', 'division'],
  Pgdit: ['examination', 'institution', 'subject', 'year', 'marksObtained', 'marksPercentage', 'cgpa', 'class', 'division'],
  Other: ['examination', 'institution', 'board', 'subject', 'year', 'marksObtained', 'marksPercentage', 'cgpa', 'class', 'division'],
};

/** An element ID for a service field key such as `mailingAddress.upazilaId` or `academicHistory[0].category`. */
export function fieldId(key: string): string {
  return key.replace(/[.[\]]+/g, '-').replace(/-$/, '');
}

/**
 * Enter a student admission from the paper form, or maintain one. The email finds or creates the Student account: a new email creates
 * a pending account that gets a setup email, a returning Student's email reuses the account and prefills the shared profile, and an
 * email of any other kind of account is refused by the service. The profile (personal details, two addresses with cascading
 * Division, District, and an Upazila or City Corporation, and the academic history) is shared by all of the Student's admissions; the program, rolls, hall,
 * and registration number belong to this admission. Hall and registration number can be recorded later, each on its own. No
 * attachment, photograph, or signature is captured. The service authorizes and validates everything.
 */
@Component({
  selector: 'app-student-form',
  imports: [ReactiveFormsModule, RouterLink, UtcTimestamp, GraduationEligibility, SearchableSelect, SelectOption],
  templateUrl: './student-form.html',
})
export class StudentForm {
  private readonly api = inject(StudentApi);
  private readonly configuration = inject(ConfigurationApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Bound from the route; absent when adding. */
  readonly admissionId = input<string>();

  protected readonly isNew = computed(() => !this.admissionId());
  protected readonly categories = HISTORY_CATEGORIES;
  protected readonly historyFields = HISTORY_FIELDS;
  protected readonly statusLabel = statusLabel;
  protected readonly fieldId = fieldId;

  protected readonly form = this.fb.group({
    email: [''],
    applicantName: [''],
    fatherName: [''],
    motherName: [''],
    dateOfBirth: [''],
    placeOfBirth: [''],
    maritalStatus: [''],
    nationality: [''],
    applicantMobile: [''],
    mailing: this.addressGroup(),
    permanent: this.addressGroup(),
    guardianName: [''],
    guardianRelationship: [''],
    guardianAddress: [''],
    guardianCellNumber: [''],
    degreeId: [''],
    batchId: [''],
    admissionSerialNumber: [''],
    admissionExamRoll: [''],
    classRoll: [''],
    assignedHallId: [''],
    registrationNumber: [''],
    academicHistory: this.fb.array<FormGroup>([]),
  });

  protected readonly admission = signal<StudentAdmission | null>(null);
  protected readonly lookup = signal<StudentLookup | null>(null);
  protected readonly degrees = signal<ConfigurationItem[]>([]);
  protected readonly batches = signal<ConfigurationItem[]>([]);
  protected readonly halls = signal<ConfigurationItem[]>([]);
  protected readonly institutions = signal<ConfigurationItem[]>([]);
  protected readonly boards = signal<ConfigurationItem[]>([]);
  protected readonly groups = signal<ConfigurationItem[]>([]);
  protected readonly notListed = NOT_LISTED;
  protected readonly isCatalogField = isCatalogField;
  protected readonly divisions = signal<ConfigurationItem[]>([]);
  protected readonly districts = { mailing: signal<ConfigurationItem[]>([]), permanent: signal<ConfigurationItem[]>([]) };
  protected readonly upazilas = { mailing: signal<ConfigurationItem[]>([]), permanent: signal<ConfigurationItem[]>([]) };
  protected readonly cityCorporations = { mailing: signal<ConfigurationItem[]>([]), permanent: signal<ConfigurationItem[]>([]) };
  protected readonly selectedDegree = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');
  /** Changes on every save so the eligibility panel re-evaluates. */
  protected readonly savedVersion = signal('');

  /** The original values of this admission, so a deactivated choice it already has stays selectable. */
  private readonly current = computed(() => this.admission());

  protected readonly degreeChoices = computed(() => this.activeOrCurrent(this.degrees(), this.current()?.degreeId));
  protected readonly batchChoices = computed(() =>
    this.activeOrCurrent(this.batches(), this.current()?.batchId).filter((b) => b.degreeId === this.selectedDegree()),
  );
  protected readonly hallChoices = computed(() => this.activeOrCurrent(this.halls(), this.current()?.assignedHallId));

  constructor() {
    this.notice.set((this.router.getCurrentNavigation()?.extras.state?.['notice'] as string | undefined) ?? null);
    effect(() => {
      const id = this.admissionId();
      untracked(() => void this.initialize(id));
    });
  }

  protected get history(): FormArray<FormGroup> {
    return this.form.controls.academicHistory;
  }

  protected address(kind: AddressKind): FormGroup {
    return kind === 'mailing' ? this.form.controls.mailing : this.form.controls.permanent;
  }

  protected applicableFields(index: number): readonly HistoryField[] {
    const category = this.history.at(index).get('category')?.value as AcademicHistoryCategory | '';
    return category ? APPLICABLE[category] : [];
  }

  /**
   * The catalog records a history field can choose: institutions of the fitting type, or boards, or groups. Active records, plus the one
   * this row already has, so a record deactivated since stays selected.
   */
  protected catalogChoices(name: CatalogField, index: number): ConfigurationItem[] {
    const spec = CATALOG_FIELDS[name];
    const items = spec.catalog === 'institutions' ? this.institutions() : spec.catalog === 'education-boards' ? this.boards() : this.groups();
    const types = spec.types as readonly string[] | null;
    const current = this.history.at(index).get(`${name}Choice`)?.value as string;
    return items.filter((item) => (item.isActive || item.id === current) && (!types || types.includes(item.type ?? '')));
  }

  protected isNotListed(name: CatalogField, index: number): boolean {
    return this.history.at(index).get(`${name}Choice`)?.value === NOT_LISTED;
  }

  protected fieldLabel(name: HistoryField): string {
    return HISTORY_FIELDS.find((f) => f.name === name)?.label ?? name;
  }

  protected errorsFor(key: string): string[] {
    return this.problems()[key] ?? [];
  }

  protected describedBy(key: string, help = false): string | null {
    const id = fieldId(key);
    const ids = [help ? `${id}-help` : '', this.errorsFor(key).length > 0 ? `${id}-error` : ''].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : null;
  }

  /** Who made a change: the account email, "(account removed)" if it no longer exists, or "System" when no account did. */
  protected who(display: string | undefined, userId: string | undefined): string {
    return display ?? (userId ? '(account removed)' : 'System');
  }

  protected degreePicked(): void {
    this.selectedDegree.set(this.form.controls.degreeId.value);
    if (!this.batchChoices().some((b) => b.id === this.form.controls.batchId.value)) {
      this.form.controls.batchId.setValue('');
    }
  }

  protected async divisionPicked(kind: AddressKind): Promise<void> {
    const group = this.address(kind);
    group.patchValue({ districtId: '', locality: '' });
    this.upazilas[kind].set([]);
    this.cityCorporations[kind].set([]);
    await this.loadDistricts(kind, group.get('divisionId')!.value);
  }

  protected async districtPicked(kind: AddressKind): Promise<void> {
    const group = this.address(kind);
    group.patchValue({ locality: '' });
    await this.loadLocalities(kind, group.get('districtId')!.value);
  }

  /** The service reports a locality problem on `upazilaId` or `cityCorporationId`; both belong to the one locality selector. */
  protected localityErrors(key: string): string[] {
    return [...this.errorsFor(`${key}.upazilaId`), ...this.errorsFor(`${key}.cityCorporationId`)];
  }

  protected localityDescribedBy(key: string): string | null {
    return this.localityErrors(key).length > 0 ? `${fieldId(key + '.locality')}-error` : null;
  }

  protected addHistory(): void {
    this.history.push(this.historyGroup());
    this.announcement.set(`Academic-history entry ${this.history.length} added.`);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`#${fieldId(`academicHistory[${this.history.length - 1}].category`)}`)?.focus());
  }

  protected removeHistory(index: number): void {
    this.history.removeAt(index);
    this.announcement.set(`Academic-history entry ${index + 1} removed.`);
  }

  /** On a new admission, finds out whether the email is new, a returning Student (whose profile is prefilled), or refused. */
  protected async checkEmail(): Promise<void> {
    if (!this.isNew()) {
      return;
    }
    const email = this.form.controls.email.value.trim();
    this.lookup.set(null);
    if (!email || !email.includes('@')) {
      return;
    }
    try {
      const result = await firstValueFrom(this.api.lookup(email));
      this.lookup.set(result);
      if (result.status === 'ExistingStudent' && result.profile) {
        await this.applyProfile(result.profile);
        this.announcement.set('Returning student. The shared profile was filled in from their existing record.');
      }
    } catch {
      // The lookup only helps; the service decides on submit.
      this.lookup.set(null);
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
      this.errorMessage.set('Some fields need attention. Correct them and save again.');
      this.focusFirstInvalid();
      return;
    }

    this.saving.set(true);
    this.announcement.set('Saving…');
    try {
      const id = this.admissionId();
      if (id) {
        const saved = await firstValueFrom(this.api.update(id, this.buildRequest(false)));
        await this.apply(saved);
        this.savedVersion.set(saved.lastModifiedAtUtc);
        this.notice.set(`The admission of ${saved.profile.applicantName} was saved.`);
        this.announcement.set('Saved.');
      } else {
        const created = await firstValueFrom(this.api.create(this.buildRequest(true)));
        const name = created.admission.profile.applicantName;
        const notice = created.accountCreated
          ? created.setupEmailRequested
            ? `${name} was admitted. A Student account was created and a setup email was requested; it stays pending until they set a password.`
            : `${name} was admitted and a Student account was created, but the setup email could not be queued. Send it from Accounts.`
          : `${name} was admitted to another program. Their existing Student account was reused and no new setup email was sent.`;
        await this.router.navigate(['/admin/students', created.admission.id], { state: { notice } });
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
    const require = (key: string, value: string, message: string) => {
      if (!value.trim()) {
        errors[key] = [message];
      }
    };
    if (this.isNew()) {
      require('email', v.email, "Enter the applicant's email address.");
    }
    require('applicantName', v.applicantName, "Enter the applicant's name.");
    require('applicantMobile', v.applicantMobile, "Enter the applicant's mobile number.");
    require('degreeId', v.degreeId, 'Select a degree.');
    require('batchId', v.batchId, 'Select a batch.');
    require('admissionSerialNumber', v.admissionSerialNumber, 'Enter the admission test serial number.');
    require('admissionExamRoll', v.admissionExamRoll, 'Enter the admission test roll number (Exam Roll).');
    for (const kind of ['mailing', 'permanent'] as const) {
      const a = v[kind];
      const key = kind === 'mailing' ? 'mailingAddress' : 'permanentAddress';
      if (a.details.trim() || a.districtId || a.locality || a.cellNumber.trim()) {
        require(`${key}.details`, a.details, 'Enter the address details (house, road, area).');
        if (!a.districtId) {
          errors[`${key}.districtId`] = ['Select the division and district.'];
        }
        if (!a.locality) {
          errors[`${key}.upazilaId`] = ['Select an upazila or a city corporation.'];
        }
      }
    }
    v.academicHistory.forEach((row: Record<string, string>, i: number) => {
      if (!row['category']) {
        errors[`academicHistory[${i}].category`] = ['Select a category.'];
      }
    });
    return errors;
  }

  private buildRequest(withEmail: boolean): StudentAdmissionRequest {
    const v = this.form.getRawValue();
    const text = (value: string) => (value.trim() ? value.trim() : null);
    // The locality selector holds "upazila:<id>" or "city:<id>", so an address always sends exactly one of the two.
    const address = (a: { details: string; districtId: string; locality: string; cellNumber: string }): StudentAddressRequest | null =>
      a.details.trim() || a.districtId || a.locality || a.cellNumber.trim()
        ? {
            details: text(a.details),
            districtId: a.districtId || null,
            upazilaId: a.locality.startsWith(UPAZILA) ? a.locality.slice(UPAZILA.length) : null,
            cityCorporationId: a.locality.startsWith(CITY) ? a.locality.slice(CITY.length) : null,
            cellNumber: text(a.cellNumber),
          }
        : null;
    return {
      ...(withEmail ? { email: v.email.trim() } : {}),
      applicantName: v.applicantName.trim(),
      fatherName: text(v.fatherName),
      motherName: text(v.motherName),
      dateOfBirth: v.dateOfBirth || null,
      placeOfBirth: text(v.placeOfBirth),
      maritalStatus: text(v.maritalStatus),
      nationality: text(v.nationality),
      applicantMobile: v.applicantMobile.trim(),
      mailingAddress: address(v.mailing),
      permanentAddress: address(v.permanent),
      guardianName: text(v.guardianName),
      guardianRelationship: text(v.guardianRelationship),
      guardianAddress: text(v.guardianAddress),
      guardianCellNumber: text(v.guardianCellNumber),
      degreeId: v.degreeId || null,
      batchId: v.batchId || null,
      admissionSerialNumber: v.admissionSerialNumber.trim(),
      admissionExamRoll: v.admissionExamRoll.trim(),
      classRoll: text(v.classRoll),
      assignedHallId: v.assignedHallId || null,
      registrationNumber: text(v.registrationNumber),
      // Every source value is sent exactly as typed (only outer spaces trimmed); blanks are left out.
      academicHistory: v.academicHistory.map((row: Record<string, string>) => {
        const entry: Record<string, string | null> = { id: row['id'] || null, category: row['category'] };
        for (const field of HISTORY_FIELDS) {
          entry[field.name] = text(row[field.name] ?? '');
        }
        // A catalog choice sends its ID (the service keeps the catalog name); a name that is not listed is sent as typed.
        for (const [name, spec] of Object.entries(CATALOG_FIELDS)) {
          const choice = row[`${name}Choice`] ?? '';
          entry[spec.idField] = choice && choice !== NOT_LISTED ? choice : null;
          if (choice !== NOT_LISTED) {
            entry[name] = choice ? text(row[name] ?? '') : null;
          }
        }
        return entry as unknown as StudentAdmissionRequest['academicHistory'][number];
      }),
    };
  }

  private handleFailure(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 400 && error.error?.errors) {
      const found: Record<string, string[]> = {};
      for (const [key, messages] of Object.entries(error.error.errors as Record<string, string[]>)) {
        found[key.charAt(0).toLowerCase() + key.slice(1)] = messages;
      }
      this.problems.set(found);
      this.errorMessage.set('Some fields need attention. Correct them and save again.');
      this.focusFirstInvalid();
      return;
    }

    this.errorMessage.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your current role cannot manage students. Switch to the Admin role and try again.'
        : error instanceof HttpErrorResponse && error.status === 404
          ? 'This admission no longer exists.'
          : problemMessage(error, 'The admission could not be saved. Try again.'),
    );
  }

  private async initialize(id: string | undefined): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.problems.set({});
    this.errorMessage.set(null);
    this.admission.set(null);
    this.lookup.set(null);
    this.history.clear();
    this.form.reset();
    this.selectedDegree.set('');

    try {
      const [degrees, batches, halls, divisions, institutions, boards, groups, admission] = await Promise.all([
        this.configuration.listAll(descriptorFor('degrees')!, 'all'),
        this.configuration.listAll(descriptorFor('batches')!, 'all'),
        this.configuration.listAll(descriptorFor('halls')!, 'all'),
        this.configuration.listAll(descriptorFor('divisions')!, 'all'),
        this.configuration.listAll(descriptorFor('institutions')!, 'all'),
        this.configuration.listAll(descriptorFor('education-boards')!, 'all'),
        this.configuration.listAll(descriptorFor('education-groups')!, 'all'),
        id ? firstValueFrom(this.api.get(id)) : Promise.resolve(null),
      ]);
      this.degrees.set(degrees);
      this.batches.set(batches);
      this.halls.set(halls);
      this.institutions.set(institutions);
      this.boards.set(boards);
      this.groups.set(groups);
      this.divisions.set(divisions);
      if (admission) {
        await this.apply(admission);
      }
    } catch (error) {
      this.loadError.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This admission was not found.'
          : problemMessage(error, 'The admission could not be loaded. Try again.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  private async apply(admission: StudentAdmission): Promise<void> {
    this.admission.set(admission);
    await this.applyProfile(admission.profile);
    this.form.patchValue({
      email: admission.profile.email,
      degreeId: admission.degreeId,
      batchId: admission.batchId,
      admissionSerialNumber: admission.admissionSerialNumber,
      admissionExamRoll: admission.admissionExamRoll,
      classRoll: admission.classRoll ?? '',
      assignedHallId: admission.assignedHallId ?? '',
      registrationNumber: admission.registrationNumber ?? '',
    });
    this.selectedDegree.set(admission.degreeId);
    this.problems.set({});
    this.errorMessage.set(null);
  }

  private async applyProfile(profile: StudentProfile): Promise<void> {
    this.form.patchValue({
      applicantName: profile.applicantName,
      fatherName: profile.fatherName ?? '',
      motherName: profile.motherName ?? '',
      dateOfBirth: profile.dateOfBirth ?? '',
      placeOfBirth: profile.placeOfBirth ?? '',
      maritalStatus: profile.maritalStatus ?? '',
      nationality: profile.nationality ?? '',
      applicantMobile: profile.applicantMobile,
      guardianName: profile.guardianName ?? '',
      guardianRelationship: profile.guardianRelationship ?? '',
      guardianAddress: profile.guardianAddress ?? '',
      guardianCellNumber: profile.guardianCellNumber ?? '',
    });
    await this.applyAddress('mailing', profile.mailingAddress);
    await this.applyAddress('permanent', profile.permanentAddress);
    this.history.clear();
    for (const entry of profile.academicHistory) {
      this.history.push(this.historyGroup(entry));
    }
  }

  private async applyAddress(kind: AddressKind, address: StudentAddress | null | undefined): Promise<void> {
    const group = this.address(kind);
    group.reset();
    this.districts[kind].set([]);
    this.upazilas[kind].set([]);
    this.cityCorporations[kind].set([]);
    if (!address) {
      return;
    }
    if (address.divisionId) {
      await this.loadDistricts(kind, address.divisionId);
    }
    if (address.districtId) {
      await this.loadLocalities(kind, address.districtId);
    }
    group.patchValue({
      divisionId: address.divisionId ?? '',
      districtId: address.districtId ?? '',
      locality: address.upazilaId ? UPAZILA + address.upazilaId : address.cityCorporationId ? CITY + address.cityCorporationId : '',
      details: address.details ?? '',
      cellNumber: address.cellNumber ?? '',
    });
  }

  private async loadDistricts(kind: AddressKind, divisionId: string): Promise<void> {
    this.districts[kind].set(divisionId ? await this.configuration.listAll(descriptorFor('districts')!, 'all', divisionId) : []);
  }

  /** Both kinds of locality of one District: its Upazilas and its City Corporations. */
  private async loadLocalities(kind: AddressKind, districtId: string): Promise<void> {
    const [upazilas, cityCorporations] = districtId
      ? await Promise.all([
          this.configuration.listAll(descriptorFor('upazilas')!, 'all', districtId),
          this.configuration.listAll(descriptorFor('city-corporations')!, 'all', districtId),
        ])
      : [[], []];
    this.upazilas[kind].set(upazilas);
    this.cityCorporations[kind].set(cityCorporations);
  }

  /** Active records, plus an inactive one this admission already uses so it stays selected. */
  private activeOrCurrent(items: ConfigurationItem[], currentId: string | undefined): ConfigurationItem[] {
    return items.filter((item) => item.isActive || item.id === currentId);
  }

  /** Geographic choices for one address: active ones, plus the inactive one already saved there. */
  protected geography(
    items: ConfigurationItem[],
    kind: AddressKind,
    level: 'divisionId' | 'districtId' | 'upazilaId' | 'cityCorporationId',
  ): ConfigurationItem[] {
    const saved = this.admission()?.profile[kind === 'mailing' ? 'mailingAddress' : 'permanentAddress']?.[level];
    return items.filter((item) => item.isActive || item.id === saved);
  }

  private addressGroup() {
    return this.fb.group({ divisionId: [''], districtId: [''], locality: [''], details: [''], cellNumber: [''] });
  }

  private historyGroup(entry?: AcademicHistoryEntry): FormGroup {
    const controls: Record<string, [string]> = { id: [entry?.id ?? ''], category: [entry?.category ?? ''] };
    for (const field of HISTORY_FIELDS) {
      controls[field.name] = [entry?.[field.name] ?? ''];
    }
    // The catalog choice: the record's ID, "not listed" for a typed name, or empty.
    for (const [name, spec] of Object.entries(CATALOG_FIELDS)) {
      const id = entry?.[spec.idField];
      controls[`${name}Choice`] = [id ? id : entry?.[name as CatalogField] ? NOT_LISTED : ''];
    }
    const group = this.fb.group(controls);
    // Choosing a catalog record shows its name; switching to "not listed" starts from an empty name.
    for (const name of Object.keys(CATALOG_FIELDS)) {
      group.get(`${name}Choice`)!.valueChanges.subscribe((choice: string) => {
        const record = [...this.institutions(), ...this.boards(), ...this.groups()].find((item) => item.id === choice);
        group.get(name)!.setValue(choice === NOT_LISTED ? '' : (record?.name ?? ''));
      });
    }
    return group;
  }

  private focusFirstInvalid(): void {
    // After the next render, because aria-invalid is only set once the errors have been drawn.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}
