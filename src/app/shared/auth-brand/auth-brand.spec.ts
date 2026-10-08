import { TestBed } from '@angular/core/testing';

import { AuthBrand } from './auth-brand';

describe('AuthBrand', () => {
  it('shows the IIT logo at its intrinsic ratio with a text alternative, centered above the portal name', async () => {
    const fixture = TestBed.createComponent(AuthBrand);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    const logo = host.querySelector('img')!;

    expect(logo.getAttribute('src')).toBe('images/iit-logo.png');
    expect(logo.alt).toBe('IIT, University of Dhaka');
    expect([logo.getAttribute('width'), logo.getAttribute('height')]).toEqual(['600', '327']);
    expect(host.classList).toContain('items-center');
    expect(host.textContent).toContain('IIT Academic Portal');
  });
});
