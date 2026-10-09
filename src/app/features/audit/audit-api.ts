import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AuditEvent, AuditFilters, AuditPage, PAGE_SIZE, toUtcInstant } from './audit.models';

/** Client for the read-only audit review API. The service decides access on every request. */
@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);

  search(filters: AuditFilters, cursor: string | null): Observable<AuditPage> {
    const values: Record<string, string> = {
      fromUtc: toUtcInstant(filters.from),
      toUtc: toUtcInstant(filters.to),
      category: filters.category,
      outcome: filters.outcome,
      eventType: filters.eventType.trim(),
      actorUserId: filters.actorUserId.trim(),
      entityType: filters.entityType.trim(),
      entityId: filters.entityId.trim(),
      correlationId: filters.correlationId.trim(),
      cursor: cursor ?? '',
    };

    // Blank filters are left out so the request names only what was asked for.
    let params = new HttpParams().set('pageSize', PAGE_SIZE);
    for (const [name, value] of Object.entries(values)) {
      if (value) {
        params = params.set(name, value);
      }
    }
    return this.http.get<AuditPage>('/api/audit-events', { params });
  }

  get(eventId: string): Observable<AuditEvent> {
    return this.http.get<AuditEvent>(`/api/audit-events/${encodeURIComponent(eventId)}`);
  }
}
