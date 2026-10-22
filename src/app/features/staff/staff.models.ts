import { AccountStatus } from '../users/user.models';

/** A staff profile as the service returns it. It never carries a credential, document, or verified state. */
export interface StaffProfile {
  id: string;
  userId: string;
  email: string;
  accountStatus: AccountStatus;
  /** False when User Management has since removed the Admin role: the profile stays readable but cannot be changed. */
  hasAdminRole: boolean;
  name: string;
  mobileNumber: string;
  designationId: string;
  designationName?: string;
  /** False once the staff member was deactivated: the profile stays readable but cannot be changed. */
  isActive: boolean;
  createdAtUtc: string;
  createdByUserId?: string;
  createdBy?: string;
  lastModifiedAtUtc: string;
  lastModifiedByUserId?: string;
  lastModifiedBy?: string;
  /** Only in the response to a create: whether a new pending Admin account was created, or an existing one was linked. */
  accountCreated?: boolean;
  /** Only in the response to a create: whether the credential setup email was requested for the new account. */
  setupEmailRequested?: boolean;
}

export interface StaffPage {
  items: StaffProfile[];
  page: number;
  totalCount: number;
  totalPages: number;
}

/** A create or update. `email` is sent only when creating; the confirmation is required on every save and goes to the audit history. */
export interface StaffProfileRequest {
  email?: string;
  name: string;
  mobileNumber: string;
  designationId: string;
  manualVerificationConfirmed: boolean;
}

/** What a create did, in words for the staff list's notice. */
export function createdNotice(created: StaffProfile): string {
  if (!created.accountCreated) {
    return `The staff profile of ${created.name} was added to the existing Admin account ${created.email}.`;
  }
  return created.setupEmailRequested
    ? `${created.name} was added with a new Admin account. A credential setup email was sent to ${created.email}.`
    : `${created.name} was added with a new Admin account, but the credential setup email could not be requested. ` +
        'Reissue it from the account in Accounts.';
}
