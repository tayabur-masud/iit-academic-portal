import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { STUB_ROUTES, TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { NotificationDetail as Detail, NotificationPage, NotificationRow } from './notification.models';
import { NotificationDetail } from './notification-detail';
import { NotificationHistory } from './notification-history';
import { NotificationSearchState } from './notification-search-state';

@Component({ selector: 'app-destination', template: '' })
class Destination {}

const ROOT = '/api/admin/notifications';

function row(id: string, extra: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id,
    eventType: 'ResultsPublished',
    recipientUserId: `user-${id}`,
    destination: `student.${id}@iit.test`,
    channel: 'Email',
    status: 'Sent',
    requestedAtUtc: '2026-10-16T08:30:00Z',
    sentAtUtc: '2026-10-16T08:30:02Z',
    contentWithheld: false,
    ...extra,
  };
}

describe('NotificationHistory', () => {
  let fixture: ComponentFixture<NotificationHistory>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(): Promise<void> {
    TestBed.configureTestingModule({ imports: [NotificationHistory], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(NotificationHistory);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => http.verify());

  function listRequest(match: (r: TestRequest['request']) => boolean = () => true): TestRequest {
    return http.expectOne((r) => r.url === ROOT && match(r));
  }

  async function respond(request: TestRequest, items: NotificationRow[], nextCursor: string | null = null): Promise<void> {
    request.flush({ items, nextCursor } satisfies NotificationPage);
    await settle();
    fixture.detectChanges();
  }

  function rows(): string[] {
    return Array.from(page.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  function set(selector: string, value: string, event = 'input'): void {
    const control = page.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event(event));
  }

  it('shows a loading state, then notifications with the status written out and the destination and user ID', async () => {
    await open();
    expect(page.textContent).toContain('Loading notifications');
    const first = listRequest();
    expect(first.request.params.get('pageSize')).toBe('25');
    expect(first.request.params.has('cursor')).toBe(false);
    expect(first.request.params.has('status')).toBe(false);

    await respond(first, [
      row('1'),
      row('2', { status: 'Failed', failureCode: 'Http400', sentAtUtc: undefined }),
      row('3', { status: 'Uncertain', sentAtUtc: undefined, destination: undefined, eventType: 'PasswordReset', contentWithheld: true }),
      row('4', { status: 'Suppressed', parentNotificationId: '9' }),
    ]);

    expect(page.querySelector('h1')?.textContent).toContain('Notifications');
    expect(rows()[0]).toContain('Results published');
    expect(rows()[0]).toContain('student.1@iit.test');
    expect(rows()[0]).toContain('user-1');
    expect(rows()[0]).toContain('Sent');
    expect(rows()[1]).toContain('Failed');
    expect(rows()[2]).toContain('Password reset');
    expect(rows()[2]).toContain('No address');
    expect(rows()[2]).toContain('Uncertain');
    expect(rows()[3]).toContain('Suppressed');
    expect(rows()[3]).toContain('Resend of an earlier notification');
    expect(page.querySelector('tbody a')?.getAttribute('href')).toBe(`/admin/notifications/1`);
    expect(page.textContent).toContain('All 4 matching notifications loaded');
  });

  it('never shows message content or a link in the rows', async () => {
    await open();
    await respond(listRequest(), [row('1', { eventType: 'PasswordReset', contentWithheld: true })]);

    expect(page.textContent).not.toMatch(/subject|proof|reset-password/i);
  });

  it('combines the recipient, message, status and UTC date filters in one request and starts again from the first batch', async () => {
    await open();
    await respond(listRequest(), [row('1')], 'next-1');

    set('#recipient', ' student.7@iit.test ');
    set('#eventType', 'FeedbackWindowOpened', 'change');
    set('#status', 'Failed', 'change');
    set('#from', '2026-10-01T00:00');
    set('#to', '2026-10-02T12:30');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    const request = listRequest((r) => r.params.get('status') === 'Failed');

    expect(request.request.params.get('recipient')).toBe('student.7@iit.test');
    expect(request.request.params.get('eventType')).toBe('FeedbackWindowOpened');
    expect(request.request.params.get('fromUtc')).toBe('2026-10-01T00:00:00Z');
    expect(request.request.params.get('toUtc')).toBe('2026-10-02T12:30:00Z');
    expect(request.request.params.has('cursor')).toBe(false);
    await respond(request, [row('9', { status: 'Failed' })]);

    expect(rows().length).toBe(1);
  });

  it('checks the date range before asking and keeps the rows already shown', async () => {
    await open();
    await respond(listRequest(), [row('1')]);

    set('#from', '2026-10-02T00:00');
    set('#to', '2026-10-01T00:00');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('#to-error')?.textContent).toContain('later than its start');
    expect(page.querySelector('#to')?.getAttribute('aria-invalid')).toBe('true');
    expect(rows().length).toBe(1);
    http.expectNone((r) => r.url === ROOT);
  });

  it('loads the next batch with the cursor when asked, and keeps the earlier rows', async () => {
    await open();
    await respond(listRequest(), [row('1'), row('2')], 'cursor-2');
    expect(page.textContent).not.toContain('matching notifications loaded');

    button('Load more notifications').click();
    const more = listRequest((r) => r.params.get('cursor') === 'cursor-2');
    expect(more.request.params.get('pageSize')).toBe('25');
    await respond(more, [row('3')], null);

    expect(rows().length).toBe(3);
    expect(page.textContent).toContain('All 3 matching notifications loaded');
    expect(page.querySelector('button.btn-secondary.btn-sm:not([disabled])')?.textContent).not.toContain('Load more');
  });

  it('keeps the rows already loaded when a later batch fails and retries only that batch', async () => {
    await open();
    await respond(listRequest(), [row('1'), row('2')], 'cursor-2');

    button('Load more notifications').click();
    listRequest((r) => r.params.get('cursor') === 'cursor-2').flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(rows().length).toBe(2);
    expect(page.querySelector('[role=alert]')?.textContent).toContain('More notifications not shown');

    button('Try again').click();
    await respond(listRequest((r) => r.params.get('cursor') === 'cursor-2'), [row('3')], null);

    expect(rows().length).toBe(3);
    expect(page.querySelector('[role=alert]')).toBeNull();
  });

  it('shows the first-load error with a way to retry', async () => {
    await open();
    listRequest().flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Notifications not shown');
    expect(page.querySelector('table')).toBeNull();

    button('Try again').click();
    await respond(listRequest(), [row('1')]);

    expect(rows().length).toBe(1);
  });

  it('explains an empty history differently from a search with no match', async () => {
    await open();
    await respond(listRequest(), []);
    expect(page.textContent).toContain('No notifications yet');

    set('#status', 'Failed', 'change');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await respond(listRequest((r) => r.params.get('status') === 'Failed'), []);

    expect(page.textContent).toContain('No notifications match these filters');
  });

  it('shows the service filter errors against the filters', async () => {
    await open();
    await respond(listRequest(), [row('1')]);

    set('#from', '2026-10-01T00:00');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    listRequest((r) => r.params.has('fromUtc')).flush(...problem(400, 'Invalid', { fromUtc: ['Enter a valid date.'], status: ['Bad status.'] }));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('#from-error')?.textContent).toContain('valid date');
    expect(page.querySelector('#status-error')?.textContent).toContain('Bad status');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Some filters need attention');
  });

  it('remembers the filters and loaded rows for the next visit in this session', async () => {
    await open();
    await respond(listRequest(), [row('1'), row('2')], 'cursor-2');
    TestBed.inject(NotificationSearchState);
    fixture.destroy();

    fixture = TestBed.createComponent(NotificationHistory);
    page = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();

    http.expectNone((r) => r.url === ROOT);
    expect(rows().length).toBe(2);
    expect(page.textContent).toContain('Load more notifications');
  });
});

describe('NotificationDetail', () => {
  let fixture: ComponentFixture<NotificationDetail>;
  let http: HttpTestingController;
  let page: HTMLElement;

  function detail(id: string, extra: Partial<Detail> = {}, notification: Partial<NotificationRow> = {}): Detail {
    return {
      notification: row(id, notification),
      occurrenceId: 'publication:os-2031',
      templateRevision: 2,
      subject: 'Results published for Algorithms',
      body: 'Results for Algorithms (Fall 2026) have been published.',
      attempts: [
        { attemptNumber: 1, startedAtUtc: '2026-10-16T08:30:00Z', completedAtUtc: '2026-10-16T08:30:02Z', outcome: 'Accepted', providerAcceptedAtUtc: '2026-10-16T08:30:02Z' },
      ],
      ...extra,
    };
  }

  async function open(loaded: Detail, id = loaded.notification.id): Promise<void> {
    TestBed.configureTestingModule({
      imports: [NotificationDetail],
      providers: provideAuthTesting([...STUB_ROUTES, { path: 'admin/notifications/:id', component: Destination }]),
    });
    http = httpMock();
    fixture = TestBed.createComponent(NotificationDetail);
    fixture.componentRef.setInput('notificationId', id);
    page = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne(`${ROOT}/${id}`).flush(loaded);
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function button(text: string): HTMLButtonElement | undefined {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  }

  async function resendRequest(id: string): Promise<TestRequest> {
    await settle();
    const tokens = http.match('/api/auth/anti-forgery-token');
    if (tokens.length > 0) {
      tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
      await settle();
    }
    return http.expectOne({ method: 'POST', url: `${ROOT}/${id}/resends` });
  }

  it('shows the exact destination, subject and body of an ordinary message with its attempts', async () => {
    await open(detail('1'));

    expect(page.querySelector('[data-testid=content-subject]')?.textContent).toBe('Results published for Algorithms');
    expect(page.querySelector('[data-testid=content-body]')?.textContent).toContain('have been published');
    expect(page.textContent).toContain('student.1@iit.test');
    expect(page.textContent).toContain('Template revision');
    expect(page.textContent).toContain('publication:os-2031');
    expect(page.querySelector('tbody tr')?.textContent).toContain('Accepted');
    expect(page.textContent).toContain('does not prove it reached or was read');
  });

  it('withholds a security message entirely and says so', async () => {
    await open(detail('2', { subject: undefined, body: undefined }, { eventType: 'PasswordReset', contentWithheld: true }));

    expect(page.textContent).toContain('Content withheld');
    expect(page.textContent).toContain('never stored');
    expect(page.querySelector('[data-testid=content-subject]')).toBeNull();
    expect(page.querySelector('[data-testid=content-body]')).toBeNull();
    expect(page.textContent).not.toMatch(/proof=|reset-password/i);
  });

  it('offers a resend only for a failed notification, and explains why not for any other status', async () => {
    for (const status of ['Pending', 'Retrying', 'Sent', 'Suppressed', 'Uncertain'] as const) {
      TestBed.resetTestingModule();
      await open(detail('3', { attempts: [] }, { status }), '3');
      expect(button('Resend…')).toBeUndefined();
      expect(page.textContent).toContain('Only a failed notification can be resent');
      http.verify();
    }
  });

  it('asks for confirmation before anything is sent and can be cancelled', async () => {
    await open(detail('4', {}, { status: 'Failed', failureCode: 'Http400' }));

    button('Resend…')!.click();
    fixture.detectChanges();
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Resend this notification?');
    http.expectNone({ method: 'POST', url: `${ROOT}/4/resends` });

    button('Cancel')!.click();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')).toBeNull();
    expect(button('Resend…')).toBeDefined();
  });

  it('requests the resend with an idempotency key and links to the new linked execution, leaving the original shown unchanged', async () => {
    await open(detail('5', {}, { status: 'Failed', failureCode: 'Http400' }));
    button('Resend…')!.click();
    fixture.detectChanges();

    button('Yes, resend')!.click();
    const request = await resendRequest('5');

    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.request.body).toBeNull();
    request.flush(detail('6', { attempts: [] }, { status: 'Pending', parentNotificationId: '5', sentAtUtc: undefined }), { status: 202, statusText: 'Accepted' });
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('.alert-success')?.textContent).toContain('Resend requested');
    expect(page.querySelector('a[href="/admin/notifications/6"]')).not.toBeNull();
    expect(button('Resend…')).toBeUndefined();
    expect(page.textContent).toContain('Failed');
  });

  it('retries a failed request with the same key so a repeated confirmation cannot create a second execution', async () => {
    await open(detail('7', {}, { status: 'Failed' }));
    button('Resend…')!.click();
    fixture.detectChanges();

    button('Yes, resend')!.click();
    const first = await resendRequest('7');
    const key = first.request.headers.get('Idempotency-Key');
    first.flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();
    expect(page.querySelector('.field-error')?.textContent).toContain('Something went wrong');

    button('Yes, resend')!.click();
    const second = await resendRequest('7');

    expect(second.request.headers.get('Idempotency-Key')).toBe(key);
    second.flush(detail('8', {}, { status: 'Pending', parentNotificationId: '7' }), { status: 202, statusText: 'Accepted' });
    await settle();
  });

  it.each([
    ['ResendInProgress', 'A resend of this notification is already in progress.'],
    ['DestinationChanged', 'The address no longer belongs to the intended recipient.'],
    ['RecipientIneligible', 'The recipient account no longer exists or is deactivated.'],
    ['OwnerWorkflowUnavailable', 'A fresh secure link cannot be produced yet. Use the owning account workflow instead.'],
  ])('shows the safe reason for the refusal %s and creates nothing', async (code, reason) => {
    await open(detail('9', { subject: undefined, body: undefined }, { status: 'Failed' }));
    button('Resend…')!.click();
    fixture.detectChanges();

    button('Yes, resend')!.click();
    (await resendRequest('9')).flush({ title: 'Not allowed', status: 409, detail: 'Server wording that must not be needed', code }, { status: 409, statusText: 'Conflict' });
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('.field-error')?.textContent).toContain(reason);
    expect(page.textContent).not.toContain('Resend requested');
  });

  it('shows a not-found notification and a load error with no content', async () => {
    TestBed.configureTestingModule({ imports: [NotificationDetail], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(NotificationDetail);
    fixture.componentRef.setInput('notificationId', 'missing');
    page = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne(`${ROOT}/missing`).flush(...problem(404, 'There is no such notification resource.'));
    await settle();
    fixture.detectChanges();

    expect(page.textContent).toContain('This notification was not found');
    expect(page.querySelector('[data-testid=content-body]')).toBeNull();
  });
});
