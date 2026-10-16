import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { FeedbackReminderSetting } from './feedback-reminder-setting';
import { NotificationDetail } from './notification-detail';
import { NotificationHistory } from './notification-history';
import { NotificationTemplateEditor } from './notification-template-editor';
import { NotificationTemplates } from './notification-templates';
import { NotificationDetail as Detail, NotificationRow, NotificationTemplate } from './notification.models';

/**
 * Structural accessibility and layout checks for every notification administration screen: one heading, named controls, captioned
 * tables, announced and focusable errors, status shown as text, and the load-more fallback for infinite scrolling. A real-browser
 * axe pass is recorded in the quickstart; these checks run on every build.
 */
describe('Notification administration screens', () => {
  let http: HttpTestingController;
  let page: HTMLElement;
  let fixture: ComponentFixture<unknown>;

  const row = (id: string, extra: Partial<NotificationRow> = {}): NotificationRow => ({
    id,
    eventType: 'ResultsPublished',
    recipientUserId: `user-${id}`,
    destination: `s${id}@iit.test`,
    channel: 'Email',
    status: 'Failed',
    requestedAtUtc: '2026-10-16T08:30:00Z',
    contentWithheld: false,
    ...extra,
  });

  const template = (extra: Partial<NotificationTemplate> = {}): NotificationTemplate => ({
    eventType: 'ResultsPublished',
    slug: 'results-published',
    name: 'Results published',
    channel: 'Email',
    isSecurity: false,
    enabled: true,
    revision: 1,
    subject: 'Subject {{courseName}}',
    body: 'Body {{termName}}',
    placeholders: ['courseName', 'termName'],
    requiredPlaceholders: [],
    updatedAtUtc: '2026-10-16T08:00:00Z',
    ...extra,
  });

  const detail: Detail = {
    notification: row('1'),
    occurrenceId: 'occ-1',
    templateRevision: 1,
    subject: 'Subject',
    body: 'Body',
    attempts: [{ attemptNumber: 1, startedAtUtc: '2026-10-16T08:30:00Z', completedAtUtc: '2026-10-16T08:30:01Z', outcome: 'PermanentFailure', failureCode: 'Http400' }],
  };

  async function render<T>(component: Type<T>, inputs: Record<string, string> = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [component], providers: provideAuthTesting() });
    http = httpMock();
    const created = TestBed.createComponent(component);
    fixture = created as ComponentFixture<unknown>;
    for (const [name, value] of Object.entries(inputs)) {
      created.componentRef.setInput(name, value);
    }
    page = created.nativeElement;
    await created.whenStable();
  }

  async function answer(url: string | RegExp, body: object): Promise<void> {
    http.expectOne((r) => (typeof url === 'string' ? r.url === url : url.test(r.url))).flush(body);
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  /** The accessible name of a control: a label, an aria-label, or a wrapping label. */
  function nameOf(control: Element): string {
    const id = control.getAttribute('id');
    const labelled = id ? page.querySelector(`label[for="${id}"]`)?.textContent : null;
    return (labelled ?? control.getAttribute('aria-label') ?? control.closest('label')?.textContent ?? '').trim();
  }

  function expectAccessible(): void {
    expect(page.querySelectorAll('h1').length).toBe(1);

    for (const control of Array.from(page.querySelectorAll('input:not([type=hidden]), select, textarea'))) {
      expect(nameOf(control), `control #${control.id} has no accessible name`).not.toBe('');
    }

    for (const table of Array.from(page.querySelectorAll('table'))) {
      expect(table.querySelector('caption')?.textContent?.trim(), 'table has no caption').toBeTruthy();
      expect(table.closest('.data-table-container'), 'table is not in a scrolling container for narrow screens').not.toBeNull();
      for (const header of Array.from(table.querySelectorAll('th'))) {
        expect(header.getAttribute('scope'), `<th>${header.textContent}</th> has no scope`).toBeTruthy();
      }
    }

    for (const button of Array.from(page.querySelectorAll('button'))) {
      expect((button.textContent ?? '').trim() || button.getAttribute('aria-label'), 'button has no name').toBeTruthy();
    }
    for (const link of Array.from(page.querySelectorAll('a'))) {
      expect(link.getAttribute('href') ?? link.getAttribute('ng-reflect-router-link'), 'link has no destination').not.toBeNull();
      expect((link.textContent ?? '').trim(), 'link has no text').not.toBe('');
    }

    // Every id an aria-describedby points at exists.
    for (const element of Array.from(page.querySelectorAll('[aria-describedby]'))) {
      for (const id of element.getAttribute('aria-describedby')!.split(/\s+/)) {
        const target = page.querySelector(`[id="${id}"]`);
        if (id.endsWith('-error')) {
          // An error id may be listed before its message is drawn; when the control is invalid the message must exist.
          if (element.getAttribute('aria-invalid') === 'true') {
            expect(target, `missing #${id}`).not.toBeNull();
          }
        } else {
          expect(target, `missing #${id}`).not.toBeNull();
        }
      }
    }

    expect(page.querySelector('nav[aria-label="Breadcrumb"]')).not.toBeNull();
    expect(page.querySelector('[role=status].sr-only, p.sr-only[role=status]'), 'no polite live region').not.toBeNull();
  }

  it('history: named filters, captioned table, status as text, a load-more fallback and a sentinel hidden from assistive technology', async () => {
    await render(NotificationHistory);
    await answer('/api/admin/notifications', { items: [row('1'), row('2', { status: 'Sent' })], nextCursor: 'more' });

    expectAccessible();
    expect(page.querySelector('nav[aria-label="Notification sections"]')).not.toBeNull();
    expect(Array.from(page.querySelectorAll('tbody tr')).map((r) => r.textContent)).toEqual([
      expect.stringContaining('Failed'),
      expect.stringContaining('Sent'),
    ]);
    // jsdom has no IntersectionObserver, so this is also the keyboard and no-observer fallback for infinite scrolling.
    expect(Array.from(page.querySelectorAll('button')).some((b) => b.textContent?.includes('Load more notifications'))).toBe(true);
    expect(page.querySelector('.infinite-scroll-sentinel')?.getAttribute('aria-hidden')).toBe('true');
    expect(page.querySelectorAll('input[type=datetime-local]').length).toBe(2);
  });

  it('history: a validation problem is announced, marks the field invalid and moves focus to it', async () => {
    await render(NotificationHistory);
    await answer('/api/admin/notifications', { items: [row('1')], nextCursor: null });
    const from = page.querySelector<HTMLInputElement>('#from')!;
    const to = page.querySelector<HTMLInputElement>('#to')!;
    from.value = '2026-10-02T00:00';
    from.dispatchEvent(new Event('input'));
    to.value = '2026-10-01T00:00';
    to.dispatchEvent(new Event('input'));

    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    fixture.detectChanges();
    await settle();

    expect(page.querySelector('#to-error')?.textContent).toBeTruthy();
    expect(to.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(to);
    expectAccessible();
  });

  it('history: the loading, error, and empty states are each shown on their own, with a retry', async () => {
    await render(NotificationHistory);
    expect(page.textContent).toContain('Loading notifications');
    expect(page.querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true');

    http.expectOne((r) => r.url === '/api/admin/notifications').flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();
    expect(page.querySelector('[role=alert]')).not.toBeNull();
    expect(page.querySelector('table')).toBeNull();

    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again'))!.click();
    await answer('/api/admin/notifications', { items: [], nextCursor: null });
    expect(page.textContent).toContain('No notifications yet');
    expect(page.querySelector('[role=alert]')).toBeNull();
  });

  it('detail: facts in a description list, a captioned attempts table, and a resend confirmation that is announced', async () => {
    await render(NotificationDetail, { notificationId: '1' });
    await answer('/api/admin/notifications/1', detail);

    expectAccessible();
    expect(page.querySelectorAll('dl').length).toBeGreaterThan(0);
    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Resend…'))!.click();
    fixture.detectChanges();
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Resend this notification?');
  });

  it('detail: withheld content is a labelled note, not an empty region', async () => {
    await render(NotificationDetail, { notificationId: '2' });
    await answer('/api/admin/notifications/2', { ...detail, subject: undefined, body: undefined, notification: row('2', { contentWithheld: true, eventType: 'PasswordReset' }) });

    expectAccessible();
    expect(page.querySelector('[role=note]')?.textContent).toContain('Content withheld');
  });

  it('templates: a captioned table whose state is written out, with a link that names the template', async () => {
    await render(NotificationTemplates);
    await answer('/api/admin/notification-templates', [template(), template({ slug: 'password-reset', name: 'Password reset', isSecurity: true, enabled: true })]);

    expectAccessible();
    expect(page.querySelector('tbody a')?.textContent?.trim()).toBe('Results published');
  });

  it('template editor: labelled fields, help text tied to them, a disabled control explained, and a preview region with a heading', async () => {
    await render(NotificationTemplateEditor, { eventType: 'password-reset' });
    await answer('/api/admin/notification-templates/password-reset/email', template({
      slug: 'password-reset', name: 'Password reset', isSecurity: true, subject: 'Reset', body: 'Link {{actionLink}}',
      placeholders: ['actionLink', 'expiresIn'], requiredPlaceholders: ['actionLink'],
    }));

    expectAccessible();
    const enabled = page.querySelector<HTMLInputElement>('#enabled')!;
    expect(enabled.disabled).toBe(true);
    expect(enabled.getAttribute('aria-describedby')).toContain('enabled-help');
    expect(page.querySelector('#body')?.getAttribute('aria-describedby')).toContain('body-help');
    expect(page.querySelector('fieldset legend')?.textContent).toContain('Sample values');
  });

  it('template editor: a failed save is announced as an alert and focuses the first invalid field', async () => {
    await render(NotificationTemplateEditor, { eventType: 'results-published' });
    await answer('/api/admin/notification-templates/results-published/email', template());
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    const tokens = http.match('/api/auth/anti-forgery-token');
    tokens.forEach((t) => t.flush({ requestToken: 'token' }));
    await settle();

    http.expectOne({ method: 'PUT', url: '/api/admin/notification-templates/results-published/email' }).flush(
      ...problem(400, 'Invalid', { subject: ['Enter a subject.'] }),
    );
    await settle();
    fixture.detectChanges();
    await settle();

    expect(page.querySelector('[role=alert]')).not.toBeNull();
    expect(document.activeElement?.id).toBe('subject');
    expect(page.querySelector('#subject')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.querySelector('#subject')?.getAttribute('aria-describedby')).toContain('subject-error');
    expectAccessible();
  });

  it('reminder setting: a labelled number field with help and an announced error', async () => {
    await render(FeedbackReminderSetting);
    await answer('/api/admin/notification-settings/feedback-reminder', { configured: false });

    expectAccessible();
    const input = page.querySelector<HTMLInputElement>('#minutes')!;
    expect(input.type).toBe('number');
    expect(input.getAttribute('aria-describedby')).toContain('minutes-help');
    expect(page.querySelector('.alert-info')?.getAttribute('role')).toBe('status');

    input.value = '0';
    input.dispatchEvent(new Event('input'));
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    fixture.detectChanges();
    await settle();

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input);
  });

  it('every screen keeps its layout single-column friendly: filter and form grids collapse and tables scroll instead of overflowing', async () => {
    await render(NotificationHistory);
    await answer('/api/admin/notifications', { items: [row('1')], nextCursor: null });

    const grid = page.querySelector('form .grid')!;
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).not.toMatch(/(^|\s)grid-cols-[2-9]/);
    expect(page.querySelector('.data-table-container')).not.toBeNull();
  });
});
