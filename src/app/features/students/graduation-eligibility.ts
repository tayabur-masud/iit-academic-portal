import { DecimalPipe } from '@angular/common';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { problemMessage } from '../../core/http/problem';
import { StudentApi } from './student-api';
import { GraduationEligibility as Eligibility, REQUIREMENT_LABELS } from './student.models';

/**
 * The computed graduation eligibility of one admission: eligible only when this admission's passed-course credits reach its degree's
 * requirement, its current cumulative CGPA from published results reaches the degree's minimum, and both its hall and registration
 * number are recorded. Each unmet or unavailable requirement is listed. It is read-only: there is no result entry or CGPA calculation,
 * no clearance action, and it never blocks result calculation or publication.
 */
@Component({
  selector: 'app-graduation-eligibility',
  imports: [DecimalPipe],
  templateUrl: './graduation-eligibility.html',
})
export class GraduationEligibility {
  private readonly api = inject(StudentApi);

  readonly admissionId = input.required<string>();
  /** Changes whenever the admission is saved, so the panel re-evaluates after a hall or registration number is recorded. */
  readonly version = input<string>('');

  protected readonly labels = REQUIREMENT_LABELS;
  protected readonly result = signal<Eligibility | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.admissionId();
      this.version();
      untracked(() => void this.load(id));
    });
  }

  protected reload(): void {
    void this.load(this.admissionId());
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.result.set(await firstValueFrom(this.api.eligibility(id)));
    } catch (error) {
      this.result.set(null);
      this.errorMessage.set(problemMessage(error, 'Graduation eligibility could not be checked. Try again.'));
    } finally {
      this.loading.set(false);
    }
  }
}
