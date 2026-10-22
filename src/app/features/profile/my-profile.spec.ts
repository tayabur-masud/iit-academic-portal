import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { AuthSession } from '../../core/auth/auth-session';
import { Role } from '../../core/auth/auth.models';
import { httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { MyProfile } from './my-profile';
import { MyProfileView, MyStudentProfile } from './my-profile.models';

const URL = '/api/profile';

function student(extra: Partial<MyStudentProfile> = {}): MyStudentProfile {
  return {
    kind: 'student',
    applicantName: 'Ayesha Rahman',
    fatherName: 'Abdur Rahman',
    motherName: 'Salma Begum',
    dateOfBirth: '1998-04-12',
    placeOfBirth: 'Dhaka',
    maritalStatus: 'Single',
    nationality: 'Bangladeshi',
    applicantMobile: '+8801711000000',
    mailingAddress: {
      details: 'House 12, Road 5',
      cellNumber: '01811000000',
      upazilaName: 'Kaliakair',
      cityCorporationName: null,
      districtName: 'Gazipur',
      divisionName: 'Dhaka',
    },
    permanentAddress: {
      details: 'Holding 7, Tongi',
      cellNumber: null,
      upazilaName: null,
      cityCorporationName: 'Gazipur City Corporation',
      districtName: 'Gazipur',
      divisionName: 'Dhaka',
    },
    guardianName: 'Abdul Karim',
    guardianRelationship: 'Uncle',
    guardianAddress: 'Mirpur 10, Dhaka',
    guardianCellNumber: '01911000000',
    academicHistory: [
      {
        category: 'SscOLevel',
        examination: 'SSC',
        schoolOrCollege: 'Motijheel Model High School',
        board: 'Dhaka',
        group: 'Science',
        department: null,
        university: null,
        subject: null,
        institution: null,
        year: '2013',
        marksObtained: null,
        marksPercentage: null,
        cgpa: '5.00',
        class: null,
        division: null,
      },
      {
        category: 'BachelorGraduation',
        examination: null,
        schoolOrCollege: null,
        board: null,
        group: null,
        department: null,
        university: 'University of Dhaka',
        subject: 'CSE',
        institution: null,
        year: '2019',
        marksObtained: null,
        marksPercentage: null,
        cgpa: '3.70',
        class: 'First',
        division: null,
      },
      {
        category: 'Other',
        examination: 'Professional qualification',
        schoolOrCollege: 'College North',
        board: null,
        group: null,
        department: null,
        university: 'University Central',
        subject: null,
        institution: 'Training Center South',
        year: '2022',
        marksObtained: null,
        marksPercentage: null,
        cgpa: null,
        class: null,
        division: null,
      },
    ],
    ...extra,
  };
}

describe('MyProfile', () => {
  let fixture: ComponentFixture<MyProfile>;
  let http: HttpTestingController;
  let page: HTMLElement;
  let activeRole: ReturnType<typeof signal<Role | null>>;

  async function open(role: Role): Promise<void> {
    activeRole = signal<Role | null>(role);
    TestBed.configureTestingModule({
      imports: [MyProfile],
      providers: [...provideAuthTesting(), { provide: AuthSession, useValue: { activeRole } }],
    });
    http = httpMock();
    fixture = TestBed.createComponent(MyProfile);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function answer(view: MyProfileView): Promise<void> {
    http.expectOne({ method: 'GET', url: URL }).flush(view);
    await settle();
    await fixture.whenStable();
  }

  /** The label/value pairs of every description list on the page, as "Label: value"; a value's lines are joined by a space. */
  function facts(): string[] {
    const text = (element: Element | null): string => {
      const lines = element?.children.length
        ? Array.from(element.children).map((child) => child.textContent)
        : [element?.textContent];
      return lines.join(' ').replace(/\s+/g, ' ').trim();
    };
    return Array.from(page.querySelectorAll('dt')).map(
      (dt) => `${dt.textContent?.trim()}: ${text(dt.nextElementSibling)}`,
    );
  }

  afterEach(() => http.verify());

  it('shows a loading state, then the Admin staff profile with the account email and active role', async () => {
    await open('Admin');
    expect(page.querySelector('[role=status]')?.textContent).toContain('Loading your profile');
    expect(page.querySelector('h1')?.textContent).toContain('My Profile');

    await answer({
      email: 'registrar@iit.test',
      activeRole: 'Admin',
      profile: {
        kind: 'staff',
        name: 'Farhana Akter',
        mobileNumber: '01711000000',
        designationName: 'Assistant Registrar',
      },
    });

    expect(facts()).toEqual([
      'Email address: registrar@iit.test',
      'Active role: Admin',
      'Name: Farhana Akter',
      'Mobile number: 01711000000',
      'Designation: Assistant Registrar',
    ]);
    expect(page.querySelector('#profile-title')?.textContent).toContain('Staff profile');
  });

  it('is view-only: no form, input, save, edit, or deactivation control', async () => {
    await open('Teacher');
    await answer({
      email: 'teacher@iit.test',
      activeRole: 'Teacher',
      profile: {
        kind: 'teacher',
        displayName: 'Dr Rezvi Shahariar',
        employeeStaffId: 'T-042',
        phone: '01556408903',
        designationName: 'Professor',
      },
    });

    expect(page.querySelector('form, input, select, textarea')).toBeNull();
    const actions = Array.from(page.querySelectorAll('button, a')).map(
      (e) => e.textContent?.trim() ?? '',
    );
    expect(
      actions.filter((text) => /save|edit|change|deactivate|update|delete/i.test(text)),
    ).toEqual([]);
  });

  it('shows the teacher profile for a Coordinator, says why, and marks unset optional values as not recorded', async () => {
    await open('Coordinator');
    await answer({
      email: 'coordinator@iit.test',
      activeRole: 'Coordinator',
      profile: {
        kind: 'teacher',
        displayName: 'Dr Rezvi Shahariar',
        employeeStaffId: null,
        phone: null,
        designationName: null,
      },
    });

    expect(page.querySelector('#profile-title')?.textContent).toContain('Teacher profile');
    expect(page.textContent).toContain('As a Coordinator, your teacher profile is your profile.');
    expect(facts()).toContain('Name: Dr Rezvi Shahariar');
    expect(facts()).toContain('Staff ID: Not recorded');
    expect(facts()).toContain('Phone: Not recorded');
    expect(facts()).toContain('Designation: Not recorded');
    expect(page.textContent).not.toMatch(/coordinator profile/i);
  });

  it('shows every Student personal detail, both addresses with locality names, the guardian, and prior education in order', async () => {
    await open('Student');
    await answer({ email: 'ayesha@example.test', activeRole: 'Student', profile: student() });

    expect(facts()).toEqual(
      expect.arrayContaining([
        'Name: Ayesha Rahman',
        'Mobile number: +8801711000000',
        "Father's name: Abdur Rahman",
        "Mother's name: Salma Begum",
        'Date of birth: 12 April 1998',
        'Place of birth: Dhaka',
        'Marital status: Single',
        'Nationality: Bangladeshi',
        'Mailing address: House 12, Road 5, Kaliakair, Gazipur, Dhaka Cell 01811000000',
        'Permanent address: Holding 7, Tongi, Gazipur City Corporation, Gazipur, Dhaka',
        'Relationship: Uncle',
        'Address: Mirpur 10, Dhaka',
        'Cell number: 01911000000',
      ]),
    );
    expect(page.querySelector('time')?.getAttribute('datetime')).toBe('1998-04-12');
    const rows = Array.from(page.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.children).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim()),
    );
    expect(rows).toEqual([
      ['SSC / O-Level SSC', 'Motijheel Model High School', 'Dhaka', 'Science', '2013', 'CGPA 5.00'],
      ['Bachelor / Graduation', 'University of Dhaka', '', 'CSE', '2019', 'CGPA 3.70, Class First'],
      [
        'Other Professional qualification',
        'College North, University Central, Training Center South',
        '',
        '',
        '2022',
        '',
      ],
    ]);
    expect(page.querySelector('table caption')?.textContent).toContain('Academic history');
  });

  it('shows absent Student details as not recorded without inventing values', async () => {
    await open('Student');
    await answer({
      email: 'rafiq@example.test',
      activeRole: 'Student',
      profile: student({
        fatherName: null,
        dateOfBirth: null,
        mailingAddress: null,
        permanentAddress: null,
        guardianName: null,
        guardianRelationship: null,
        guardianAddress: null,
        guardianCellNumber: null,
        academicHistory: [],
      }),
    });

    expect(facts()).toEqual(
      expect.arrayContaining([
        "Father's name: Not recorded",
        'Date of birth: Not recorded',
        'Mailing address: Not recorded',
        'Permanent address: Not recorded',
      ]),
    );
    expect(page.textContent).toContain('No guardian or emergency contact is recorded.');
    expect(page.textContent).toContain('No academic history is recorded.');
    expect(page.querySelector('table')).toBeNull();
  });

  it('explains a missing profile for the active role without showing any other profile', async () => {
    await open('Admin');
    await answer({ email: 'admin@iit.test', activeRole: 'Admin', profile: null });

    const empty = page.querySelector('.empty-state')!;
    expect(empty.textContent).toContain('No staff profile yet');
    expect(empty.textContent).toContain('for the Admin role');
    expect(facts()).toEqual(['Email address: admin@iit.test', 'Active role: Admin']);
  });

  it('reloads for the new active role after a role switch and never shows the previous role in the meantime', async () => {
    await open('Admin');
    await answer({
      email: 'both@iit.test',
      activeRole: 'Admin',
      profile: {
        kind: 'staff',
        name: 'Staff Name',
        mobileNumber: '01711000001',
        designationName: 'Lecturer',
      },
    });

    activeRole.set('Teacher');
    await fixture.whenStable();
    expect(page.textContent).not.toContain('Staff Name');
    expect(page.querySelector('[role=status]')?.textContent).toContain('Loading your profile');

    await answer({
      email: 'both@iit.test',
      activeRole: 'Teacher',
      profile: {
        kind: 'teacher',
        displayName: 'Teacher Name',
        employeeStaffId: null,
        phone: null,
        designationName: 'Lecturer',
      },
    });
    expect(page.querySelector('#profile-title')?.textContent).toContain('Teacher profile');
    expect(facts()).toContain('Name: Teacher Name');
  });

  it('keeps only the newest response when an earlier request answers late', async () => {
    await open('Admin');
    const first = http.expectOne(URL);
    activeRole.set('Teacher');
    await fixture.whenStable();
    const second = http.match(URL).at(-1)!;

    second.flush({ email: 'both@iit.test', activeRole: 'Teacher', profile: null });
    first.flush({
      email: 'both@iit.test',
      activeRole: 'Admin',
      profile: { kind: 'staff', name: 'Stale', mobileNumber: '1', designationName: null },
    });
    await settle();
    await fixture.whenStable();

    expect(page.textContent).not.toContain('Stale');
    expect(facts()).toContain('Active role: Teacher');
  });

  it('shows a recoverable error without any profile details, and Try again loads it', async () => {
    await open('Teacher');
    http.expectOne(URL).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await settle();
    await fixture.whenStable();

    const alert = page.querySelector('[role=alert]')!;
    expect(alert.textContent).toContain('Profile not shown');
    expect(page.querySelector('dl')).toBeNull();

    Array.from(alert.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Try again'))!
      .click();
    await answer({
      email: 'teacher@iit.test',
      activeRole: 'Teacher',
      profile: {
        kind: 'teacher',
        displayName: 'Dr Rezvi Shahariar',
        employeeStaffId: null,
        phone: null,
        designationName: null,
      },
    });
    expect(page.querySelector('[role=alert]')).toBeNull();
    expect(facts()).toContain('Name: Dr Rezvi Shahariar');
  });

  it("shows the service's reason when the session has no supported role", async () => {
    await open('Student');
    http
      .expectOne(URL)
      .flush(problem(403, 'Choose a portal role to see your profile.'), {
        status: 403,
        statusText: 'Forbidden',
      });
    await settle();
    await fixture.whenStable();

    expect(page.querySelector('[role=alert]')?.textContent).toContain(
      'Choose a portal role to see your profile.',
    );
  });

  it('sends no account identifier or role with the request', async () => {
    await open('Admin');
    const call = http.expectOne(URL);

    expect(call.request.method).toBe('GET');
    expect(call.request.params.keys()).toEqual([]);
    expect(call.request.urlWithParams).toBe(URL);
    expect(call.request.body).toBeNull();
    call.flush({ email: 'a@iit.test', activeRole: 'Admin', profile: null });
  });
});
