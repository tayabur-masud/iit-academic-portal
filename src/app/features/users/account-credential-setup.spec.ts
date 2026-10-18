import { TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { STUB_ROUTES, TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { AccountCredentialSetup } from './account-credential-setup';

const SETUP = '/api/auth/account-credential-setups';
const PROOF = 'Cf-secret-proof+/=';

describe('AccountCredentialSetup', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let page: HTMLElement;
  let errors: string[];

  async function open(query = `?userId=u-1&proof=${encodeURIComponent(PROOF)}`): Promise<void> {
    TestBed.configureTestingModule({
      imports: [AccountCredentialSetup],
      providers: provideAuthTesting([...STUB_ROUTES, { path: 'account-setup', component: AccountCredentialSetup }]),
    });
    http = httpMock();
    errors = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(args.join(' ')));
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => errors.push(args.join(' ')));
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/account-setup${query}`, AccountCredentialSetup);
    await settle();
    page = harness.routeNativeElement!;
    harness.detectChanges();
  }

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
    harness.detectChanges();
  }

  function submit(): void {
    page.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    harness.detectChanges();
  }

  async function setupRequest(): Promise<TestRequest> {
    await settle();
    const tokens = http.match('/api/auth/anti-forgery-token');
    if (tokens.length > 0) {
      tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
      await settle();
    }
    return http.expectOne({ method: 'POST', url: SETUP });
  }

  async function render(): Promise<void> {
    await settle();
    harness.detectChanges();
  }

  it('removes the proof from the address bar and never displays it', async () => {
    await open();

    expect(TestBed.inject(Router).url).toBe('/account-setup');
    expect(page.textContent).not.toContain(PROOF);
    expect(page.textContent).not.toContain('u-1');
    expect(page.querySelector('h1')?.textContent).toContain('Set up your account');
  });

  it('shows the password rules and refuses a weak or mismatched password before sending anything', async () => {
    await open();
    type('#new-password', 'short');
    type('#confirm-password', 'different');

    submit();
    await render();

    expect(page.querySelector('#new-password')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.querySelector('#password-error')?.textContent).toContain('meets every rule');
    expect(page.querySelector('#confirm-error')?.textContent).toContain('same password');
    expect(page.querySelector('#password-rules')?.textContent).toContain('At least 8 characters');
    expect(http.match(SETUP)).toHaveLength(0);
  });

  it('sends the account ID, proof and password only to the setup endpoint and confirms activation', async () => {
    await open();
    type('#new-password', 'Chosen-pass9');
    type('#confirm-password', 'Chosen-pass9');

    submit();
    const request = await setupRequest();
    expect(request.request.body).toEqual({ userId: 'u-1', proof: PROOF, newPassword: 'Chosen-pass9' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await render();

    expect(page.querySelector('[role=status]')?.textContent).toContain('account is active');
    expect(page.querySelector('a.btn-primary')?.getAttribute('href')).toBe('/login');
    expect(page.textContent).not.toContain('Chosen-pass9');
  });

  it('shows the same invalid-link message for an expired or used link without echoing the proof', async () => {
    await open();
    type('#new-password', 'Chosen-pass9');
    type('#confirm-password', 'Chosen-pass9');

    submit();
    (await setupRequest()).flush(...problem(400, 'This setup link is invalid, has expired, or was already used. Ask an Admin to send a new setup email.'));
    await render();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Setup link not valid');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Ask an Admin');
    expect(page.textContent).not.toContain(PROOF);
    expect(page.querySelector('form')).toBeNull();
    expect(errors.join(' ')).not.toContain(PROOF);
  });

  it('shows server password-policy errors on the password field and keeps the form', async () => {
    await open();
    type('#new-password', 'Chosen-pass9');
    type('#confirm-password', 'Chosen-pass9');

    submit();
    (await setupRequest()).flush(...problem(400, 'Invalid', { newPassword: ['Include at least one number.'] }));
    await render();

    expect(page.querySelector('#password-error')?.textContent).toContain('Include at least one number.');
    expect(page.querySelector('form')).not.toBeNull();
  });

  it('explains an incomplete link without a form', async () => {
    await open('?userId=u-1');

    expect(page.querySelector('[role=alert]')?.textContent).toContain('incomplete');
    expect(page.querySelector('form')).toBeNull();
  });

  it('labels both password fields for assistive technology and keyboard users', async () => {
    await open();

    expect(page.querySelector('label[for="new-password"]')?.textContent).toContain('New password');
    expect(page.querySelector('label[for="confirm-password"]')?.textContent).toContain('Confirm new password');
    expect(page.querySelector('#new-password')?.getAttribute('autocomplete')).toBe('new-password');
    expect(page.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
  });
});
