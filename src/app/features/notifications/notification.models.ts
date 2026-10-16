/** Where a notification is in its delivery. "Sent" means the delivery service accepted it, not that it reached an inbox. */
export type NotificationStatus = 'Pending' | 'Retrying' | 'Sent' | 'Failed' | 'Suppressed' | 'Uncertain';

export const NOTIFICATION_STATUSES: readonly { value: NotificationStatus; label: string; help: string }[] = [
  { value: 'Pending', label: 'Pending', help: 'Waiting for its first delivery attempt.' },
  { value: 'Retrying', label: 'Retrying', help: 'A delivery attempt failed and another is scheduled.' },
  { value: 'Sent', label: 'Sent', help: 'Accepted by the delivery service. This does not prove it reached or was read in an inbox.' },
  { value: 'Failed', label: 'Failed', help: 'It could not be delivered. A failed notification can be resent.' },
  { value: 'Suppressed', label: 'Suppressed', help: 'Not sent because its template was disabled when it was requested.' },
  { value: 'Uncertain', label: 'Uncertain', help: 'The delivery service may or may not have accepted it. It is not retried and cannot be resent.' },
];

export interface EventTypeInfo {
  value: string;
  label: string;
}

export const EVENT_TYPES: readonly EventTypeInfo[] = [
  { value: 'TeacherInvitation', label: 'Teacher invitation' },
  { value: 'StudentInvitation', label: 'Student invitation' },
  { value: 'EmailConfirmation', label: 'Email confirmation' },
  { value: 'PasswordReset', label: 'Password reset' },
  { value: 'ResultsPublished', label: 'Results published' },
  { value: 'FeedbackWindowOpened', label: 'Feedback window opened' },
  { value: 'FeedbackClosingReminder', label: 'Feedback closing reminder' },
];

export function eventLabel(eventType: string): string {
  return EVENT_TYPES.find((e) => e.value === eventType)?.label ?? eventType;
}

export function statusLabel(status: string): string {
  return NOTIFICATION_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function statusHelp(status: string): string {
  return NOTIFICATION_STATUSES.find((s) => s.value === status)?.help ?? '';
}

/** Status is always written out; the badge color only reinforces it. */
export function statusBadgeClass(status: string): string {
  return status === 'Sent' ? 'badge badge-success' : status === 'Failed' || status === 'Uncertain' ? 'badge badge-error' : 'badge';
}

/** A template as an Admin sees it. */
export interface NotificationTemplate {
  eventType: string;
  slug: string;
  name: string;
  channel: string;
  isSecurity: boolean;
  enabled: boolean;
  revision: number;
  subject: string;
  body: string;
  placeholders: string[];
  requiredPlaceholders: string[];
  updatedAtUtc: string;
}

export interface TemplateUpdateRequest {
  expectedRevision: number;
  subject: string;
  body: string;
  enabled: boolean;
}

export interface TemplatePreviewRequest {
  subject: string;
  body: string;
  sampleValues?: Record<string, string>;
}

/** A preview: the plain text, and the same message in the branded email layout. Both are made with sample data only. */
export interface TemplatePreview {
  subject: string;
  body: string;
  html: string;
  synthetic: boolean;
}

/** A history row: delivery facts only. It never carries message content. */
export interface NotificationRow {
  id: string;
  eventType: string;
  recipientUserId: string;
  destination?: string;
  channel: string;
  status: NotificationStatus;
  requestedAtUtc: string;
  sentAtUtc?: string;
  contentWithheld: boolean;
  parentNotificationId?: string;
  failureCode?: string;
}

export interface NotificationPage {
  items: NotificationRow[];
  nextCursor: string | null;
}

export interface NotificationAttempt {
  attemptNumber: number;
  startedAtUtc: string;
  completedAtUtc: string;
  outcome: string;
  failureCode?: string;
  providerAcceptedAtUtc?: string;
}

/** A history record with its attempts. An ordinary message adds its exact subject and body; a security message never has them. */
export interface NotificationDetail {
  notification: NotificationRow;
  occurrenceId: string;
  templateRevision: number;
  subject?: string;
  body?: string;
  attempts: NotificationAttempt[];
}

/** The history filter form. Date-times are entered as UTC. */
export interface NotificationFilters {
  recipient: string;
  eventType: string;
  status: '' | NotificationStatus;
  from: string;
  to: string;
}

export const EMPTY_NOTIFICATION_FILTERS: NotificationFilters = { recipient: '', eventType: '', status: '', from: '', to: '' };

export function hasNotificationFilters(filters: NotificationFilters): boolean {
  return Object.values(filters).some((value) => value.trim() !== '');
}

export interface FeedbackReminderSetting {
  configured: boolean;
  leadTimeMinutes?: number;
}

/** Safe, plain-language reasons the service gives for refusing a resend, keyed by its stable code. */
export const RESEND_REFUSALS: Record<string, string> = {
  InProgress: 'This notification is still being delivered.',
  AlreadySent: 'This notification was already accepted by the delivery service.',
  Suppressed: 'This notification was suppressed because its template was disabled.',
  DeliveryUncertain: 'Whether this notification was delivered cannot be determined, so it cannot be resent.',
  AlreadyResent: 'A resend of this notification was already accepted by the delivery service.',
  ResendInProgress: 'A resend of this notification is already in progress.',
  RecipientIneligible: 'The recipient account no longer exists or is deactivated.',
  DestinationChanged: 'The address no longer belongs to the intended recipient.',
  NoDestination: 'The recipient had no email address when this was requested.',
  OwnerWorkflowUnavailable: 'A fresh secure link cannot be produced yet. Use the owning account workflow instead.',
};
