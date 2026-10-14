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

      submit();
      const request = await writeRequest('POST', 'degrees');
      expect(request.request.body).toEqual({ name: 'Bachelor of IT', isActive: true, code: 'bit' });
      request.flush(item('1', 'Bachelor of IT', { code: 'bit' }), { status: 201, statusText: 'Created' });
      await settle();

      expect(TestBed.inject(Router).url).toBe('/admin/configuration/degrees');
    });

    it('shows the service field errors against the field and keeps what was typed', async () => {
      await open('degrees');
      await settle();
      fixture.detectChanges();
      type('#name', 'Duplicate');
      type('#code', 'D1');

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
      await respond(lookup('degrees/d1'), item('d1', 'BSc', { code: 'B' }));

      expect(page.querySelector('h1')?.textContent).toContain('Edit degree');
      expect(page.querySelector<HTMLInputElement>('#name')?.value).toBe('BSc');
      expect(page.querySelector<HTMLInputElement>('#code')?.value).toBe('B');

      type('#name', 'BSc in IT');
      submit();
      const request = await writeRequest('PUT', 'degrees/d1');
      expect(request.request.body).toEqual({ name: 'BSc in IT', isActive: true, code: 'B' });
      request.flush(item('d1', 'BSc in IT'));
      await settle();
    });

    it('deactivates by turning Active off and explains an inactive record', async () => {
      await open('degrees', 'd1');
      await respond(lookup('degrees/d1'), item('d1', 'BSc', { isActive: false }));
      expect(page.textContent).toContain('This degree is inactive');

      const active = page.querySelector<HTMLInputElement>('#isActive')!;
      expect(active.checked).toBe(false);
      active.click();
      submit();
      const request = await writeRequest('PUT', 'degrees/d1');
      expect(request.request.body.isActive).toBe(true);
      request.flush(item('d1', 'BSc'));
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
      await respond(lookup('degrees/d1'), item('d1', 'BSc', extra));
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
