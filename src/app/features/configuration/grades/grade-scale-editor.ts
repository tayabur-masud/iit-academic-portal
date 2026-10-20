import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../../core/http/problem';
import { UtcTimestamp } from '../../../shared/utc-timestamp/utc-timestamp';
import { ConfigurationApi } from '../configuration-api';
import { GradeBand, GradeBandRequest } from '../configuration.models';

const MAX_LETTER = 20;
const MAX_COMMENT = 500;

type BandForm = FormGroup<{
  id: FormControl<string | null>;
  letterGrade: FormControl<string>;
  marksLowerBound: FormControl<number | null>;
  marksUpperBound: FormControl<number | null>;
  numericGrade: FormControl<number | null>;
  comment: FormControl<string>;
  isActive: FormControl<boolean>;
}>;

/** Errors keyed `bands` for the scale as a whole and `bands[i].field` for one band, exactly as the service keys them. */
type Problems = Record<string, string[]>;

const percent = (value: number) => `${Number(value.toFixed(10))}`;

/**
 * The global Grade scale shared by every degree, edited as one table and saved together: the only write replaces the whole
 * scale, because the active bands must cover every percentage from 0 through 100 exactly once. The same checks run here
 * before anything is sent; the service repeats them and its errors are shown against the same bands. Reference data only:
 * there is no degree, student, or course here.
 */
