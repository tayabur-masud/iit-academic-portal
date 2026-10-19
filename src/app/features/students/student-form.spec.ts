import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { STUB_ROUTES, TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { ConfigurationItem } from '../configuration/configuration.models';
import { StudentAdmission, StudentAdmissionCreated, StudentProfile } from './student.models';
import { StudentForm } from './student-form';

@Component({ selector: 'app-student-destination', template: '' })
class Destination {}

const ROOT = '/api/admin/students';
const CONFIG = '/api/admin/configuration';

function item(id: string, name: string, extra: Partial<ConfigurationItem> = {}): ConfigurationItem {
  return { id, name, isActive: true, createdAtUtc: '2026-10-19T08:00:00Z', lastModifiedAtUtc: '2026-10-19T08:00:00Z', ...extra };
}

function profile(extra: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: 'p1',
    userId: 'u1',
    email: 'ayesha@iit.test',
    accountStatus: 'PendingCredentialSetup',
    applicantName: 'Ayesha Rahman',
    applicantMobile: '01711000000',
    mailingAddress: {
      details: 'House 12',
      cellNumber: '01811',
      upazilaId: 'up1',
      upazilaName: 'Kaliakair',
      districtId: 'dist1',
      districtName: 'Gazipur',
      divisionId: 'div1',
      divisionName: 'Dhaka',
    },
    academicHistory: [{ id: 'h1', category: 'SscOLevel', board: 'Dhaka Board (old)', cgpa: '5.00' }],
    admissions: [],
    ...extra,
  };
}

function admission(extra: Partial<StudentAdmission> = {}): StudentAdmission {
  return {
    id: 'a1',
    profile: profile(),
    otherAdmissions: [],
    degreeId: 'pgdit',
    degreeName: 'PGDIT',
    batchId: 'pb1',
    batchName: 'PGDIT Batch 1',
    admissionSerialNumber: 'S-1',
    admissionExamRoll: 'R-1',
    createdAtUtc: '2026-10-19T08:00:00Z',
    lastModifiedAtUtc: '2026-10-19T08:00:00Z',
    ...extra,
  };
}

