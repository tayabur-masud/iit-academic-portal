import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { STUB_ROUTES, TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../../testing/auth-testing';
import { ConfigurationItem } from '../configuration.models';
import { CatalogForm } from './catalog-form';

@Component({ template: '' })
class Destination {}

const ROOT = '/api/admin/configuration';

function item(id: string, name: string, extra: Partial<ConfigurationItem> = {}): ConfigurationItem {
  return { id, name, isActive: true, createdAtUtc: '2026-10-09T08:30:00Z', lastModifiedAtUtc: '2026-10-09T08:30:00Z', ...extra };
}

describe('CatalogForm', () => {
  let fixture: ComponentFixture<CatalogForm>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(resource: string, id?: string): Promise<void> {
    TestBed.configureTestingModule({
      imports: [CatalogForm],
      providers: provideAuthTesting([...STUB_ROUTES, { path: 'admin/configuration/:resource', component: Destination }]),
    });
    http = httpMock();
    fixture = TestBed.createComponent(CatalogForm);
    fixture.componentRef.setInput('resource', resource);
    if (id) {
      fixture.componentRef.setInput('id', id);
    }
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => http.verify());

  function lookup(path: string, match: (r: TestRequest['request']) => boolean = () => true): TestRequest {
    return http.expectOne((r) => r.method === 'GET' && r.url === `${ROOT}/${path}` && match(r));
  }

  async function respond(request: TestRequest, body: object): Promise<void> {
    request.flush(body);
    await settle();
    fixture.detectChanges();
  }

  const list = (items: ConfigurationItem[]) => ({ items, nextCursor: null });

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }

  function choose(selector: string, value: string): void {
    const select = page.querySelector<HTMLSelectElement>(selector)!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
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

  describe('a catalog', () => {
    it('requires a name before it sends anything', async () => {
      await open('degrees');
      await settle();
      fixture.detectChanges();

      submit();
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#name-error')?.textContent).toContain('Enter a name');
      expect(page.querySelector('#name')?.getAttribute('aria-invalid')).toBe('true');
      http.expectNone(`${ROOT}/degrees`);
    });

    it('creates a record and returns to the list with a confirmation', async () => {
      await open('degrees');
      await settle();
      fixture.detectChanges();
      type('#name', '  Bachelor of IT ');
      type('#code', ' bit ');
      type('#creditsToBeCompleted', '120');

      submit();
      const request = await writeRequest('POST', 'degrees');
      expect(request.request.body).toEqual({ name: 'Bachelor of IT', isActive: true, code: 'bit', creditsToBeCompleted: 120 });
      request.flush(item('1', 'Bachelor of IT', { code: 'bit', creditsToBeCompleted: 120 }), { status: 201, statusText: 'Created' });
      await settle();

      expect(TestBed.inject(Router).url).toBe('/admin/configuration/degrees');
    });

    it('requires positive credits to be completed and sends the Degree value as a number', async () => {
      await open('degrees');
      await settle();
      fixture.detectChanges();

      const credits = page.querySelector<HTMLInputElement>('#creditsToBeCompleted')!;
      expect(credits.type).toBe('number');
      expect(credits.required).toBe(true);
      expect(credits.min).toBe('0.01');
      expect(credits.step).toBe('0.01');
      type('#name', 'Bachelor of IT');

      submit();
      await settle();
      fixture.detectChanges();
      expect(page.querySelector('#creditsToBeCompleted-error')?.textContent).toContain('positive');
      http.expectNone(`${ROOT}/degrees`);

      type('#creditsToBeCompleted', '0');
      submit();
      await settle();
      fixture.detectChanges();
      expect(page.querySelector('#creditsToBeCompleted-error')?.textContent).toContain('positive');
      http.expectNone(`${ROOT}/degrees`);

      type('#creditsToBeCompleted', '-1');
      submit();
      await settle();
      fixture.detectChanges();
      expect(page.querySelector('#creditsToBeCompleted-error')?.textContent).toContain('positive');
      http.expectNone(`${ROOT}/degrees`);

      type('#creditsToBeCompleted', '1.234');
      submit();
      await settle();
      fixture.detectChanges();
      expect(page.querySelector('#creditsToBeCompleted-error')?.textContent).toContain('two decimal places');
      http.expectNone(`${ROOT}/degrees`);

      type('#creditsToBeCompleted', '120.50');
      submit();
      const request = await writeRequest('POST', 'degrees');
      expect(request.request.body).toEqual({ name: 'Bachelor of IT', isActive: true, code: '', creditsToBeCompleted: 120.5 });
      request.flush(item('degree-1', 'Bachelor of IT', { creditsToBeCompleted: 120.5 }), { status: 201, statusText: 'Created' });
      await settle();
    });

    it('loads and updates the Degree credit total', async () => {
      await open('degrees', 'degree-1');
      await respond(lookup('degrees/degree-1'), item('degree-1', 'Bachelor of IT', { code: 'BIT', creditsToBeCompleted: 120.5 }));

      expect(page.querySelector<HTMLInputElement>('#creditsToBeCompleted')?.value).toBe('120.5');
      type('#creditsToBeCompleted', '140.25');
      submit();
      const request = await writeRequest('PUT', 'degrees/degree-1');
      expect(request.request.body).toEqual({
        name: 'Bachelor of IT',
        isActive: true,
        code: 'BIT',
        creditsToBeCompleted: 140.25,
      });
      request.flush(item('degree-1', 'Bachelor of IT', { code: 'BIT', creditsToBeCompleted: 140.25 }));
      await settle();
    });

    it('shows the service field errors against the field and keeps what was typed', async () => {
      await open('degrees');
      await settle();
      fixture.detectChanges();
      type('#name', 'Duplicate');
      type('#code', 'D1');
      type('#creditsToBeCompleted', '120');

      submit();
      (await writeRequest('POST', 'degrees')).flush(
        ...problem(400, 'Invalid', { name: ['A degree with this name already exists.'], code: ['A degree with this code already exists.'] }),
      );
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#name-error')?.textContent).toContain('already exists');
      expect(page.querySelector('#code-error')?.textContent).toContain('already exists');
      expect(page.querySelector('[role=alert]')?.textContent).toContain('Some fields need attention');
      expect(page.querySelector<HTMLInputElement>('#name')?.value).toBe('Duplicate');
      expect(TestBed.inject(Router).url).not.toContain('degrees');
    });

    it('gives a hall an optional code and address and sends them trimmed', async () => {
      await open('halls');
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#type')).toBeNull();
      type('#name', '  Fazlul Huq Hall ');
      type('#code', ' fh ');
      type('#address', '  University of Dhaka ');
      submit();
      const request = await writeRequest('POST', 'halls');

      expect(request.request.body).toEqual({ name: 'Fazlul Huq Hall', isActive: true, code: 'fh', address: 'University of Dhaka' });
      request.flush(item('h1', 'Fazlul Huq Hall'), { status: 201, statusText: 'Created' });
      await settle();
      expect(TestBed.inject(Router).url).toBe('/admin/configuration/halls');
    });

    it('does not offer a code where the catalog has none', async () => {
      await open('semesters');
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#code')).toBeNull();
      expect(page.querySelector('#type')).toBeNull();
      expect(page.querySelector('#creditsToBeCompleted')).toBeNull();
    });

    it('requires one of the three institution types and sends the address trimmed', async () => {
      await open('institutions');
      await settle();
      fixture.detectChanges();
      type('#name', 'Dhaka College');

      submit();
      await settle();
      fixture.detectChanges();
      expect(page.querySelector('#type-error')?.textContent).toContain('Select a type');
      expect(Array.from(page.querySelectorAll<HTMLOptionElement>('#type option')).map((o) => o.value)).toEqual(['', 'School', 'College', 'University']);

      choose('#type', 'College');
      type('#address', '  1 Main Road ');
      submit();
      const request = await writeRequest('POST', 'institutions');
      expect(request.request.body).toEqual({ name: 'Dhaka College', isActive: true, code: '', type: 'College', address: '1 Main Road' });
      request.flush(item('1', 'Dhaka College'), { status: 201, statusText: 'Created' });
      await settle();
    });

    it('loads a record for editing and saves only through PUT', async () => {
      await open('degrees', 'd1');
      await respond(lookup('degrees/d1'), item('d1', 'BSc', { code: 'B', creditsToBeCompleted: 120 }));

      expect(page.querySelector('h1')?.textContent).toContain('Edit degree');
      expect(page.querySelector<HTMLInputElement>('#name')?.value).toBe('BSc');
      expect(page.querySelector<HTMLInputElement>('#code')?.value).toBe('B');

      type('#name', 'BSc in IT');
      submit();
      const request = await writeRequest('PUT', 'degrees/d1');
      expect(request.request.body).toEqual({ name: 'BSc in IT', isActive: true, code: 'B', creditsToBeCompleted: 120 });
      request.flush(item('d1', 'BSc in IT', { creditsToBeCompleted: 120 }));
      await settle();
    });

    it('deactivates by turning Active off and explains an inactive record', async () => {
      await open('degrees', 'd1');
      await respond(lookup('degrees/d1'), item('d1', 'BSc', { isActive: false, creditsToBeCompleted: 120 }));
      expect(page.textContent).toContain('This degree is inactive');

      const active = page.querySelector<HTMLInputElement>('#isActive')!;
      expect(active.checked).toBe(false);
      active.click();
      submit();
      const request = await writeRequest('PUT', 'degrees/d1');
      expect(request.request.body.isActive).toBe(true);
      request.flush(item('d1', 'BSc', { creditsToBeCompleted: 120 }));
      await settle();
    });

    it('shows who created and last changed the record and when, in UTC', async () => {
      await open('degrees', 'd1');
      await respond(
        lookup('degrees/d1'),
        item('d1', 'BSc', {
          createdAtUtc: '2026-10-09T08:30:00Z',
          createdByUserId: 'u1',
          createdBy: 'first@iit.test',
          lastModifiedAtUtc: '2026-10-12T14:05:09Z',
          lastModifiedByUserId: 'u2',
          lastModifiedBy: 'second@iit.test',
        }),
      );

      const history = page.querySelector('section[aria-labelledby="history-title"]')!;
      expect(history.textContent).toContain('Record history');
      expect(history.textContent).toContain('2026-10-09 08:30:00 UTC');
      expect(history.textContent).toContain('first@iit.test');
      expect(history.textContent).toContain('2026-10-12 14:05:09 UTC');
      expect(history.textContent).toContain('second@iit.test');
    });

    it('says System when no account made the change and marks a removed account', async () => {
      await open('degrees', 'd1');
      await respond(lookup('degrees/d1'), item('d1', 'BSc', { createdByUserId: undefined, lastModifiedByUserId: 'gone-1' }));

      const history = page.querySelector('section[aria-labelledby="history-title"]')!.textContent!;
      expect(history).toContain('by System');
      expect(history).toContain('by (account removed)');
    });

    it('has no record history while creating', async () => {
      await open('degrees');
      await settle();
      fixture.detectChanges();

      expect(page.textContent).not.toContain('Record history');
    });

    it('says so when the record does not exist', async () => {
      await open('degrees', 'missing');
      lookup('degrees/missing').flush(...problem(404, 'No record has that identifier.'));
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('[role=alert]')?.textContent).toContain('was not found');
    });
  });

  describe('delete', () => {
    async function openExisting(extra: Partial<ConfigurationItem> = {}): Promise<void> {
      await open('degrees', 'd1');
      await respond(lookup('degrees/d1'), item('d1', 'BSc', { creditsToBeCompleted: 120, ...extra }));
    }

    it('asks for confirmation, deletes, and returns to the list', async () => {
      await openExisting();
      expect(page.textContent).toContain('kept in the database');

      button('Delete degree').click();
      fixture.detectChanges();
      expect(page.textContent).toContain('Delete "BSc"?');
      expect(page.textContent).toContain('cannot be restored from the portal');
      http.expectNone({ method: 'DELETE', url: `${ROOT}/degrees/d1` });

      button('Yes, delete').click();
      const request = await writeRequest('DELETE', 'degrees/d1');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(TestBed.inject(Router).url).toBe('/admin/configuration/degrees');
    });

    it('uses the danger style to start and to confirm a delete, never the primary one', async () => {
      await openExisting();

      expect(button('Delete degree').classList).toContain('btn-danger-outline');
      button('Delete degree').click();
      fixture.detectChanges();
      expect(button('Yes, delete').classList).toContain('btn-danger');
      expect(button('Yes, delete').classList).not.toContain('btn-primary');
    });

    it('can be cancelled without sending anything', async () => {
      await openExisting();
      button('Delete degree').click();
      fixture.detectChanges();

      button('Cancel').click();
      fixture.detectChanges();

      expect(page.textContent).not.toContain('Delete "BSc"?');
    });

    it('explains a record in use and offers to deactivate it instead', async () => {
      await openExisting();
      button('Delete degree').click();
      fixture.detectChanges();

      button('Yes, delete').click();
      (await writeRequest('DELETE', 'degrees/d1')).flush(
        ...problem(409, 'This degree is used by other records, so it cannot be deleted. Deactivate it instead.'),
      );
      await settle();
      fixture.detectChanges();
      expect(page.querySelector('[role=alert]')?.textContent).toContain('cannot be deleted');

      button('Deactivate instead').click();
      const request = await writeRequest('PUT', 'degrees/d1');
      expect(request.request.body.isActive).toBe(false);
      request.flush(item('d1', 'BSc', { isActive: false }));
      await settle();
      expect(TestBed.inject(Router).url).toBe('/admin/configuration/degrees');
    });

    it('is not offered when creating', async () => {
      await open('degrees');
      await settle();
      fixture.detectChanges();

      expect(page.textContent).not.toContain('Delete this degree');
    });
  });

  describe('a batch', () => {
    async function openBatch(id?: string): Promise<void> {
      await open('batches', id);
      await respond(lookup('degrees'), list([item('d1', 'BSc'), item('d2', 'Old degree', { isActive: false })]));
      await respond(lookup('semesters'), list([item('s1', 'Spring')]));
      await respond(lookup('academic-sessions'), list([item('a1', '2026'), item('a2', '2019', { isActive: false })]));
    }

    it('requires a name, a degree, a starting semester and a session', async () => {
      await openBatch();

      submit();
      await settle();
      fixture.detectChanges();

      for (const field of ['name', 'degreeId', 'startingSemesterId', 'academicSessionId']) {
        expect(page.querySelector(`#${field}-error`)).not.toBeNull();
      }
    });

    it('offers only active records for a new batch and sends the three references', async () => {
      await openBatch();

      expect(Array.from(page.querySelectorAll<HTMLOptionElement>('#degreeId option')).map((o) => o.textContent!.trim())).toEqual([
        'Select a degree',
        'BSc',
      ]);
      type('#name', 'Batch 12');
      choose('#degreeId', 'd1');
      choose('#startingSemesterId', 's1');
      choose('#academicSessionId', 'a1');

      submit();
      const request = await writeRequest('POST', 'batches');
      expect(request.request.body).toEqual({
        name: 'Batch 12',
        isActive: true,
        degreeId: 'd1',
        startingSemesterId: 's1',
        academicSessionId: 'a1',
      });
      request.flush(item('b1', 'Batch 12'), { status: 201, statusText: 'Created' });
      await settle();
    });

    it('keeps the inactive degree an existing batch already uses selectable, marked inactive', async () => {
      await openBatch('b1');
      await respond(lookup('batches/b1'), item('b1', 'Batch 1', { degreeId: 'd2', startingSemesterId: 's1', academicSessionId: 'a1' }));

      const options = Array.from(page.querySelectorAll<HTMLOptionElement>('#degreeId option')).map((o) => o.textContent!.trim());
      expect(options).toEqual(['Select a degree', 'BSc', 'Old degree (inactive)']);
      expect(page.querySelector<HTMLSelectElement>('#degreeId')?.value).toBe('d2');
      // The unused inactive session is not offered.
      expect(Array.from(page.querySelectorAll<HTMLOptionElement>('#academicSessionId option')).map((o) => o.textContent!.trim())).toEqual([
        'Select a academic session',
        '2026',
      ]);
    });

    it('shows a rejected reference against its selector', async () => {
      await openBatch();
      type('#name', 'Batch 12');
      choose('#degreeId', 'd1');
      choose('#startingSemesterId', 's1');
      choose('#academicSessionId', 'a1');

      submit();
      (await writeRequest('POST', 'batches')).flush(
        ...problem(400, 'Invalid', { academicSessionId: ['The selected academic session is inactive. Choose an active academic session.'] }),
      );
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#academicSessionId-error')?.textContent).toContain('inactive');
      expect(page.querySelector('#academicSessionId')?.getAttribute('aria-invalid')).toBe('true');
    });
  });

  describe('a course', () => {
    const course = (id: string, name: string, extra: Partial<ConfigurationItem> = {}) =>
      item(id, name, { code: id.toUpperCase(), creditHours: 3, type: 'Mandatory', degreeId: 'd1', ...extra });

    async function openCourse(id?: string, loaded?: ConfigurationItem): Promise<void> {
      await open('courses', id);
      await respond(lookup('degrees'), list([item('d1', 'EMIT'), item('d2', 'PGDIT')]));
      if (id) {
        await respond(lookup(`courses/${id}`), loaded ?? course(id, 'Loaded'));
        await respond(
          lookup('courses', (r) => r.params.get('degreeId') === (loaded?.degreeId ?? 'd1') && r.params.get('status') === 'active'),
          list([course('c1', 'Basics'), course(id, 'Loaded')]),
        );
      }
    }

    async function pickDegree(degreeId: string, courses: ConfigurationItem[]): Promise<void> {
      choose('#degreeId', degreeId);
      await respond(lookup('courses', (r) => r.params.get('degreeId') === degreeId && r.params.get('status') === 'active'), list(courses));
    }

    function options(selector: string): string[] {
      return Array.from(page.querySelectorAll<HTMLOptionElement>(`${selector} option`)).map((o) => o.textContent!.trim());
    }

    it('requires a code, a type, credit hours, and a degree, and offers only Mandatory and Elective', async () => {
      await openCourse();
      type('#name', 'Algorithms');

      submit();
      await settle();
      fixture.detectChanges();

      for (const field of ['code', 'type', 'creditHours', 'degreeId']) {
        expect(page.querySelector(`#${field}-error`)).not.toBeNull();
      }
      expect(page.querySelector('label[for="code"]')?.textContent?.trim()).toBe('Code');
      expect(options('#type')).toEqual(['Select a type', 'Mandatory', 'Elective']);
      http.expectNone(`${ROOT}/courses`);
    });

    it('offers the active courses of the chosen degree as prerequisites and sends the course with numbers', async () => {
      await openCourse();
      expect(options('#prerequisiteCourseId')).toEqual(['Select a degree first']);
      type('#name', 'Advanced Algorithms');
      type('#code', ' cse-301 ');
      type('#creditHours', '3');
      type('#theoryCreditHours', '2');
      type('#labCreditHours', '1');
      choose('#type', 'Elective');
      await pickDegree('d1', [course('c1', 'Basics')]);
      expect(options('#prerequisiteCourseId')).toEqual(['No prerequisite', 'C1 · Basics']);
      choose('#prerequisiteCourseId', 'c1');

      submit();
      const request = await writeRequest('POST', 'courses');

      expect(request.request.body).toEqual({
        name: 'Advanced Algorithms',
        isActive: true,
        code: 'cse-301',
        type: 'Elective',
        creditHours: 3,
        theoryCreditHours: 2,
        labCreditHours: 1,
        prerequisiteCourseId: 'c1',
        degreeId: 'd1',
      });
      request.flush(course('c9', 'Advanced Algorithms'), { status: 201, statusText: 'Created' });
      await settle();
    });

    it('sends a missing theory or lab part as null and no prerequisite as null', async () => {
      await openCourse();
      type('#name', 'Seminar');
      type('#code', 'SEM-1');
      type('#creditHours', '1.5');
      type('#labCreditHours', '1.5');
      choose('#type', 'Mandatory');
      await pickDegree('d2', []);

      submit();
      const request = await writeRequest('POST', 'courses');

      expect(request.request.body).toMatchObject({ creditHours: 1.5, theoryCreditHours: null, labCreditHours: 1.5, prerequisiteCourseId: null });
      request.flush(course('c9', 'Seminar'), { status: 201, statusText: 'Created' });
      await settle();
    });

    it('rejects a part over the total and parts that do not add up before sending anything', async () => {
      await openCourse();
      type('#name', 'Lab Course');
      type('#code', 'LAB-1');
      type('#creditHours', '3');
      type('#theoryCreditHours', '4');
      choose('#type', 'Mandatory');
      await pickDegree('d1', []);

      submit();
      await settle();
      fixture.detectChanges();
      expect(page.querySelector('#theoryCreditHours-error')?.textContent).toContain('cannot be more than the total');

      type('#theoryCreditHours', '2');
      type('#labCreditHours', '2');
      submit();
      await settle();
      fixture.detectChanges();
      expect(page.querySelector('#labCreditHours-error')?.textContent).toContain('must add up to the total');
      http.expectNone(`${ROOT}/courses`);
    });

    it('never offers a course as its own prerequisite and clears a prerequisite of another degree', async () => {
      await openCourse('c5', course('c5', 'Loaded', { prerequisiteCourseId: 'c1' }));

      expect(options('#prerequisiteCourseId')).toEqual(['No prerequisite', 'C1 · Basics']);
      expect(page.querySelector<HTMLSelectElement>('#prerequisiteCourseId')?.value).toBe('c1');

      await pickDegree('d2', [course('p1', 'Other Degree Course', { degreeId: 'd2' })]);

      expect(page.querySelector<HTMLSelectElement>('#prerequisiteCourseId')?.value).toBe('');
      expect(options('#prerequisiteCourseId')).toEqual(['No prerequisite', 'P1 · Other Degree Course']);
    });

    it('shows a degree change the service refuses against the degree field', async () => {
      await openCourse('c5', course('c5', 'Loaded'));
      await pickDegree('d2', []);

      submit();
      (await writeRequest('PUT', 'courses/c5')).flush(
        ...problem(400, 'Invalid', { degreeId: ['Active courses in the current degree have this course as their prerequisite. Change their prerequisite first.'] }),
      );
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#degreeId-error')?.textContent).toContain('have this course as their prerequisite');
      expect(page.querySelector('#degreeId')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('explains a blocked deactivation and offers no delete for a course', async () => {
      await openCourse('c1', course('c1', 'Basics'));
      expect(page.querySelector('#delete-title')).toBeNull();

      page.querySelector<HTMLInputElement>('#isActive')!.click();
      submit();
      (await writeRequest('PUT', 'courses/c1')).flush(
        ...problem(409, 'Active courses have this course as their prerequisite, so it cannot be deactivated.'),
      );
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('[role=alert]')?.textContent).toContain('cannot be deactivated');
    });

    it('marks credit fields the service rejects', async () => {
      await openCourse();
      type('#name', 'X');
      type('#code', 'X-1');
      type('#creditHours', '3');
      choose('#type', 'Mandatory');
      await pickDegree('d1', []);

      submit();
      (await writeRequest('POST', 'courses')).flush(...problem(400, 'Invalid', { code: ['A course with this code already exists.'] }));
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#code-error')?.textContent).toContain('already exists');
    });
  });

  describe('geography', () => {
    it('asks a district for its division', async () => {
      await open('districts');
      await respond(lookup('geography/divisions'), list([item('v1', 'Dhaka'), item('v2', 'Old', { isActive: false })]));

      expect(Array.from(page.querySelectorAll<HTMLOptionElement>('#divisionId option')).map((o) => o.textContent!.trim())).toEqual([
        'Select a division',
        'Dhaka',
      ]);
      type('#name', 'Gazipur');
      choose('#divisionId', 'v1');
      submit();
      const request = await writeRequest('POST', 'geography/districts');
      expect(request.request.body).toEqual({ name: 'Gazipur', isActive: true, divisionId: 'v1' });
      request.flush(item('g1', 'Gazipur'), { status: 201, statusText: 'Created' });
      await settle();
    });

    it('cascades an upazila: the division narrows the districts and only the district is sent', async () => {
      await open('upazilas');
      await respond(lookup('geography/divisions'), list([item('v1', 'Dhaka'), item('v2', 'Khulna')]));
      expect(page.querySelector<HTMLSelectElement>('#districtId option')?.textContent).toContain('Choose a division first');

      choose('#cascadeDivisionId', 'v1');
      await settle();
      await respond(
        lookup('geography/districts', (r) => r.params.get('divisionId') === 'v1'),
        list([item('g1', 'Gazipur'), item('g2', 'Narayanganj')]),
      );
      expect(Array.from(page.querySelectorAll<HTMLOptionElement>('#districtId option')).map((o) => o.textContent!.trim())).toEqual([
        'Select a district',
        'Gazipur',
        'Narayanganj',
      ]);

      // Changing the division clears a district chosen under the old one.
      choose('#districtId', 'g1');
      choose('#cascadeDivisionId', 'v2');
      await settle();
      await respond(lookup('geography/districts', (r) => r.params.get('divisionId') === 'v2'), list([item('g9', 'Khulna sadar')]));
      expect(page.querySelector<HTMLSelectElement>('#districtId')?.value).toBe('');

      choose('#cascadeDivisionId', 'v1');
      await settle();
      await respond(lookup('geography/districts', (r) => r.params.get('divisionId') === 'v1'), list([item('g1', 'Gazipur')]));
      type('#name', 'Kaliakair');
      choose('#districtId', 'g1');
      submit();
      const request = await writeRequest('POST', 'geography/upazilas');
      expect(request.request.body).toEqual({ name: 'Kaliakair', isActive: true, districtId: 'g1' });
      request.flush(item('u1', 'Kaliakair'), { status: 201, statusText: 'Created' });
      await settle();
    });

    it('requires the division and the district of an upazila', async () => {
      await open('upazilas');
      await respond(lookup('geography/divisions'), list([item('v1', 'Dhaka')]));
      type('#name', 'Sadar');

      submit();
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#cascadeDivisionId-error')).not.toBeNull();
      expect(page.querySelector('#districtId-error')).not.toBeNull();
    });
  });

  it('says so when the resource does not exist', async () => {
    await open('no-such-resource');

    expect(page.querySelector('[role=alert]')?.textContent).toContain('no such configuration resource');
  });
});
