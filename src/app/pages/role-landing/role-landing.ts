import { Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroSquares2x2 } from '@ng-icons/heroicons/outline';

import { ROLE_AREAS, Role } from '../../core/auth/auth.models';

/**
 * A role's landing page. Module features are outside this feature's scope, so it shows the module
 * heading and an empty state until those features are delivered.
 */
@Component({
  selector: 'app-role-landing',
  imports: [NgIcon],
  viewProviders: [provideIcons({ heroSquares2x2 })],
  template: `
    <div class="page-header">
      <div class="min-w-0">
        <h1>{{ module() }}</h1>
      </div>
    </div>
    <section class="empty-state" aria-labelledby="empty-title">
      <ng-icon name="heroSquares2x2" />
      <h2 id="empty-title" class="empty-state-title">Nothing here yet</h2>
      <p class="empty-state-text">{{ module() }} features will appear here as they become available.</p>
    </section>
  `,
})
export class RoleLanding {
  /** Bound from route data. */
  readonly role = input.required<Role>();
  protected readonly module = computed(() => ROLE_AREAS[this.role()].module);
}