@Component({
  selector: 'app-grade-scale-editor',
  imports: [ReactiveFormsModule, RouterLink, UtcTimestamp],
  templateUrl: './grade-scale-editor.html',
})
export class GradeScaleEditor {
  private readonly api = inject(ConfigurationApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly bands = new FormArray<BandForm>([]);
  protected readonly form = new FormGroup({ bands: this.bands });

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly problems = signal<Problems>({});
  protected readonly announcement = signal('');
  /** The band whose removal is being confirmed in its row, if any. */
  protected readonly confirming = signal<number | null>(null);
  /** The bands as last loaded or saved, to tell which ones a save would delete and to show who changed the scale last. */
  private readonly saved = signal<GradeBand[]>([]);
  /** Bumped whenever rows are added or removed, so the "removed" note recomputes. */
  private readonly rowsChanged = signal(0);

  protected readonly removedCount = computed(() => {
    this.rowsChanged();
    const kept = new Set(this.bands.controls.map((band) => band.controls.id.value).filter(Boolean));
    return this.saved().filter((band) => !kept.has(band.id)).length;
  });

  /** The most recent change to any band. */
  protected readonly lastChange = computed(() =>
    this.saved().reduce<GradeBand | null>((latest, band) => (!latest || band.lastModifiedAtUtc > latest.lastModifiedAtUtc ? band : latest), null),
  );

  /** Messages about the scale as a whole, and about bands that have no field to show them on (a band that no longer exists). */
  protected readonly scaleMessages = computed(() => {
    const problems = this.problems();
    const messages = [...(problems['bands'] ?? [])];
    for (const [key, list] of Object.entries(problems)) {
      const match = /^bands\[(\d+)\]\.id$/.exec(key);
      if (match) {
        messages.push(...list.map((message) => `Band ${Number(match[1]) + 1}: ${message}`));
      }
    }
    return messages;
  });

  constructor() {
    void this.load();
  }

  protected errorsFor(index: number, field: string): string[] {
    return this.problems()[`bands[${index}].${field}`] ?? [];
  }

  protected readonly hasProblems = computed(() => Object.keys(this.problems()).length > 0);

  protected describedBy(index: number, field: string): string | null {
    const errors = this.errorsFor(index, field).length + (field === 'marksUpperBound' ? this.errorsFor(index, 'upperBoundInclusive').length : 0);
    return errors > 0 ? `band-${index}-${field}-error` : null;
  }

  protected who(display: string | undefined, userId: string | undefined): string {
    return display ?? (userId ? '(account removed)' : 'System');
  }

  protected addBand(): void {
    this.confirming.set(null);
    this.bands.push(this.newBand());
    this.rowsChanged.update((n) => n + 1);
    this.notice.set(null);
    this.announcement.set(`Band ${this.bands.length} added.`);
  }

  /** The letter grade of a band as typed, for confirmation and announcements. */
  protected letterOf(index: number): string {
    return this.bands.at(index)?.controls.letterGrade.value.trim() ?? '';
  }

  /** Whether a band was loaded from the service (so removing it deletes it on save) rather than added on this screen. */
  protected isSaved(index: number): boolean {
    return !!this.bands.at(index)?.controls.id.value;
  }

  /** Asks, in the row, before removing a band; focus moves to the confirming button. */
  protected askRemove(index: number): void {
    this.confirming.set(index);
    this.focus(`band-${index}-confirm-remove`);
  }

  protected cancelRemove(index: number): void {
    this.confirming.set(null);
    this.focus(`band-${index}-remove`);
  }

  protected confirmRemove(index: number): void {
    const letter = this.letterOf(index);
    const saved = this.isSaved(index);
    this.confirming.set(null);
    this.bands.removeAt(index);
    this.rowsChanged.update((n) => n + 1);
    // Band numbers shift, so errors keyed by the old numbers no longer point at the right rows.
    this.problems.set({});
    this.notice.set(null);
    this.announcement.set(`Band ${index + 1}${letter ? ` (${letter})` : ''} removed.${saved ? ' It is deleted when you save.' : ''}`);
    // Focus stays in the table: the band that took this place, or the one above it, or else Add band.
    const next = Math.min(index, this.bands.length - 1);
    this.focus(next >= 0 ? `band-${next}-remove` : 'add-band');
  }

  protected reload(): void {
    void this.load();
  }

  private focus(id: string): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus());
  }

  protected async submit(): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.notice.set(null);
    this.saveError.set(null);
    const bands = this.request();
    const problems = validate(bands);
    this.problems.set(problems);
    if (Object.keys(problems).length > 0) {
      this.announcement.set('The grade scale was not saved. Correct the highlighted bands.');
      this.focusFirstInvalid();
      return;
    }

    this.saving.set(true);
    try {
      const page = await firstValueFrom(this.api.replaceGradeScale(bands));
      this.show(page.items);
      this.notice.set('The grade scale was saved.');
      this.announcement.set('The grade scale was saved.');
    } catch (error) {
      const fieldProblems = error instanceof HttpErrorResponse && error.status === 400 ? (error.error?.errors as Problems | undefined) : undefined;
      if (fieldProblems && Object.keys(fieldProblems).length > 0) {
        this.problems.set(fieldProblems);
        this.focusFirstInvalid();
      } else {
        this.saveError.set(problemMessage(error, 'The grade scale could not be saved. Try again.'));
      }
      this.announcement.set('The grade scale was not saved.');
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.saveError.set(null);
    this.notice.set(null);
    this.problems.set({});
    this.announcement.set('Loading the grade scale…');
    try {
      const page = await firstValueFrom(this.api.listGrades());
      this.show(page.items);
      this.announcement.set(`Loaded ${page.items.length} grade bands.`);
    } catch (error) {
      this.loadError.set(problemMessage(error, 'The grade scale could not be loaded. Try again.'));
      this.announcement.set('');
    } finally {
      this.loading.set(false);
    }
  }

  private show(items: GradeBand[]): void {
    this.confirming.set(null);
    this.saved.set(items);
    this.bands.clear();
    for (const item of items) {
      this.bands.push(this.newBand(item));
    }
    this.rowsChanged.update((n) => n + 1);
    this.problems.set({});
  }

  private newBand(item?: GradeBand): BandForm {
    return new FormGroup({
      id: new FormControl<string | null>(item?.id ?? null),
      letterGrade: new FormControl(item?.letterGrade ?? '', { nonNullable: true }),
      marksLowerBound: new FormControl<number | null>(item?.marksLowerBound ?? null),
      marksUpperBound: new FormControl<number | null>(item?.marksUpperBound ?? null),
      numericGrade: new FormControl<number | null>(item?.numericGrade ?? null),
      comment: new FormControl(item?.comment ?? '', { nonNullable: true }),
      isActive: new FormControl(item?.isActive ?? true, { nonNullable: true }),
    });
  }

  /** The table as the request the service takes: the band ending at 100 includes 100; a new band has no id. */
  private request(): GradeBandRequest[] {
    return this.bands.controls.map((band) => {
      const v = band.getRawValue();
      const upper = number(v.marksUpperBound);
      return {
        ...(v.id ? { id: v.id } : {}),
        letterGrade: v.letterGrade.trim(),
        marksLowerBound: number(v.marksLowerBound),
        marksUpperBound: upper,
        upperBoundInclusive: upper === 100,
        numericGrade: number(v.numericGrade),
        comment: v.comment.trim(),
        isActive: v.isActive,
      };
    });
  }

  private focusFirstInvalid(): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}

