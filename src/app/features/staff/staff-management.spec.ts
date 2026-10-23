import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { STUB_ROUTES, TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { ConfigurationItem } from '../configuration/configuration.models';
import { StaffForm } from './staff-form';
import { StaffList } from './staff-list';
import { StaffProfile } from './staff.models';
import { chooseOption, optionLabels, selectedValue } from '../../../testing/select-testing';

@Component({ template: '' })
class Destination {}

const ROOT = '/api/admin/staff';
const DESIGNATIONS = '/api/admin/configuration/designations';

function designation(id: string, name: string, isActive = true): ConfigurationItem {
  return { id, name, isActive, createdAtUtc: '2026-10-21T08:00:00Z', lastModifiedAtUtc: '2026-10-21T08:00:00Z' };
}

function staff(extra: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 's1',
    userId: 'u1',
    email: 'registrar@iit.test',
    accountStatus: 'Active',
    hasAdminRole: true,
    name: 'Farhana Akter',
    mobileNumber: '01711000000',
    designationId: 'd1',
    designationName: 'Assistant Registrar',
    isActive: true,
    createdAtUtc: '2026-10-21T08:30:00Z',
    createdBy: 'admin@iit.test',
    createdByUserId: 'a1',
    lastModifiedAtUtc: '2026-10-21T08:30:00Z',
    lastModifiedBy: 'admin@iit.test',
    lastModifiedByUserId: 'a1',
    ...extra,
  };
}

const page = (items: StaffProfile[], pageNumber = 1, totalPages = 1) => ({ items, page: pageNumber, totalCount: items.length, totalPages });

