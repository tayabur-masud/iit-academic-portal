import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroIdentification } from '@ng-icons/heroicons/outline';
import { firstValueFrom } from 'rxjs';

import { AuthSession } from '../../core/auth/auth-session';
import { problemMessage } from '../../core/http/problem';
import { categoryLabel } from '../students/student.models';
import { MyProfileApi } from './my-profile-api';
import {
  MyAcademicHistoryEntry,
  MyAddress,
  MyProfileView,
  MyRoleProfile,
} from './my-profile.models';

/**
 * My Profile, for every role: the signed-in account's email and the profile its active role reads (the Staff profile for Admin, the
 * Student profile for Student, and the Teacher profile for Teacher and Coordinator). View-only: each profile is changed in its own
 * management screen. It reloads when the active role changes, and drops the previous view first so another role's details are never
 * shown in the meantime.
 */
@Component({
  selector: 'app-my-profile',
  imports: [NgIcon],
  viewProviders: [provideIcons({ heroIdentification })],
  templateUrl: './my-profile.html',
})
export class MyProfile {
  private readonly api = inject(MyProfileApi);
  private readonly session = inject(AuthSession);

  protected readonly categoryLabel = categoryLabel;

  protected readonly view = signal<MyProfileView | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  /** The noun for the active role's profile, used in the headings and the "no profile" message. */
  protected readonly profileNoun = computed(() => {
    const role = this.view()?.activeRole;
    return role === 'Admin'
      ? 'staff profile'
      : role === 'Student'
        ? 'student profile'
        : 'teacher profile';
  });

  protected readonly staff = computed(() => this.profileOf('staff'));
  protected readonly teacher = computed(() => this.profileOf('teacher'));
  protected readonly student = computed(() => this.profileOf('student'));

  /** Counts requests so a slower, earlier response (from before a role switch) can never replace a newer one. */
  private request = 0;

  constructor() {
    effect(() => {
      this.session.activeRole();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    const request = ++this.request;
    this.view.set(null);
    this.loadError.set(null);
    this.loading.set(true);
    try {
      const view = await firstValueFrom(this.api.get());
      if (request === this.request) {
        this.view.set(view);
      }
    } catch (error) {
      if (request === this.request) {
        this.loadError.set(
          error instanceof HttpErrorResponse && error.status === 403
            ? problemMessage(error, 'Choose a portal role to see your profile.')
            : problemMessage(error, 'Your profile could not be loaded. Try again.'),
        );
      }
    } finally {
      if (request === this.request) {
        this.loading.set(false);
      }
    }
  }

  private profileOf<K extends MyRoleProfile['kind']>(
    kind: K,
  ): Extract<MyRoleProfile, { kind: K }> | null {
    const profile = this.view()?.profile;
    return profile?.kind === kind ? (profile as Extract<MyRoleProfile, { kind: K }>) : null;
  }

  /** The address as one line: details, then the locality path (Upazila or City Corporation, District, Division). */
  protected addressLine(address: MyAddress): string {
    return [
      address.details,
      address.upazilaName ?? address.cityCorporationName,
      address.districtName,
      address.divisionName,
    ]
      .filter((part): part is string => !!part)
      .join(', ');
  }

  /** All recorded institution names for the qualification, in the order stored on the Student profile. */
  protected institutionOf(entry: MyAcademicHistoryEntry): string {
    return [entry.schoolOrCollege, entry.university, entry.institution]
      .filter((name): name is string => !!name)
      .join(', ');
  }

  /** The subject side of a row: group, department, or subject, whichever were recorded. */
  protected fieldOf(entry: MyAcademicHistoryEntry): string {
    return [entry.group, entry.department, entry.subject]
      .filter((part): part is string => !!part)
      .join(', ');
  }

  /** The recorded result values, labelled, in the order they appear on the paper form. */
  protected resultOf(entry: MyAcademicHistoryEntry): string {
    return [
      entry.marksObtained && `Marks ${entry.marksObtained}`,
      entry.marksPercentage && `${entry.marksPercentage}%`,
      entry.cgpa && `CGPA ${entry.cgpa}`,
      entry.class && `Class ${entry.class}`,
      entry.division && `Division ${entry.division}`,
    ]
      .filter((part): part is string => !!part)
      .join(', ');
  }

  /** An ISO date (yyyy-MM-dd) as "12 April 1998", read as a calendar date so no time zone can shift it. */
  protected dateOf(iso: string): string {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
}
