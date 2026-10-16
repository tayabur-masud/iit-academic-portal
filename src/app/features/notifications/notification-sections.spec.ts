import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { NotificationSections } from './notification-sections';

@Component({ selector: 'app-stub', template: '' })
class Stub {}

describe('NotificationSections', () => {
  async function renderAt(url: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [NotificationSections],
      providers: [
        provideRouter([
          { path: 'admin/notifications', component: Stub },
          { path: 'admin/notifications/templates', component: Stub },
          { path: 'admin/notifications/templates/:eventType', component: Stub },
          { path: 'admin/notifications/settings', component: Stub },
          { path: 'admin/notifications/:id', component: Stub },
        ]),
      ],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(NotificationSections);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  const current = (page: HTMLElement) => Array.from(page.querySelectorAll('a[aria-current="page"]')).map((a) => a.textContent?.trim());

  it('is a labelled list of three real links styled as tabs, not buttons and not the ARIA tab pattern', async () => {
    const page = await renderAt('/admin/notifications');

    expect(page.querySelector('nav')?.getAttribute('aria-label')).toBe('Notification sections');
    expect(page.querySelector('ul.tabs')).not.toBeNull();
    expect(Array.from(page.querySelectorAll('a.tab')).map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['History', '/admin/notifications'],
      ['Templates', '/admin/notifications/templates'],
      ['Reminder setting', '/admin/notifications/settings'],
    ]);
    expect(page.querySelector('button, [role=tab], [role=tablist]')).toBeNull();
  });

  it.each([
    ['/admin/notifications', 'History'],
    ['/admin/notifications/templates', 'Templates'],
    ['/admin/notifications/settings', 'Reminder setting'],
  ])('marks exactly one tab as the current page at %s', async (url, label) => {
    expect(current(await renderAt(url))).toEqual([label]);
  });

  it('keeps Templates current on a template editor page, and History current only on the history list', async () => {
    expect(current(await renderAt('/admin/notifications/templates/password-reset'))).toEqual(['Templates']);
    TestBed.resetTestingModule();
    expect(current(await renderAt('/admin/notifications/9d4c2a10-0000-4000-8000-000000000001'))).toEqual([]);
  });
});
