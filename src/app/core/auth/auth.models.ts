export type Role = 'Admin' | 'Student' | 'Teacher' | 'Coordinator';

/**
 * The account's assigned roles and this session's active role. The service starts every session in the
 * account's default role, so the active role is null only when no supported role is assigned.
 */
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
  Admin: { path: '/admin', module: 'Dashboard' },
  Student: { path: '/student', module: 'Dashboard' },
  Teacher: { path: '/teacher', module: 'Dashboard' },
  Coordinator: { path: '/coordinator', module: 'Dashboard' },
};

/** Where a signed-in user belongs before choosing a page. */
export function routeForSession(context: SessionContext): string {
  return context.activeRole ? ROLE_AREAS[context.activeRole].path : '/no-role';
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
