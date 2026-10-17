import { Role } from '../../core/auth/auth.models';
import { ACCOUNT_STATUSES, TeacherAccountStatus, statusLabel } from '../teachers/teacher.models';

/** Whether an account may sign in. Only Active accounts can; a new account starts as PendingCredentialSetup until its holder sets a password. */
export type AccountStatus = TeacherAccountStatus;

export { ACCOUNT_STATUSES, statusLabel };

export const ROLE_FILTERS: readonly { value: Role; label: string }[] = [
  { value: 'Admin', label: 'Admin' },
  { value: 'Student', label: 'Student' },
  { value: 'Teacher', label: 'Teacher' },
  { value: 'Coordinator', label: 'Coordinator' },
];

/** The account types User Management creates. Teachers are added through Teacher Management; Coordinator comes from assignments. */
export type AccountType = 'Admin' | 'Student';

export const ACCOUNT_TYPES: readonly { value: AccountType; label: string; help: string }[] = [
  { value: 'Admin', label: 'Admin', help: 'Can manage the portal: accounts, teachers, configuration, notifications, and audit history.' },
  { value: 'Student', label: 'Student', help: 'A Student account holds only the Student role.' },
];

/**
 * A portal account as the service returns it. It never carries a password, hash, setup proof, or setup link. `concurrencyStamp` is
 * the value sent back with an email change so an edit made from stale data is refused; it is not a credential.
 */
export interface UserAccount {
  userId: string;
  email: string;
  accountStatus: AccountStatus;
  roles: Role[];
  defaultRole?: Role;
  /** Present when Teacher Management owns this account's profile. */
  teacherId?: string;
  concurrencyStamp: string;
  createdAtUtc?: string;
  createdByUserId?: string;
  createdBy?: string;
  lastModifiedAtUtc?: string;
  lastModifiedByUserId?: string;
  lastModifiedBy?: string;
}

export interface UserAccountPage {
  items: UserAccount[];
  page: number;
  totalCount: number;
  totalPages: number;
}

export type RoleFilter = '' | Role;
export type StatusFilter = '' | AccountStatus;

export interface CreateAccountRequest {
  email: string;
  accountType: AccountType;
}

export interface UpdateEmailRequest {
  email: string;
  expectedConcurrencyStamp: string;
}

export interface UpdateRolesRequest {
  roles: Role[];
  defaultRole: Role | null;
}

/** The result of a setup-email reissue. It never contains the link or proof. */
export interface CredentialSetupReissue {
  account: UserAccount;
  setupEmailRequested: boolean;
  message: string;
}

/** The public setup page's request. The proof and password are sent only here and never shown or logged. */
export interface AccountCredentialSetupRequest {
  userId: string;
  proof: string;
  newPassword: string;
}
