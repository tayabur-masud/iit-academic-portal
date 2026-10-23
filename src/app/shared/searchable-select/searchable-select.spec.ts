import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { SearchableSelect, SelectOption } from './searchable-select';

@Component({
  imports: [ReactiveFormsModule, SearchableSelect, SelectOption],
  template: `
    <form [formGroup]="form" (submit)="submitted = submitted + 1">
      <label for="degree">Degree</label>
      <app-select
        inputId="degree"
        formControlName="degree"
        emptyLabel="Select a degree"
        describedBy="degree-help"
        required
        (valueChange)="changes.push($event)"
      >
        @for (option of degrees(); track option.id) {
          <app-option [value]="option.id" [label]="option.name" [keywords]="option.code" />
        }
      </app-select>
      <label for="place">Place</label>
      <app-select inputId="place" formControlName="place">
        <app-option group="Upazilas" value="u1" label="Kaliakair" />
        <app-option group="Upazilas" value="u2" label="Sreepur" />
        <app-option group="City corporations" value="c1" label="Gazipur City Corporation" />
      </app-select>
    </form>
  `,
})
class Host {
  readonly form = new FormGroup({
    degree: new FormControl('', { nonNullable: true }),
    place: new FormControl('u2', { nonNullable: true }),
  });
  readonly degrees = signal([
    { id: 'emit', name: 'EMIT', code: null as string | null },
    { id: 'pgdit', name: 'PGDIT', code: null },
    { id: 'bsse', name: 'BSSE (Software Engineering)', code: 'SE-01' },
  ]);
  readonly changes: string[] = [];
  submitted = 0;
}

describe('SearchableSelect', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let page: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  const field = (id = 'degree') => page.querySelector<HTMLInputElement>(`#${id}`)!;
  const list = (id = 'degree') => page.querySelector<HTMLElement>(`#${id}-listbox`)!;
  const visible = (id = 'degree') =>
    Array.from(list(id).querySelectorAll('[role=option]')).map((o) => o.textContent?.trim());
  const key = async (name: string, id = 'degree') => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    field(id).dispatchEvent(event);
    await fixture.whenStable();
    return event;
  };
  const type = async (text: string, id = 'degree') => {
    field(id).value = text;
    field(id).dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  it('is a labelled ARIA combobox that controls a hidden listbox and passes on the description and required state', () => {
    const input = field();
    expect(page.querySelector('label[for="degree"]')).not.toBeNull();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-controls')).toBe('degree-listbox');
    expect(input.getAttribute('aria-describedby')).toBe('degree-help');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.placeholder).toBe('Select a degree');
    expect(list().getAttribute('role')).toBe('listbox');
    expect(list().hidden).toBe(true);
    expect(visible()).toEqual(['Select a degree', 'EMIT', 'PGDIT', 'BSSE (Software Engineering)']);
  });

  it('shows the label of the value the form control holds', async () => {
    host.form.controls.degree.setValue('pgdit');
    await fixture.whenStable();

    expect(field().value).toBe('PGDIT');
    expect(page.querySelector('app-select')?.getAttribute('data-value')).toBe('pgdit');
    expect(field('place').value).toBe('Sreepur');
  });

  it('filters the choices by what is typed, ignoring case, and chooses the highlighted one with Enter without submitting the form', async () => {
    await type('soft');

    expect(field().getAttribute('aria-expanded')).toBe('true');
    expect(visible()).toEqual(['BSSE (Software Engineering)']);
    expect(field().getAttribute('aria-activedescendant')).toBe(
      list().querySelector('[role=option]')?.id,
    );

    const enter = await key('Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(host.submitted).toBe(0);
    expect(host.form.controls.degree.value).toBe('bsse');
    expect(field().value).toBe('BSSE (Software Engineering)');
    expect(list().hidden).toBe(true);
    expect(host.changes).toEqual(['bsse']);
  });

  it('moves through the choices with the arrow keys, Home, and End', async () => {
    await key('ArrowDown');
    expect(list().hidden).toBe(false);
    const active = () => list().querySelector('[role=option].active')?.textContent?.trim();
    expect(active()).toBe('Select a degree');

    await key('ArrowDown');
    expect(active()).toBe('EMIT');
    await key('End');
    expect(active()).toBe('BSSE (Software Engineering)');
    await key('ArrowDown');
    expect(active()).toBe('BSSE (Software Engineering)');
    await key('Home');
    expect(active()).toBe('Select a degree');
    await key('ArrowUp');
    expect(active()).toBe('Select a degree');
  });

  it('says when nothing matches, and Escape closes the list and restores the selection', async () => {
    host.form.controls.degree.setValue('emit');
    await fixture.whenStable();
    await type('zzz');

    expect(visible()).toEqual([]);
    expect(list().textContent).toContain('No matches');
    expect(page.textContent).toContain('0 matches');

    await key('Escape');
    expect(list().hidden).toBe(true);
    expect(field().value).toBe('EMIT');
    expect(host.form.controls.degree.value).toBe('emit');
    expect(host.changes).toEqual([]);
  });

  it('chooses with a click, marks the chosen option, and reports a change only when the value changes', async () => {
    field().click();
    await fixture.whenStable();
    const option = (label: string) =>
      Array.from(list().querySelectorAll<HTMLElement>('[role=option]')).find(
        (o) => o.textContent?.trim() === label,
      )!;

    option('PGDIT').click();
    await fixture.whenStable();
    expect(host.form.controls.degree.value).toBe('pgdit');
    expect(option('PGDIT').getAttribute('aria-selected')).toBe('true');

    option('PGDIT').click();
    option('Select a degree').click();
    expect(host.form.controls.degree.value).toBe('');
    expect(host.changes).toEqual(['pgdit', '']);
  });

  it('closes on blur, keeping the selection, and marks the control touched', async () => {
    await type('PG');
    field().dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(list().hidden).toBe(true);
    expect(field().value).toBe('');
    expect(host.form.controls.degree.value).toBe('');
    expect(host.form.controls.degree.touched).toBe(true);
  });

  it('shows grouped choices under their headings, filtering keeps the heading of what matches', async () => {
    const groups = () =>
      Array.from(list('place').querySelectorAll('.searchable-select-group')).map((g) =>
        g.textContent?.trim(),
      );
    expect(groups()).toEqual(['Upazilas', 'City corporations']);
    expect(list('place').querySelector('[role=group]')?.getAttribute('aria-labelledby')).toBe(
      list('place').querySelector('.searchable-select-group')?.id,
    );

    await type('gazi', 'place');
    expect(groups()).toEqual(['City corporations']);
    expect(visible('place')).toEqual(['Gazipur City Corporation']);
  });

  it('follows the form control when it is disabled', async () => {
    host.form.controls.degree.disable();
    await fixture.whenStable();

    expect(field().disabled).toBe(true);
    field().click();
    await fixture.whenStable();
    expect(list().hidden).toBe(true);
  });

  it('keeps showing the chosen label when the choices load after the value', async () => {
    host.degrees.set([]);
    host.form.controls.degree.setValue('pgdit');
    await fixture.whenStable();
    expect(field().value).toBe('');

    host.degrees.set([{ id: 'pgdit', name: 'PGDIT', code: null }]);
    await fixture.whenStable();
    expect(field().value).toBe('PGDIT');
  });

  it('also matches an option by its keywords (such as a code) without showing them', async () => {
    await type('se-01');

    expect(visible()).toEqual(['BSSE (Software Engineering)']);
    expect(list().textContent).not.toContain('SE-01');
  });
});
