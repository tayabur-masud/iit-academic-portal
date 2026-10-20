/** What the service returns for any configuration record; fields a resource does not have are absent. */
export interface ConfigurationItem {
  id: string;
  name: string;
  isActive: boolean;
  code?: string;
  type?: string;
  address?: string;
  creditsToBeCompleted?: number;
  /** A degree's minimum CGPA for completion, on the 4.00 scale. */
  minimumCgpaForCompletion?: number;
  /** A course's total credit hours, and its optional theory and lab parts. */
  creditHours?: number;
  theoryCreditHours?: number;
  labCreditHours?: number;
  /** A course's optional prerequisite: another active course of the same degree. */
  prerequisiteCourseId?: string;
  degreeId?: string;
  startingSemesterId?: string;
  academicSessionId?: string;
  divisionId?: string;
  districtId?: string;
  /** When and by whom it was created. The account is absent for a seed script or a background change. */
  createdAtUtc: string;
  createdByUserId?: string;
  /** That account's current email; absent when the account was removed (or there was none). */
  createdBy?: string;
  lastModifiedAtUtc: string;
  lastModifiedByUserId?: string;
  lastModifiedBy?: string;
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
  hasCredits: boolean;
  /** The code must be given (otherwise it is optional). */
  codeRequired?: boolean;
  /** The choices for `type`; institution types when absent. */
  typeOptions?: readonly string[];
  /** A course: credit hours with optional theory and lab parts, and an optional prerequisite of the same degree. */
  isCourse?: boolean;
  /** False for a resource that is only ever deactivated, never deleted. */
  canDelete?: boolean;
  references: ReferenceField[];
  /** The query parameter that limits the list to one parent, if the resource has a parent. */
  parentFilter?: 'divisionId' | 'districtId' | 'degreeId';
  /** For an Upazila: the Division is chosen first and narrows the District choices. */
  cascadeFrom?: string;
  /** Edited on its own screen (the Grade scale), never through the generic list and form. */
  ownEditor?: boolean;
}

export const INSTITUTION_TYPES = ['School', 'College', 'University'] as const;

export const COURSE_TYPES = ['Mandatory', 'Elective'] as const;

const base = { hasCode: false, hasType: false, hasAddress: false, hasCredits: false, references: [] as ReferenceField[] };

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
    description: 'The programs IIT offers, with an optional code and required credit total.',
    hasCode: true,
    hasCredits: true,
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
    slug: 'halls',
    apiPath: 'halls',
    group: 'Other catalogs',
    label: 'Halls',
    singular: 'hall',
    description: 'University residential halls, with an optional code and address.',
    hasCode: true,
    hasAddress: true,
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
    slug: 'courses',
    apiPath: 'courses',
    group: 'IIT academics',
    label: 'Courses',
    singular: 'course',
    description:
      'Each course belongs to one degree and has a unique code, credit hours (optionally split into theory and lab), a Mandatory or Elective type, and an optional prerequisite from the same degree. Courses are deactivated, never deleted.',
    hasCode: true,
    codeRequired: true,
    hasType: true,
    typeOptions: COURSE_TYPES,
    isCourse: true,
    canDelete: false,
    references: [{ name: 'degreeId', label: 'Degree', resource: 'degrees' }],
    parentFilter: 'degreeId',
  },
  {
    ...base,
    slug: 'grades',
    apiPath: 'grades',
    group: 'IIT academics',
    label: 'Grades',
    singular: 'grade band',
    description:
      'One grade scale shared by every degree: marks percentage bands, each with a letter grade, a numeric grade on the 4.00 scale, and a comment. The bands are edited and saved together.',
    references: [],
    ownEditor: true,
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
  {
    ...base,
    slug: 'city-corporations',
    apiPath: 'geography/city-corporations',
    group: 'Geography',
    label: 'City corporations',
    singular: 'city corporation',
    description: 'Each city corporation belongs to one district. Its name is unique among the city corporations of that district.',
    references: [{ name: 'districtId', label: 'District', resource: 'districts' }],
    parentFilter: 'districtId',
    cascadeFrom: 'divisions',
  },
];

/** The sections of the Configuration home, in the order they are shown. */
export const GROUPS = ['IIT academics', 'Other catalogs', 'Geography'] as const;

/** A resource the generic list and form serve; one with its own editor (the Grade scale) is not one of them. */
export function descriptorFor(slug: string | undefined): ResourceDescriptor | undefined {
  return RESOURCES.find((resource) => resource.slug === slug && !resource.ownEditor);
}

/** One band of the global Grade scale, as the service returns it. */
export interface GradeBand {
  id: string;
  letterGrade: string;
  /** Inclusive lower bound, a percentage. */
  marksLowerBound: number;
  /** Exclusive upper bound, a percentage, except that the band ending at 100 includes it. */
  marksUpperBound: number;
  upperBoundInclusive: boolean;
  /** On the 4.00 scale, with at most two decimals. */
  numericGrade: number;
  comment: string;
  isActive: boolean;
  createdAtUtc: string;
  createdByUserId?: string;
  createdBy?: string;
  lastModifiedAtUtc: string;
  lastModifiedByUserId?: string;
  lastModifiedBy?: string;
}

/** One band of a requested scale; leave out `id` to create a band. */
export interface GradeBandRequest {
  id?: string;
  letterGrade: string;
  marksLowerBound: number | null;
  marksUpperBound: number | null;
  upperBoundInclusive: boolean;
  numericGrade: number | null;
  comment: string;
  isActive: boolean;
}

export interface GradeScalePage {
  items: GradeBand[];
  nextCursor: null;
}

/** The body sent to create or update a record. */
export interface ConfigurationRequest {
  name: string;
  isActive: boolean;
  code?: string;
  type?: string;
  address?: string;
  creditsToBeCompleted?: number;
  minimumCgpaForCompletion?: number;
  creditHours?: number;
  theoryCreditHours?: number | null;
  labCreditHours?: number | null;
  prerequisiteCourseId?: string | null;
  degreeId?: string;
  startingSemesterId?: string;
  academicSessionId?: string;
  divisionId?: string;
  districtId?: string;
}
