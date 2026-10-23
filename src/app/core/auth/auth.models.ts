export type Role = 'Admin' | 'Student' | 'Teacher' | 'Coordinator';

/**
 * The account's assigned roles and this session's active role. The service starts every session in the
 * account's default role, so the active role is null only when no supported role is assigned.
 */
export interface SessionContext {
  availableRoles: Role[];
  activeRole: Role | null;
  /**
   * The signed-in account's name for the account menu: the active role's profile name, another of its profile names, or its email.
   * The service sends it with every session response, so it follows a role switch.
   */
  displayName?: string | null;
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

/** Pages every role has (outside the role areas), such as My Profile; they show the active role's view, so they are kept on a switch. */
export const SHARED_PAGES: readonly string[] = ['/profile'];

/**
 * Keeps `url` only if it lies inside the role's area or is a shared page; otherwise the role's landing page. Used after a
 * role switch and for post-sign-in return URLs, so no page from another role is kept or reopened.
 */
export function landingWithin(url: string | null | undefined, role: Role): string {
  const area = ROLE_AREAS[role].path;
  const within = (base: string) =>
    !!url && (url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`));
  if (url && (within(area) || SHARED_PAGES.some(within))) {
    return url;
  }
  return area;
}
