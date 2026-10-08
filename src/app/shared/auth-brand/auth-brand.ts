import { Component } from '@angular/core';

/**
 * IIT identity block for the focused authentication screens (design-system §10): the approved logo at
 * its original aspect ratio, centered above the product name.
 */
@Component({
  selector: 'app-auth-brand',
  host: { class: 'mb-6 flex flex-col items-center gap-3 text-center' },
  template: `
    <img
      src="images/iit-logo.png"
      alt="IIT, University of Dhaka"
      width="600"
      height="327"
      class="h-20 w-auto"
    />
    <p class="m-0 text-heading font-semibold text-brand-primary">IIT Academic Portal</p>
  `,
})
export class AuthBrand {}
