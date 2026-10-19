import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  GraduationEligibility,
  StudentAdmission,
  StudentAdmissionCreated,
  StudentAdmissionRequest,
  StudentLookup,
  StudentPage,
} from './student.models';

export interface StudentListOptions {
  search?: string;
  degreeId?: string;
  batchId?: string;
  page?: number;
  pageSize?: number;
}

const ROOT = '/api/admin/students';

/** Client for the Admin Student Management API. The service authorizes every call from the active role. */
@Injectable({ providedIn: 'root' })
export class StudentApi {
  private readonly http = inject(HttpClient);

  list(options: StudentListOptions = {}): Observable<StudentPage> {
    let params = new HttpParams().set('page', options.page ?? 1).set('pageSize', options.pageSize ?? 25);
    const search = options.search?.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (options.degreeId) {
      params = params.set('degreeId', options.degreeId);
    }
    if (options.batchId) {
      params = params.set('batchId', options.batchId);
    }
    return this.http.get<StudentPage>(ROOT, { params });
  }

  /** Whether an admission for this email creates a Student, reuses one (with the profile to prefill), or is refused. */
  lookup(email: string): Observable<StudentLookup> {
    return this.http.get<StudentLookup>(`${ROOT}/lookup`, { params: new HttpParams().set('email', email.trim()) });
  }

  get(admissionId: string): Observable<StudentAdmission> {
    return this.http.get<StudentAdmission>(`${ROOT}/${encodeURIComponent(admissionId)}`);
  }

  create(body: StudentAdmissionRequest): Observable<StudentAdmissionCreated> {
    return this.http.post<StudentAdmissionCreated>(ROOT, body);
  }

  update(admissionId: string, body: StudentAdmissionRequest): Observable<StudentAdmission> {
    return this.http.put<StudentAdmission>(`${ROOT}/${encodeURIComponent(admissionId)}`, body);
  }

  eligibility(admissionId: string): Observable<GraduationEligibility> {
    return this.http.get<GraduationEligibility>(`${ROOT}/${encodeURIComponent(admissionId)}/graduation-eligibility`);
  }
}