describe('Staff Management', () => {
  let http: HttpTestingController;

  afterEach(() => http.verify());

  describe('directory', () => {
    let fixture: ComponentFixture<StaffList>;
    let element: HTMLElement;

    async function open(): Promise<void> {
      TestBed.configureTestingModule({ imports: [StaffList], providers: provideAuthTesting() });
      http = httpMock();
      fixture = TestBed.createComponent(StaffList);
      element = fixture.nativeElement;
      await fixture.whenStable();
    }

    async function respond(items: StaffProfile[], match: (r: TestRequest['request']) => boolean = () => true): Promise<void> {
      http.expectOne((r) => r.url === ROOT && match(r)).flush(page(items));
      await settle();
      fixture.detectChanges();
    }

    it('lists staff with account, mobile number, and designation, and links each profile', async () => {
      await open();
      expect(element.textContent).toContain('Loading staff');
      await respond([staff(), staff({ id: 's2', name: 'Old Admin', hasAdminRole: false, email: 'old@iit.test' })], (r) => r.params.get('page') === '1');

      const rows = Array.from(element.querySelectorAll('tbody tr')).map((tr) => tr.textContent!.replace(/\s+/g, ' ').trim());
      expect(rows[0]).toContain('Farhana Akter');
      expect(rows[0]).toContain('registrar@iit.test');
      expect(rows[0]).toContain('01711000000');
      expect(rows[0]).toContain('Assistant Registrar');
      expect(rows[0]).toContain('Active');
      expect(rows[1]).toContain('No Admin role');
      expect(element.querySelector('tbody a')?.getAttribute('href')).toBe('/admin/staff/s1');
      expect(element.querySelector('a.btn-primary')?.getAttribute('href')).toBe('/admin/staff/new');
      expect(element.textContent).toContain('Your own profile is changed here too');
    });

    it('searches and tells an empty directory from no matches', async () => {
      await open();
      await respond([]);
      expect(element.textContent).toContain('No staff profiles yet');

      const search = element.querySelector<HTMLInputElement>('#search')!;
      search.value = 'registrar';
      search.dispatchEvent(new Event('input'));
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      await respond([], (r) => r.params.get('search') === 'registrar');

      expect(element.textContent).toContain('No staff profiles match');
    });

    it('shows a load error with a retry', async () => {
      await open();
      http.expectOne((r) => r.url === ROOT).flush(...problem(500, 'boom'));
      await settle();
      fixture.detectChanges();

      expect(element.querySelector('[role=alert]')?.textContent).toContain('Staff not shown');
      Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again'))!.click();
      await respond([staff()]);
      expect(element.querySelector('[role=alert]')).toBeNull();
    });

    function button(label: string): HTMLButtonElement | undefined {
      return Array.from(element.querySelectorAll<HTMLButtonElement>('tbody button')).find((b) => b.textContent?.includes(label));
    }

    async function deactivationRequest(id: string): Promise<TestRequest> {
      await settle();
      const tokens = http.match('/api/auth/anti-forgery-token');
      if (tokens.length > 0) {
        tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
        await settle();
      }
      return http.expectOne({ method: 'POST', url: `${ROOT}/${id}/deactivation` });
    }

    it('shows inactive staff and offers deactivation only for active staff', async () => {
      await open();
      await respond([staff(), staff({ id: 's2', name: 'Former Officer', isActive: false, accountStatus: 'Deactivated' })]);

      const rows = Array.from(element.querySelectorAll('tbody tr'));
      expect(rows[0].textContent).toContain('Deactivate');
      expect(rows[1].textContent).toContain('Inactive');
      expect(rows[1].querySelector('button')).toBeNull();
    });

    it('deactivates a staff member only after an in-row confirmation, and can be cancelled', async () => {
      await open();
      await respond([staff()]);

      button('Deactivate')!.click();
      fixture.detectChanges();
      expect(element.querySelector('tbody [role=group]')?.textContent).toContain('Deactivate Farhana Akter?');
      button('Cancel')!.click();
      fixture.detectChanges();
      expect(element.querySelector('tbody [role=group]')).toBeNull();
      http.expectNone({ method: 'POST', url: `${ROOT}/s1/deactivation` });

      button('Deactivate')!.click();
      fixture.detectChanges();
      const confirmButton = button('Yes, deactivate')!;
      expect(confirmButton.classList).toContain('btn-danger');
      confirmButton.click();
      const request = await deactivationRequest('s1');
      request.flush(staff({ isActive: false, accountStatus: 'Deactivated' }));
      await settle();
      fixture.detectChanges();

      expect(element.querySelector('.alert-success')?.textContent).toContain('Farhana Akter was deactivated');
      expect(element.querySelector('tbody tr')?.textContent).toContain('Inactive');
      expect(button('Deactivate')).toBeUndefined();
    });

    it('shows a refused deactivation in the row, such as the signed-in Admin or the last active Admin', async () => {
      await open();
      await respond([staff()]);

      button('Deactivate')!.click();
      fixture.detectChanges();
      button('Yes, deactivate')!.click();
      (await deactivationRequest('s1')).flush(...problem(409, 'You cannot deactivate your own staff account. Ask another Admin to do it.'));
      await settle();
      fixture.detectChanges();

      expect(element.querySelector('tbody [role=alert]')?.textContent).toContain('your own staff account');
      expect(element.querySelector('tbody tr')?.textContent).toContain('Active');
    });
  });

  describe('form', () => {
    let fixture: ComponentFixture<StaffForm>;
    let element: HTMLElement;

    async function open(id?: string, loaded: StaffProfile = staff()): Promise<void> {
      TestBed.configureTestingModule({
        imports: [StaffForm],
        providers: provideAuthTesting([...STUB_ROUTES, { path: 'admin/staff', component: Destination }]),
      });
      http = httpMock();
      fixture = TestBed.createComponent(StaffForm);
      if (id) {
        fixture.componentRef.setInput('id', id);
      }
      element = fixture.nativeElement;
      await fixture.whenStable();
      http.expectOne((r) => r.url === DESIGNATIONS).flush({
        items: [designation('d1', 'Assistant Registrar'), designation('d2', 'Deputy Registrar'), designation('d0', 'Retired Post', false)],
        nextCursor: null,
      });
      await settle();
      if (id) {
        http.expectOne(`${ROOT}/${id}`).flush(loaded);
        await settle();
      }
      fixture.detectChanges();
    }

    function type(selector: string, value: string): void {
      const control = element.querySelector<HTMLInputElement>(selector)!;
      control.value = value;
      control.dispatchEvent(new Event('input'));
    }

    function choose(selector: string, value: string): void {
      chooseOption(element, selector, value);
    }

    function confirm(): void {
      element.querySelector<HTMLInputElement>('#manualVerificationConfirmed')!.click();
    }

    async function submit(): Promise<void> {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      fixture.detectChanges();
    }

    async function writeRequest(method: string, url: string): Promise<TestRequest> {
      await settle();
      const tokens = http.match('/api/auth/anti-forgery-token');
      if (tokens.length > 0) {
        tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
        await settle();
      }
      return http.expectOne({ method, url });
    }

    function options(selector: string): string[] {
      return optionLabels(element, `${selector}`);
    }

    it('creates by email with no account picker, and offers only active designations', async () => {
      await open();

      expect(element.querySelector('h1')?.textContent).toContain('Add staff member');
      expect(element.querySelector<HTMLInputElement>('#email')?.type).toBe('email');
      expect(element.querySelector('#userId')).toBeNull();
      expect(element.querySelector('#accountSearch')).toBeNull();
      expect(options('#designationId')).toEqual(['Select a designation', 'Assistant Registrar', 'Deputy Registrar']);
      http.expectNone((r) => r.url.includes('eligible-accounts'));
    });

    it('requires the email, name, mobile number, designation, and the verification confirmation before sending anything', async () => {
      await open();

      await submit();

      for (const field of ['email', 'name', 'mobileNumber', 'designationId', 'manualVerificationConfirmed']) {
        expect(element.querySelector(`#${field}-error`)).not.toBeNull();
        expect(element.querySelector(`#${field}`)?.getAttribute('aria-invalid')).toBe('true');
      }
      expect(element.querySelector('#manualVerificationConfirmed-error')?.textContent).toContain('manually verified');
      http.expectNone({ method: 'POST', url: ROOT });
    });

    it('rejects a malformed email before sending anything', async () => {
      await open();
      type('#email', 'not-an-email');

      await submit();

      expect(element.querySelector('#email-error')?.textContent).toContain('valid email');
      http.expectNone({ method: 'POST', url: ROOT });
    });

    function fill(): void {
      type('#email', ' nusrat@iit.test ');
      type('#name', '  Nusrat Jahan ');
      type('#mobileNumber', ' 01822000000 ');
      choose('#designationId', 'd2');
      confirm();
    }

    async function create(response: StaffProfile): Promise<string> {
      await open();
      fill();
      await submit();
      const request = await writeRequest('POST', ROOT);
      expect(request.request.body).toEqual({
        email: 'nusrat@iit.test',
        name: 'Nusrat Jahan',
        mobileNumber: '01822000000',
        designationId: 'd2',
        manualVerificationConfirmed: true,
      });
      request.flush(response, { status: 201, statusText: 'Created' });
      await settle();
      const router = TestBed.inject(Router);
      expect(router.url).toBe('/admin/staff');
      return router.lastSuccessfulNavigation()?.extras.state?.['notice'] as string;
    }

    const created = (extra: Partial<StaffProfile>) =>
      staff({ id: 's9', userId: 'u9', email: 'nusrat@iit.test', name: 'Nusrat Jahan', accountStatus: 'PendingCredentialSetup', ...extra });

    it('creates a new Admin account by email and says the setup email was sent', async () => {
      const notice = await create(created({ accountCreated: true, setupEmailRequested: true }));
      expect(notice).toContain('new Admin account');
      expect(notice).toContain('credential setup email was sent to nusrat@iit.test');
    });

    it('says when the setup email could not be requested, pointing to Accounts', async () => {
      const notice = await create(created({ accountCreated: true, setupEmailRequested: false }));
      expect(notice).toContain('could not be requested');
      expect(notice).toContain('Accounts');
    });

    it('says when the email belonged to an existing Admin account that was linked', async () => {
      const notice = await create(created({ accountStatus: 'Active', accountCreated: false, setupEmailRequested: false }));
      expect(notice).toContain('existing Admin account nusrat@iit.test');
    });

    it('edits a profile, needing a fresh confirmation for every save, without sending the account', async () => {
      await open('s1');

      expect(element.querySelector('h1')?.textContent).toContain('Edit staff profile');
      expect(element.querySelector('#email')).toBeNull();
      expect(element.textContent).toContain('registrar@iit.test');
      expect(element.querySelector<HTMLInputElement>('#name')?.value).toBe('Farhana Akter');
      expect(element.querySelector<HTMLInputElement>('#manualVerificationConfirmed')?.checked).toBe(false);
      expect(element.querySelector('section[aria-labelledby="history-title"]')?.textContent).toContain('admin@iit.test');

      type('#name', 'Farhana Akter Khan');
      await submit();
      expect(element.querySelector('#manualVerificationConfirmed-error')).not.toBeNull();
      http.expectNone({ method: 'PUT', url: `${ROOT}/s1` });

      confirm();
      await submit();
      const request = await writeRequest('PUT', `${ROOT}/s1`);
      expect(request.request.body).toEqual({
        name: 'Farhana Akter Khan',
        mobileNumber: '01711000000',
        designationId: 'd1',
        manualVerificationConfirmed: true,
      });
      request.flush(staff({ name: 'Farhana Akter Khan' }));
      await settle();
      fixture.detectChanges();

      expect(element.querySelector('[role=status].alert-success')?.textContent).toContain('Farhana Akter Khan was saved');
      expect(element.querySelector<HTMLInputElement>('#manualVerificationConfirmed')?.checked).toBe(false);
    });

    it('keeps an inactive designation the profile already has selectable', async () => {
      await open('s1', staff({ designationId: 'd0', designationName: 'Retired Post' }));

      expect(options('#designationId')).toContain('Retired Post (inactive)');
      expect(selectedValue(element, '#designationId')).toBe('d0');
    });

    it('shows the service field errors and a refused account', async () => {
      await open();
      fill();

      await submit();
      (await writeRequest('POST', ROOT)).flush(
        ...problem(400, 'Invalid', { email: ['Enter a valid email address.'], designationId: ['Choose an active designation.'] }),
      );
      await settle();
      fixture.detectChanges();
      expect(element.querySelector('#email-error')?.textContent).toContain('valid email');
      expect(element.querySelector('#designationId-error')?.textContent).toContain('active designation');

      await submit();
      (await writeRequest('POST', ROOT)).flush(...problem(409, 'This account already has a staff profile. Open it from the staff directory to change it.'));
      await settle();
      fixture.detectChanges();
      expect(element.querySelector('.alert-error')?.textContent).toContain('already has a staff profile');

      await submit();
      (await writeRequest('POST', ROOT)).flush(...problem(409, 'This account is deactivated, so it cannot be given a staff profile.'));
      await settle();
      fixture.detectChanges();
      expect(element.querySelector('.alert-error')?.textContent).toContain('deactivated');
    });

    it('shows a deactivated staff member read-only', async () => {
      await open('s1', staff({ isActive: false, accountStatus: 'Deactivated' }));

      expect(element.textContent).toContain('This staff member is deactivated');
      expect(element.querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(true);
    });

    it('does not let a profile be changed once its account lost the Admin role', async () => {
      await open('s1', staff({ hasAdminRole: false }));

      expect(element.textContent).toContain('no longer has the Admin role');
      expect(element.querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(true);
    });
  });
});
