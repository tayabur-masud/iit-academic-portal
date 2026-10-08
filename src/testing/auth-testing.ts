import { Component } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Routes, provideRouter, withComponentInputBinding } from '@angular/router';

import { SessionContext } from '../app/core/auth/auth.models';
import { csrfInterceptor } from '../app/core/auth/csrf-token';

@Component({ template: '' })
class Stub {}

/** Destination routes for navigation assertions. */
export const STUB_ROUTES: Routes = [
  'login',
  'select-role',
  'no-role',
  'unauthorized',
  'forgot-password',
  'admin',
  'student',
  'teacher',
  'coordinator',
].map((path) => ({ path, component: Stub }));

export function provideAuthTesting(routes: Routes = STUB_ROUTES) {
  return [
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([csrfInterceptor])),
    provideHttpClientTesting(),
  ];
}

export const TEST_CSRF_TOKEN = 'test-csrf-token';

/** Lets pending promise chains and HTTP subscriptions run. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

/** Answers the anti-forgery token request that precedes a state-changing call. */
export async function flushCsrf(http: HttpTestingController): Promise<void> {
  await settle();
  http.expectOne('/api/auth/anti-forgery-token').flush({ requestToken: TEST_CSRF_TOKEN });
  await settle();
}

export function problem(status: number, detail: string, errors?: Record<string, string[]>) {
  return [{ status, title: 'Problem', detail, errors }, { status, statusText: 'Problem' }] as const;
}

export function context(availableRoles: SessionContext['availableRoles'], activeRole: SessionContext['activeRole']): SessionContext {
  return { availableRoles, activeRole };
}

export function httpMock(): HttpTestingController {
  return TestBed.inject(HttpTestingController);
}
