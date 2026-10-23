import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { StudentListItem, StudentPage } from './student.models';
import { StudentList } from './student-list';
import { chooseOption, optionLabels, selectedValue } from '../../../testing/select-testing';

const ROOT = '/api/admin/students';

function row(id: string, name: string, extra: Partial<StudentListItem> = {}): StudentListItem {
  return {
    id,
    studentProfileId: 'p-' + name,
    userId: 'u-' + name,
    applicantName: name,
    email: `${name.toLowerCase()}@iit.test`,
    accountStatus: 'Active',
    degreeId: 'pgdit',
    degreeName: 'PGDIT',
    batchId: 'pb1',
    batchName: 'Batch 1',
    admissionExamRoll: 'R-' + id,
    ...extra,
  };
}

describe('StudentList', () => {
  let fixture: ComponentFixture<StudentList>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(): Promise<void> {
    TestBed.configureTestingModule({ imports: [StudentList], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(StudentList);
    page = fixture.nativeElement;
    await fixture.whenStable();
    http
      .expectOne((r) => r.url === '/api/admin/configuration/degrees')
      .flush({
        items: [
          { id: 'emit', name: 'EMIT', isActive: true, createdAtUtc: '', lastModifiedAtUtc: '' },
          { id: 'pgdit', name: 'PGDIT', isActive: true, createdAtUtc: '', lastModifiedAtUtc: '' },
        ],
        nextCursor: null,
      });
    http.expectOne((r) => r.url === '/api/admin/configuration/batches').flush({
      items: [
        { id: 'eb7', name: 'EMIT Batch 7', degreeId: 'emit', isActive: true, createdAtUtc: '', lastModifiedAtUtc: '' },
        { id: 'pb1', name: 'PGDIT Batch 1', degreeId: 'pgdit', isActive: true, createdAtUtc: '', lastModifiedAtUtc: '' },
      ],
      nextCursor: null,
    });
  }

  afterEach(() => http.verify());

  function listRequest(match: (r: TestRequest['request']) => boolean = () => true): TestRequest {
    return http.expectOne((r) => r.url === ROOT && match(r));
  }

  async function respond(request: TestRequest, items: StudentListItem[], totalPages = 1, pageNumber = 1): Promise<void> {
    request.flush({ items, page: pageNumber, totalCount: items.length, totalPages } satisfies StudentPage);
    await settle();
    fixture.detectChanges();
  }

  it('lists one row per admission, so a returning student appears once per program, with unassigned identifiers named', async () => {
    await open();
    const first = listRequest();
    expect(first.request.params.get('pageSize')).toBe('25');
    await respond(first, [
      row('a1', 'Ayesha', { assignedHallName: 'Jagannath Hall', registrationNumber: 'REG-1', classRoll: 'PG-17' }),
      row('a2', 'Ayesha', { degreeName: 'EMIT', batchName: 'Batch 7', accountStatus: 'PendingCredentialSetup' }),
    ]);

    const rows = Array.from(page.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('PGDIT · Batch 1');
    expect(rows[0]).toContain('REG-1');
    expect(rows[0]).toContain('PG-17');
    expect(rows[0]).not.toContain('R-a1');
    expect(Array.from(page.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toContain('Class roll');
    expect(rows[1]).toContain('EMIT · Batch 7');
    expect(rows[1]).toContain('Not assigned');
    expect(rows[1]).toContain('Pending setup');
    expect(page.querySelector('tbody a')?.getAttribute('href')).toBe('/admin/students/a1');
    expect(page.querySelector('a.btn-primary')?.getAttribute('href')).toBe('/admin/students/new');
  });

  it('searches and filters by degree from the first batch again', async () => {
    await open();
    await respond(listRequest(), [row('a1', 'Ayesha')], 3);

    chooseOption(page, '#degree', 'emit');
    await respond(listRequest((r) => r.params.get('degreeId') === 'emit' && r.params.get('page') === '1'), []);

    expect(page.textContent).toContain('No admissions match');
  });

  it("filters by batch, offers only the chosen degree's batches, and clears a batch of another degree", async () => {
    await open();
    await respond(listRequest(), [row('a1', 'Ayesha')]);

    expect(optionLabels(page, '#batch')).toEqual(['All', 'EMIT Batch 7', 'PGDIT Batch 1']);
    chooseOption(page, '#batch', 'pb1');
    await respond(listRequest((r) => r.params.get('batchId') === 'pb1' && r.params.get('page') === '1'), [row('a1', 'Ayesha')]);

    chooseOption(page, '#degree', 'emit');
    await respond(listRequest((r) => r.params.get('degreeId') === 'emit' && !r.params.has('batchId')), []);

    expect(optionLabels(page, '#batch')).toEqual(['All', 'EMIT Batch 7']);
    expect(selectedValue(page, '#batch')).toBe('');
  });

  it('shows a failed load with a retry', async () => {
    await open();
    listRequest().flush(...problem(500, 'boom'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Students not shown');
    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again'))!.click();
    await respond(listRequest(), [row('a1', 'Ayesha')]);
    expect(page.querySelector('[role=alert]')).toBeNull();
  });
});
