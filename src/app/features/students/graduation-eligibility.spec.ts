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
});
