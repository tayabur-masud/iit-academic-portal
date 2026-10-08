import { Routes } from '@angular/router';

import {
  activeRoleGuard,
  authGuard,
  guestGuard,
  homeRedirectGuard,
  roleSelectionGuard,
} from './core/auth/auth.guards';
import { ROLE_AREAS, Role } from './core/auth/auth.models';
import { ForgotPassword } from './features/auth/forgot-password/forgot-password';
import { Login } from './features/auth/login/login';
import { ResetPassword } from './features/auth/reset-password/reset-password';
import { SelectRole } from './features/auth/select-role/select-role';
import { Shell } from './layout/shell/shell';
import { RoleLanding } from './pages/role-landing/role-landing';
import { NoRole, NotFound, Unauthorized } from './pages/status/status-pages';

const TITLE = 'IIT Academic Portal';

function roleArea(role: Role) {
  return {
    path: ROLE_AREAS[role].path.slice(1),
    canActivate: [activeRoleGuard(role)],
    component: RoleLanding,
    data: { role },
    title: `${ROLE_AREAS[role].module} | ${TITLE}`,
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
    path: 'select-role',
    component: SelectRole,
    canActivate: [roleSelectionGuard],
    title: `Choose a role | ${TITLE}`,
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      roleArea('Admin'),
      roleArea('Student'),
      roleArea('Teacher'),
      roleArea('Coordinator'),
      { path: 'unauthorized', component: Unauthorized, title: `Access denied | ${TITLE}` },
      { path: 'no-role', component: NoRole, title: `No portal role | ${TITLE}` },
    ],
  },
  { path: '**', component: NotFound, title: `Page not found | ${TITLE}` },
];
