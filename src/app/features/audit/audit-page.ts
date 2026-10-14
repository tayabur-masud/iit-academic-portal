import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../core/http/problem';
import { Pager } from '../../shared/pager/pager';
import { PagerPreferences } from '../../shared/pager/pager-preferences';
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
  imports: [ReactiveFormsModule, RouterLink, Pager, UtcTimestamp],
  templateUrl: './audit-page.html',
})
export class AuditPage implements OnInit {
  private readonly api = inject(AuditApi);
  private readonly state = inject(AuditSearchState);
  private readonly preferences = inject(PagerPreferences);
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
  protected readonly page = signal(1);
  protected readonly totalPages = signal(0);
  protected readonly totalCount = signal(0);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');
  protected readonly pageSize = this.preferences.pageSize;
  protected readonly firstShown = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly lastShown = computed(() => (this.page() - 1) * this.pageSize() + this.items().length);
  protected readonly filtered = signal(false);

  private applied: AuditFilters = { ...EMPTY_FILTERS };

  ngOnInit(): void {
    // Returning from an event restores the filters and page the reviewer was on.
    this.applied = { ...this.state.filters };
    this.form.setValue(this.applied);
    this.page.set(this.state.page);
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
    this.page.set(1);
    void this.load();
  }

  protected clear(): void {
    this.problems.set({});
    this.form.setValue({ ...EMPTY_FILTERS });
    this.applied = { ...EMPTY_FILTERS };
    this.page.set(1);
    void this.load();
  }

  protected setPageSize(size: number): void {
    // A different size changes which rows fall on each page, so go back to the first page.
    this.preferences.set(size);
    this.page.set(1);
    void this.load();
  }

  protected goTo(target: number): void {
    // Clicks during a load are ignored, not disabled, so the focused button keeps keyboard focus.
    if (!this.loading() && target !== this.page() && target >= 1 && target <= this.totalPages()) {
      this.page.set(target);
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
      const result = await firstValueFrom(this.api.search(this.applied, this.page(), this.pageSize()));
      const totalPages = result.totalPages ?? 0;
      if (result.items.length === 0 && totalPages > 0 && this.page() > totalPages) {
        // Events were removed from the match (or the page was stale): show the last page that exists.
        this.page.set(totalPages);
        await this.load();
        return;
      }
      this.items.set(result.items);
      this.totalPages.set(totalPages);
      this.totalCount.set(result.totalCount ?? result.items.length);
      this.loaded.set(true);
      this.state.save(this.applied, this.page());
      this.announcement.set(
        result.items.length === 0
          ? 'No events match these filters.'
          : `Showing events ${this.firstShown()} to ${this.lastShown()} of ${this.totalCount()}. Page ${this.page()} of ${totalPages}.`,
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
    this.totalPages.set(0);
    this.totalCount.set(0);
    this.announcement.set('');

    if (error instanceof HttpErrorResponse && error.status === 400) {
      const found: Record<string, string[]> = {};
      for (const field of [...FILTER_FIELDS, 'fromUtc', 'toUtc', 'page', 'pageSize']) {
        const messages = fieldErrors(error, field);
        if (messages.length > 0) {
          found[FIELD_FOR_PARAMETER[field] ?? field] = messages;
        }
      }
      this.problems.set(found);
      if (found['page']) {
        this.page.set(1);
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
