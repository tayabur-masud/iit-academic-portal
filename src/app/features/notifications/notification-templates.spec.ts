import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { NotificationTemplate } from './notification.models';
import { NotificationTemplateEditor } from './notification-template-editor';
import { NotificationTemplates } from './notification-templates';

const ROOT = '/api/admin/notification-templates';
const BRANDED = '<!DOCTYPE html><html><body><img src="https://portal.test/images/iit-logo.png" alt="IIT, University of Dhaka"><h1>Draft CS 101</h1></body></html>';

function template(slug: string, name: string, extra: Partial<NotificationTemplate> = {}): NotificationTemplate {
  return {
    eventType: name.replace(/\s+/g, ''),
    slug,
    name,
    channel: 'Email',
    isSecurity: false,
    enabled: true,
    revision: 1,
    subject: 'Results published for {{courseName}}',
    body: 'Results for {{courseName}} ({{termName}}) are out.\n\n{{portalUrl}}',
    placeholders: ['courseName', 'termName', 'portalUrl'],
    requiredPlaceholders: [],
    updatedAtUtc: '2026-10-16T08:00:00Z',
    ...extra,
  };
}

const RESET = template('password-reset', 'Password reset', {
  isSecurity: true,
  subject: 'Reset your password',
  body: 'Use this link: {{actionLink}} (expires in {{expiresIn}})',
  placeholders: ['actionLink', 'expiresIn'],
  requiredPlaceholders: ['actionLink'],
});

