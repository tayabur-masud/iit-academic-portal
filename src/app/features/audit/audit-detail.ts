import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { AuditApi } from './audit-api';
import { AuditChange, AuditEvent, displayValue } from './audit.models';

/** One audit event with its safe metadata and change summary. Excluded values are never available here. */
@Component({
  selector: 'app-audit-detail',
  imports: [RouterLink, UtcTimestamp],
  templateUrl: './audit-detail.html',
})
export class AuditDetail {
  private readonly api = inject(AuditApi);

  /** Bound from the route. */
  readonly eventId = input.required<string>();

  protected readonly event = signal<AuditEvent | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => void this.load(this.eventId()));
  }

  protected metadataEntries(event: AuditEvent): [string, string][] {
    return Object.entries(event.metadata ?? {}).map(([key, value]) => [key, displayValue(value)]);
  }

  protected value(change: AuditChange, which: 'oldValue' | 'newValue'): string {
    return displayValue(change[which]);
  }

  protected outcomeLabel(event: AuditEvent): string {
    return event.outcome.charAt(0).toUpperCase() + event.outcome.slice(1);
  }

  protected reload(): void {
    void this.load(this.eventId());
  }

  private async load(eventId: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    this.errorMessage.set(null);
    this.event.set(null);

    try {
      this.event.set(await firstValueFrom(this.api.get(eventId)));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.notFound.set(true);
      } else if (error instanceof HttpErrorResponse && error.status === 403) {
        this.errorMessage.set('Your current role cannot review audit history. Switch to the Admin role and try again.');
      } else {
        this.errorMessage.set(problemMessage(error, 'The audit event could not be loaded. Try again.'));
      }
    } finally {
      this.loading.set(false);
    }
  }
}
