import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';

/**
 * A timestamp shown in UTC with the zone written out, so a reader never has to guess the time zone. The
 * machine-readable value stays in the element's `datetime` attribute.
 */
@Component({
  selector: 'app-utc-timestamp',
  imports: [DatePipe],
  template: `<time [attr.datetime]="value()">{{ value() | date: 'yyyy-MM-dd HH:mm:ss' : 'UTC' }} UTC</time>`,
})
export class UtcTimestamp {
  /** An ISO 8601 instant, as returned by the service. */
  readonly value = input.required<string>();
}
