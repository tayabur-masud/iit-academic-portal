/** What the service returns for any configuration record; fields a resource does not have are absent. */
export interface ConfigurationItem {
  id: string;
  name: string;
  isActive: boolean;
  code?: string;
  type?: string;
  address?: string;
  degreeId?: string;
  startingSemesterId?: string;
  academicSessionId?: string;
  divisionId?: string;
  districtId?: string;
}

export interface ConfigurationPage {
  items: ConfigurationItem[];
  nextCursor: string | null;
  /** Present when the request asked for a numbered page. */
  page?: number;
  totalCount?: number;
  totalPages?: number;
}

export type ConfigurationStatus = 'active' | 'inactive' | 'all';

export type ReferenceName =
  | 'degreeId'
  | 'startingSemesterId'
  | 'academicSessionId'
  | 'divisionId'
  | 'districtId';

/** A required reference to another resource, chosen from a list. */
export interface ReferenceField {
  name: ReferenceName;
  label: string;
  /** The slug of the resource it refers to. */
  resource: string;
}

export interface ResourceDescriptor {
  /** The UI path segment and lookup key. */
  slug: string;
  /** The API path after /api/admin/configuration/. */
  apiPath: string;
  group: 'IIT academics' | 'Other catalogs' | 'Geography';
  /** Plural, for headings and navigation. */
  label: string;
  /** Singular, for buttons and messages. */
  singular: string;
  description: string;
  hasCode: boolean;
  hasType: boolean;
  hasAddress: boolean;
  references: ReferenceField[];
  /** The query parameter that limits the list to one parent, if the resource has a parent. */
  parentFilter?: 'divisionId' | 'districtId';
  /** For an Upazila: the Division is chosen first and narrows the District choices. */
  cascadeFrom?: string;
}

export const INSTITUTION_TYPES = ['School', 'College', 'University'] as const;

const base = { hasCode: false, hasType: false, hasAddress: false, references: [] as ReferenceField[] };

export const RESOURCES: ResourceDescriptor[] = [
  {
    ...base,
    slug: 'institutions',
    apiPath: 'institutions',
    group: 'Other catalogs',
    label: 'Educational institutions',
    singular: 'educational institution',
    description: 'Schools, colleges, and universities, with an optional code and address.',
    hasCode: true,
    hasType: true,
    hasAddress: true,
  },
  {
    ...base,
    slug: 'education-boards',
    apiPath: 'education-boards',
    group: 'Other catalogs',
    label: 'Education boards',
    singular: 'education board',
    description: 'Boards that conduct previous-education examinations.',
    hasCode: true,
  },
  {
    ...base,
    slug: 'education-groups',
    apiPath: 'education-groups',
    group: 'Other catalogs',
    label: 'Education groups',
    singular: 'education group',
    description: 'Previous-education groups such as Science, Humanities, and Business Studies.',
  },
  {
    ...base,
    slug: 'examination-types',
    apiPath: 'examination-types',
    group: 'Other catalogs',
    label: 'Examination types',
    singular: 'examination type',
    description: 'Previous-education categories such as SSC/O-Level, HSC/A-Level, and Bachelor.',
  },
  {
    ...base,
    slug: 'degrees',
    apiPath: 'degrees',
    group: 'IIT academics',
    label: 'Degrees',
    singular: 'degree',
    description: 'The programs IIT offers, with an optional code.',
    hasCode: true,
  },
  {
    ...base,
    slug: 'semesters',
    apiPath: 'semesters',
    group: 'IIT academics',
    label: 'Semesters',
    singular: 'semester',
    description: 'Semester labels. A semester does not depend on a degree or batch.',
  },
  {
    ...base,
    slug: 'academic-sessions',
    apiPath: 'academic-sessions',
    group: 'IIT academics',
    label: 'Academic sessions',
    singular: 'academic session',
    description: 'Session labels such as 2025-2026. Many batches can share one.',
  },
  {
    ...base,
    slug: 'designations',
    apiPath: 'designations',
    group: 'Other catalogs',
    label: 'Designations',
    singular: 'designation',
    description: 'Teaching and staff designations, with an optional code.',
    hasCode: true,
  },
  {
    ...base,
    slug: 'batches',
    apiPath: 'batches',
    group: 'IIT academics',
    label: 'Batches',
    singular: 'batch',
    description: 'A batch has a degree, a starting semester, and an academic session. Its name is unique within the degree.',
    references: [
      { name: 'degreeId', label: 'Degree', resource: 'degrees' },
      { name: 'startingSemesterId', label: 'Starting semester', resource: 'semesters' },
      { name: 'academicSessionId', label: 'Academic session', resource: 'academic-sessions' },
    ],
  },
  {
    ...base,
    slug: 'divisions',
    apiPath: 'geography/divisions',
    group: 'Geography',
    label: 'Divisions',
    singular: 'division',
    description: 'The top level of the geographic hierarchy.',
  },
  {
    ...base,
    slug: 'districts',
    apiPath: 'geography/districts',
    group: 'Geography',
    label: 'Districts',
    singular: 'district',
    description: 'Each district belongs to one division.',
    references: [{ name: 'divisionId', label: 'Division', resource: 'divisions' }],
    parentFilter: 'divisionId',
  },
  {
    ...base,
    slug: 'upazilas',
    apiPath: 'geography/upazilas',
    group: 'Geography',
    label: 'Upazilas',
    singular: 'upazila',
    description: 'Each upazila belongs to one district.',
    references: [{ name: 'districtId', label: 'District', resource: 'districts' }],
    parentFilter: 'districtId',
    cascadeFrom: 'divisions',
  },
];

/** The sections of the Configuration home, in the order they are shown. */
export const GROUPS = ['IIT academics', 'Other catalogs', 'Geography'] as const;

export function descriptorFor(slug: string | undefined): ResourceDescriptor | undefined {
  return RESOURCES.find((resource) => resource.slug === slug);
}

/** The body sent to create or update a record. */
export interface ConfigurationRequest {
  name: string;
  isActive: boolean;
  code?: string;
  type?: string;
  address?: string;
  degreeId?: string;
  startingSemesterId?: string;
  academicSessionId?: string;
  divisionId?: string;
  districtId?: string;
}