describe('StudentForm', () => {
  let fixture: ComponentFixture<StudentForm>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(id?: string, loaded: StudentAdmission = admission()): Promise<void> {
    TestBed.configureTestingModule({
      imports: [StudentForm],
      providers: provideAuthTesting([...STUB_ROUTES, { path: 'admin/students/:admissionId', component: Destination }]),
    });
    http = httpMock();
    fixture = TestBed.createComponent(StudentForm);
    if (id) {
      fixture.componentRef.setInput('admissionId', id);
    }
    page = fixture.nativeElement;
    await fixture.whenStable();

    respondList(`${CONFIG}/degrees`, [item('pgdit', 'PGDIT'), item('emit', 'EMIT'), item('old', 'Retired', { isActive: false })]);
    respondList(`${CONFIG}/batches`, [
      item('pb1', 'PGDIT Batch 1', { degreeId: 'pgdit' }),
      item('eb7', 'EMIT Batch 7', { degreeId: 'emit' }),
    ]);
    respondList(`${CONFIG}/halls`, [item('hall1', 'Jagannath Hall'), item('hall2', 'Closed Hall', { isActive: false })]);
    respondList(`${CONFIG}/geography/divisions`, [item('div1', 'Dhaka')]);
    if (id) {
      http.expectOne({ method: 'GET', url: `${ROOT}/${id}` }).flush(loaded);
      await settle();
      for (const address of [loaded.profile.mailingAddress, loaded.profile.permanentAddress]) {
        if (address?.divisionId) {
          respondList(`${CONFIG}/geography/districts`, [item('dist1', 'Gazipur', { divisionId: 'div1' })]);
          await settle();
        }
        if (address?.districtId) {
          respondList(`${CONFIG}/geography/upazilas`, [item('up1', 'Kaliakair', { districtId: 'dist1' })]);
          await settle();
        }
      }
    }
    await render();
  }

  afterEach(() => http.verify());

  function respondList(url: string, items: ConfigurationItem[]): void {
    http.expectOne((r) => r.method === 'GET' && r.url === url).flush({ items, nextCursor: null });
  }

  async function render(): Promise<void> {
    await settle();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }

  function choose(selector: string, value: string): void {
    const select = page.querySelector<HTMLSelectElement>(selector)!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
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

  async function fillRequired(): Promise<void> {
    type('#email', 'new.student@iit.test');
    type('#applicantName', 'Rahim Uddin');
    type('#applicantMobile', '01700000000');
    choose('#degreeId', 'emit');
    fixture.detectChanges();
    choose('#batchId', 'eb7');
    type('#admissionSerialNumber', 'S-9');
    type('#admissionExamRoll', 'R-9');
    fixture.detectChanges();
  }

  describe('adding an admission', () => {
    it('captures typed data only: no file, photo, signature, or password control', async () => {
      await open();

      expect(page.querySelector('input[type=file]')).toBeNull();
      expect(page.querySelector('input[type=password]')).toBeNull();
      expect(page.textContent).toMatch(/are not\s+uploaded/);
    });

    it('requires email, name, mobile, degree, batch, serial and exam roll before sending anything', async () => {
      await open();

      submit();
      await render();

      for (const id of ['email', 'applicantName', 'applicantMobile', 'degreeId', 'batchId', 'admissionSerialNumber', 'admissionExamRoll']) {
        expect(page.querySelector(`#${id}`)?.getAttribute('aria-invalid')).toBe('true');
      }
      expect(http.match(ROOT)).toHaveLength(0);
    });

    it('offers only the batches of the chosen degree', async () => {
      await open();

      choose('#degreeId', 'emit');
      fixture.detectChanges();

      const batches = Array.from(page.querySelectorAll<HTMLOptionElement>('#batchId option')).map((o) => o.textContent?.trim());
      expect(batches).toEqual(['Select a batch', 'EMIT Batch 7']);
      expect(Array.from(page.querySelectorAll('#degreeId option')).map((o) => o.textContent?.trim())).not.toContain('Retired (inactive)');
    });

    it('cascades division, district, and upazila for an address and sends only the upazila with the details', async () => {
      await open();
      await fillRequired();

      choose('#mailing-divisionId', 'div1');
      respondList(`${CONFIG}/geography/districts`, [item('dist1', 'Gazipur', { divisionId: 'div1' })]);
      await render();
      choose('#mailing-districtId', 'dist1');
      respondList(`${CONFIG}/geography/upazilas`, [item('up1', 'Kaliakair', { districtId: 'dist1' })]);
      await render();
      choose('#mailingAddress-upazilaId', 'up1');
      type('#mailingAddress-details', '  House 12, Road 5 ');
      type('#mailingAddress-cellNumber', '01811000000');

      submit();
      const request = await writeRequest('POST', ROOT);

      expect(http.match((r) => r.url.includes('districts')).length).toBe(0);
      expect(request.request.body.mailingAddress).toEqual({ details: 'House 12, Road 5', upazilaId: 'up1', cellNumber: '01811000000' });
      expect(request.request.body.permanentAddress).toBeNull();
      request.flush(...problem(500, 'boom'));
      await render();
    });

    it('asks for an upazila when address details are given without one', async () => {
      await open();
      await fillRequired();
      type('#mailingAddress-details', 'House 12');

      submit();
      await render();

      expect(page.querySelector('#mailingAddress-upazilaId')?.getAttribute('aria-invalid')).toBe('true');
      expect(page.querySelector('#mailingAddress-upazilaId-error')?.textContent).toContain('division, district, and upazila');
      expect(http.match(ROOT)).toHaveLength(0);
    });

    it('offers all six history categories, shows the fields that apply, and sends text exactly as typed', async () => {
      await open();
      await fillRequired();

      button('Add academic-history entry').click();
      await render();
      const categories = Array.from(page.querySelectorAll<HTMLOptionElement>('#academicHistory-0-category option')).map((o) => o.textContent?.trim());
      expect(categories).toEqual(['Select a category', 'SSC / O-Level', 'HSC / A-Level', 'Bachelor / Graduation', 'Master', 'PGDIT', 'Other']);
      choose('#academicHistory-0-category', 'SscOLevel');
      fixture.detectChanges();
      expect(page.querySelector('#academicHistory-0-board')).not.toBeNull();
      expect(page.querySelector('#academicHistory-0-university')).toBeNull();
      type('#academicHistory-0-board', 'Dhaka Board (old name)');
      type('#academicHistory-0-marksPercentage', '086.50');
      type('#academicHistory-0-cgpa', '5.00');

      submit();
      const request = await writeRequest('POST', ROOT);

      const [entry] = request.request.body.academicHistory;
      expect(entry).toMatchObject({ id: null, category: 'SscOLevel', board: 'Dhaka Board (old name)', marksPercentage: '086.50', cgpa: '5.00', university: null });
      request.flush(...problem(500, 'boom'));
      await render();
    });

    it('requires a category for each history entry and can remove an entry', async () => {
      await open();
      await fillRequired();
      button('Add academic-history entry').click();
      button('Add academic-history entry').click();
      await render();

      submit();
      await render();
      expect(page.querySelector('#academicHistory-1-category')?.getAttribute('aria-invalid')).toBe('true');

      button('Remove entry 1').click();
      await render();
      expect(page.querySelectorAll('[role=group][aria-label^="Academic-history entry"]')).toHaveLength(1);
    });

    it('creates the admission and opens it with a notice about the new account and setup email', async () => {
      await open();
      await fillRequired();

      submit();
      const request = await writeRequest('POST', ROOT);
      expect(request.request.body).toMatchObject({
        email: 'new.student@iit.test',
        applicantName: 'Rahim Uddin',
        degreeId: 'emit',
        batchId: 'eb7',
        assignedHallId: null,
        registrationNumber: null,
        academicHistory: [],
      });
      expect(request.request.headers.get('X-CSRF-Token')).toBe(TEST_CSRF_TOKEN);
      request.flush({ admission: admission({ id: 'a9' }), accountCreated: true, profileCreated: true, setupEmailRequested: true } satisfies StudentAdmissionCreated);
      await render();

      const router = TestBed.inject(Router);
      expect(router.url).toBe('/admin/students/a9');
      expect(router.lastSuccessfulNavigation()?.extras.state?.['notice']).toContain('setup email was requested');
    });

    it('says a returning student reused their account and got no new setup email', async () => {
      await open();
      await fillRequired();

      submit();
      (await writeRequest('POST', ROOT)).flush({
        admission: admission({ id: 'a10' }),
        accountCreated: false,
        profileCreated: false,
        setupEmailRequested: false,
      } satisfies StudentAdmissionCreated);
      await render();

      expect(TestBed.inject(Router).lastSuccessfulNavigation()?.extras.state?.['notice']).toContain('existing Student account was reused');
    });

    it('prefills the shared profile and history for a returning student found by email', async () => {
      await open();
      type('#email', 'ayesha@iit.test');
      page.querySelector('#email')!.dispatchEvent(new Event('blur'));
      await settle();
      http.expectOne((r) => r.url === `${ROOT}/lookup` && r.params.get('email') === 'ayesha@iit.test').flush({
        status: 'ExistingStudent',
        profile: profile({ admissions: [{ id: 'old', degreeId: 'pgdit', degreeName: 'PGDIT', batchId: 'pb1', batchName: 'PGDIT Batch 1', createdAtUtc: '' }] }),
      });
      await settle();
      respondList(`${CONFIG}/geography/districts`, [item('dist1', 'Gazipur', { divisionId: 'div1' })]);
      await settle();
      respondList(`${CONFIG}/geography/upazilas`, [item('up1', 'Kaliakair', { districtId: 'dist1' })]);
      await render();

      expect(page.querySelector('[role=status].alert')?.textContent).toContain('Returning student');
      expect(page.textContent).toContain('PGDIT · PGDIT Batch 1');
      expect(page.querySelector<HTMLInputElement>('#applicantName')?.value).toBe('Ayesha Rahman');
      expect(page.querySelector<HTMLInputElement>('#academicHistory-0-board')?.value).toBe('Dhaka Board (old)');
      expect(page.querySelector<HTMLSelectElement>('#mailingAddress-upazilaId')?.value).toBe('up1');
    });

    it('warns when the email belongs to a staff account', async () => {
      await open();
      type('#email', 'admin@iit.test');
      page.querySelector('#email')!.dispatchEvent(new Event('blur'));
      await settle();
      http.expectOne((r) => r.url === `${ROOT}/lookup`).flush({ status: 'NotStudentAccount' });
      await render();

      expect(page.querySelector('.alert-warning')?.textContent).toContain('accounts are never merged');
    });

    it('marks fields named by the service, including nested address and history keys', async () => {
      await open();
      await fillRequired();
      button('Add academic-history entry').click();
      await render();
      choose('#academicHistory-0-category', 'Master');

      submit();
      (await writeRequest('POST', ROOT)).flush(
        ...problem(400, 'Invalid', {
          'mailingAddress.upazilaId': ['Select an active upazila.'],
          'academicHistory[0].category': ['Select SSC/O-Level, HSC/A-Level, Bachelor/Graduation, Master, PGDIT, or Other.'],
          batchId: ['The batch does not belong to the selected degree.'],
        }),
      );
      await render();

      expect(page.querySelector('#mailingAddress-upazilaId-error')?.textContent).toContain('Select an active upazila.');
      expect(page.querySelector('#academicHistory-0-category')?.getAttribute('aria-invalid')).toBe('true');
      expect(page.querySelector('#batchId-error')?.textContent).toContain('does not belong');
    });

    it('shows a conflict such as a non-Student email from the service', async () => {
      await open();
      await fillRequired();

      submit();
      (await writeRequest('POST', ROOT)).flush(...problem(409, 'This email belongs to a portal account that is not a Student account.'));
      await render();

      expect(page.querySelector('.alert-error')?.textContent).toContain('not a Student account');
      expect(TestBed.inject(Router).url).toBe('/');
    });
  });

  describe('maintaining an admission', () => {
    async function openExisting(loaded = admission()): Promise<void> {
      await open('a1', loaded);
      http.expectOne(`${ROOT}/a1/graduation-eligibility`).flush({ admissionId: 'a1', eligible: false, requirements: [] });
      await render();
    }

    it('shows the account, the other programs, and the current values without an email field', async () => {
      await openExisting(
        admission({
          otherAdmissions: [{ id: 'a0', degreeId: 'pgdit', degreeName: 'PGDIT', batchId: 'pb0', batchName: 'PGDIT Batch 0', registrationNumber: 'R-OLD', createdAtUtc: '' }],
        }),
      );

      expect(page.querySelector('#email')).toBeNull();
      expect(page.textContent).toContain('ayesha@iit.test');
      expect(page.textContent).toContain('Pending setup');
      expect(page.querySelector('a[href="/admin/students/a0"]')?.textContent).toContain('PGDIT · PGDIT Batch 0');
      expect(page.querySelector('a[href="/admin/users/u1"]')).not.toBeNull();
      expect(page.querySelector<HTMLSelectElement>('#batchId')?.value).toBe('pb1');
      expect(page.querySelector<HTMLSelectElement>('#mailingAddress-upazilaId')?.value).toBe('up1');
      expect(page.querySelector('app-graduation-eligibility')).not.toBeNull();
    });

    it('saves the hall alone and keeps the registration number and history ids', async () => {
      await openExisting(admission({ registrationNumber: 'REG-1' }));

      choose('#assignedHallId', 'hall1');
      submit();
      const request = await writeRequest('PUT', `${ROOT}/a1`);

      expect(request.request.body.email).toBeUndefined();
      expect(request.request.body.assignedHallId).toBe('hall1');
      expect(request.request.body.registrationNumber).toBe('REG-1');
      expect(request.request.body.academicHistory[0].id).toBe('h1');
      request.flush(admission({ assignedHallId: 'hall1', assignedHallName: 'Jagannath Hall', registrationNumber: 'REG-1', lastModifiedAtUtc: '2026-10-19T09:00:00Z' }));
      await settle();
      respondList(`${CONFIG}/geography/districts`, [item('dist1', 'Gazipur', { divisionId: 'div1' })]);
      await settle();
      respondList(`${CONFIG}/geography/upazilas`, [item('up1', 'Kaliakair', { districtId: 'dist1' })]);
      await render();
      http.expectOne(`${ROOT}/a1/graduation-eligibility`).flush({ admissionId: 'a1', eligible: false, requirements: [] });
      await render();

      expect(page.querySelector('[role=status].alert-success')?.textContent).toContain('was saved');
    });

    it('saves the registration number alone, leaving the hall unassigned', async () => {
      await openExisting();

      type('#registrationNumber', ' 2026-17 ');
      submit();
      const request = await writeRequest('PUT', `${ROOT}/a1`);

      expect(request.request.body.registrationNumber).toBe('2026-17');
      expect(request.request.body.assignedHallId).toBeNull();
      request.flush(...problem(409, 'Another admission already has this registration number.'));
      await render();
      expect(page.querySelector('.alert-error')?.textContent).toContain('already has this registration number');
    });

    it('keeps an inactive hall the admission already has selectable', async () => {
      await openExisting(admission({ assignedHallId: 'hall2', assignedHallName: 'Closed Hall' }));

      const options = Array.from(page.querySelectorAll<HTMLOptionElement>('#assignedHallId option')).map((o) => o.textContent?.trim());
      expect(options).toContain('Closed Hall (inactive)');
      expect(page.querySelector<HTMLSelectElement>('#assignedHallId')?.value).toBe('hall2');
    });

    it('explains a refused write by a non-Admin role', async () => {
      await openExisting();

      submit();
      (await writeRequest('PUT', `${ROOT}/a1`)).flush(...problem(403, 'Forbidden'));
      await render();

      expect(page.querySelector('.alert-error')?.textContent).toContain('Switch to the Admin role');
    });
  });
});
