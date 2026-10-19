import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AccountCredentialSetupRequest,
  CreateAccountRequest,
  CredentialSetupReissue,
  RoleFilter,
  StatusFilter,
  UpdateEmailRequest,
  UpdateRolesRequest,
  UserAccount,
  UserAccountPage,
} from './user.models';

export interface UserListOptions {
  search?: string;
  role?: RoleFilter;
  status?: StatusFilter;
  page?: number;
  pageSize?: number;
}

const ROOT = '/api/admin/users';

/** Client for the Admin account API and the public setup completion. The service authorizes every Admin call from the active role. */
@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly http = inject(HttpClient);

  list(options: UserListOptions = {}): Observable<UserAccountPage> {
    let params = new HttpParams().set('page', options.page ?? 1).set('pageSize', options.pageSize ?? 25);
    const search = options.search?.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (options.role) {
      params = params.set('role', options.role);
    }
    if (options.status) {
      params = params.set('status', options.status);
    }
    return this.http.get<UserAccountPage>(ROOT, { params });
  }

  get(userId: string): Observable<UserAccount> {
    return this.http.get<UserAccount>(`${ROOT}/${encodeURIComponent(userId)}`);
  }

  /** Creates a pending Admin or Student account with no password; the service then requests its setup email. */
  create(body: CreateAccountRequest): Observable<UserAccount> {
    return this.http.post<UserAccount>(ROOT, body);
  }

  updateEmail(userId: string, body: UpdateEmailRequest): Observable<UserAccount> {
    return this.http.put<UserAccount>(`${ROOT}/${encodeURIComponent(userId)}/email`, body);
  }

  updateRoles(userId: string, body: UpdateRolesRequest): Observable<UserAccount> {
    return this.http.put<UserAccount>(`${ROOT}/${encodeURIComponent(userId)}/roles`, body);
  }

  /** Blocks sign-in and ends every session. Nothing is deleted. */
  deactivate(userId: string): Observable<UserAccount> {
    return this.http.post<UserAccount>(`${ROOT}/${encodeURIComponent(userId)}/deactivation`, {});
  }

  /** Sends a fresh setup email to a pending account; earlier links stop working. */
  reissueSetup(userId: string): Observable<CredentialSetupReissue> {
    return this.http.post<CredentialSetupReissue>(`${ROOT}/${encodeURIComponent(userId)}/credential-setup-reissues`, {});
  }

  /** Public: whether a setup link can still be used. Says nothing about the account; an unusable link is just `usable: false`. */
  checkSetupLink(userId: string, proof: string): Observable<{ usable: boolean }> {
    return this.http.post<{ usable: boolean }>('/api/auth/account-credential-setup-checks', { userId, proof });
  }

  /** Public: sets the first password from the emailed link and activates the account. */
  completeSetup(body: AccountCredentialSetupRequest): Observable<void> {
    return this.http.post<void>('/api/auth/account-credential-setups', body);
  }
}
