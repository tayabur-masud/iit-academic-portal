import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { TEST_CSRF_TOKEN, httpMock, problem, provideAuthTesting, settle } from '../../../../testing/auth-testing';
import { GradeBand } from '../configuration.models';
import { GradeScaleEditor } from './grade-scale-editor';

const ROOT = '/api/admin/configuration';

const INITIAL: [string, number, number, number, string][] = [
  ['A+', 80, 100, 4, 'Excellent'],
  ['A', 75, 80, 3.75, 'Better'],
  ['A-', 70, 75, 3.5, 'Good'],
  ['B+', 65, 70, 3.25, 'Above Average'],
  ['B', 60, 65, 3, 'Average'],
  ['B-', 55, 60, 2.75, 'Below Average'],
  ['C+', 50, 55, 2.5, 'Satisfactory'],
  ['C', 45, 50, 2.25, 'Not satisfactory'],
  ['D', 40, 45, 2, 'Pass'],
  ['F', 0, 40, 0, 'Fail'],
];

function band(i: number, extra: Partial<GradeBand> = {}): GradeBand {
  const [letterGrade, marksLowerBound, marksUpperBound, numericGrade, comment] = INITIAL[i];
  return {
    id: `g${i}`,
    letterGrade,
    marksLowerBound,
    marksUpperBound,
    upperBoundInclusive: marksUpperBound === 100,
    numericGrade,
    comment,
    isActive: true,
    createdAtUtc: '2026-10-20T08:00:00Z',
    lastModifiedAtUtc: '2026-10-20T08:00:00Z',
    ...extra,
  };
}

const scale = () => INITIAL.map((_, i) => band(i));

