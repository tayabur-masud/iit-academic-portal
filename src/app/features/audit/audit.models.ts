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
