import { Role } from '../../core/auth/auth.models';

/** GET /api/profile: the signed-in account's email, its active role, and that role's profile (null when the account has none). */
export interface MyProfileView {
  email: string;
  activeRole: Role;
  profile: MyRoleProfile | null;
}

/** Which profile the active role reads: Admin `staff`, Student `student`, Teacher and Coordinator `teacher`. */
export type MyRoleProfile = MyStaffProfile | MyTeacherProfile | MyStudentProfile;

export interface MyStaffProfile {
  kind: 'staff';
  name: string;
  mobileNumber: string;
  designationName: string | null;
}

export interface MyTeacherProfile {
  kind: 'teacher';
  displayName: string;
  employeeStaffId: string | null;
  phone: string | null;
  designationName: string | null;
}

export interface MyStudentProfile {
  kind: 'student';
  applicantName: string;
  fatherName: string | null;
  motherName: string | null;
  /** ISO date (yyyy-MM-dd). */
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  applicantMobile: string;
  mailingAddress: MyAddress | null;
  permanentAddress: MyAddress | null;
  guardianName: string | null;
  guardianRelationship: string | null;
  guardianAddress: string | null;
  guardianCellNumber: string | null;
  academicHistory: MyAcademicHistoryEntry[];
}

/** One of `upazilaName` and `cityCorporationName` is set when the address has a locality. */
export interface MyAddress {
  details: string | null;
  cellNumber: string | null;
  upazilaName: string | null;
  cityCorporationName: string | null;
  districtName: string | null;
  divisionName: string | null;
}

export interface MyAcademicHistoryEntry {
  category: string;
  examination: string | null;
  schoolOrCollege: string | null;
  board: string | null;
  group: string | null;
  department: string | null;
  university: string | null;
  subject: string | null;
  institution: string | null;
  year: string | null;
  marksObtained: string | null;
  marksPercentage: string | null;
  cgpa: string | null;
  class: string | null;
  division: string | null;
}
