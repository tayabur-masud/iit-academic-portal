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
      cityCorporationId: null,
      cityCorporationName: null,
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
    respondList(`${CONFIG}/institutions`, [
      item('sch1', 'Motijheel Model High School', { type: 'School' }),
      item('col1', 'Notre Dame College', { type: 'College' }),
      item('uni1', 'University of Dhaka', { type: 'University' }),
      item('uni2', 'Closed University', { type: 'University', isActive: false }),
    ]);
    respondList(`${CONFIG}/education-boards`, [item('b1', 'Dhaka')]);
    respondList(`${CONFIG}/education-groups`, [item('g1', 'Science')]);
    if (id) {
      http.expectOne({ method: 'GET', url: `${ROOT}/${id}` }).flush(loaded);
      await settle();
      for (const address of [loaded.profile.mailingAddress, loaded.profile.permanentAddress]) {
        if (address?.divisionId) {
          respondList(`${CONFIG}/geography/districts`, [item('dist1', 'Gazipur', { divisionId: 'div1' })]);
          await settle();
        }
        if (address?.districtId) {
          respondLocalities();
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

  /** Answers the two locality lists a District loads: its Upazilas and its City Corporations. */
  function respondLocalities(
    upazilas: ConfigurationItem[] = [item('up1', 'Kaliakair', { districtId: 'dist1' })],
    cities: ConfigurationItem[] = [item('cc1', 'Gazipur City Corporation', { districtId: 'dist1' })],
  ): void {
    respondList(`${CONFIG}/geography/upazilas`, upazilas);
    respondList(`${CONFIG}/geography/city-corporations`, cities);
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

    it('cascades division, district, and an upazila for an address and sends the district with only the upazila', async () => {
      await open();
      await fillRequired();

      choose('#mailing-divisionId', 'div1');
      respondList(`${CONFIG}/geography/districts`, [item('dist1', 'Gazipur', { divisionId: 'div1' })]);
      await render();
      choose('#mailing-districtId', 'dist1');
      respondLocalities();
      await render();
      choose('#mailingAddress-locality', 'upazila:up1');
      type('#mailingAddress-details', '  House 12, Road 5 ');
      type('#mailingAddress-cellNumber', '01811000000');

      submit();
      const request = await writeRequest('POST', ROOT);

      expect(http.match((r) => r.url.includes('districts')).length).toBe(0);
      expect(request.request.body.mailingAddress).toEqual({
        details: 'House 12, Road 5',
        districtId: 'dist1',
        upazilaId: 'up1',
        cityCorporationId: null,
        cellNumber: '01811000000',
      });
      expect(request.request.body.permanentAddress).toBeNull();
      request.flush(...problem(500, 'boom'));
      await render();
    });

    it('asks for the district and a locality when address details are given without them', async () => {
      await open();
      await fillRequired();
      type('#mailingAddress-details', 'House 12');

      submit();
      await render();

      expect(page.querySelector('#mailing-districtId')?.getAttribute('aria-invalid')).toBe('true');
      expect(page.querySelector('#mailing-districtId-error')?.textContent).toContain('division and district');
      expect(page.querySelector('#mailingAddress-locality')?.getAttribute('aria-invalid')).toBe('true');
      expect(page.querySelector('#mailingAddress-locality-error')?.textContent).toContain('upazila or a city corporation');
      expect(http.match(ROOT)).toHaveLength(0);
    });

    it('offers the upazilas and city corporations of the chosen district only, and sends a city corporation alone', async () => {
      await open();
      await fillRequired();

      choose('#permanent-divisionId', 'div1');
      respondList(`${CONFIG}/geography/districts`, [item('dist1', 'Gazipur', { divisionId: 'div1' })]);
      await render();
      choose('#permanent-districtId', 'dist1');
      const upazilaRequest = http.expectOne((r) => r.url === `${CONFIG}/geography/upazilas`);
      const cityRequest = http.expectOne((r) => r.url === `${CONFIG}/geography/city-corporations`);
      expect(upazilaRequest.request.params.get('districtId')).toBe('dist1');
      expect(cityRequest.request.params.get('districtId')).toBe('dist1');
      upazilaRequest.flush({ items: [item('up1', 'Kaliakair', { districtId: 'dist1' })], nextCursor: null });
      cityRequest.flush({
        items: [item('cc1', 'Gazipur City Corporation', { districtId: 'dist1' }), item('cc0', 'Old City', { districtId: 'dist1', isActive: false })],
        nextCursor: null,
      });
      await render();

      const select = page.querySelector<HTMLSelectElement>('#permanentAddress-locality')!;
      expect(page.querySelector('label[for="permanentAddress-locality"]')?.textContent).toContain('Upazila or city corporation');
      expect(Array.from(select.querySelectorAll('optgroup')).map((g) => g.label)).toEqual(['Upazilas', 'City corporations']);
      expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual([
        'Select an upazila or city corporation',
        'Kaliakair',
        'Gazipur City Corporation',
      ]);
      choose('#permanentAddress-locality', 'city:cc1');
      type('#permanentAddress-details', 'Holding 7, Tongi');

      submit();
      const request = await writeRequest('POST', ROOT);
      expect(request.request.body.permanentAddress).toEqual({
        details: 'Holding 7, Tongi',
        districtId: 'dist1',
        upazilaId: null,
        cityCorporationId: 'cc1',
        cellNumber: null,
      });
      request.flush(...problem(500, 'boom'));
      await render();
    });

    it('clears the locality when the district or division changes', async () => {
      await open();
      choose('#mailing-divisionId', 'div1');
      respondList(`${CONFIG}/geography/districts`, [item('dist1', 'Gazipur', { divisionId: 'div1' }), item('dist2', 'Narayanganj', { divisionId: 'div1' })]);
      await render();
      choose('#mailing-districtId', 'dist1');
      respondLocalities();
      await render();
      choose('#mailingAddress-locality', 'city:cc1');

      choose('#mailing-districtId', 'dist2');
      respondLocalities([], [item('cc2', 'Narayanganj City Corporation', { districtId: 'dist2' })]);
      await render();
      expect(page.querySelector<HTMLSelectElement>('#mailingAddress-locality')?.value).toBe('');
      expect(Array.from(page.querySelectorAll<HTMLOptionElement>('#mailingAddress-locality option')).map((o) => o.textContent?.trim())).toEqual([
        'Select an upazila or city corporation',
        'Narayanganj City Corporation',
      ]);

      choose('#mailingAddress-locality', 'city:cc2');
      choose('#mailing-divisionId', '');
      await render();
      expect(page.querySelector<HTMLSelectElement>('#mailingAddress-locality')?.value).toBe('');
      expect(page.querySelector<HTMLSelectElement>('#mailing-districtId')?.value).toBe('');
    });

    it('shows a mixed or cross-district locality refused by the service on the one locality selector', async () => {
      await open();
      await fillRequired();

      submit();
      (await writeRequest('POST', ROOT)).flush(
        ...problem(400, 'Invalid', {
          'mailingAddress.cityCorporationId': ['The selected city corporation is not in the selected district.'],
          'permanentAddress.districtId': ['Select the division and district.'],
        }),
      );
      await render();

      expect(page.querySelector('#mailingAddress-locality')?.getAttribute('aria-invalid')).toBe('true');
      expect(page.querySelector('#mailingAddress-locality-error')?.textContent).toContain('not in the selected district');
      expect(page.querySelector('#permanent-districtId-error')?.textContent).toContain('division and district');
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
      expect(page.querySelector('#academicHistory-0-boardId')).not.toBeNull();
      expect(page.querySelector('#academicHistory-0-universityId')).toBeNull();
      choose('#academicHistory-0-boardId', '__not-listed__');
      fixture.detectChanges();
      type('#academicHistory-0-board', 'Dhaka Board (old name)');
      type('#academicHistory-0-marksPercentage', '086.50');
      type('#academicHistory-0-cgpa', '5.00');

      submit();
      const request = await writeRequest('POST', ROOT);

      const [entry] = request.request.body.academicHistory;
      expect(entry).toMatchObject({
        id: null,
        category: 'SscOLevel',
        board: 'Dhaka Board (old name)',
        boardId: null,
        marksPercentage: '086.50',
        cgpa: '5.00',
        university: null,
        universityId: null,
      });
      request.flush(...problem(500, 'boom'));
      await render();
    });

    it('chooses institutions, boards, and groups from their catalogs, filtered by the type that fits the field', async () => {
      await open();
      await fillRequired();
      button('Add academic-history entry').click();
      button('Add academic-history entry').click();
      await render();
      choose('#academicHistory-0-category', 'HscALevel');
      choose('#academicHistory-1-category', 'Master');
      fixture.detectChanges();

      const options = (selector: string) => Array.from(page.querySelectorAll<HTMLOptionElement>(`${selector} option`)).map((o) => o.textContent?.trim());
      expect(options('#academicHistory-0-schoolOrCollegeId')).toEqual([
        'Not given',
        'Motijheel Model High School',
        'Notre Dame College',
        'Not listed: type the name',
      ]);
      expect(options('#academicHistory-1-universityId')).toEqual(['Not given', 'University of Dhaka', 'Not listed: type the name']);
      choose('#academicHistory-0-schoolOrCollegeId', 'col1');
      choose('#academicHistory-0-boardId', 'b1');
      choose('#academicHistory-0-groupId', 'g1');
      choose('#academicHistory-1-universityId', 'uni1');
      fixture.detectChanges();
      expect(page.querySelector('#academicHistory-0-schoolOrCollege')).toBeNull();

      submit();
      const request = await writeRequest('POST', ROOT);

      const [hsc, master] = request.request.body.academicHistory;
      expect(hsc).toMatchObject({ schoolOrCollegeId: 'col1', schoolOrCollege: 'Notre Dame College', boardId: 'b1', board: 'Dhaka', groupId: 'g1', group: 'Science' });
      expect(master).toMatchObject({ universityId: 'uni1', university: 'University of Dhaka', institutionId: null });
      request.flush(...problem(500, 'boom'));
      await render();
    });

    it('shows a catalog choice the service refused on its dropdown', async () => {
      await open();
      await fillRequired();
      button('Add academic-history entry').click();
      await render();
      choose('#academicHistory-0-category', 'Master');
      fixture.detectChanges();
      choose('#academicHistory-0-universityId', 'uni1');

      submit();
      (await writeRequest('POST', ROOT)).flush(
        ...problem(400, 'Invalid', { 'academicHistory[0].universityId': ['Select an active university, or type the name if it is not listed.'] }),
      );
      await render();

      expect(page.querySelector('#academicHistory-0-universityId')?.getAttribute('aria-invalid')).toBe('true');
      expect(page.querySelector('#academicHistory-0-universityId-error')?.textContent).toContain('type the name if it is not listed');
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
      respondLocalities();
      await render();

      expect(page.querySelector('[role=status].alert')?.textContent).toContain('Returning student');
      expect(page.textContent).toContain('PGDIT · PGDIT Batch 1');
      expect(page.querySelector<HTMLInputElement>('#applicantName')?.value).toBe('Ayesha Rahman');
      expect(page.querySelector<HTMLInputElement>('#academicHistory-0-board')?.value).toBe('Dhaka Board (old)');
      expect(page.querySelector<HTMLSelectElement>('#mailingAddress-locality')?.value).toBe('upazila:up1');
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

      expect(page.querySelector('#mailingAddress-locality-error')?.textContent).toContain('Select an active upazila.');
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

    it('shows a saved city corporation address with its district and division', async () => {
      const loaded = admission();
      loaded.profile = {
        ...loaded.profile,
        permanentAddress: {
          details: 'Holding 7',
          cityCorporationId: 'cc1',
          cityCorporationName: 'Gazipur City Corporation',
          districtId: 'dist1',
          districtName: 'Gazipur',
          divisionId: 'div1',
          divisionName: 'Dhaka',
        },
      };
      await openExisting(loaded);

      expect(page.querySelector<HTMLSelectElement>('#permanentAddress-locality')?.value).toBe('city:cc1');
      expect(page.querySelector<HTMLSelectElement>('#permanent-districtId')?.value).toBe('dist1');
      expect(page.querySelector<HTMLSelectElement>('#permanent-divisionId')?.value).toBe('div1');
    });

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
      expect(page.querySelector<HTMLSelectElement>('#mailingAddress-locality')?.value).toBe('upazila:up1');
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
      respondLocalities();
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
