import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import {
  TEST_CSRF_TOKEN,
  context,
  flushCsrf,
  httpMock,
  problem,
  provideAuthTesting,
  settle,
} from '../../../../testing/auth-testing';
import { Login } from './login';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Login], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(Login);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function type(selector: string, value: string): void {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(): void {
    page.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
  }

  async function submitCredentials(): Promise<void> {
    type('#email', 'teacher@iit.test');
    type('#password', 'Secret-pass1');
    submit();
    await flushCsrf(http);
  }

  it('shows the IIT logo with a text alternative', () => {
    const logo = page.querySelector<HTMLImageElement>('img[src="images/iit-logo.png"]');

    expect(logo).not.toBeNull();
    expect(logo!.alt).toBe('IIT, University of Dhaka');
  });

  it('requires email and password before contacting the service', () => {
    submit();

    expect(page.querySelector('#email-error')?.textContent).toContain('Enter your email address');
    expect(page.querySelector('#password-error')?.textContent).toContain('Enter your password');
    expect(page.querySelector('#email')?.getAttribute('aria-invalid')).toBe('true');
    http.expectNone('/api/auth/sessions');
  });

  it('shows a generic failure, keeps the email, and clears the password', async () => {
    await submitCredentials();

    const request = http.expectOne('/api/auth/sessions');
    expect(request.request.headers.get('X-CSRF-Token')).toBe(TEST_CSRF_TOKEN);
    request.flush(...problem(401, 'The email or password is incorrect.'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Sign-in failed');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('The email or password is incorrect.');
    expect(page.querySelector<HTMLInputElement>('#email')!.value).toBe('teacher@iit.test');
    expect(page.querySelector<HTMLInputElement>('#password')!.value).toBe('');
  });

  it('shows progress and ignores repeat submissions while signing in', async () => {
    await submitCredentials();
    const button = page.querySelector<HTMLButtonElement>('button[type=submit]')!;

    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Signing in');
    expect(page.querySelector('form')?.getAttribute('aria-busy')).toBe('true');

    await fixture.componentInstance.submit();
    const pending = http.match('/api/auth/sessions');
    expect(pending.length).toBe(1);
    pending[0].flush(context(['Teacher'], 'Teacher'));
    await settle();
  });

  it('opens the role area for a single-role account', async () => {
    await submitCredentials();
    http.expectOne('/api/auth/sessions').flush(context(['Teacher'], 'Teacher'));
    await settle();

    expect(TestBed.inject(Router).url).toBe('/teacher');
  });

  it('opens the default role area for a multi-role account without asking for a role', async () => {
    await submitCredentials();
    http.expectOne('/api/auth/sessions').flush(context(['Teacher', 'Coordinator'], 'Teacher'));
    await settle();

    expect(TestBed.inject(Router).url).toBe('/teacher');
  });
});
