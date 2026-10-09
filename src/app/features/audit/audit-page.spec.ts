import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { AuditSearchState } from './audit-search-state';
import { AuditEvent, AuditPage as Page } from './audit.models';
import { AuditPage } from './audit-page';

function event(id: string, overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventId: id,
    occurredAtUtc: '2026-10-09T08:30:00Z',
    category: 'security',
    eventType: 'auth.sign-in',
    outcome: 'success',
    actorUserId: 'user-1',
    actorDisplay: 'admin@iit.test',
    entityType: null,
    entityId: null,
    correlationId: null,
    source: '203.0.113.9',
    metadata: {},
    changes: [],
    ...overrides,
  };
}

describe('AuditPage', () => {
  let fixture: ComponentFixture<AuditPage>;
  let http: HttpTestingController;
  let page: HTMLElement;

  async function open(first: Page | null = { items: [event('e1')], nextCursor: null }): Promise<void> {
    TestBed.configureTestingModule({ imports: [AuditPage], providers: provideAuthTesting() });
    http = httpMock();
    fixture = TestBed.createComponent(AuditPage);
    page = fixture.nativeElement;
    await fixture.whenStable();
    if (first) {
      http.expectOne((r) => r.url === '/api/audit-events').flush(first);
      await settle();
      fixture.detectChanges();
    }
  }

  afterEach(() => http.verify());

  function type(selector: string, value: string): void {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function button(text: string): HTMLButtonElement {
    return Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
  }

  it('lists events with times labeled UTC and the actor shown', async () => {
    await open();

    expect(page.querySelector('time')?.getAttribute('datetime')).toContain('2026-10-09T08:30:00');
    expect(page.querySelector('tbody')?.textContent).toContain('2026-10-09 08:30:00 UTC');
    expect(page.querySelector('tbody')?.textContent).toContain('admin@iit.test');
    expect(page.querySelector('label[for=from]')?.textContent).toContain('UTC');
    expect(page.querySelector('tbody a')?.getAttribute('href')).toBe('/admin/audit/e1');
  });

  it('shows outcome as text and marks a removed account', async () => {
    await open({
      items: [event('e2', { outcome: 'denied', actorDisplay: null, actorUserId: 'gone-1' })],
      nextCursor: null,
    });

    expect(page.querySelector('.badge')?.textContent).toContain('Denied');
    expect(page.querySelector('tbody')?.textContent).toContain('(account removed)');
  });

  it('explains an empty first page differently from an empty filtered result', async () => {
    await open({ items: [], nextCursor: null });
    expect(page.textContent).toContain('No audit events yet');

    type('#eventType', 'nothing');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne((r) => r.params.get('eventType') === 'nothing').flush({ items: [], nextCursor: null });
    await settle();
    fixture.detectChanges();

    expect(page.textContent).toContain('No events match these filters');
  });

  it('sends only the filters that were filled in, as UTC instants', async () => {
    await open();

    type('#from', '2026-10-01T00:00');
    type('#eventType', ' auth.sign-in ');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));

    const request = http.expectOne((r) => r.url === '/api/audit-events' && r.params.has('eventType'));
    expect(request.request.params.get('eventType')).toBe('auth.sign-in');
    expect(request.request.params.get('fromUtc')).toBe('2026-10-01T00:00:00Z');
    expect(request.request.params.has('toUtc')).toBe(false);
    expect(request.request.params.has('cursor')).toBe(false);
    request.flush({ items: [], nextCursor: null });
  });

  it('rejects an end before the start without calling the service', async () => {
    await open();

    type('#from', '2026-10-02T00:00');
    type('#to', '2026-10-01T00:00');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    http.expectNone((r) => r.params.has('toUtc'));
    expect(page.querySelector('#to-error')?.textContent).toContain('later than its start');
    expect(page.querySelector('#to')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('pages forward by cursor and back again', async () => {
    await open({ items: [event('e1')], nextCursor: 'c1' });
    expect(button('Previous page').disabled).toBe(true);

    button('Next page').click();
    http.expectOne((r) => r.params.get('cursor') === 'c1').flush({ items: [event('e2')], nextCursor: null });
    await settle();
    fixture.detectChanges();
    expect(page.textContent).toContain('Page 2');
    expect(button('Next page').disabled).toBe(true);

    button('Previous page').click();
    http.expectOne((r) => !r.params.has('cursor')).flush({ items: [event('e1')], nextCursor: 'c1' });
    await settle();
    fixture.detectChanges();
    expect(page.textContent).toContain('Page 1');
  });

  it('shows server validation problems against the field that caused them', async () => {
    await open();

    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    http
      .expectOne((r) => r.url === '/api/audit-events')
      .flush(...problem(400, 'Invalid', { fromUtc: ['The start must be a valid UTC date-time.'] }));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('#from-error')?.textContent).toContain('valid UTC date-time');
    expect(page.querySelector('[role=alert]')?.textContent).toContain('Some filters need attention');
    expect(page.querySelector('tbody')).toBeNull();
  });

  it('shows a role message on 403 and no stale results', async () => {
    await open();

    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne((r) => r.url === '/api/audit-events').flush(...problem(403, 'Forbidden'));
    await settle();
    fixture.detectChanges();

    expect(page.querySelector('[role=alert]')?.textContent).toContain('Admin role');
    expect(page.querySelector('tbody')).toBeNull();
  });

  it('restores the filters and page it was left on', async () => {
    TestBed.configureTestingModule({ imports: [AuditPage], providers: provideAuthTesting() });
    http = httpMock();
    TestBed.inject(AuditSearchState).save(
      { from: '', to: '', category: 'security', outcome: '', eventType: 'auth.sign-in', actorUserId: '', entityType: '', entityId: '', correlationId: '' },
      [null, 'c1'],
    );
    fixture = TestBed.createComponent(AuditPage);
    page = fixture.nativeElement;
    await fixture.whenStable();

    const request = http.expectOne((r) => r.url === '/api/audit-events');
    expect(request.request.params.get('cursor')).toBe('c1');
    expect(request.request.params.get('category')).toBe('security');
    request.flush({ items: [event('e3')], nextCursor: null });
    await settle();
    fixture.detectChanges();

    expect(page.querySelector<HTMLInputElement>('#eventType')?.value).toBe('auth.sign-in');
    expect(page.textContent).toContain('Page 2');
  });
});