describe('GradeScaleEditor', () => {
  let fixture: ComponentFixture<GradeScaleEditor>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(): Promise<void> {
    TestBed.configureTestingModule({ imports: [GradeScaleEditor], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(GradeScaleEditor);
    page = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function listRequest(): TestRequest {
    return http.expectOne((r) => r.method === 'GET' && r.url === `${ROOT}/grades` && r.params.get('status') === 'all');
  }

  async function respond(request: TestRequest, items: GradeBand[]): Promise<void> {
    request.flush({ items, nextCursor: null });
    await settle();
    fixture.detectChanges();
  }

  async function openWith(items: GradeBand[] = scale()): Promise<void> {
    await open();
    await respond(listRequest(), items);
  }

  function input(row: number, field: string): HTMLInputElement {
    return page.querySelector<HTMLInputElement>(`#band-${row}-${field}`)!;
  }

  function type(row: number, field: string, value: string): void {
    const control = input(row, field);
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(page.querySelectorAll<HTMLTableRowElement>('tbody tr'));
  }

  async function save(): Promise<void> {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    fixture.detectChanges();
  }

  async function writeRequest(): Promise<TestRequest> {
    await settle();
    const tokens = http.match('/api/auth/anti-forgery-token');
    if (tokens.length > 0) {
      tokens[0].flush({ requestToken: TEST_CSRF_TOKEN });
      await settle();
    }
    return http.expectOne({ method: 'PUT', url: `${ROOT}/grades/scale` });
  }

  it('shows a loading state, then every band highest first with its bounds, grade, comment, and status', async () => {
    await open();
    expect(page.textContent).toContain('Loading the grade scale');

    await respond(listRequest(), scale());

    expect(page.querySelector('h1')?.textContent).toContain('Grades');
    expect(page.textContent).toContain('shared by every degree');
    expect(rows().length).toBe(10);
    expect(input(0, 'letterGrade').value).toBe('A+');
    expect(input(0, 'marksLowerBound').value).toBe('80');
    expect(input(0, 'marksUpperBound').value).toBe('100');
    expect(input(0, 'numericGrade').value).toBe('4');
    expect(input(0, 'comment').value).toBe('Excellent');
    expect(input(9, 'letterGrade').value).toBe('F');
    expect(rows()[0].textContent).toContain('includes 100%');
    expect(rows()[1].textContent).not.toContain('includes 100%');
    expect(input(0, 'isActive').checked).toBe(true);
    expect(page.querySelector('label[for="band-0-letterGrade"]')?.textContent).toContain('Letter grade, band 1');
    expect(page.querySelector('#degreeId')).toBeNull();
    expect(page.querySelector('caption')?.textContent).toContain('Grade bands');
  });

  it('explains an empty scale and lets the Admin start one', async () => {
    await openWith([]);

    expect(page.textContent).toContain('No grade bands yet');
    button('Add band').click();
    fixture.detectChanges();
    expect(rows().length).toBe(1);
  });

  it('shows a load error with a retry that loads again', async () => {
    await open();
    listRequest().flush(...problem(500, 'Boom'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('could not be loaded');
    button('Try again').click();
    await respond(listRequest(), scale());
    expect(rows().length).toBe(10);
  });

  it('submits the complete scale and shows the saved result', async () => {
    await openWith();
    type(0, 'comment', 'Outstanding');
    type(1, 'numericGrade', '3.8');

    await save();
    const request = await writeRequest();
    const bands = request.request.body.bands;
    expect(bands.length).toBe(10);
    expect(bands[0]).toEqual({
      id: 'g0',
      letterGrade: 'A+',
      marksLowerBound: 80,
      marksUpperBound: 100,
      upperBoundInclusive: true,
      numericGrade: 4,
      comment: 'Outstanding',
      isActive: true,
    });
    expect(bands[1]).toMatchObject({ id: 'g1', numericGrade: 3.8, upperBoundInclusive: false });
    request.flush({ items: [band(0, { comment: 'Outstanding' }), ...scale().slice(1)], nextCursor: null });
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=status].alert')?.textContent).toContain('The grade scale was saved');
    expect(input(0, 'comment').value).toBe('Outstanding');
  });

  it('removes a band and adds one, sending the new band without an id and leaving the removed one out', async () => {
    await openWith();
    // Drop D (40-45) and stretch C down to 40.
    button('Remove band 9').click();
    fixture.detectChanges();
    type(7, 'marksLowerBound', '40');
    button('Add band').click();
    fixture.detectChanges();
    type(9, 'letterGrade', 'Z');
    type(9, 'marksLowerBound', '10');
    type(9, 'marksUpperBound', '20');
    type(9, 'numericGrade', '1');
    type(9, 'comment', 'Old');
    input(9, 'isActive').click();
    fixture.detectChanges();

    expect(page.textContent).toContain('Removed bands are deleted when you save');
    await save();
    const request = await writeRequest();
    const bands = request.request.body.bands;
    expect(bands.map((b: { letterGrade: string }) => b.letterGrade)).toEqual(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'F', 'Z']);
    expect(bands.some((b: { id?: string }) => b.id === 'g8')).toBe(false);
    expect(bands[9]).toEqual({
      letterGrade: 'Z',
      marksLowerBound: 10,
      marksUpperBound: 20,
      upperBoundInclusive: false,
      numericGrade: 1,
      comment: 'Old',
      isActive: false,
    });
    request.flush({ items: scale(), nextCursor: null });
    await settle();
  });

  it('refuses a gap before sending anything, naming the uncovered percentages and the band', async () => {
    await openWith();
    type(1, 'marksLowerBound', '76');

    await save();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('No active band covers 75% to 76%');
    expect(page.querySelector('#band-1-marksLowerBound-error')?.textContent).toContain('gap');
    expect(input(1, 'marksLowerBound').getAttribute('aria-invalid')).toBe('true');
    http.expectNone(`${ROOT}/grades/scale`);
  });

  it('checks each band: grade range and decimals, duplicate letters, bounds, and required comment', async () => {
    await openWith();
    type(0, 'numericGrade', '4.01');
    type(2, 'numericGrade', '3.555');
    type(3, 'letterGrade', ' a ');
    type(4, 'comment', '  ');
    type(5, 'marksUpperBound', '101');

    await save();

    expect(page.querySelector('#band-0-numericGrade-error')?.textContent).toContain('0.00 to 4.00');
    expect(page.querySelector('#band-2-numericGrade-error')?.textContent).toContain('two decimal places');
    expect(page.querySelector('#band-3-letterGrade-error')?.textContent).toContain('already has this letter grade');
    expect(page.querySelector('#band-4-comment-error')?.textContent).toContain('Enter a comment');
    expect(page.querySelector('#band-5-marksUpperBound-error')?.textContent).toContain('0 to 100');
    http.expectNone(`${ROOT}/grades/scale`);
  });

  it('shows the errors the service returns against the scale and the band, and keeps the edits', async () => {
    await openWith();
    type(1, 'comment', 'Changed');

    await save();
    (await writeRequest()).flush(
      ...problem(400, 'Invalid', {
        bands: ['No active band covers 75% to 76%.'],
        'bands[1].id': ['This band no longer exists. Reload the scale and try again.'],
      }),
    );
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('No active band covers 75% to 76%');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('no longer exists');
    expect(input(1, 'comment').value).toBe('Changed');
  });

  it('keeps the edits and explains a failed save', async () => {
    await openWith();
    type(0, 'comment', 'Kept');

    await save();
    (await writeRequest()).flush(...problem(500, 'Boom'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Not saved');
    expect(input(0, 'comment').value).toBe('Kept');
  });

  it('discards unsaved changes by loading the scale again', async () => {
    await openWith();
    type(0, 'comment', 'Unsaved');

    button('Discard changes').click();
    await respond(listRequest(), scale());

    expect(input(0, 'comment').value).toBe('Excellent');
  });
});
