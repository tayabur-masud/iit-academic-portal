import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { MyProfileView } from './my-profile.models';

/**
 * Client for My Profile. The service takes the account and the active role from the session, so the request carries no account
 * identifier or role. There is no write.
 */
@Injectable({ providedIn: 'root' })
export class MyProfileApi {
  private readonly http = inject(HttpClient);

  get(): Observable<MyProfileView> {
    return this.http.get<MyProfileView>('/api/profile');
  }
}
