export type Role = 'Admin' | 'Student' | 'Teacher' | 'Coordinator';

/** The account's assigned roles and this session's active role (null until a multi-role user chooses). */
export interface SessionContext {
  availableRoles: Role[];
  activeRole: Role | null;
}

export interface PasswordResetCompletion {
  email: string;
  proof: string;
  newPassword: string;
}

/** Each role's area and its feature-list module. Navigation only; the service enforces access. */
export const ROLE_AREAS: Record<Role, { path: string; module: string }> = {
  Admin: { path: '/admin', module: 'Admin Module' },
  Student: { path: '/student', module: 'Student Module' },
  Teacher: { path: '/teacher', module: 'Teacher Module' },
  Coordinator: { path: '/coordinator', module: 'Coordinator Module' },
};

/** Where a signed-in user belongs before choosing a page. */
export function routeForSession(context: SessionContext): string {
  if (context.activeRole) {
    return ROLE_AREAS[context.activeRole].path;
  }
  return context.availableRoles.length > 0 ? '/select-role' : '/no-role';
}

/**
 * Keeps `url` only if it lies inside the role's area; otherwise the role's landing page. Used after a
 * role switch and for post-sign-in return URLs, so no page from another role is kept or reopened.
 */
export function landingWithin(url: string | null | undefined, role: Role): string {
  const area = ROLE_AREAS[role].path;
  if (url && (url === area || url.startsWith(`${area}/`) || url.startsWith(`${area}?`))) {
    return url;
  }
  return area;
}
