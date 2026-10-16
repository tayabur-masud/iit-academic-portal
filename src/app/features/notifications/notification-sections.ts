import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * The three notification administration pages as a tab strip. Each tab is a real link to its own page (back, bookmarks, and lazy
 * loading keep working); the current page is marked with aria-current="page". Templates stays current on its editor pages too.
 */
@Component({
  selector: 'app-notification-sections',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Notification sections">
      <ul class="tabs">
        <li>
          <a class="tab" routerLink="/admin/notifications" ariaCurrentWhenActive="page" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive>History</a>
        </li>
        <li>
          <a class="tab" routerLink="/admin/notifications/templates" ariaCurrentWhenActive="page" routerLinkActive>Templates</a>
        </li>
        <li>
          <a class="tab" routerLink="/admin/notifications/settings" ariaCurrentWhenActive="page" routerLinkActive>Reminder setting</a>
        </li>
      </ul>
    </nav>
  `,
})
export class NotificationSections {}
