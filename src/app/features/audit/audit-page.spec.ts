import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { httpMock, problem, provideAuthTesting, settle } from '../../../testing/auth-testing';
import { PagerPreferences } from '../../shared/pager/pager-preferences';
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

  async function open(first: Page | null = { items: [event('e1')], nextCursor: null, page: 1, totalCount: 1, totalPages: 1 }): Promise<void> {
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
      page: 1,
      totalCount: 1,
      totalPages: 1,
    });

    expect(page.querySelector('.badge')?.textContent).toContain('Denied');
    expect(page.querySelector('tbody')?.textContent).toContain('(account removed)');
  });

  it('explains an empty first page differently from an empty filtered result', async () => {
    await open({ items: [], nextCursor: null, page: 1, totalCount: 0, totalPages: 0 });
    expect(page.textContent).toContain('No audit events yet');

    type('#eventType', 'nothing');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne((r) => r.params.get('eventType') === 'nothing').flush({ items: [], nextCursor: null, page: 1, totalCount: 0, totalPages: 0 });
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
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.has('cursor')).toBe(false);
    request.flush({ items: [], nextCursor: null, page: 1, totalCount: 0, totalPages: 0 });
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

  function pager(): HTMLElement {
    return page.querySelector<HTMLElement>('nav[aria-label="Pages of results"]')!;
  }

  function pageButtons(): string[] {
    return Array.from(pager().querySelectorAll('li')).map((li) => li.textContent!.trim());
  }

  async function respond(request: (r: { params: { get(n: string): string | null } }) => boolean, body: Page): Promise<void> {
    http.expectOne((r) => r.url === '/api/audit-events' && request(r)).flush(body);
    await settle();
    fixture.detectChanges();
  }

  it('shows numbered pages with the total and the range on screen', async () => {
    await open({ items: [event('e1')], nextCursor: null, page: 1, totalCount: 1000, totalPages: 40 });

    expect(pageButtons()).toEqual(['Previous page', '1', '2', '3', '…', '40', 'Next page']);
    expect(page.textContent).toContain('Showing 1 to 25 of 1000 events');
    expect(pager().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('1');
    expect(button('Previous').disabled).toBe(true);
  });

  it('jumps to a numbered page, the next page and the previous page', async () => {
    await open({ items: [event('e1')], nextCursor: null, page: 1, totalCount: 1000, totalPages: 40 });

    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    await respond((r) => r.params.get('page') === '3', { items: [event('e3')], nextCursor: null, page: 3, totalCount: 1000, totalPages: 40 });
    expect(pager().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('3');
    expect(page.textContent).toContain('Showing 51 to 75 of 1000 events');

    button('Next').click();
    await respond((r) => r.params.get('page') === '4', { items: [event('e4')], nextCursor: null, page: 4, totalCount: 1000, totalPages: 40 });
    button('Previous').click();
    await respond((r) => r.params.get('page') === '3', { items: [event('e3')], nextCursor: null, page: 3, totalCount: 1000, totalPages: 40 });
    expect(pager().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('3');
  });

  it('keeps the current rows on screen, marked busy, while another page loads', async () => {
    await open({ items: [event('e1')], nextCursor: null, page: 1, totalCount: 1000, totalPages: 40 });

    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    fixture.detectChanges();

    expect(page.querySelectorAll('tbody tr').length).toBe(1);
    expect(page.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(page.querySelector('.spinner')).not.toBeNull();
    // A second click while loading is ignored: only one request is outstanding.
    pager().querySelector<HTMLButtonElement>('[aria-label="Page 4"]')!.click();
    await respond((r) => r.params.get('page') === '3', { items: [event('e3')], nextCursor: null, page: 3, totalCount: 1000, totalPages: 40 });
    expect(page.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('can jump straight to the last page, where Next is disabled', async () => {
    await open({ items: [event('e1')], nextCursor: null, page: 1, totalCount: 1000, totalPages: 40 });

    pager().querySelector<HTMLButtonElement>('[aria-label="Page 40"]')!.click();
    await respond((r) => r.params.get('page') === '40', { items: [event('e40')], nextCursor: null, page: 40, totalCount: 1000, totalPages: 40 });

    expect(button('Next').disabled).toBe(true);
    expect(pageButtons()).toEqual(['Previous page', '1', '…', '38', '39', '40', 'Next page']);
  });

  it('starts again from page 1 when the filters change', async () => {
    await open({ items: [event('e1')], nextCursor: null, page: 1, totalCount: 1000, totalPages: 40 });
    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    await respond((r) => r.params.get('page') === '3', { items: [event('e3')], nextCursor: null, page: 3, totalCount: 1000, totalPages: 40 });

    type('#eventType', 'auth.sign-in');
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    await respond((r) => r.params.get('page') === '1' && r.params.get('eventType') === 'auth.sign-in', {
      items: [event('e1')], nextCursor: null, page: 1, totalCount: 50, totalPages: 2,
    });

    expect(pageButtons()).toEqual(['Previous page', '1', '2', 'Next page']);
  });

  it('shows the last existing page when the requested page is past the end', async () => {
    await open({ items: [event('e1')], nextCursor: null, page: 1, totalCount: 60, totalPages: 3 });
    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    await respond((r) => r.params.get('page') === '3', { items: [], nextCursor: null, page: 3, totalCount: 30, totalPages: 2 });
    // The list was shorter than the pager believed: the screen asks for the last page that exists.
    await respond((r) => r.params.get('page') === '2', { items: [event('e2')], nextCursor: null, page: 2, totalCount: 30, totalPages: 2 });

    expect(pager().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2');
  });

  it('changes how many rows a page holds, starts again from page 1, and remembers the choice', async () => {
    await open({ items: [event('e1')], nextCursor: null, page: 1, totalCount: 1000, totalPages: 40 });
    pager().querySelector<HTMLButtonElement>('[aria-label="Page 3"]')!.click();
    await respond((r) => r.params.get('page') === '3', { items: [event('e3')], nextCursor: null, page: 3, totalCount: 1000, totalPages: 40 });

    const select = page.querySelector<HTMLSelectElement>('#page-size')!;
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    const request = http.expectOne((r) => r.url === '/api/audit-events' && r.params.get('pageSize') === '50');
    expect(request.request.params.get('page')).toBe('1');
    request.flush({ items: [event('e1')], nextCursor: null, page: 1, totalCount: 1000, totalPages: 20 });
    await settle();
    fixture.detectChanges();

    expect(page.textContent).toContain('Showing 1 to 50 of 1000 events');
    expect(page.querySelector<HTMLSelectElement>('#page-size')?.value).toBe('50');
    expect(TestBed.inject(PagerPreferences).pageSize()).toBe(50);
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
      3,
    );
    fixture = TestBed.createComponent(AuditPage);
    page = fixture.nativeElement;
    await fixture.whenStable();

    const request = http.expectOne((r) => r.url === '/api/audit-events');
    expect(request.request.params.get('page')).toBe('3');
    expect(request.request.params.get('category')).toBe('security');
    request.flush({ items: [event('e3')], nextCursor: null, page: 3, totalCount: 60, totalPages: 3 });
    await settle();
    fixture.detectChanges();

    expect(page.querySelector<HTMLInputElement>('#eventType')?.value).toBe('auth.sign-in');
    expect(pager().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('3');
  });
});
