import { HttpErrorResponse } from '@angular/common/http';

const UNREACHABLE = 'The portal could not be reached. Check your connection and try again.';
const UNEXPECTED = 'Something went wrong on our side. Try again in a moment.';

interface ProblemBody {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

function problemOf(error: unknown): ProblemBody | null {
  return error instanceof HttpErrorResponse && error.error && typeof error.error === 'object'
    ? (error.error as ProblemBody)
    : null;
}

/** A user-safe message for a failed request: the service's problem detail, or a generic fallback. */
export function problemMessage(error: unknown, fallback = UNEXPECTED): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return UNREACHABLE;
    }
    if (error.status >= 500) {
      return UNEXPECTED;
    }
  }
  return problemOf(error)?.detail ?? fallback;
}

/** Field errors from a validation problem response, keyed case-insensitively by field name. */
export function fieldErrors(error: unknown, field: string): string[] {
  const errors = problemOf(error)?.errors ?? {};
  const key = Object.keys(errors).find((k) => k.toLowerCase() === field.toLowerCase());
  return key ? errors[key] : [];
}