describe('NotificationTemplates', () => {
  let fixture: ComponentFixture<NotificationTemplates>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(): Promise<void> {
    TestBed.configureTestingModule({ imports: [NotificationTemplates], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(NotificationTemplates);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => http.verify());

  async function respond(request: TestRequest, body: object): Promise<void> {
    request.flush(body);
    await settle();
    fixture.detectChanges();
  }

  it('shows a loading state, then every template with its kind, state and revision and a link to edit it', async () => {
    await open();
    expect(page.textContent).toContain('Loading templates');

    await respond(http.expectOne(ROOT), [template('results-published', 'Results published'), RESET, template('feedback-window-opened', 'Feedback window opened', { enabled: false, revision: 3 })]);

    const rows = Array.from(page.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('Results published');
    expect(rows[0]).toContain('Academic notice');
    expect(rows[0]).toContain('Enabled');
    expect(rows[1]).toContain('Secure link');
    expect(rows[2]).toContain('Disabled');
    expect(rows[2]).toContain('3');
    expect(page.querySelector('tbody a')?.getAttribute('href')).toBe('/admin/notifications/templates/results-published');
  });

  it('shows the service error with a way to retry', async () => {
    await open();
    http.expectOne(ROOT).flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Templates not shown');

    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again'))!.click();
    await respond(http.expectOne(ROOT), [template('results-published', 'Results published')]);

    expect(page.querySelector('[role=alert]')).toBeNull();
    expect(page.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('explains an empty list', async () => {
    await open();
    await respond(http.expectOne(ROOT), []);

    expect(page.textContent).toContain('No templates');
  });
});

describe('NotificationTemplateEditor', () => {
  let fixture: ComponentFixture<NotificationTemplateEditor>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(slug: string, loaded: NotificationTemplate): Promise<void> {
    TestBed.configureTestingModule({ imports: [NotificationTemplateEditor], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(NotificationTemplateEditor);
    fixture.componentRef.setInput('eventType', slug);
    page = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne(`${ROOT}/${slug}/email`).flush(loaded);
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  /** The pending write; the anti-forgery token is answered only when it has not already been fetched. */
  async function writeRequest(method: string, path: string): Promise<TestRequest> {
    await settle();
    const tokens = http.match('/api/auth/anti-forgery-token');
    if (tokens.length > 0) {
      tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
      await settle();
    }
    return http.expectOne({ method, url: `${ROOT}/${path}` });
  }

  async function respond(request: TestRequest, body: object): Promise<void> {
    request.flush(body);
    await settle();
    fixture.detectChanges();
  }

  it('loads the template into the form and lists the placeholders and the required ones', async () => {
    await open('password-reset', RESET);

    expect(page.querySelector('h1')?.textContent).toContain('Password reset');
    expect(page.querySelector<HTMLInputElement>('#subject')?.value).toBe('Reset your password');
    expect(page.querySelector<HTMLTextAreaElement>('#body')?.value).toContain('{{actionLink}}');
    expect(page.querySelector('#body-help')?.textContent).toContain('{{actionLink}}');
    expect(page.querySelector('#body-help')?.textContent).toContain('Required');
    expect(page.textContent).toContain('Revision 1');
  });

  it('shows a secure template as always enabled: the control is checked and disabled, with the reason', async () => {
    await open('password-reset', RESET);

    const enabled = page.querySelector<HTMLInputElement>('#enabled')!;
    expect(enabled.checked).toBe(true);
    expect(enabled.disabled).toBe(true);
    expect(page.querySelector('#enabled-help')?.textContent).toContain('must stay enabled');
    expect(page.querySelector('[role=note]')?.textContent).toContain('secure link');
  });

  it('lets an ordinary template be disabled and explains what disabling does', async () => {
    await open('results-published', template('results-published', 'Results published'));

    const enabled = page.querySelector<HTMLInputElement>('#enabled')!;
    expect(enabled.disabled).toBe(false);
    expect(page.querySelector('#enabled-help')?.textContent).toContain('suppressed');

    enabled.click();
    type('#subject', 'Edited subject');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    const request = await writeRequest('PUT', 'results-published/email');

    expect(request.request.body).toEqual({
      expectedRevision: 1,
      subject: 'Edited subject',
      body: 'Results for {{courseName}} ({{termName}}) are out.\n\n{{portalUrl}}',
      enabled: false,
    });
    await respond(request, template('results-published', 'Results published', { revision: 2, enabled: false, subject: 'Edited subject' }));
    expect(page.textContent).toContain('Saved as revision 2.');
    expect(page.textContent).toContain('Revision 2');
  });

  it('shows the service field errors against the fields, moves focus to the first, and keeps what was typed', async () => {
    await open('results-published', template('results-published', 'Results published'));
    type('#body', 'Hello {{nope}}');

    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    (await writeRequest('PUT', 'results-published/email')).flush(
      ...problem(400, 'Invalid', { body: ['"{{nope}}" is not a supported placeholder for this message.'], subject: ['Enter a subject.'] }),
    );
    await settle();
    fixture.detectChanges();
    await settle();

    expect(page.querySelector('#body-error')?.textContent).toContain('not a supported placeholder');
    expect(page.querySelector('#subject-error')?.textContent).toContain('Enter a subject');
    expect(page.querySelector('#body')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.querySelector('#body')?.getAttribute('aria-describedby')).toContain('body-error');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Some fields need attention');
    expect(page.querySelector<HTMLTextAreaElement>('#body')?.value).toBe('Hello {{nope}}');
    expect(document.activeElement?.id).toBe('subject');
  });

  it('explains a stale revision, offers to reload the latest, and keeps the saved wording', async () => {
    await open('results-published', template('results-published', 'Results published'));
    type('#subject', 'My edit');

    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    (await writeRequest('PUT', 'results-published/email')).flush(
      ...problem(409, 'The template was changed by someone else. Reload it and apply your edit again.'),
    );
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Someone else changed this template');
    expect(page.querySelector<HTMLInputElement>('#subject')?.value).toBe('My edit');

    button('Reload the latest version').click();
    await settle();
    http.expectOne(`${ROOT}/results-published/email`).flush(template('results-published', 'Results published', { revision: 2, subject: 'Their edit' }));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector<HTMLInputElement>('#subject')?.value).toBe('Their edit');
    expect(page.querySelector('[role=alert]')).toBeNull();
  });

  it('previews with synthetic values, sends only the draft and any sample values, and saves nothing', async () => {
    await open('results-published', template('results-published', 'Results published'));
    type('#sample-courseName', 'CS 101');
    type('#subject', 'Draft {{courseName}}');

    button('Preview').click();
    const request = await writeRequest('POST', 'results-published/email/previews');

    expect(request.request.body).toEqual({
      subject: 'Draft {{courseName}}',
      body: 'Results for {{courseName}} ({{termName}}) are out.\n\n{{portalUrl}}',
      sampleValues: { courseName: 'CS 101' },
    });
    await respond(request, { subject: 'Draft CS 101', body: 'Results for CS 101 (Sample Term) are out.', html: BRANDED, synthetic: true });

    expect(page.querySelector('[data-testid=preview-subject]')?.textContent).toBe('Draft CS 101');
    expect(page.querySelector('[data-testid=preview-body]')?.textContent).toContain('Sample Term');
    expect(page.querySelector('#preview-title')?.textContent).toContain('Preview');
    expect(page.textContent).toContain('Nothing was sent or saved');
    expect(page.textContent).toContain('standard IIT layout');
    http.expectNone({ method: 'PUT', url: `${ROOT}/results-published/email` });
  });

  it('shows the branded layout in a frame that cannot run scripts, next to the plain-text version', async () => {
    await open('results-published', template('results-published', 'Results published'));
    button('Preview').click();
    await respond(await writeRequest('POST', 'results-published/email/previews'), { subject: 'S', body: 'B', html: BRANDED, synthetic: true });

    const frame = page.querySelector<HTMLIFrameElement>('[data-testid=preview-frame]')!;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('title')).toContain('branded email');
    expect(frame.getAttribute('srcdoc')).toContain('iit-logo.png');
    expect(frame.getAttribute('srcdoc')).toContain('IIT, University of Dhaka');
    expect(page.textContent).toContain('As the recipient sees it');
    expect(page.textContent).toContain('Plain-text version');
  });

  it('shows a secure preview with the nonfunctional link placeholder and offers no sample value for the link', async () => {
    await open('password-reset', RESET);
    expect(page.querySelector('#sample-actionLink')).toBeNull();
    expect(page.querySelector('#sample-expiresIn')).not.toBeNull();

    button('Preview').click();
    const request = await writeRequest('POST', 'password-reset/email/previews');
    await respond(request, { subject: 'Reset your password', body: 'Use this link: [SAMPLE LINK - not functional] (expires in 1 hour)', html: BRANDED, synthetic: true });

    expect(page.querySelector('[data-testid=preview-body]')?.textContent).toContain('[SAMPLE LINK - not functional]');
    expect(page.querySelector('#preview-title')?.parentElement?.textContent).toContain('does not work');
    expect(page.querySelector('[data-testid=preview-body]')?.textContent).not.toContain('http');
  });

  it('discards a preview as soon as the wording is edited, because it no longer describes it', async () => {
    await open('results-published', template('results-published', 'Results published'));
    button('Preview').click();
    await respond(await writeRequest('POST', 'results-published/email/previews'), { subject: 'S', body: 'B', html: BRANDED, synthetic: true });
    expect(page.querySelector('#preview-title')).not.toBeNull();

    type('#body', 'Changed {{courseName}}');
    fixture.detectChanges();

    expect(page.querySelector('#preview-title')).toBeNull();
  });

  it('shows preview validation errors against the field', async () => {
    await open('results-published', template('results-published', 'Results published'));
    type('#body', '<b>bold</b>');

    button('Preview').click();
    (await writeRequest('POST', 'results-published/email/previews')).flush(
      ...problem(400, 'Invalid', { body: ['HTML and other markup are not allowed. Use plain text.'] }),
    );
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('#body-error')?.textContent).toContain('markup');
    expect(page.querySelector('#preview-title')).toBeNull();
  });

  it('shows a not-found template without a form and a forbidden role message on save', async () => {
    TestBed.configureTestingModule({ imports: [NotificationTemplateEditor], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(NotificationTemplateEditor);
    fixture.componentRef.setInput('eventType', 'nope');
    page = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne(`${ROOT}/nope/email`).flush(...problem(404, 'There is no such notification template.'));
    await settle();
    fixture.detectChanges();

    expect(page.textContent).toContain('This template was not found');
    expect(page.querySelector('form')).toBeNull();
  });

  it('tells the Admin to switch role when the service answers 403', async () => {
    await open('results-published', template('results-published', 'Results published'));

    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    (await writeRequest('PUT', 'results-published/email')).flush(...problem(403, 'Forbidden'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Switch to the Admin role');
  });
});
