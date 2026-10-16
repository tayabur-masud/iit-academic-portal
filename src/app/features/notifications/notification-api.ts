import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { toUtcInstant } from '../audit/audit.models';
import {
  FeedbackReminderSetting,
  NotificationDetail,
  NotificationFilters,
  NotificationPage,
  NotificationTemplate,
  TemplatePreview,
  TemplatePreviewRequest,
  TemplateUpdateRequest,
} from './notification.models';

const TEMPLATES = '/api/admin/notification-templates';
const NOTIFICATIONS = '/api/admin/notifications';
const REMINDER = '/api/admin/notification-settings/feedback-reminder';

/** Client for the Admin notification API. The service authorizes every call from the active role. */
@Injectable({ providedIn: 'root' })
export class NotificationApi {
  private readonly http = inject(HttpClient);

  listTemplates(): Observable<NotificationTemplate[]> {
    return this.http.get<NotificationTemplate[]>(TEMPLATES);
  }

  getTemplate(slug: string): Observable<NotificationTemplate> {
    return this.http.get<NotificationTemplate>(`${TEMPLATES}/${encodeURIComponent(slug)}/email`);
  }

  updateTemplate(slug: string, body: TemplateUpdateRequest): Observable<NotificationTemplate> {
    return this.http.put<NotificationTemplate>(`${TEMPLATES}/${encodeURIComponent(slug)}/email`, body);
  }

  /** Renders draft wording with synthetic values. Nothing is sent or stored. */
  previewTemplate(slug: string, body: TemplatePreviewRequest): Observable<TemplatePreview> {
    return this.http.post<TemplatePreview>(`${TEMPLATES}/${encodeURIComponent(slug)}/email/previews`, body);
  }

  search(filters: NotificationFilters, cursor: string | null, pageSize: number): Observable<NotificationPage> {
    const values: Record<string, string> = {
      recipient: filters.recipient.trim(),
      eventType: filters.eventType,
      status: filters.status,
      fromUtc: toUtcInstant(filters.from),
      toUtc: toUtcInstant(filters.to),
    };

    // Blank filters are left out so the request names only what was asked for.
    let params = new HttpParams().set('pageSize', pageSize);
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    for (const [name, value] of Object.entries(values)) {
      if (value) {
        params = params.set(name, value);
      }
    }
    return this.http.get<NotificationPage>(NOTIFICATIONS, { params });
  }

  get(id: string): Observable<NotificationDetail> {
    return this.http.get<NotificationDetail>(`${NOTIFICATIONS}/${encodeURIComponent(id)}`);
  }

  /** Requests a linked re-send of a failed notification. The same key always returns the same execution. */
  resend(id: string, idempotencyKey: string): Observable<NotificationDetail> {
    return this.http.post<NotificationDetail>(
      `${NOTIFICATIONS}/${encodeURIComponent(id)}/resends`,
      null,
      { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) },
    );
  }

  getReminderSetting(): Observable<FeedbackReminderSetting> {
    return this.http.get<FeedbackReminderSetting>(REMINDER);
  }

  saveReminderSetting(leadTimeMinutes: number): Observable<FeedbackReminderSetting> {
    return this.http.put<FeedbackReminderSetting>(REMINDER, { leadTimeMinutes });
  }
}
