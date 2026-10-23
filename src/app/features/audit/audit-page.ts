import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../core/http/problem';
import { InfiniteScrollSentinel } from '../../shared/infinite-scroll/infinite-scroll-sentinel';
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
import { SearchableSelect, SelectOption } from '../../shared/searchable-select/searchable-select';

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
  imports: [ReactiveFormsModule, RouterLink, InfiniteScrollSentinel, UtcTimestamp, SearchableSelect, SelectOption],
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
  protected readonly hasMore = signal(false);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');
  protected readonly filtered = signal(false);

  private applied: AuditFilters = { ...EMPTY_FILTERS };

  ngOnInit(): void {
    const snapshot = this.state.restore();
    this.applied = snapshot ? { ...snapshot.filters } : { ...EMPTY_FILTERS };
    this.form.setValue(this.applied);
    if (snapshot?.items.length) {
      this.items.set(snapshot.items);
      this.nextCursor.set(snapshot.nextCursor);
      this.hasMore.set(!!snapshot.nextCursor);
      this.loaded.set(true);
      this.filtered.set(hasFilters(this.applied));
      this.announcement.set(`Loaded ${snapshot.items.length} audit events.`);
    } else {
      void this.load();
    }
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
    this.nextCursor.set(null);
    this.hasMore.set(false);
    this.state.clear();
    void this.load();
  }

  protected clear(): void {
    this.problems.set({});
    this.form.setValue({ ...EMPTY_FILTERS });
    this.applied = { ...EMPTY_FILTERS };
    this.nextCursor.set(null);
    this.hasMore.set(false);
    this.state.clear();
    void this.load();
  }

  protected loadMore(): void {
    if (!this.loading() && this.nextCursor()) {
      void this.load(true);
    }
  }

  protected retryMore(): void {
    this.errorMessage.set(null);
    this.loadMore();
  }

  protected reload(): void {
    void this.load();
  }

  private async load(append = false): Promise<void> {
    if (this.loading()) {
      return;
    }

    const cursor = append ? this.nextCursor() : null;
    if (append && !cursor) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set(append ? 'Loading more audit events…' : 'Loading audit events…');
    this.filtered.set(hasFilters(this.applied));

    try {
      const result = await firstValueFrom(this.api.search(this.applied, cursor, 25));
      const loadedItems = append ? [...this.items(), ...result.items] : result.items;
      this.items.set(loadedItems);
      this.nextCursor.set(result.nextCursor);
      this.hasMore.set(!!result.nextCursor);
      this.loaded.set(true);
      this.state.save(this.applied, loadedItems, result.nextCursor);
      this.announcement.set(
        loadedItems.length === 0
          ? 'No events match these filters.'
          : `Loaded ${loadedItems.length} audit events${result.nextCursor ? '. More events are available below.' : '.'}`,
      );
    } catch (error) {
      this.handleFailure(error, append);
    } finally {
      this.loading.set(false);
    }
  }

  private handleFailure(error: unknown, append: boolean): void {
    if (!append) {
      this.items.set([]);
      this.nextCursor.set(null);
      this.hasMore.set(false);
    }
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
      this.errorMessage.set('Some filters need attention. Correct them and apply the filters again.');
      this.focusFirstInvalid();
      return;
    }

    this.errorMessage.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your current role cannot review audit history. Switch to the Admin role and try again.'
        : problemMessage(error, append ? 'More audit events could not be loaded. Try again.' : 'The audit events could not be loaded. Try again.'),
    );
  }

  private focusFirstInvalid(): void {
    // After the next render, because aria-invalid is only set once the errors have been drawn.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}
