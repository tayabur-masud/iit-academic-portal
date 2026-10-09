import { Route, Routes } from '@angular/router';

import {
  activeRoleGuard,
  authGuard,
  guestGuard,
  homeRedirectGuard,
} from './core/auth/auth.guards';
import { ROLE_AREAS, Role } from './core/auth/auth.models';
import { AuditDetail } from './features/audit/audit-detail';
import { AuditPage } from './features/audit/audit-page';
import { ForgotPassword } from './features/auth/forgot-password/forgot-password';
import { Login } from './features/auth/login/login';
import { ResetPassword } from './features/auth/reset-password/reset-password';
import { Shell } from './layout/shell/shell';
import { RoleLanding } from './pages/role-landing/role-landing';
import { NoRole, NotFound, Unauthorized } from './pages/status/status-pages';

const TITLE = 'IIT Academic Portal';

/** A role's area: its landing page, plus any pages that belong only to that role. */
function roleArea(role: Role, pages: Routes = []): Route {
  return {
    path: ROLE_AREAS[role].path.slice(1),
    canActivate: [activeRoleGuard(role)],
    children: [
      {
        path: '',
        component: RoleLanding,
        data: { role },
        title: `${ROLE_AREAS[role].module} | ${TITLE}`,
      },
      ...pages,
    ],
  };
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeRedirectGuard], children: [] },
  { path: 'login', component: Login, canActivate: [guestGuard], title: `Sign in | ${TITLE}` },
  {
    path: 'forgot-password',
    component: ForgotPassword,
    canActivate: [guestGuard],
    title: `Reset your password | ${TITLE}`,
  },
  // Not guest-only: a recovery link may be opened in a browser that is still signed in.
  { path: 'reset-password', component: ResetPassword, title: `Choose a new password | ${TITLE}` },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      // Audit history lives under /admin, so switching away from Admin leaves it for the new role's landing page.
      roleArea('Admin', [
        { path: 'audit', component: AuditPage, title: `Audit history | ${TITLE}` },
        { path: 'audit/:eventId', component: AuditDetail, title: `Audit event | ${TITLE}` },
      ]),
      roleArea('Student'),
      roleArea('Teacher'),
      roleArea('Coordinator'),
      { path: 'unauthorized', component: Unauthorized, title: `Access denied | ${TITLE}` },
      { path: 'no-role', component: NoRole, title: `No portal role | ${TITLE}` },
    ],
  },
  { path: '**', component: NotFound, title: `Page not found | ${TITLE}` },
];
