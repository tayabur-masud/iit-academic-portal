import {
  Component,
  Directive,
  ElementRef,
  booleanAttribute,
  computed,
  contentChildren,
  effect,
  forwardRef,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** One choice of an `<app-select>`. `group` puts it under a heading (as an optgroup did); `keywords` (such as a code) also match a search but are not shown. */
@Directive({ selector: 'app-option' })
export class SelectOption {
  // Not required inputs: the select can read its options before Angular has bound them on the first pass.
  readonly value = input('');
  readonly label = input('');
  readonly group = input<string | undefined>(undefined);
  readonly keywords = input<string | null | undefined>(undefined);
}

interface Choice {
  value: string;
  label: string;
  group?: string;
  keywords?: string | null;
}

interface Section {
  group?: string;
  items: { choice: Choice; index: number }[];
}

/** Case- and accent-insensitive text for matching what is typed against a label. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * The portal's dropdown: a searchable select (the ARIA editable combobox with a listbox popup). Typing filters the choices by label
 * (and by an option's `keywords`, such as a configuration code);
 * Arrow keys, Home, and End move through them, Enter chooses, Escape closes and restores the selection, and a click chooses. It is a form
 * control like a native select (`formControlName`, `[formControl]`), holding a string value; `emptyLabel` adds the "" choice ("Any",
 * "Select a degree") as the first choice and as the placeholder. `(valueChange)` fires after the control changes, as a select's change
 * event did. The choices stay in the page while closed (hidden), so assistive technology and tests can reach them.
 */
@Component({
  selector: 'app-select',
  templateUrl: './searchable-select.html',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchableSelect), multi: true },
  ],
  host: { class: 'searchable-select', '[attr.data-value]': 'value()' },
})
export class SearchableSelect implements ControlValueAccessor {
  /** The id of the text field, for the field's `<label for>`; the list is `<inputId>-listbox`. */
  readonly inputId = input.required<string>();
  /** The label of the "" choice. Null means the select has no empty choice. */
  readonly emptyLabel = input<string | null>(null);
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly describedBy = input<string | null>(null);
  readonly required = input(false, { transform: booleanAttribute });

  /** The new value, after the form control has it. */
  readonly valueChange = output<string>();

  private readonly options = contentChildren(SelectOption);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');

  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(-1);

  protected readonly choices = computed<Choice[]>(() => {
    const empty = this.emptyLabel();
    const options = this.options().map((o) => ({
      value: o.value(),
      label: o.label(),
      group: o.group(),
      keywords: o.keywords(),
    }));
    return empty === null ? options : [{ value: '', label: empty }, ...options];
  });

  /** The choices that match what is typed, in their original order. */
  protected readonly matches = computed(() => {
    const query = fold(this.query());
    return query
      ? this.choices().filter((choice) =>
          fold(`${choice.label} ${choice.keywords ?? ''}`).includes(query),
        )
      : this.choices();
  });

  /** The matches grouped under their headings, each keeping its position in `matches` for keyboard focus. */
  protected readonly sections = computed<Section[]>(() => {
    const sections: Section[] = [];
    this.matches().forEach((choice, index) => {
      const last = sections.at(-1);
      if (last && last.group === choice.group) {
        last.items.push({ choice, index });
      } else {
        sections.push({ group: choice.group, items: [{ choice, index }] });
      }
    });
    return sections;
  });

  protected readonly selectedLabel = computed(() => {
    const value = this.value();
    return value === ''
      ? ''
      : (this.choices().find((choice) => choice.value === value)?.label ?? '');
  });

  protected readonly listId = computed(() => `${this.inputId()}-listbox`);
  protected readonly activeId = computed(() =>
    this.open() && this.active() >= 0 ? this.optionId(this.active()) : null,
  );

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // Keep the text field showing the selection while the user is not typing (also after the choices load or change).
    effect(() => {
      const label = this.selectedLabel();
      if (!this.open()) {
        untracked(() => (this.field().nativeElement.value = label));
      }
    });
    // Keep the highlighted choice in view.
    effect(() => {
      const id = this.activeId();
      if (id) {
        untracked(() =>
          Array.from(this.list().nativeElement.querySelectorAll<HTMLElement>('[role=option]'))
            .find((option) => option.id === id)
            ?.scrollIntoView?.({ block: 'nearest' }),
        );
      }
    });
  }

  protected optionId(index: number): string {
    return `${this.inputId()}-option-${index}`;
  }

  writeValue(value: unknown): void {
    this.value.set(value === null || value === undefined ? '' : String(value));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    if (disabled) {
      this.close();
    }
  }

  /** Chooses a value: the control gets it first, then `valueChange` fires (only when it changed, like a select's change event). */
  choose(value: string): void {
    const changed = value !== this.value();
    this.value.set(value);
    this.close();
    this.field().nativeElement.value = this.selectedLabel();
    if (changed) {
      this.onChange(value);
      this.valueChange.emit(value);
    }
  }

  protected toggle(): void {
    if (this.disabled()) {
      return;
    }
    if (this.open()) {
      this.close();
    } else {
      this.show();
    }
  }

  protected typed(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.open.set(true);
    this.active.set(this.matches().length > 0 ? 0 : -1);
  }

  protected focused(): void {
    // Typing then replaces the shown selection instead of adding to it.
    this.field().nativeElement.select();
  }

  protected blurred(): void {
    this.close();
    this.onTouched();
  }

  protected keydown(event: KeyboardEvent): void {
    const count = this.matches().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.show();
        } else if (count > 0) {
          this.active.set(Math.min(this.active() + 1, count - 1));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.open()) {
          this.show();
        } else if (count > 0) {
          this.active.set(Math.max(this.active() - 1, 0));
        }
        break;
      case 'Home':
      case 'End':
        if (this.open() && count > 0) {
          event.preventDefault();
          this.active.set(event.key === 'Home' ? 0 : count - 1);
        }
        break;
      case 'Enter':
        if (this.open()) {
          // Choosing never submits the form around it.
          event.preventDefault();
          const choice = this.matches()[this.active()];
          if (choice) {
            this.choose(choice.value);
          }
        }
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
          this.field().nativeElement.value = this.selectedLabel();
          this.field().nativeElement.select();
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  private show(): void {
    this.query.set('');
    this.open.set(true);
    const selected = this.choices().findIndex((choice) => choice.value === this.value());
    this.active.set(selected >= 0 ? selected : 0);
  }

  private close(): void {
    if (this.open()) {
      this.open.set(false);
      this.query.set('');
      this.active.set(-1);
      this.field().nativeElement.value = this.selectedLabel();
    }
  }
}
