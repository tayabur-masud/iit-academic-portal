import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { NotificationApi } from './notification-api';
import {
  NotificationDetail as Detail,
  RESEND_REFUSALS,
  eventLabel,
  statusBadgeClass,
  statusHelp,
  statusLabel,
} from './notification.models';

/**
 * One notification: its delivery facts and every attempt, the exact subject and body for an ordinary message, and an explicit
 * statement that a secure message's content is withheld (it is never stored). A failed notification can be resent after an explicit
 * confirmation; the resend is a new linked execution that runs in the background and never changes the original.
 */
@Component({
  selector: 'app-notification-detail',
  imports: [RouterLink, UtcTimestamp],
  templateUrl: './notification-detail.html',
})
export class NotificationDetail {
  private readonly api = inject(NotificationApi);

  /** Bound from the route. */
  readonly notificationId = input.required<string>();

  protected readonly eventLabel = eventLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusHelp = statusHelp;
  protected readonly statusBadgeClass = statusBadgeClass;

  protected readonly detail = signal<Detail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly confirming = signal(false);
  protected readonly resending = signal(false);
  protected readonly resendError = signal<string | null>(null);
  protected readonly resent = signal<Detail | null>(null);
  protected readonly announcement = signal('');

  protected readonly canResend = computed(() => this.detail()?.notification.status === 'Failed' && !this.resent());

  /** One key per confirmation: a retry of the same confirmation returns the same execution instead of making another. */
  private resendKey: string | null = null;

  constructor() {
    effect(() => {
      const id = this.notificationId();
      untracked(() => void this.load(id));
    });
  }

  protected askResend(): void {
    this.resendError.set(null);
    this.confirming.set(true);
  }

  protected cancelResend(): void {
    this.confirming.set(false);
    this.resendError.set(null);
    this.resendKey = null;
  }

  protected async confirmResend(): Promise<void> {
    const current = this.detail();
    if (!current || this.resending()) {
      return;
    }

    this.resendKey ??= crypto.randomUUID();
    this.resending.set(true);
    this.resendError.set(null);
    this.announcement.set('Requesting the resend…');
    try {
      const created = await firstValueFrom(this.api.resend(current.notification.id, this.resendKey));
      this.resent.set(created);
      this.confirming.set(false);
      this.resendKey = null;
      this.announcement.set('The resend was requested. It will be delivered in the background.');
    } catch (error) {
      this.announcement.set('');
      this.resendError.set(this.refusal(error));
      if (error instanceof HttpErrorResponse && error.status === 409) {
        // A refusal is final for this confirmation; a later attempt is a new decision with a new key.
        this.resendKey = null;
      }
    } finally {
      this.resending.set(false);
    }
  }

  private refusal(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        const code = (error.error as { code?: string } | null)?.code;
        return (code && RESEND_REFUSALS[code]) || problemMessage(error, 'This notification cannot be resent.');
      }
      if (error.status === 403) {
        return 'Your current role cannot resend notifications. Switch to the Admin role and try again.';
      }
      if (error.status === 404) {
        return 'This notification no longer exists.';
      }
    }
    return problemMessage(error, 'The resend could not be requested. Try again.');
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.detail.set(null);
    this.resent.set(null);
    this.confirming.set(false);
    this.resendError.set(null);
    this.resendKey = null;
    try {
      this.detail.set(await firstValueFrom(this.api.get(id)));
    } catch (error) {
      this.loadError.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This notification was not found.'
          : problemMessage(error, 'The notification could not be loaded. Try again.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
