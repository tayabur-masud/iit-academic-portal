import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import {
  ConfigurationItem,
  ConfigurationPage,
  ConfigurationRequest,
  ConfigurationStatus,
  ResourceDescriptor,
} from './configuration.models';

export interface ListOptions {
  search?: string;
  status?: ConfigurationStatus;
  cursor?: string | null;
  /** A 1-based page number: the list then also returns the total count and page count. */
  page?: number;
  pageSize?: number;
  /** Limits a geography list to one parent (a division for districts, a district for upazilas). */
  parentId?: string;
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
}
