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
| `src/app/features/audit/` | Admin-only audit history at `/admin/audit` (search with cursor paging) and `/admin/audit/:eventId` (detail); filters and page position are remembered in memory while an event is open |
| `src/app/layout/shell/` | Signed-in shell: header, sidebar navigation, and an account section at the bottom of the sidebar (active role or role switcher, sign-out) |
| `src/app/pages/` | Role landing pages and the unauthorized, no-role, and not-found states |
| `src/app/shared/utc-timestamp/` | `<app-utc-timestamp>`: every audit time is shown in UTC with an explicit "UTC" label inside a `time` element |
| `src/app/shared/auth-brand/` | Centered IIT logo and portal name used on every authentication screen |
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
- Audit history is shown only to the active Admin role. Its navigation item is hidden for other roles, but the
  service decides on every request; a 403 shows a message and no results.
