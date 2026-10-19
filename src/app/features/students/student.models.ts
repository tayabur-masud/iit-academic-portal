import { AccountStatus } from '../users/user.models';

/** The six fixed prior-education categories; every other history value is free text kept as written on the form. */
export type AcademicHistoryCategory = 'SscOLevel' | 'HscALevel' | 'BachelorGraduation' | 'Master' | 'Pgdit' | 'Other';

export const HISTORY_CATEGORIES: readonly { value: AcademicHistoryCategory; label: string }[] = [
  { value: 'SscOLevel', label: 'SSC / O-Level' },
  { value: 'HscALevel', label: 'HSC / A-Level' },
  { value: 'BachelorGraduation', label: 'Bachelor / Graduation' },
  { value: 'Master', label: 'Master' },
  { value: 'Pgdit', label: 'PGDIT' },
  { value: 'Other', label: 'Other' },
];

export function categoryLabel(category: string): string {
  return HISTORY_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

/** The text fields of one history row, in the order the form shows them. */
export const HISTORY_FIELDS = [
  { name: 'examination', label: 'Examination' },
  { name: 'schoolOrCollege', label: 'School / college' },
  { name: 'board', label: 'Board' },
  { name: 'group', label: 'Group' },
  { name: 'department', label: 'Department' },
  { name: 'university', label: 'University' },
  { name: 'subject', label: 'Subject' },
  { name: 'institution', label: 'Institution' },
  { name: 'year', label: 'Year' },
  { name: 'marksObtained', label: 'Marks obtained' },
  { name: 'marksPercentage', label: 'Marks %' },
  { name: 'cgpa', label: 'CGPA' },
  { name: 'class', label: 'Class' },
  { name: 'division', label: 'Division' },
] as const;

export type HistoryField = (typeof HISTORY_FIELDS)[number]['name'];

export type AcademicHistoryValues = Partial<Record<HistoryField, string | null>>;

/**
 * The history fields chosen from a Configuration catalog, with the ID field that holds the choice. The text field keeps the name: the
 * catalog name when chosen, or the name typed from the form when it is not listed. Institutions are limited to the types that fit.
 */
export const CATALOG_FIELDS = {
  schoolOrCollege: { idField: 'schoolOrCollegeId', catalog: 'institutions', types: ['School', 'College'] },
  university: { idField: 'universityId', catalog: 'institutions', types: ['University'] },
  institution: { idField: 'institutionId', catalog: 'institutions', types: null },
  board: { idField: 'boardId', catalog: 'education-boards', types: null },
  group: { idField: 'groupId', catalog: 'education-groups', types: null },
} as const;

export type CatalogField = keyof typeof CATALOG_FIELDS;
export type CatalogIdField = (typeof CATALOG_FIELDS)[CatalogField]['idField'];

export function isCatalogField(name: string): name is CatalogField {
  return name in CATALOG_FIELDS;
}

export type AcademicHistoryIds = Partial<Record<CatalogIdField, string | null>>;

export interface AcademicHistoryEntry extends AcademicHistoryValues, AcademicHistoryIds {
  id: string;
  category: AcademicHistoryCategory;
}

export interface AcademicHistoryRequest extends AcademicHistoryValues, AcademicHistoryIds {
  id: string | null;
  category: string;
}

/** An address as the service returns it: the details plus the Upazila and the District and Division derived from it. */
export interface StudentAddress {
  details?: string | null;
  cellNumber?: string | null;
  upazilaId?: string | null;
  upazilaName?: string | null;
  districtId?: string | null;
  districtName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
}

/** An address as sent: no District or Division, which the service derives from the Upazila. */
export interface StudentAddressRequest {
  details: string | null;
  upazilaId: string | null;
  cellNumber: string | null;
}

export interface StudentAdmissionSummary {
  id: string;
  degreeId: string;
  degreeName?: string | null;
  batchId: string;
  batchName?: string | null;
  registrationNumber?: string | null;
  createdAtUtc: string;
}

/** The shared Student profile. The email and status are the account's. It never carries a password or setup link. */
export interface StudentProfile {
  id: string;
  userId: string;
  email: string;
  accountStatus: AccountStatus;
  applicantName: string;
  fatherName?: string | null;
  motherName?: string | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  applicantMobile: string;
  mailingAddress?: StudentAddress | null;
  permanentAddress?: StudentAddress | null;
  guardianName?: string | null;
  guardianRelationship?: string | null;
  guardianAddress?: string | null;
  guardianCellNumber?: string | null;
  academicHistory: AcademicHistoryEntry[];
  admissions: StudentAdmissionSummary[];
}

export interface StudentAdmission {
  id: string;
  profile: StudentProfile;
  otherAdmissions: StudentAdmissionSummary[];
  degreeId: string;
  degreeName?: string | null;
  batchId: string;
  batchName?: string | null;
  admissionSerialNumber: string;
  admissionExamRoll: string;
  classRoll?: string;
  assignedHallId?: string;
  assignedHallName?: string;
  registrationNumber?: string;
  createdAtUtc: string;
  createdByUserId?: string;
  createdBy?: string;
  lastModifiedAtUtc: string;
  lastModifiedByUserId?: string;
  lastModifiedBy?: string;
}

export interface StudentAdmissionCreated {
  admission: StudentAdmission;
  accountCreated: boolean;
  profileCreated: boolean;
  setupEmailRequested: boolean;
}

export interface StudentListItem {
  id: string;
  studentProfileId: string;
  userId: string;
  applicantName: string;
  email: string;
  accountStatus: AccountStatus;
  degreeId: string;
  degreeName?: string | null;
  batchId: string;
  batchName?: string | null;
  admissionExamRoll: string;
  classRoll?: string;
  assignedHallName?: string;
  registrationNumber?: string;
}

export interface StudentPage {
  items: StudentListItem[];
  page: number;
  totalCount: number;
  totalPages: number;
}

/** The admission form as sent. There is no password, attachment, or signature field. */
export interface StudentAdmissionRequest {
  email?: string;
  applicantName: string;
  fatherName: string | null;
  motherName: string | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  applicantMobile: string;
  mailingAddress: StudentAddressRequest | null;
  permanentAddress: StudentAddressRequest | null;
  guardianName: string | null;
  guardianRelationship: string | null;
  guardianAddress: string | null;
  guardianCellNumber: string | null;
  degreeId: string | null;
  batchId: string | null;
  admissionSerialNumber: string;
  admissionExamRoll: string;
  classRoll: string | null;
  assignedHallId: string | null;
  registrationNumber: string | null;
  academicHistory: AcademicHistoryRequest[];
}

export type StudentLookupStatus = 'New' | 'ExistingStudent' | 'NotStudentAccount';

export interface StudentLookup {
  status: StudentLookupStatus;
  profile?: StudentProfile;
}

export type RequirementStatus = 'Met' | 'NotMet' | 'Unavailable';

export interface EligibilityRequirement {
  requirement: 'Credits' | 'AssignedHall' | 'RegistrationNumber';
  status: RequirementStatus;
  message: string;
}

export interface GraduationEligibility {
  admissionId: string;
  eligible: boolean;
  requiredCredits?: number;
  completedCredits?: number;
  requirements: EligibilityRequirement[];
}

export const REQUIREMENT_LABELS: Record<EligibilityRequirement['requirement'], string> = {
  Credits: 'Credits',
  AssignedHall: 'Assigned hall',
  RegistrationNumber: 'Registration number',
};
