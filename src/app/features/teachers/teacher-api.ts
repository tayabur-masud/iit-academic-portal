import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Teacher, TeacherPage, TeacherRequest, TeacherRolesRequest, TeacherStatusFilter } from './teacher.models';

export interface TeacherListOptions {
  search?: string;
  status?: TeacherStatusFilter;
  page?: number;
  pageSize?: number;
}

const ROOT = '/api/admin/teachers';

/** Client for the Admin teacher API. The service authorizes every call from the active role. */
@Injectable({ providedIn: 'root' })
export class TeacherApi {
  private readonly http = inject(HttpClient);

  list(options: TeacherListOptions = {}): Observable<TeacherPage> {
    let params = new HttpParams().set('page', options.page ?? 1).set('pageSize', options.pageSize ?? 25);
    const search = options.search?.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (options.status) {
      params = params.set('status', options.status);
    }
    return this.http.get<TeacherPage>(ROOT, { params });
  }

  get(id: string): Observable<Teacher> {
    return this.http.get<Teacher>(`${ROOT}/${encodeURIComponent(id)}`);
  }

  create(body: TeacherRequest): Observable<Teacher> {
    return this.http.post<Teacher>(ROOT, body);
  }

  update(id: string, body: TeacherRequest): Observable<Teacher> {
    return this.http.put<Teacher>(`${ROOT}/${encodeURIComponent(id)}`, body);
  }

  updateRoles(id: string, body: TeacherRolesRequest): Observable<Teacher> {
    return this.http.put<Teacher>(`${ROOT}/${encodeURIComponent(id)}/roles`, body);
  }

  /** Disables the account and revokes its sessions. Nothing is deleted. */
  deactivate(id: string): Observable<Teacher> {
    return this.http.post<Teacher>(`${ROOT}/${encodeURIComponent(id)}/deactivation`, {});
  }
}
