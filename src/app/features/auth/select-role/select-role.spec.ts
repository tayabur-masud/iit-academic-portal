import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { AuthSession } from '../../../core/auth/auth-session';
import { context, flushCsrf, httpMock, provideAuthTesting, settle } from '../../../../testing/auth-testing';
import { SelectRole } from './select-role';

describe('SelectRole', () => {
  let fixture: ComponentFixture<SelectRole>;
  let http: HttpTestingController;
  let page: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [SelectRole], providers: provideAuthTesting() });
    http = httpMock();
    const loaded = TestBed.inject(AuthSession).refresh();
    http.expectOne('/api/auth/sessions/current').flush(context(['Teacher', 'Coordinator'], null));
    await loaded;
    fixture = TestBed.createComponent(SelectRole);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('offers only the assigned roles in a labelled group', () => {
    const choices = Array.from(page.querySelectorAll('input[type=radio]')).map(
      (input) => (input as HTMLInputElement).value,
    );

    expect(choices).toEqual(['Teacher', 'Coordinator']);
    expect(page.querySelector('legend')?.textContent).toContain('Role');
  });

  it('asks for a choice before contacting the service', () => {
    page.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();

    expect(page.querySelector('#role-error')?.textContent).toContain('Choose a role');
    http.expectNone('/api/auth/sessions/current/active-role');
  });

  it('activates the chosen role and opens its area', async () => {
    page.querySelector<HTMLInputElement>('input[value=Coordinator]')!.click();
    page.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await flushCsrf(http);

    const request = http.expectOne('/api/auth/sessions/current/active-role');
    expect(request.request.body).toEqual({ role: 'Coordinator' });
    request.flush(context(['Teacher', 'Coordinator'], 'Coordinator'));
    await settle();

    expect(TestBed.inject(Router).url).toBe('/coordinator');
  });
});
