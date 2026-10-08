import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthSession } from '../../../core/auth/auth-session';
import { STUB_ROUTES, flushCsrf, httpMock, problem, provideAuthTesting, settle } from '../../../../testing/auth-testing';
import { ResetPassword } from './reset-password';

const PROOF = 'one-use-proof-value';

describe('ResetPassword', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(url: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: provideAuthTesting([{ path: 'reset-password', component: ResetPassword }, ...STUB_ROUTES]),
    });
    http = httpMock();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, ResetPassword);
    await settle();
    page = harness.routeNativeElement!;
    harness.detectChanges();
  }

  afterEach(() => http.verify());

  function type(selector: string, value: string): void {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
  }

  function submit(): void {
    page.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    harness.detectChanges();
  }

  const validLink = `/reset-password?email=student%40example.test&proof=${PROOF}`;

  it('explains an incomplete link instead of showing the form', async () => {
    await open('/reset-password?email=student%40example.test');

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Reset link not valid');
    expect(page.querySelector('a[href="/forgot-password"]')).not.toBeNull();
    expect(page.querySelector('form')).toBeNull();
  });

  it('gives live feedback on each password rule in text', async () => {
    await open(validLink);

    type('#new-password', 'abc');

    const rules = page.querySelector('#password-rules')!.textContent!;
    expect(rules).toMatch(/At least 8 characters:\s*not met/);
    expect(rules).toMatch(/At least one letter:\s*met/);
    expect(rules).toMatch(/At least one number:\s*not met/);
  });

  it('rejects passwords outside the rule and mismatched confirmation without contacting the service', async () => {
    await open(validLink);

    type('#new-password', 'abcdefgh');
    type('#confirm-password', 'abcdefgh1');
    submit();

    expect(page.querySelector('#password-error')).not.toBeNull();
    expect(page.querySelector('#confirm-error')).not.toBeNull();
    http.expectNone('/api/auth/password-resets');
  });

  it('completes the reset, signs this browser out locally, and never shows the proof', async () => {
    await open(validLink);
    expect(page.textContent).not.toContain(PROOF);

    type('#new-password', 'Replacement1');
    type('#confirm-password', 'Replacement1');
    submit();
    await flushCsrf(http);
    harness.detectChanges();
    expect(page.querySelector('button[type=submit]')?.textContent).toContain('Saving');

    const request = http.expectOne('/api/auth/password-resets');
    expect(request.request.body).toEqual({
      email: 'student@example.test',
      proof: PROOF,
      newPassword: 'Replacement1',
    });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    harness.detectChanges();

    expect(page.querySelector('[role=status]')?.textContent).toContain('Password reset');
    expect(TestBed.inject(AuthSession).context()).toBeNull();
    expect(page.textContent).not.toContain(PROOF);
  });

  it('explains an invalid, expired, or used link', async () => {
    await open(validLink);
    type('#new-password', 'Replacement1');
    type('#confirm-password', 'Replacement1');
    submit();
    await flushCsrf(http);

    http
      .expectOne('/api/auth/password-resets')
      .flush(...problem(400, 'This reset link is invalid, has expired, or was already used. Request a new link.'));
    await settle();
    harness.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('already used');
    expect(page.querySelector('a[href="/forgot-password"]')).not.toBeNull();
  });

  it('shows password errors returned by the service on the field', async () => {
    await open(validLink);
    type('#new-password', 'Replacement1');
    type('#confirm-password', 'Replacement1');
    submit();
    await flushCsrf(http);

    http
      .expectOne('/api/auth/password-resets')
      .flush(...problem(400, 'Validation failed', { NewPassword: ['Include at least one number.'] }));
    await settle();
    harness.detectChanges();

    expect(page.querySelector('#password-error')?.textContent).toContain('Include at least one number.');
  });
});
