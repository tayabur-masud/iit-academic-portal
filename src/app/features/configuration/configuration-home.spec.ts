import { TestBed } from '@angular/core/testing';

import { provideAuthTesting } from '../../../testing/auth-testing';
import { ConfigurationHome } from './configuration-home';
import { RESOURCES } from './configuration.models';

describe('ConfigurationHome', () => {
  it('links to every resource, grouped, with the Configuration heading', async () => {
    TestBed.configureTestingModule({ imports: [ConfigurationHome], providers: provideAuthTesting() });
    const fixture = TestBed.createComponent(ConfigurationHome);
    await fixture.whenStable();
    const page: HTMLElement = fixture.nativeElement;

    expect(page.querySelector('h1')?.textContent).toContain('Configuration');
    expect(Array.from(page.querySelectorAll('h2')).map((h) => h.textContent)).toEqual(['IIT academics', 'Other catalogs', 'Geography']);

    const sections = Array.from(page.querySelectorAll('section')).map((section) => ({
      title: section.querySelector('h2')?.textContent,
      links: Array.from(section.querySelectorAll('li a')).map((a) => a.textContent!.trim()),
    }));
    expect(sections).toEqual([
      { title: 'IIT academics', links: ['Degrees', 'Semesters', 'Academic sessions', 'Batches', 'Courses', 'Grades'] },
      {
        title: 'Other catalogs',
        links: ['Educational institutions', 'Education boards', 'Education groups', 'Examination types', 'Designations', 'Halls'],
      },
      { title: 'Geography', links: ['Divisions', 'Districts', 'Upazilas', 'City corporations'] },
    ]);
    const hrefs = Array.from(page.querySelectorAll('li a')).map((a) => a.getAttribute('href')).sort();
    expect(hrefs).toEqual(RESOURCES.map((r) => `/admin/configuration/${r.slug}`).sort());
    expect(RESOURCES.length).toBe(16);
  });
});
