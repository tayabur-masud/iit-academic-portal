import { Role } from '../../core/auth/auth.models';

/** Whether an account may sign in. Only Active accounts can; a new teacher starts as PendingCredentialSetup. */
export type TeacherAccountStatus = 'Active' | 'PendingCredentialSetup' | 'Deactivated';

export const ACCOUNT_STATUSES: readonly { value: TeacherAccountStatus; label: string }[] = [
  { value: 'Active', label: 'Active' },
  { value: 'PendingCredentialSetup', label: 'Pending setup' },
  { value: 'Deactivated', label: 'Deactivated' },
];

export function statusLabel(status: TeacherAccountStatus): string {
  return ACCOUNT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** A teacher as the service returns it. It never carries a password or other secret. */
export interface Teacher {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  employeeStaffId?: string;
  phone?: string;
  designationId?: string;
  designationName?: string;
  isActive: boolean;
  accountStatus: TeacherAccountStatus;
  roles: Role[];
  defaultRole?: Role;
  createdAtUtc: string;
  createdByUserId?: string;
  createdBy?: string;
  lastModifiedAtUtc: string;
  lastModifiedByUserId?: string;
  lastModifiedBy?: string;
}

export interface TeacherPage {
  items: Teacher[];
  page: number;
  totalCount: number;
  totalPages: number;
}

export interface TeacherRequest {
  displayName: string;
  email: string;
  employeeStaffId: string;
  phone: string;
  designationId: string | null;
}

export interface TeacherRolesRequest {
  roles: Role[];
  defaultRole: Role | null;
}

export type TeacherStatusFilter = '' | TeacherAccountStatus;
