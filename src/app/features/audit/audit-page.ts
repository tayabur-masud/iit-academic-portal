import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../core/http/problem';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { AuditApi } from './audit-api';
import { AuditSearchState } from './audit-search-state';
import {
  AuditCategory,
  AuditEvent,
  AuditFilters,
  AuditOutcome,
  EMPTY_FILTERS,
  hasFilters,
  toUtcInstant,
} from './audit.models';

/** Query parameter the service reports a problem under, mapped to the form field that holds it. */
const FIELD_FOR_PARAMETER: Record<string, keyof AuditFilters> = {
  fromUtc: 'from',
  toUtc: 'to',
};

const FILTER_FIELDS: (keyof AuditFilters)[] = [
  'from',
  'to',
  'category',
  'outcome',
  'eventType',
  'actorUserId',
  'entityType',
  'entityId',
  'correlationId',
];

/** Admin-only search of audit history. The service re-checks the Admin role on every request. */
@Component({
  selector: 'app-audit-page',
  imports: [ReactiveFormsModule, RouterLink, UtcTimestamp],
  templateUrl: './audit-page.html',
})
export class AuditPage implements OnInit {
  private readonly api = inject(AuditApi);
  private readonly state = inject(AuditSearchState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = inject(NonNullableFormBuilder).group({
    from: [''],
    to: [''],
    category: ['' as '' | AuditCategory],
    outcome: ['' as '' | AuditOutcome],
    eventType: [''],
    actorUserId: [''],
    entityType: [''],
    entityId: [''],
    correlationId: [''],
  });

  protected readonly textFields = [
    { name: 'eventType', label: 'Event type', example: 'auth.sign-in' },
    { name: 'actorUserId', label: 'Actor ID', example: 'The stable user ID' },
    { name: 'entityType', label: 'Entity type', example: 'Session' },
    { name: 'entityId', label: 'Entity ID', example: '' },
    { name: 'correlationId', label: 'Correlation ID', example: 'Relates events from one request' },
  ] as const;

  protected readonly items = signal<AuditEvent[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  /** The cursor that opened each page visited so far; the last entry is the current page. */
  protected readonly cursors = signal<(string | null)[]>([null]);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');
  protected readonly pageNumber = computed(() => this.cursors().length);
  protected readonly filtered = signal(false);

  private applied: AuditFilters = { ...EMPTY_FILTERS };

  ngOnInit(): void {
    // Returning from an event restores the filters and page the reviewer was on.
    this.applied = { ...this.state.filters };
    this.form.setValue(this.applied);
    this.cursors.set([...this.state.cursors]);
    void this.load();
  }

  protected errorsFor(field: string): string[] {
    return this.problems()[field] ?? [];
  }

  protected describedBy(field: string): string | null {
    return this.errorsFor(field).length > 0 ? `${field}-error` : null;
  }

  protected outcomeLabel(outcome: AuditOutcome): string {
    return outcome.charAt(0).toUpperCase() + outcome.slice(1);
  }

  protected outcomeClass(outcome: AuditOutcome): string {
    return outcome === 'success' ? 'badge badge-success' : 'badge badge-error';
  }

  protected entityText(event: AuditEvent): string {
    return [event.entityType, event.entityId].filter((part) => !!part).join(' / ');
  }

  protected apply(): void {
    this.problems.set({});
    const values = this.form.getRawValue();

    // The service validates too; this catches the common mistake before a round trip.
    const from = toUtcInstant(values.from);
    const to = toUtcInstant(values.to);
    if (from && to && new Date(to) <= new Date(from)) {
      this.problems.set({ to: ['The end of the range must be later than its start.'] });
      this.focusFirstInvalid();
      return;
    }

    this.applied = values;
    this.cursors.set([null]);
    void this.load();
  }

  protected clear(): void {
    this.problems.set({});
    this.form.setValue({ ...EMPTY_FILTERS });
    this.applied = { ...EMPTY_FILTERS };
    this.cursors.set([null]);
    void this.load();
  }

  protected next(): void {
    const cursor = this.nextCursor();
    if (cursor) {
      this.cursors.update((history) => [...history, cursor]);
      void this.load();
    }
  }

  protected previous(): void {
    if (this.cursors().length > 1) {
      this.cursors.update((history) => history.slice(0, -1));
      void this.load();
    }
  }

  protected reload(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set('Loading audit events…');
    this.filtered.set(hasFilters(this.applied));

    try {
      const page = await firstValueFrom(this.api.search(this.applied, this.cursors().at(-1) ?? null));
      this.items.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.loaded.set(true);
      this.state.save(this.applied, this.cursors());
      this.announcement.set(
        page.items.length === 0
          ? 'No events match these filters.'
          : `${page.items.length} ${page.items.length === 1 ? 'event' : 'events'} shown on page ${this.pageNumber()}.`,
      );
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.loading.set(false);
    }
  }

  private handleFailure(error: unknown): void {
    // No partial or stale results are shown after a failure.
    this.items.set([]);
    this.nextCursor.set(null);
    this.announcement.set('');

    if (error instanceof HttpErrorResponse && error.status === 400) {
      const found: Record<string, string[]> = {};
      for (const field of [...FILTER_FIELDS, 'fromUtc', 'toUtc', 'cursor', 'pageSize']) {
        const messages = fieldErrors(error, field);
        if (messages.length > 0) {
          found[FIELD_FOR_PARAMETER[field] ?? field] = messages;
        }
      }
      this.problems.set(found);
      if (found['cursor']) {
        // A stale cursor means the position is lost: go back to the first page.
        this.cursors.set([null]);
      }
      this.errorMessage.set('Some filters need attention. Correct them and apply the filters again.');
      this.focusFirstInvalid();
      return;
    }

    this.errorMessage.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your current role cannot review audit history. Switch to the Admin role and try again.'
        : problemMessage(error, 'The audit events could not be loaded. Try again.'),
    );
  }

  private focusFirstInvalid(): void {
    // After the next render, because aria-invalid is only set once the errors have been drawn.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}
