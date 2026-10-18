import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { FeedbackReminderSetting } from './feedback-reminder-setting';
import { FeedbackReminderSetting as Setting } from './notification.models';

const URL = '/api/admin/notification-settings/feedback-reminder';

describe('FeedbackReminderSetting', () => {
  let fixture: ComponentFixture<FeedbackReminderSetting>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(loaded: Setting): Promise<void> {
    TestBed.configureTestingModule({ imports: [FeedbackReminderSetting], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(FeedbackReminderSetting);
    page = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne({ method: 'GET', url: URL }).flush(loaded);
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function type(value: string): void {
    const input = page.querySelector<HTMLInputElement>('#minutes')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  async function putRequest(): Promise<TestRequest> {
    await settle();
    const tokens = http.match('/api/auth/anti-forgery-token');
    if (tokens.length > 0) {
      tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
      await settle();
    }
    return http.expectOne({ method: 'PUT', url: URL });
  }

  it('says plainly that nothing is set yet and no default is assumed', async () => {
    await open({ configured: false });

    expect(page.textContent).toContain('Not set yet');
    expect(page.textContent).toContain('No closing reminder is sent until you save a number of minutes');
    expect(page.querySelector<HTMLInputElement>('#minutes')?.value).toBe('');
  });

  it('shows the saved value and states that it applies to every window', async () => {
    await open({ configured: true, leadTimeMinutes: 90 });

    expect(page.querySelector<HTMLInputElement>('#minutes')?.value).toBe('90');
    expect(page.textContent).not.toContain('Not set yet');
    expect(page.textContent).toContain('One setting applies to every window');
  });

  it('saves a whole positive number of minutes and confirms it', async () => {
    await open({ configured: false });
    type('45');

    submit();
    const request = await putRequest();

    expect(request.request.body).toEqual({ leadTimeMinutes: 45 });
    request.flush({ configured: true, leadTimeMinutes: 45 });
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('.alert-success')?.textContent).toContain('45 minutes before a feedback window closes');
    expect(page.textContent).not.toContain('Not set yet');
  });

  it.each(['', '0', '-3', '2.5', 'abc'])('refuses %j before sending anything and focuses the field', async (value) => {
    await open({ configured: true, leadTimeMinutes: 60 });
    type(value);

    submit();
    await settle();
    fixture.detectChanges();
    await settle();

    expect(page.querySelector('#minutes-error')?.textContent).toContain('whole number of minutes');
    expect(page.querySelector('#minutes')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.querySelector('#minutes')?.getAttribute('aria-describedby')).toContain('minutes-error');
    expect(document.activeElement?.id).toBe('minutes');
    http.expectNone({ method: 'PUT', url: URL });
  });

  it('shows the service error against the field and keeps what was typed', async () => {
    await open({ configured: true, leadTimeMinutes: 60 });
    type('999999');

    submit();
    (await putRequest()).flush(...problem(400, 'Invalid', { leadTimeMinutes: ['Enter a whole number of minutes from 1 to 525600.'] }));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('#minutes-error')?.textContent).toContain('525600');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('needs attention');
    expect(page.querySelector<HTMLInputElement>('#minutes')?.value).toBe('999999');
  });

  it('tells a non-Admin role to switch and reports other failures safely', async () => {
    await open({ configured: false });
    type('30');

    submit();
    (await putRequest()).flush(...problem(403, 'Forbidden'));
    await settle();
    fixture.detectChanges();
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Switch to the Admin role');

    submit();
    (await putRequest()).flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Something went wrong');
  });

  it('offers no per-window control and shows a load error with a retry', async () => {
    TestBed.configureTestingModule({ imports: [FeedbackReminderSetting], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(FeedbackReminderSetting);
    page = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne({ method: 'GET', url: URL }).flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Setting not shown');

    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again'))!.click();
    http.expectOne({ method: 'GET', url: URL }).flush({ configured: true, leadTimeMinutes: 15 });
    await settle();
    fixture.detectChanges();

    expect(page.querySelectorAll('input').length).toBe(1);
    expect(page.querySelector<HTMLInputElement>('#minutes')?.value).toBe('15');
  });
});
