import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { AuditEvent } from './audit.models';
import { AuditDetail } from './audit-detail';

const base: AuditEvent = {
  eventId: '11111111-1111-1111-1111-111111111111',
  occurredAtUtc: '2026-10-09T08:30:00Z',
  category: 'business',
  eventType: 'student.updated',
  outcome: 'success',
  actorUserId: 'user-1',
  actorDisplay: 'admin@iit.test',
  entityType: 'Student',
  entityId: '42',
  correlationId: 'corr-1',
  source: '203.0.113.9',
  metadata: { reason: 'correction' },
  changes: [],
};

describe('AuditDetail', () => {
  let fixture: ComponentFixture<AuditDetail>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(): Promise<void> {
    TestBed.configureTestingModule({ imports: [AuditDetail], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(AuditDetail);
    fixture.componentRef.setInput('eventId', base.eventId);
    page = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function respond(event: AuditEvent): Promise<void> {
    http.expectOne(`/api/audit-events/${base.eventId}`).flush(event);
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('shows the event facts, context and a link back to the list', async () => {
    await open();
    await respond(base);

    expect(page.querySelector('h1')?.textContent).toContain('Audit event');
    expect(page.textContent).toContain('2026-10-09 08:30:00 UTC');
    expect(page.textContent).toContain('admin@iit.test');
    expect(page.textContent).toContain('Student 42');
    expect(page.textContent).toContain('reason');
    expect(page.textContent).toContain('correction');
    expect(page.querySelector('a')?.getAttribute('href')).toBe('/admin/audit');
  });

  it('shows allowlisted values and a safe indicator for protected fields', async () => {
    await open();
    await respond({
      ...base,
      changes: [
        { fieldName: 'status', oldValue: 'Active', newValue: 'Inactive' },
        { fieldName: 'passwordHash', changed: true },
      ],
    });

    const rows = Array.from(page.querySelectorAll('tbody tr')).map((r) => r.textContent);
    expect(rows[0]).toContain('Active');
    expect(rows[0]).toContain('Inactive');
    expect(rows[1]).toContain('passwordHash');
    expect(rows[1]).toContain('values are not recorded');
  });

  it('marks an actor whose account no longer exists', async () => {
    await open();
    await respond({ ...base, actorDisplay: null });

    expect(page.textContent).toContain('(account removed)');
    expect(page.textContent).toContain('user-1');
  });

  it('explains an unknown event', async () => {
    await open();
    http.expectOne(`/api/audit-events/${base.eventId}`).flush(...problem(404, 'Not found'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Event not found');
  });

  it('does not reveal anything on a role failure', async () => {
    await open();
    http.expectOne(`/api/audit-events/${base.eventId}`).flush(...problem(403, 'Forbidden'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Admin role');
    expect(page.querySelector('h1')).toBeNull();
  });
});
