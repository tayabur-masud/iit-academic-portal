import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { flushCsrf, httpMock, provideAuthTesting, settle } from '../../../../testing/auth-testing';
import { ForgotPassword } from './forgot-password';

const GENERIC =
  'If an eligible account exists, recovery instructions will be sent to its registered email address.';

describe('ForgotPassword', () => {
  let fixture: ComponentFixture<ForgotPassword>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ForgotPassword], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(ForgotPassword);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function submit(email: string): void {
    const input = page.querySelector<HTMLInputElement>('#email')!;
    input.value = email;
    input.dispatchEvent(new Event('input'));
    page.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
  }

  it('requires a valid email address', () => {
    submit('not-an-email');

    expect(page.querySelector('#email-error')?.textContent).toContain('name@example.com');
    http.expectNone('/api/auth/password-reset-requests');
  });

  it('shows progress, then the same generic confirmation the service returns for any address', async () => {
    submit('someone@iit.test');
    await flushCsrf(http);
    fixture.detectChanges();
    expect(page.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    expect(page.querySelector('button[type=submit]')?.textContent).toContain('Sending');

    const request = http.expectOne('/api/auth/password-reset-requests');
    expect(request.request.body).toEqual({ email: 'someone@iit.test' });
    request.flush({ message: GENERIC }, { status: 202, statusText: 'Accepted' });
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=status]')?.textContent).toContain(GENERIC);
    expect(page.querySelector('form')).toBeNull();
  });
});
