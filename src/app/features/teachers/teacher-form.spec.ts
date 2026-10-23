import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { STUB_ROUTES, TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { ConfigurationItem } from '../configuration/configuration.models';
import { Teacher } from './teacher.models';
import { TeacherForm } from './teacher-form';
import { chooseOption, optionLabels, selectedValue } from '../../../testing/select-testing';

@Component({ template: '' })
class Destination {}

const ROOT = '/api/admin/teachers';
const DESIGNATIONS = '/api/admin/configuration/designations';

function designation(id: string, name: string, isActive = true): ConfigurationItem {
  return { id, name, isActive, createdAtUtc: '2026-10-09T08:30:00Z', lastModifiedAtUtc: '2026-10-09T08:30:00Z' };
}

function teacher(extra: Partial<Teacher> = {}): Teacher {
  return {
    id: 't1',
    userId: 'u1',
    email: 'ada@iit.test',
    displayName: 'Ada Lovelace',
    employeeStaffId: 'EMP-1',
    phone: '0123',
    designationId: 'd1',
    designationName: 'Lecturer',
    isActive: true,
    accountStatus: 'Active',
    roles: ['Teacher'],
    defaultRole: 'Teacher',
    createdAtUtc: '2026-10-14T08:30:00Z',
    createdByUserId: 'admin-1',
    createdBy: 'admin@iit.test',
    lastModifiedAtUtc: '2026-10-14T09:00:00Z',
    ...extra,
  };
}

describe('TeacherForm', () => {
  let fixture: ComponentFixture<TeacherForm>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(id?: string, loaded?: Teacher): Promise<void> {
    TestBed.configureTestingModule({
      imports: [TeacherForm],
      providers: provideAuthTesting([...STUB_ROUTES, { path: 'admin/teachers', component: Destination }]),
    });
    http = httpMock();
    fixture = TestBed.createComponent(TeacherForm);
    if (id) {
      fixture.componentRef.setInput('id', id);
    }
    page = fixture.nativeElement;
    await fixture.whenStable();

    http
      .expectOne((r) => r.method === 'GET' && r.url === DESIGNATIONS)
      .flush({ items: [designation('d1', 'Lecturer'), designation('d2', 'Professor'), designation('d3', 'Retired', false)], nextCursor: null });
    if (id) {
      http.expectOne({ method: 'GET', url: `${ROOT}/${id}` }).flush(loaded ?? teacher());
    }
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function type(selector: string, value: string): void {
    const control = page.querySelector<HTMLInputElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }

  function choose(selector: string, value: string): void {
    chooseOption(page, selector, value);
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  function submitProfile(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  /** The pending write; the anti-forgery token is answered only when it has not already been fetched. */
  async function writeRequest(method: string, path: string): Promise<TestRequest> {
    await settle();
    const tokens = http.match('/api/auth/anti-forgery-token');
    if (tokens.length > 0) {
      tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
      await settle();
    }
    return http.expectOne({ method, url: `${ROOT}${path}` });
  }

  async function respond(request: TestRequest, body: object): Promise<void> {
    request.flush(body);
    await settle();
    fixture.detectChanges();
  }

  describe('adding a teacher', () => {
    it('says no password is set, offers active designations only, and requires name and email before sending anything', async () => {
      await open();

      expect(page.textContent).toContain('No password is set');
      expect(optionLabels(page, '#designationId')).toEqual([
        'No designation',
        'Lecturer',
        'Professor',
      ]);
      expect(page.querySelector('#role-admin')).toBeNull();

      submitProfile();
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#displayName-error')?.textContent).toContain('Enter the name');
      expect(page.querySelector('#email-error')?.textContent).toContain('Enter the email');
      expect(page.querySelector('#displayName')?.getAttribute('aria-invalid')).toBe('true');
      http.expectNone(ROOT);
    });

    it('creates the teacher with trimmed values and returns to the directory with a pending-account notice', async () => {
      await open();
      type('#displayName', '  Ada Lovelace ');
      type('#email', ' ada@iit.test ');
      type('#employeeStaffId', ' EMP-1 ');
      choose('#designationId', 'd2');

      submitProfile();
      const request = await writeRequest('POST', '');
      expect(request.request.body).toEqual({
        displayName: 'Ada Lovelace',
        email: 'ada@iit.test',
        employeeStaffId: 'EMP-1',
        phone: '',
        designationId: 'd2',
      });
      request.flush(teacher({ accountStatus: 'PendingCredentialSetup' }), { status: 201, statusText: 'Created' });
      await settle();

      expect(TestBed.inject(Router).url).toBe('/admin/teachers');
    });

    it('shows the service field errors against the fields and keeps what was typed', async () => {
      await open();
      type('#displayName', 'Ada');
      type('#email', 'taken@iit.test');
      type('#employeeStaffId', 'EMP-1');

      submitProfile();
      (await writeRequest('POST', '')).flush(
        ...problem(400, 'Invalid', {
          email: ['An account with this email already exists.'],
          employeeStaffId: ['Another teacher already has this staff ID.'],
        }),
      );
      await settle();
      fixture.detectChanges();

      expect(page.querySelector('#email-error')?.textContent).toContain('already exists');
      expect(page.querySelector('#employeeStaffId-error')?.textContent).toContain('staff ID');
      expect(page.querySelector('[role=alert]')?.textContent).toContain('Some fields need attention');
      expect(page.querySelector<HTMLInputElement>('#email')?.value).toBe('taken@iit.test');
      expect(TestBed.inject(Router).url).not.toContain('/admin/teachers');
    });
  });

  describe('editing a teacher', () => {
    it('loads the teacher, shows the record history, and saves changes without leaving the page', async () => {
      await open('t1');

      expect(page.querySelector<HTMLInputElement>('#displayName')?.value).toBe('Ada Lovelace');
      expect(selectedValue(page, '#designationId')).toBe('d1');
      expect(page.textContent).toContain('Record history');
      expect(page.textContent).toContain('admin@iit.test');

      type('#displayName', 'Ada King');
      submitProfile();
      const request = await writeRequest('PUT', '/t1');
      expect(request.request.body).toEqual({
        displayName: 'Ada King',
        email: 'ada@iit.test',
        employeeStaffId: 'EMP-1',
        phone: '0123',
        designationId: 'd1',
      });
      await respond(request, teacher({ displayName: 'Ada King' }));

      expect(page.textContent).toContain('The details of Ada King were saved.');
      expect(page.querySelector<HTMLInputElement>('#displayName')?.value).toBe('Ada King');
    });

    it('keeps a deactivated designation selectable for the teacher who already has it', async () => {
      await open('t1', teacher({ designationId: 'd3', designationName: 'Retired' }));

      const options = optionLabels(page, '#designationId');
      expect(options).toContain('Retired (inactive)');
      expect(selectedValue(page, '#designationId')).toBe('d3');
    });

    it('explains a pending account', async () => {
      await open('t1', teacher({ accountStatus: 'PendingCredentialSetup' }));

      expect(page.textContent).toContain('Pending setup');
      expect(page.textContent).toContain('cannot sign in until the teacher opens the setup email');
      expect(page.querySelector('a[href="/admin/users/u1"]')?.textContent).toContain('open this account in Accounts');
    });

    it('shows a not-found teacher without a form', async () => {
      TestBed.configureTestingModule({ imports: [TeacherForm], providers: provideAuthTesting() });
      http = httpMock();
      fixture = TestBed.createComponent(TeacherForm);
      fixture.componentRef.setInput('id', 'missing');
      page = fixture.nativeElement;
      await fixture.whenStable();
      http.expectOne((r) => r.url === DESIGNATIONS).flush({ items: [], nextCursor: null });
      http.expectOne(`${ROOT}/missing`).flush(...problem(404, 'No teacher has that identifier.'));
      await settle();
      fixture.detectChanges();

      expect(page.textContent).toContain('This teacher was not found');
      expect(page.querySelector('form')).toBeNull();
    });
  });

  describe('roles', () => {
    it('keeps Teacher required, offers the default role among assigned roles, and sends Teacher plus Admin', async () => {
      await open('t1');
      const teacherBox = page.querySelector<HTMLInputElement>('#role-teacher')!;
      expect(teacherBox.checked).toBe(true);
      expect(teacherBox.disabled).toBe(true);
      expect(optionLabels(page, '#defaultRole')).toEqual(['Teacher']);

      const admin = page.querySelector<HTMLInputElement>('#role-admin')!;
      admin.checked = true;
      admin.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(optionLabels(page, '#defaultRole')).toEqual(['Admin', 'Teacher']);
      choose('#defaultRole', 'Admin');

      page.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
      const request = await writeRequest('PUT', '/t1/roles');
      expect(request.request.body).toEqual({ roles: ['Teacher', 'Admin'], defaultRole: 'Admin' });
      await respond(request, teacher({ roles: ['Admin', 'Teacher'], defaultRole: 'Admin' }));

      expect(page.textContent).toContain('The roles of Ada Lovelace were saved.');
      expect(page.querySelector<HTMLInputElement>('#role-admin')?.checked).toBe(true);
    });

    it('shows Coordinator as read-only text and never offers to assign Student', async () => {
      await open('t1', teacher({ roles: ['Teacher', 'Coordinator'] }));

      expect(page.textContent).toContain('Coordinator is also assigned');
      expect(page.querySelector('#role-coordinator')).toBeNull();
      expect(page.querySelector('#role-student')).toBeNull();
      expect(optionLabels(page, '#defaultRole')).toEqual(['Teacher', 'Coordinator']);
    });

    it('shows the last-Admin conflict from the service and keeps the form as it was', async () => {
      await open('t1', teacher({ roles: ['Admin', 'Teacher'] }));
      const admin = page.querySelector<HTMLInputElement>('#role-admin')!;
      admin.checked = false;
      admin.dispatchEvent(new Event('change'));

      page.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
      (await writeRequest('PUT', '/t1/roles')).flush(...problem(409, 'This is the last active Admin account, so it cannot lose the Admin role.'));
      await settle();
      fixture.detectChanges();

      expect(page.textContent).toContain('last active Admin');
      expect(page.querySelector('[role=alert]')?.textContent).toContain('Roles not saved');
    });

    it('does not offer role changes for a deactivated teacher', async () => {
      await open('t1', teacher({ accountStatus: 'Deactivated', isActive: false }));

      expect(page.textContent).toContain('cannot be changed');
      expect(page.querySelector('#role-admin')).toBeNull();
    });
  });

  describe('deactivation', () => {
    it('asks for confirmation, then deactivates and shows the deactivated state', async () => {
      await open('t1');
      expect(page.textContent).toContain('cannot be deleted');
      expect(page.textContent).not.toContain('Delete teacher');

      button('Deactivate teacher').click();
      fixture.detectChanges();
      expect(page.textContent).toContain('Deactivate Ada Lovelace?');
      http.expectNone(`${ROOT}/t1/deactivation`);

      button('Yes, deactivate').click();
      const request = await writeRequest('POST', '/t1/deactivation');
      await respond(request, teacher({ accountStatus: 'Deactivated', isActive: false }));

      expect(page.textContent).toContain('was deactivated');
      expect(page.textContent).toContain('This teacher is deactivated');
      expect(page.textContent).not.toContain('Deactivate teacher…');
    });

    it('can be cancelled without sending anything', async () => {
      await open('t1');
      button('Deactivate teacher').click();
      fixture.detectChanges();

      button('Cancel').click();
      fixture.detectChanges();

      expect(page.textContent).not.toContain('Deactivate Ada Lovelace?');
      http.expectNone(`${ROOT}/t1/deactivation`);
    });

    it('shows why the last active Admin cannot be deactivated and leaves the teacher active', async () => {
      await open('t1', teacher({ roles: ['Admin', 'Teacher'] }));
      button('Deactivate teacher').click();
      fixture.detectChanges();

      button('Yes, deactivate').click();
      (await writeRequest('POST', '/t1/deactivation')).flush(
        ...problem(409, 'This is the last active Admin account, so it cannot be deactivated or lose the Admin role.'),
      );
      await settle();
      fixture.detectChanges();

      expect(page.textContent).toContain('last active Admin');
      expect(page.textContent).not.toContain('This teacher is deactivated');
    });
  });
});
