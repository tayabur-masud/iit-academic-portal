import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { StaffPage, StaffProfile, StaffProfileRequest } from './staff.models';

export interface StaffListOptions {
  search?: string;
  page?: number;
  pageSize?: number;
}

const ROOT = '/api/admin/staff';

/** Client for the Admin staff API. The service authorizes every call from the active role. There is no delete or reactivation. */
@Injectable({ providedIn: 'root' })
export class StaffApi {
  private readonly http = inject(HttpClient);

  list(options: StaffListOptions = {}): Observable<StaffPage> {
    let params = new HttpParams().set('page', options.page ?? 1).set('pageSize', options.pageSize ?? 25);
    const search = options.search?.trim();
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<StaffPage>(ROOT, { params });
  }

  get(id: string): Observable<StaffProfile> {
    return this.http.get<StaffProfile>(`${ROOT}/${encodeURIComponent(id)}`);
  }

  create(body: StaffProfileRequest): Observable<StaffProfile> {
    return this.http.post<StaffProfile>(ROOT, body);
  }

  update(id: string, body: StaffProfileRequest): Observable<StaffProfile> {
    return this.http.put<StaffProfile>(`${ROOT}/${encodeURIComponent(id)}`, body);
  }

  /** Deactivates the staff member and their account and ends their sessions. Repeating it changes nothing. */
  deactivate(id: string): Observable<StaffProfile> {
    return this.http.post<StaffProfile>(`${ROOT}/${encodeURIComponent(id)}/deactivation`, {});
  }
}
