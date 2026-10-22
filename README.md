# IIT Academic Portal

Angular 21 frontend for the IIT Academic Portal. Requires Node.js 24 LTS.

## Development

Start the service first, on the `https` launch profile (see `iit-academic-portal-service/README.md`):

```powershell
dotnet run --project src/IitAcademicPortal.Api --launch-profile https   # in iit-academic-portal-service
```

Then, in this folder:

```powershell
npm ci                         # first time only
npm start                      # http://localhost:4200
npm test -- --watch=false      # unit tests (Vitest), single run
npm run build                  # production build in dist/
```

`npm start` proxies `/api` to the service at `https://localhost:7286` (see `proxy.conf.json`), so the browser
talks to one origin and the service's `HttpOnly` session cookie is sent automatically. If sign-in reports
"The portal could not be reached", the service is not running on the `https` profile. In production, serve the
app and the API from the same origin (for example, through a reverse proxy).

Sign in with a seeded development account, such as `teacher.coordinator@iit.test`. It opens directly in its
default role (Teacher), and the role switcher at the bottom of the menu changes to Coordinator.

## Structure

| Path | Purpose |
|---|---|
| `src/styles/tokens.css` | Design tokens from `specs/design-system.md`, declared as the Tailwind theme; the only place color and size values are defined |
| `src/styles.css` | Tailwind entry point plus shared component classes (buttons, fields, alerts, cards, auth pages) |
| `src/app/core/auth/` | Auth API client, session state, anti-forgery and session-ended interceptors, route guards |
| `src/app/features/auth/` | Sign-in, forgot-password, and reset-password pages |
| `src/app/features/configuration/` | Admin-only reference data at `/admin/configuration`: one generic list and form (`catalogs/`) driven by descriptors in `configuration.models.ts` serves all fifteen resources (nine catalogs, batches, courses, and the division, district, upazila, and city corporation geography; all lazy-loaded), with an edit screen that shows a "Record history" panel (who created and last changed the record, and when, in UTC) and a landing page that groups them as IIT academics (degrees with their credits to be completed and minimum CGPA for completion, semesters, academic sessions, batches, courses, listed with the code as the first, linked column, sorted by code, and filtered by degree and type: code, credit hours with optional theory and lab parts, type, degree, and an optional prerequisite chosen from the active courses of that degree; courses are only deactivated), Other catalogs (institutions, boards, groups, examination types, designations, halls), and Geography The Grade scale (`grades/`) has its own editor at `/admin/configuration/grades`: one table of all bands, saved together through `PUT grades/scale`, with the same coverage checks run before sending |
| `src/app/features/users/` | Admin-only account management (lazy-loaded): the directory at `/admin/users` (search by email or exact account ID, role and status filters, infinite loading), `/admin/users/new` (add an Admin or Student; no password field, the holder gets a setup email), and `/admin/users/:userId` (identity, status, roles, email change with stale-edit handling, default role, a confirmed setup-email reissue while pending, and confirmed deactivation; teacher accounts link to Teacher Management). Also the public first-password page at `/account-setup`, which takes the account ID and one-use proof from the emailed link, removes them from the address bar, and never shows them |
| `src/app/features/students/` | Admin-only Student Management (lazy-loaded): the admission directory at `/admin/students` (search, degree and batch filters, class roll column, infinite loading; one row per program admission), and `/admin/students/new` and `/admin/students/:admissionId` (the paper-form entry: email lookup that prefills a returning Student, program and rolls, hall and registration number, applicant details, mailing and permanent addresses with cascading Division and District and one "Upazila or city corporation" choice, guardian, and academic-history rows whose school, college, university, institution, board, and group are chosen from the Configuration catalogs, with "Not listed" to type a name; the edit view adds the account panel, the student's other programs, graduation eligibility with credits and current cumulative CGPA against the degree minimum, and record history). No upload, photograph, or signature is captured |
| `src/app/features/teachers/` | Admin-only teacher management at `/admin/teachers` (directory with search, status filter, and infinite loading), `/admin/teachers/new`, and `/admin/teachers/:id` (profile, roles, account status, deactivation with confirmation, and a "Record history" panel). New teachers are pending until they use the setup email; there is no delete |
| `src/app/features/staff/` | Admin-only Staff Management (lazy-loaded): the staff directory at `/admin/staff` (search by name, email, mobile number, or designation; infinite loading) and `/admin/staff/new` (by email: a new pending Admin account with a setup email, or an existing Admin account without a profile) and `/admin/staff/:id` (Name, Mobile number, Designation, with a manual-verification confirmation required on every save, and record history); "Deactivate…" in a directory row, confirmed in the row, deactivates the staff member and their account. An Admin edits their own profile here too; the account menu's My Profile stays view-only. Roles are not changed here |
| `src/app/features/notifications/` | Admin-only notification administration under `/admin/notifications` (lazy-loaded): history with combined filters and infinite loading, a detail screen with the exact content of ordinary messages (security content is never stored and is shown as withheld), a confirmed resend of failed notifications, the eight email templates (`/templates`) with an editor and a synthetic-only preview, and the single feedback-reminder lead time (`/settings`) |
| `src/app/features/audit/` | Admin-only audit history at `/admin/audit` (search with numbered pages and a total count) and `/admin/audit/:eventId` (detail); filters and page position are remembered in memory while an event is open |
| `src/app/layout/shell/` | Signed-in shell: header, sidebar navigation, and an account section at the bottom of the sidebar (active role or role switcher, sign-out) |
| `src/app/pages/` | Role landing pages and the unauthorized, no-role, and not-found states |
| `src/app/shared/pager/` | `<app-pager>`: the one numbered pager every paged table uses ("Showing X to Y of N", an "Items per page" choice of 10, 25, 50, or 100, Previous, page numbers with an ellipsis, Next), `pageList` that decides which numbers to show, and `PagerPreferences`, which keeps the chosen page size in memory for all tables |
| `src/app/shared/utc-timestamp/` | `<app-utc-timestamp>`: every audit time is shown in UTC with an explicit "UTC" label inside a `time` element |
| `src/app/shared/auth-brand/` | Centered IIT logo and portal name used on every authentication screen |
| `src/app/shared/password-toggle/` | `<app-password-toggle>`: the eye button inside every password field that shows or hides the password; place it after the input inside `.password-field` |
| `public/images/iit-logo.png` | Approved IIT logo (600×327), shown on the authentication screens and in the signed-in header; do not stretch or recolor it |
| `public/favicon.ico`, `public/apple-touch-icon.png` | Browser-tab icon (16/32/48px, "IIT" lettermark) and 180px home-screen icon (full logo), generated from the logo per design-system §10 |

## Styling (Tailwind CSS v4)

Tailwind runs through PostCSS (`.postcssrc.json`). Its theme is the design system:

- Colors: only IIT tokens exist (`bg-brand-primary`, `text-error`, `border-control-border`, …). Tailwind's
  default palette is removed, so `bg-red-500` does not compile.
- Spacing, radius, and breakpoints use the token scale (`p-4` = 16px, `rounded-md`, `md:` = 48rem).
  Type utilities: `text-page-title`, `text-heading`, `text-compact`, `text-helper`, `leading-body`.
- Tokens without a utility namespace use the variable syntax: `max-w-(--content-max-width)`.
- Reuse the shared component classes (`btn btn-primary`, `field-input`, `alert alert-error`, `card`, …) for
  design-system components; use utilities for layout. Add a new shared class to `@layer components` in
  `src/styles.css` rather than repeating long utility lists.

## Security notes

- The service is authoritative for every access decision. Route guards and hidden navigation only shape the
  experience.
- State-changing API calls carry an `X-CSRF-Token` header obtained from `/api/auth/anti-forgery-token`. The
  token is refetched after sign-in and sign-out because the service binds it to the signed-in identity.
- Sessions end after three hours without activity. **Sign out** stays at the bottom of the sidebar (in the menu on
  mobile) so users on shared devices can end a session at any time.
- The reset page removes the recovery proof from the address bar as soon as it loads.
- Configuration and audit history are shown only to the active Admin role. Its navigation item is hidden for other roles, but the
  service decides on every request; a 403 shows a message and no results.
