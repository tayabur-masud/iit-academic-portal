/**
 * Test helpers for `<app-select>`, addressed like the native selects they replaced: by the selector of the text field (its `inputId`,
 * such as '#degreeId'). The choices stay in the page while the list is closed, so a test can read and choose them without opening it.
 */

function host(root: ParentNode, selector: string): HTMLElement {
  const field = root.querySelector<HTMLElement>(selector);
  const select = field?.closest<HTMLElement>('app-select');
  if (!select) {
    throw new Error(`No <app-select> with a field matching ${selector}`);
  }
  return select;
}

function choices(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(host(root, selector).querySelectorAll<HTMLElement>('[role=option]'));
}

/** Chooses the option with this value, as a click would: the form control changes, then `(valueChange)` fires. */
export function chooseOption(root: ParentNode, selector: string, value: string): void {
  const option = choices(root, selector).find((o) => o.dataset['value'] === value);
  if (!option) {
    throw new Error(`${selector} has no option with value "${value}"`);
  }
  option.click();
}

/** The visible labels of every option, in order (the empty choice first, when there is one). */
export function optionLabels(root: ParentNode, selector: string): string[] {
  return choices(root, selector).map((o) => o.textContent?.trim() ?? '');
}

/** The values of every option, in order. */
export function optionValues(root: ParentNode, selector: string): string[] {
  return choices(root, selector).map((o) => o.dataset['value'] ?? '');
}

/** The group headings, in order. */
export function optionGroups(root: ParentNode, selector: string): string[] {
  return Array.from(host(root, selector).querySelectorAll('.searchable-select-group')).map(
    (g) => g.textContent?.trim() ?? '',
  );
}

/** The current value ("" when nothing is chosen). */
export function selectedValue(root: ParentNode, selector: string): string {
  return host(root, selector).dataset['value'] ?? '';
}
