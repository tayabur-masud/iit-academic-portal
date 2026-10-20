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
import { TeacherForm } from './features/teachers/teacher-form';
import { TeacherList } from './features/teachers/teacher-list';
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
  // Public and not guest-only, like the reset page: the emailed setup link may be opened in any browser. Loaded on demand.
  {
    path: 'account-setup',
    loadComponent: () => import('./features/users/account-credential-setup').then((m) => m.AccountCredentialSetup),
    title: `Set up your account | ${TITLE}`,
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      // Audit history lives under /admin, so switching away from Admin leaves it for the new role's landing page.
      roleArea('Admin', [
        // Loaded on demand, like the other Admin-only screens, so the initial bundle stays small.
        { path: 'configuration', loadComponent: () => import('./features/configuration/configuration-home').then((m) => m.ConfigurationHome), title: `Configuration | ${TITLE}` },
        // The Grade scale has its own editor; it comes before ":resource" so the generic list never claims it.
        { path: 'configuration/grades', loadComponent: () => import('./features/configuration/grades/grade-scale-editor').then((m) => m.GradeScaleEditor), title: `Grades | ${TITLE}` },
        { path: 'configuration/:resource', loadComponent: () => import('./features/configuration/catalogs/catalog-list').then((m) => m.CatalogList), title: `Configuration | ${TITLE}` },
        { path: 'configuration/:resource/new', loadComponent: () => import('./features/configuration/catalogs/catalog-form').then((m) => m.CatalogForm), title: `New record | ${TITLE}` },
        { path: 'configuration/:resource/:id', loadComponent: () => import('./features/configuration/catalogs/catalog-form').then((m) => m.CatalogForm), title: `Edit record | ${TITLE}` },
        // Loaded on demand. "new" comes before ":userId" so it is never read as an account identifier.
        { path: 'users', loadComponent: () => import('./features/users/user-list').then((m) => m.UserList), title: `Accounts | ${TITLE}` },
        { path: 'users/new', loadComponent: () => import('./features/users/user-provisioning').then((m) => m.UserProvisioning), title: `Add account | ${TITLE}` },
        { path: 'users/:userId', loadComponent: () => import('./features/users/user-maintenance').then((m) => m.UserMaintenance), title: `Account | ${TITLE}` },
        // Loaded on demand. "new" comes before ":admissionId" so it is never read as an admission identifier.
        { path: 'students', loadComponent: () => import('./features/students/student-list').then((m) => m.StudentList), title: `Students | ${TITLE}` },
        { path: 'students/new', loadComponent: () => import('./features/students/student-form').then((m) => m.StudentForm), title: `Add admission | ${TITLE}` },
        { path: 'students/:admissionId', loadComponent: () => import('./features/students/student-form').then((m) => m.StudentForm), title: `Admission | ${TITLE}` },
        { path: 'teachers', component: TeacherList, title: `Teachers | ${TITLE}` },
        { path: 'teachers/new', component: TeacherForm, title: `Add teacher | ${TITLE}` },
        { path: 'teachers/:id', component: TeacherForm, title: `Edit teacher | ${TITLE}` },
        // Loaded on demand: these Admin-only screens are not part of the initial bundle. The fixed paths come first so "templates" and "settings" are never read as a notification identifier.
        { path: 'notifications', loadComponent: () => import('./features/notifications/notification-history').then((m) => m.NotificationHistory), title: `Notifications | ${TITLE}` },
        { path: 'notifications/templates', loadComponent: () => import('./features/notifications/notification-templates').then((m) => m.NotificationTemplates), title: `Message templates | ${TITLE}` },
        { path: 'notifications/templates/:eventType', loadComponent: () => import('./features/notifications/notification-template-editor').then((m) => m.NotificationTemplateEditor), title: `Edit template | ${TITLE}` },
        { path: 'notifications/settings', loadComponent: () => import('./features/notifications/feedback-reminder-setting').then((m) => m.FeedbackReminderSetting), title: `Reminder setting | ${TITLE}` },
        { path: 'notifications/:notificationId', loadComponent: () => import('./features/notifications/notification-detail').then((m) => m.NotificationDetail), title: `Notification | ${TITLE}` },
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
