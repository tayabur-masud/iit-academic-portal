import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../core/http/problem';
import { NotificationApi } from './notification-api';
import { NotificationSections } from './notification-sections';
import { FeedbackReminderSetting as Setting } from './notification.models';

/**
 * The one portal-wide number of minutes before a feedback window closes at which students are reminded. There is no default and no
 * per-window setting: until a value is saved, no closing reminder is scheduled.
 */
@Component({
  selector: 'app-feedback-reminder-setting',
  imports: [ReactiveFormsModule, RouterLink, NotificationSections],
  templateUrl: './feedback-reminder-setting.html',
})
export class FeedbackReminderSetting {
  private readonly api = inject(NotificationApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** A number input gives the form a number (or null when empty), not text. */
  protected readonly form = new FormGroup({ minutes: new FormControl<number | null>(null) });

  protected readonly setting = signal<Setting | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly problems = signal<string[]>([]);
  protected readonly announcement = signal('');

  constructor() {
    void this.load();
  }

  protected reload(): void {
    void this.load();
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.errorMessage.set(null);
    this.notice.set(null);
    this.problems.set([]);

    // The service checks too; whole positive numbers are the only thing it accepts.
    const minutes = this.form.controls.minutes.value;
    if (minutes === null || !Number.isInteger(minutes) || minutes < 1) {
      this.problems.set(['Enter a whole number of minutes, 1 or more.']);
      this.focusFirstInvalid();
      return;
    }

    this.saving.set(true);
    this.announcement.set('Saving…');
    try {
      const saved = await firstValueFrom(this.api.saveReminderSetting(minutes));
      this.apply(saved);
      this.notice.set(`Saved. Students are reminded ${saved.leadTimeMinutes} minutes before a feedback window closes.`);
      this.announcement.set('Saved.');
    } catch (error) {
      this.announcement.set('');
      if (error instanceof HttpErrorResponse && error.status === 400) {
        const messages = fieldErrors(error, 'leadTimeMinutes');
        this.problems.set(messages);
        this.errorMessage.set(
          messages.length > 0 ? 'The value needs attention. Correct it and save again.' : problemMessage(error, 'The setting could not be saved.'),
        );
        this.focusFirstInvalid();
      } else {
        this.errorMessage.set(
          error instanceof HttpErrorResponse && error.status === 403
            ? 'Your current role cannot change this setting. Switch to the Admin role and try again.'
            : problemMessage(error, 'The setting could not be saved. Try again.'),
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  private apply(setting: Setting): void {
    this.setting.set(setting);
    this.form.setValue({ minutes: setting.leadTimeMinutes ?? null });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.apply(await firstValueFrom(this.api.getReminderSetting()));
    } catch (error) {
      this.loadError.set(problemMessage(error, 'The setting could not be loaded. Try again.'));
    } finally {
      this.loading.set(false);
    }
  }

  private focusFirstInvalid(): void {
    // After the next render, because aria-invalid is only set once the errors have been drawn.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }
}
