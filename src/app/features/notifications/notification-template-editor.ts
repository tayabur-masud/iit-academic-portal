import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fieldErrors, problemMessage } from '../../core/http/problem';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { NotificationApi } from './notification-api';
import { NotificationSections } from './notification-sections';
import { NotificationTemplate, TemplatePreview } from './notification.models';

const FIELDS = ['subject', 'body', 'enabled', 'expectedRevision', 'sampleValues'] as const;

/**
 * Edit one email template and preview it. A preview uses synthetic sample values only: it sends nothing, stores nothing, and a
 * secure message shows only a visibly synthetic, nonfunctional link. An invitation, confirmation, or password-reset template cannot
 * be disabled. A save carries the revision being edited; if someone else saved first, the service refuses and the Admin reloads.
 */
@Component({
  selector: 'app-notification-template-editor',
  imports: [ReactiveFormsModule, RouterLink, UtcTimestamp, NotificationSections],
  templateUrl: './notification-template-editor.html',
})
export class NotificationTemplateEditor {
  private readonly api = inject(NotificationApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);

  /** Bound from the route. */
  readonly eventType = input.required<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    subject: [''],
    body: [''],
    enabled: [true],
  });

  /** Optional sample values for the preview, keyed by placeholder name. Not part of what is saved. */
  private readonly sample = signal<Record<string, string>>({});

  protected readonly template = signal<NotificationTemplate | null>(null);
  protected readonly preview = signal<TemplatePreview | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly previewing = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly conflict = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly problems = signal<Record<string, string[]>>({});
  protected readonly announcement = signal('');

  /**
   * The branded email layout for the preview, shown in a sandboxed frame that cannot run scripts. The service builds it from the validated
   * plain text with every value encoded, so it is trusted here only to be displayed as written (Angular would otherwise strip its styles).
   */
  protected readonly previewHtml = computed<SafeHtml | null>(() => {
    const shown = this.preview();
    return shown ? this.sanitizer.bypassSecurityTrustHtml(shown.html) : null;
  });

  /** Placeholders an Admin may give a sample value for. A secure message's link is always the fixed synthetic placeholder. */
  protected readonly sampleNames = computed(() => {
    const t = this.template();
    return t ? t.placeholders.filter((p) => !(t.isSecurity && p === 'actionLink')) : [];
  });

  constructor() {
    effect(() => {
      const slug = this.eventType();
      untracked(() => void this.initialize(slug));
    });
  }

  /** A placeholder as it is written in wording, for example {{courseName}}. */
  protected token(name: string): string {
    return `{{${name}}}`;
  }

  protected errorsFor(field: string): string[] {
    return this.problems()[field] ?? [];
  }

  protected describedBy(field: string, help = false): string | null {
    const ids = [help ? `${field}-help` : '', this.errorsFor(field).length > 0 ? `${field}-error` : ''].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : null;
  }

  protected setSample(name: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const sample = { ...this.sample() };
    if (value.trim()) {
      sample[name] = value;
    } else {
      delete sample[name];
    }
    this.sample.set(sample);
    this.preview.set(null);
  }

  protected edited(): void {
    // A preview describes the wording it was made from, so any edit makes it out of date.
    this.preview.set(null);
    this.notice.set(null);
  }

  protected async runPreview(): Promise<void> {
    if (this.previewing()) {
      return;
    }

    this.errorMessage.set(null);
    this.problems.set({});
    this.previewing.set(true);
    this.announcement.set('Preparing the preview…');
    try {
      const v = this.form.getRawValue();
      const sample = Object.keys(this.sample()).length > 0 ? this.sample() : undefined;
      const result = await firstValueFrom(this.api.previewTemplate(this.eventType(), { subject: v.subject, body: v.body, sampleValues: sample }));
      this.preview.set(result);
      this.announcement.set('Preview ready. It uses sample data and nothing was sent.');
    } catch (error) {
      this.announcement.set('');
      this.handleFailure(error, 'The preview could not be made. Try again.');
    } finally {
      this.previewing.set(false);
    }
  }

  protected async save(): Promise<void> {
    const current = this.template();
    if (!current || this.saving()) {
      return;
    }

    this.errorMessage.set(null);
    this.problems.set({});
    this.conflict.set(false);
    this.notice.set(null);
    this.saving.set(true);
    this.announcement.set('Saving…');
    try {
      const v = this.form.getRawValue();
      const saved = await firstValueFrom(
        this.api.updateTemplate(this.eventType(), { expectedRevision: current.revision, subject: v.subject, body: v.body, enabled: v.enabled }),
      );
      this.apply(saved);
      this.notice.set(saved.revision === current.revision ? 'No changes to save.' : `Saved as revision ${saved.revision}.`);
      this.announcement.set('Saved.');
    } catch (error) {
      this.announcement.set('');
      this.handleFailure(error, 'The template could not be saved. Try again.');
    } finally {
      this.saving.set(false);
    }
  }

  /** After a conflict: discard the edit and show the latest saved version. */
  protected reloadLatest(): void {
    void this.initialize(this.eventType());
  }

  private handleFailure(error: unknown, fallback: string): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.conflict.set(true);
      this.errorMessage.set(problemMessage(error, 'The template was changed by someone else.'));
      return;
    }

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
        Object.keys(found).length > 0 ? 'Some fields need attention. Correct them and try again.' : problemMessage(error, fallback),
      );
      this.focusFirstInvalid();
      return;
    }

    this.errorMessage.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your current role cannot manage notification templates. Switch to the Admin role and try again.'
        : problemMessage(error, fallback),
    );
  }

  private apply(template: NotificationTemplate): void {
    this.template.set(template);
    this.form.reset({ subject: template.subject, body: template.body, enabled: template.enabled });

    // A secure message must stay enabled, so its control is shown checked and cannot be changed. The service enforces it too.
    if (template.isSecurity) {
      this.form.controls.enabled.disable();
    } else {
      this.form.controls.enabled.enable();
    }
    this.sample.set({});
    this.preview.set(null);
  }

  private async initialize(slug: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.errorMessage.set(null);
    this.conflict.set(false);
    this.notice.set(null);
    this.problems.set({});
    this.template.set(null);
    this.preview.set(null);
    try {
      this.apply(await firstValueFrom(this.api.getTemplate(slug)));
    } catch (error) {
      this.loadError.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This template was not found.'
          : problemMessage(error, 'The template could not be loaded. Try again.'),
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
