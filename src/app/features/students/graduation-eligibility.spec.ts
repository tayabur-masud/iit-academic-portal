import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { GraduationEligibility as Eligibility } from './student.models';
import { GraduationEligibility } from './graduation-eligibility';

const URL = '/api/admin/students/a1/graduation-eligibility';

describe('GraduationEligibility', () => {
  let fixture: ComponentFixture<GraduationEligibility>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(result: Eligibility | readonly [object, object]): Promise<void> {
    TestBed.configureTestingModule({ imports: [GraduationEligibility], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(GraduationEligibility);
    fixture.componentRef.setInput('admissionId', 'a1');
    page = fixture.nativeElement;
    await fixture.whenStable();
    const request = http.expectOne(URL);
    if (Array.isArray(result)) {
      request.flush(...(result as [object, { status: number; statusText: string }]));
    } else {
      request.flush(result);
    }
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function rows(): string[] {
    return Array.from(page.querySelectorAll('li')).map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
  }

  it('shows an eligible admission with its credits and every requirement met, and offers no clearance action', async () => {
    await open({
      admissionId: 'a1',
      eligible: true,
      requiredCredits: 36,
      completedCredits: 36,
      requirements: [
        { requirement: 'Credits', status: 'Met', message: '36 of 36 required credits completed.' },
        { requirement: 'AssignedHall', status: 'Met', message: 'A hall is assigned.' },
        { requirement: 'RegistrationNumber', status: 'Met', message: 'A registration number is recorded.' },
      ],
    });

    expect(page.querySelector('.alert-success')?.textContent).toContain('Eligible to graduate');
    expect(page.textContent).toContain('36');
    expect(rows()).toHaveLength(3);
    expect(page.querySelector('button')).toBeNull();
    expect(page.textContent).toContain('never blocks');
  });

  it('names each unmet requirement of an ineligible admission', async () => {
    await open({
      admissionId: 'a1',
      eligible: false,
      requiredCredits: 36,
      completedCredits: 30,
      requirements: [
        { requirement: 'Credits', status: 'NotMet', message: '30 of 36 required credits completed; 6 still needed.' },
        { requirement: 'AssignedHall', status: 'NotMet', message: 'No hall is assigned.' },
        { requirement: 'RegistrationNumber', status: 'Met', message: 'A registration number is recorded.' },
      ],
    });

    expect(page.querySelector('.alert-warning')?.textContent).toContain('Not eligible yet');
    expect(rows()[0]).toMatch(/Not met Credits:\s*30 of 36 required credits completed; 6 still needed/);
    expect(rows()[1]).toMatch(/Not met Assigned hall:\s*No hall is assigned/);
    expect(rows()[2]).toContain('Met Registration number');
  });

  it('says when completed credits are unavailable and never shows that as eligible', async () => {
    await open({
      admissionId: 'a1',
      eligible: false,
      requiredCredits: 36,
      requirements: [
        { requirement: 'Credits', status: 'Unavailable', message: 'Passed-course results are not available in the portal yet.' },
        { requirement: 'AssignedHall', status: 'Met', message: 'A hall is assigned.' },
        { requirement: 'RegistrationNumber', status: 'Met', message: 'A registration number is recorded.' },
      ],
    });

    expect(page.querySelector('.alert-success')).toBeNull();
    expect(page.textContent).toContain('not available');
    expect(rows()[0]).toMatch(/Unavailable Credits:\s*Passed-course results are not available/);
  });

  it('shows a failed check with a retry', async () => {
    await open(problem(500, 'boom'));

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Eligibility not shown');
    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again'))!.click();
    http.expectOne(URL).flush({ admissionId: 'a1', eligible: false, requirements: [] });
    await settle();
    fixture.detectChanges();
    expect(page.querySelector('[role=alert]')).toBeNull();
  });

  function cgpaResult(current: number | undefined, status: 'Met' | 'NotMet' | 'Unavailable', message: string): Eligibility {
    return {
      admissionId: 'a1',
      eligible: status === 'Met',
      requiredCredits: 36,
      completedCredits: 36,
      minimumCgpa: 2.5,
      ...(current !== undefined ? { currentCumulativeCgpa: current } : {}),
      requirements: [
        { requirement: 'Credits', status: 'Met', message: '36 of 36 required credits completed.' },
        { requirement: 'MinimumCgpa', status, message },
        { requirement: 'AssignedHall', status: 'Met', message: 'A hall is assigned.' },
        { requirement: 'RegistrationNumber', status: 'Met', message: 'A registration number is recorded.' },
      ],
    };
  }

  it('shows the current cumulative CGPA against the degree minimum and names a CGPA below it', async () => {
    await open(cgpaResult(2.49, 'NotMet', 'Current cumulative CGPA 2.49 is below the minimum 2.50.'));

    expect(page.textContent).toMatch(/CGPA:\s*2\.49\s*current cumulative, against a minimum of\s*2\.50/);
    expect(page.querySelector('.alert-warning')?.textContent).toContain('Not eligible yet');
    expect(rows()[1]).toMatch(/Not met Minimum CGPA:\s*Current cumulative CGPA 2\.49 is below the minimum 2\.50/);
  });

  it('shows a CGPA equal to the minimum as met', async () => {
    await open(cgpaResult(2.5, 'Met', 'Current cumulative CGPA 2.50 meets the minimum 2.50.'));

    expect(page.textContent).toMatch(/CGPA:\s*2\.50\s*current cumulative/);
    expect(page.querySelector('.alert-success')?.textContent).toContain('Eligible to graduate');
    expect(rows()[1]).toContain('Met Minimum CGPA');
  });

  it('shows a CGPA above the minimum as met', async () => {
    await open(cgpaResult(3.8, 'Met', 'Current cumulative CGPA 3.80 meets the minimum 2.50.'));

    expect(page.textContent).toMatch(/CGPA:\s*3\.80/);
    expect(rows()[1]).toContain('Met Minimum CGPA');
  });

  it('says separately when the CGPA or the credits are unavailable', async () => {
    await open({
      admissionId: 'a1',
      eligible: false,
      requiredCredits: 36,
      currentCumulativeCgpa: 3.1,
      minimumCgpa: 2.5,
      requirements: [
        { requirement: 'Credits', status: 'Unavailable', message: 'Passed-course results are not available in the portal yet.' },
        { requirement: 'MinimumCgpa', status: 'Met', message: 'Current cumulative CGPA 3.10 meets the minimum 2.50.' },
        { requirement: 'AssignedHall', status: 'Met', message: 'A hall is assigned.' },
        { requirement: 'RegistrationNumber', status: 'Met', message: 'A registration number is recorded.' },
      ],
    });
    expect(page.textContent).toMatch(/Credits:\s*not available\s*completed/);
    expect(page.textContent).toMatch(/CGPA:\s*3\.10/);
    expect(rows()[0]).toMatch(/Unavailable Credits/);
    expect(rows()[1]).toContain('Met Minimum CGPA');
    TestBed.resetTestingModule();

    await open(cgpaResult(undefined, 'Unavailable', 'The current cumulative CGPA from published results is not available in the portal yet.'));
    expect(page.textContent).toMatch(/CGPA:\s*not available\s*current cumulative, against a minimum of\s*2\.50/);
    expect(rows()[0]).toContain('Met Credits');
    expect(rows()[1]).toMatch(/Unavailable Minimum CGPA:\s*The current cumulative CGPA from published results is not available/);
    expect(page.querySelector('.alert-success')).toBeNull();
  });

  it('checks again after the admission is saved, showing the newly published CGPA', async () => {
    await open(cgpaResult(2.4, 'NotMet', 'Current cumulative CGPA 2.40 is below the minimum 2.50.'));

    fixture.componentRef.setInput('version', '2026-10-21T10:00:00Z');
    fixture.detectChanges();
    await settle();
    http.expectOne(URL).flush(cgpaResult(2.6, 'Met', 'Current cumulative CGPA 2.60 meets the minimum 2.50.'));
    await settle();
    fixture.detectChanges();

    expect(page.textContent).toMatch(/CGPA:\s*2\.60/);
    expect(page.querySelector('.alert-success')?.textContent).toContain('Eligible to graduate');
    expect(page.querySelector('input, select, textarea')).toBeNull();
  });
});