function number(value: number | string | null): number | null {
  if (value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The service's rules, so most mistakes are caught before anything is sent. Messages match the service's. */
function validate(bands: GradeBandRequest[]): Problems {
  const problems: Problems = {};
  const add = (key: string, message: string) => (problems[key] ??= []).includes(message) || problems[key].push(message);

  if (bands.length === 0) {
    add('bands', 'Submit the complete grade scale, with at least one band.');
    return problems;
  }

  const letters = new Set<string>();
  const readable: boolean[] = [];
  bands.forEach((band, i) => {
    const field = (name: string) => `bands[${i}].${name}`;
    if (!band.letterGrade) {
      add(field('letterGrade'), 'Enter a letter grade.');
    } else if (band.letterGrade.length > MAX_LETTER) {
      add(field('letterGrade'), `A letter grade can be at most ${MAX_LETTER} characters.`);
    } else {
      const normalized = band.letterGrade.replace(/\s+/g, ' ').toUpperCase();
      if (letters.has(normalized)) {
        add(field('letterGrade'), 'Another band in this scale already has this letter grade.');
      }
      letters.add(normalized);
    }

    const inRange = (value: number | null, name: string, label: string) => {
      if (value === null) {
        add(field(name), `Enter the ${label}.`);
        return false;
      }
      if (value < 0 || value > 100) {
        add(field(name), `The ${label} must be a percentage from 0 to 100.`);
        return false;
      }
      return true;
    };
    const lowerOk = inRange(band.marksLowerBound, 'marksLowerBound', 'lower bound');
    const upperOk = inRange(band.marksUpperBound, 'marksUpperBound', 'upper bound');
    if (lowerOk && upperOk && band.marksLowerBound! >= band.marksUpperBound!) {
      add(field('marksUpperBound'), 'The upper bound must be above the lower bound.');
    }
    readable.push(lowerOk && upperOk);

    if (band.numericGrade === null) {
      add(field('numericGrade'), 'Enter the numeric grade.');
    } else if (band.numericGrade < 0 || band.numericGrade > 4 || !/^\d+(\.\d{1,2})?$/.test(String(band.numericGrade))) {
      add(field('numericGrade'), 'Enter a numeric grade from 0.00 to 4.00, with no more than two decimal places.');
    }

    if (!band.comment) {
      add(field('comment'), 'Enter a comment.');
    } else if (band.comment.length > MAX_COMMENT) {
      add(field('comment'), `A comment can be at most ${MAX_COMMENT} characters.`);
    }
  });

  const active = bands.map((band, index) => ({ band, index })).filter(({ band }) => band.isActive);
  if (active.length === 0) {
    add('bands', 'At least one band must be active.');
    return problems;
  }
  if (active.some(({ index }) => !readable[index])) {
    return problems;
  }

  const ordered = [...active].sort((a, b) => a.band.marksLowerBound! - b.band.marksLowerBound! || a.band.marksUpperBound! - b.band.marksUpperBound!);
  const first = ordered[0];
  if (first.band.marksLowerBound !== 0) {
    add('bands', `No active band covers 0% to ${percent(first.band.marksLowerBound!)}%. The lowest band must start at 0%.`);
    add(`bands[${first.index}].marksLowerBound`, 'The lowest active band must start at 0%.');
  }
  for (let i = 1; i < ordered.length; i++) {
    const below = ordered[i - 1].band;
    const { band, index } = ordered[i];
    if (band.marksLowerBound! > below.marksUpperBound!) {
      add('bands', `No active band covers ${percent(below.marksUpperBound!)}% to ${percent(band.marksLowerBound!)}%.`);
      add(`bands[${index}].marksLowerBound`, `Leaves a gap: ${below.letterGrade} ends at ${percent(below.marksUpperBound!)}%.`);
    } else if (band.marksLowerBound! < below.marksUpperBound!) {
      const end = Math.min(below.marksUpperBound!, band.marksUpperBound!);
      add('bands', `${below.letterGrade} and ${band.letterGrade} overlap from ${percent(band.marksLowerBound!)}% to ${percent(end)}%.`);
      add(`bands[${index}].marksLowerBound`, `Overlaps ${below.letterGrade}, which ends at ${percent(below.marksUpperBound!)}%.`);
    }
  }
  const top = ordered[ordered.length - 1];
  if (top.band.marksUpperBound !== 100) {
    add('bands', `No active band covers ${percent(top.band.marksUpperBound!)}% to 100%. The highest band must end at 100%.`);
    add(`bands[${top.index}].marksUpperBound`, 'The highest active band must end at 100%.');
  }
  return problems;
}
