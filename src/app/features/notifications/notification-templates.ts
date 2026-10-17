import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { UtcTimestamp } from '../../shared/utc-timestamp/utc-timestamp';
import { NotificationApi } from './notification-api';
import { NotificationSections } from './notification-sections';
import { NotificationTemplate } from './notification.models';

/**
 * The eight email templates (one per event). Admins open one to edit its wording, preview it, or, for an ordinary academic message,
 * disable it. Invitation, email confirmation, and password reset messages are always enabled.
 */
@Component({
  selector: 'app-notification-templates',
  imports: [RouterLink, UtcTimestamp, NotificationSections],
  templateUrl: './notification-templates.html',
})
export class NotificationTemplates {
  private readonly api = inject(NotificationApi);

  protected readonly templates = signal<NotificationTemplate[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly announcement = signal('');

  constructor() {
    void this.load();
  }

  protected reload(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.announcement.set('Loading templates…');
    try {
      const templates = await firstValueFrom(this.api.listTemplates());
      this.templates.set(templates);
      this.announcement.set(`Loaded ${templates.length} templates.`);
    } catch (error) {
      this.announcement.set('');
      this.templates.set([]);
      this.errorMessage.set(problemMessage(error, 'The templates could not be loaded. Try again.'));
    } finally {
      this.loading.set(false);
    }
  }
}
