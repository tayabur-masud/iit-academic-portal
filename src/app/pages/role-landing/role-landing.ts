import { Component, computed, input } from '@angular/core';

import { ROLE_AREAS, Role } from '../../core/auth/auth.models';

/**
 * A role's landing page. Module features are outside this feature's scope, so it shows the module
 * heading and an empty state until those features are delivered.
 */
@Component({
  selector: 'app-role-landing',
  template: `
    <h1>{{ module() }}</h1>
    <section class="card max-w-[40rem]" aria-labelledby="empty-title">
      <h2 id="empty-title">Nothing here yet</h2>
      <p>{{ module() }} features will appear here as they become available.</p>
    </section>
  `,
})
export class RoleLanding {
  /** Bound from route data. */
  readonly role = input.required<Role>();
  protected readonly module = computed(() => ROLE_AREAS[this.role()].module);
}
