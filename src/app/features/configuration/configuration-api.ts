import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import {
  ConfigurationItem,
  ConfigurationPage,
  ConfigurationRequest,
  ConfigurationStatus,
  GradeBandRequest,
  GradeScalePage,
  ResourceDescriptor,
} from './configuration.models';

export interface ListOptions {
  search?: string;
  status?: ConfigurationStatus;
  cursor?: string | null;
  /** A 1-based page number: the list then also returns the total count and page count. */
  page?: number;
  pageSize?: number;
  /** Limits a list to one parent (a division for districts, a district for upazilas and city corporations, a degree for courses). */
  parentId?: string;
  /** Limits a typed catalog (courses, educational institutions) to one type. */
  type?: string;
}

const ROOT = '/api/admin/configuration';

/** Client for the Admin configuration API. The service authorizes every call from the active role. */
@Injectable({ providedIn: 'root' })
export class ConfigurationApi {
  private readonly http = inject(HttpClient);

  list(resource: ResourceDescriptor, options: ListOptions = {}): Observable<ConfigurationPage> {
    let params = new HttpParams().set('pageSize', options.pageSize ?? 25).set('status', options.status ?? 'active');
    const search = options.search?.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (options.page) {
      params = params.set('page', options.page);
    } else if (options.cursor) {
      params = params.set('cursor', options.cursor);
    }
    if (options.parentId && resource.parentFilter) {
      params = params.set(resource.parentFilter, options.parentId);
    }
    if (options.type && resource.hasType) {
      params = params.set('type', options.type);
    }
    return this.http.get<ConfigurationPage>(`${ROOT}/${resource.apiPath}`, { params });
  }

  /** Every record, following the service's pages, for lookups and selectors. */
  async listAll(resource: ResourceDescriptor, status: ConfigurationStatus = 'all', parentId?: string): Promise<ConfigurationItem[]> {
    const items: ConfigurationItem[] = [];
    let cursor: string | null = null;
    // A generous bound keeps a misbehaving service from looping the browser forever.
    for (let page = 0; page < 50; page++) {
      const result: ConfigurationPage = await firstValueFrom(
        this.list(resource, { status, cursor, pageSize: 100, parentId }),
      );
      items.push(...result.items);
      cursor = result.nextCursor;
      if (!cursor) {
        break;
      }
    }
    return items;
  }

  get(resource: ResourceDescriptor, id: string): Observable<ConfigurationItem> {
    return this.http.get<ConfigurationItem>(`${ROOT}/${resource.apiPath}/${encodeURIComponent(id)}`);
  }

  create(resource: ResourceDescriptor, body: ConfigurationRequest): Observable<ConfigurationItem> {
    return this.http.post<ConfigurationItem>(`${ROOT}/${resource.apiPath}`, body);
  }

  update(resource: ResourceDescriptor, id: string, body: ConfigurationRequest): Observable<ConfigurationItem> {
    return this.http.put<ConfigurationItem>(`${ROOT}/${resource.apiPath}/${encodeURIComponent(id)}`, body);
  }

  remove(resource: ResourceDescriptor, id: string): Observable<void> {
    return this.http.delete<void>(`${ROOT}/${resource.apiPath}/${encodeURIComponent(id)}`);
  }

  /** The whole Grade scale, highest band first; inactive bands too, so the editor can show and keep them. */
  listGrades(): Observable<GradeScalePage> {
    return this.http.get<GradeScalePage>(`${ROOT}/grades`, { params: new HttpParams().set('status', 'all') });
  }

  /** Replaces the Grade scale with the complete set given; returns the saved scale. */
  replaceGradeScale(bands: GradeBandRequest[]): Observable<GradeScalePage> {
    return this.http.put<GradeScalePage>(`${ROOT}/grades/scale`, { bands });
  }
}
