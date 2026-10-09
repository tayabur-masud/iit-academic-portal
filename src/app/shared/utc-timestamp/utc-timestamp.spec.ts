import { TestBed } from '@angular/core/testing';

import { UtcTimestamp } from './utc-timestamp';

describe('UtcTimestamp', () => {
  async function render(value: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(UtcTimestamp);
    fixture.componentRef.setInput('value', value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the instant in UTC with the zone written out', async () => {
    const host = await render('2026-10-09T17:20:34.123Z');

    expect(host.textContent?.trim()).toBe('2026-10-09 17:20:34 UTC');
  });

  it('keeps the machine-readable instant in the datetime attribute', async () => {
    const host = await render('2026-10-09T17:20:34.123Z');

    expect(host.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-09T17:20:34.123Z');
  });

  it('does not shift across midnight into the viewer local day', async () => {
    const host = await render('2026-12-31T23:59:59Z');

    expect(host.textContent?.trim()).toBe('2026-12-31 23:59:59 UTC');
  });
});
