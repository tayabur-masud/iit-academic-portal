export type AuditCategory = 'business' | 'security';
export type AuditOutcome = 'success' | 'failure' | 'denied';

/** One allowlisted field change, or a safe indicator that a protected field changed without its values. */
export interface AuditChange {
  fieldName: string;
  oldValue?: unknown;
  newValue?: unknown;
  changed?: boolean;
}

/** A formal audit event as the service returns it (contracts/audit.openapi.json). */
export interface AuditEvent {
  eventId: string;
  occurredAtUtc: string;
  category: AuditCategory;
  eventType: string;
  outcome: AuditOutcome;
  actorUserId: string | null;
  /** The actor's current email, resolved when the event is viewed; null when the account no longer exists. */
  actorDisplay: string | null;
  entityType: string | null;
  entityId: string | null;
  correlationId: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  changes: AuditChange[];
}

export interface AuditPage {
  items: AuditEvent[];
  nextCursor: string | null;
  /** Present because the screen asks for numbered pages. */
  page?: number;
  totalCount?: number;
  totalPages?: number;
}

/** The filter form's values. Date-times are entered as UTC. */
export interface AuditFilters {
  from: string;
  to: string;
  category: '' | AuditCategory;
  outcome: '' | AuditOutcome;
  eventType: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  correlationId: string;
}

export const EMPTY_FILTERS: AuditFilters = {
  from: '',
  to: '',
  category: '',
  outcome: '',
  eventType: '',
  actorUserId: '',
  entityType: '',
  entityId: '',
  correlationId: '',
};

export const PAGE_SIZE = 25;

/**
 * The page numbers to show: the first and last page and a window around the current one, with an ellipsis where
 * pages are skipped, for example 1 … 8 9 [10] 11 12 … 40.
 */
export function pageList(current: number, total: number, around = 2): (number | '…')[] {
  if (total <= 1) {
    return total === 1 ? [1] : [];
  }
  const wanted = new Set([1, total]);
  for (let n = current - around; n <= current + around; n++) {
    if (n >= 1 && n <= total) {
      wanted.add(n);
    }
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: (number | '…')[] = [];
  sorted.forEach((n, i) => {
    const previous = sorted[i - 1];
    if (previous !== undefined && n - previous === 2) {
      result.push(previous + 1); // a single skipped page is shown, not hidden behind an ellipsis
    } else if (previous !== undefined && n - previous > 2) {
      result.push('…');
    }
    result.push(n);
  });
  return result;
}

/** Whether any filter is set, which decides which empty-state message applies. */
export function hasFilters(filters: AuditFilters): boolean {
  return Object.values(filters).some((value) => value.trim() !== '');
}

/** Turns a `datetime-local` value (entered as UTC) into the ISO instant the service expects. */
export function toUtcInstant(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.length === 16 ? `${trimmed}:00Z` : `${trimmed}Z`;
}

/** A value from metadata or a change, as readable text. Structured values are shown as JSON. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}
