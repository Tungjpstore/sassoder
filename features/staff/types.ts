import type { StaffPermissionGroup, StaffPermissionKey, StaffPermissionProfile, StaffRoleTemplateCode } from "@/lib/staff-permissions";

export type StaffOpsRealtimeState = "idle" | "connecting" | "connected" | "error";

export type StaffOpsRoleSummary = {
  id: string;
  code: StaffRoleTemplateCode | string;
  title: string;
  description: string;
  profile: StaffPermissionProfile;
  scope: "ADMIN" | "STAFF";
  permissionCount: number;
  dangerPermissionCount: number;
  preview: string;
  permissions: StaffPermissionKey[];
  system: boolean;
};

export type StaffOpsBranchSummary = {
  id: string;
  name: string;
  address: string;
  isPrimary: boolean;
  isActive: boolean;
  attendanceLocationConfigured: boolean;
  activeStaff: number;
  lateCount: number;
  pendingApprovals: number;
  suspiciousCount: number;
  coverageScore: number;
};

export type StaffOpsMember = {
  id: string;
  userId: string;
  email: string;
  employeeCode: string | null;
  employeeNumber: number | null;
  fullName: string;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  hometown: string | null;
  phone: string | null;
  username: string | null;
  hasPin: boolean;
  mustChangeAppPassword: boolean;
  appPasswordAttempts: number;
  appPasswordLockedUntil: string | null;
  appPasswordLastFailedAt: string | null;
  roleCode: StaffRoleTemplateCode | string;
  roleTitle: string;
  roleProfile: StaffPermissionProfile;
  permissions: StaffPermissionKey[];
  employmentStatus: "active" | "suspended" | "resigned";
  accountStatus: "active" | "blocked";
  isArchived: boolean;
  primaryBranchId: string | null;
  primaryBranchName: string | null;
  branchNames: string[];
  lastSeenAt: string | null;
  activeSessionCount: number;
  todayAttendanceState: "on_time" | "late" | "early_leave" | "overtime" | "absent" | null;
  lateMinutesToday: number;
  overtimeMinutesToday: number;
  suspiciousScore: number;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

export type StaffOpsAttendanceFeedItem = {
  id: string;
  staffMemberId: string;
  fullName: string;
  branchId: string | null;
  branchName: string | null;
  shiftName: string | null;
  state: "on_time" | "late" | "early_leave" | "overtime" | "absent";
  source: "gps" | "qr" | "wifi" | "manual" | "offline_sync";
  approvalState: "auto_approved" | "pending" | "approved" | "rejected";
  clockInAt: string;
  clockOutAt: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  distanceMeters: number | null;
};

export type StaffOpsApprovalItem = {
  id: string;
  attendanceLogId: string | null;
  staffMemberId: string;
  fullName: string;
  branchName: string | null;
  requestType: "outside_location" | "attendance_edit" | "overtime" | "shift_override" | "manual_clock_in" | "leave_request" | "shift_swap" | "device_restriction";
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  requestedPayload: Record<string, unknown>;
  reviewNote: string | null;
  createdAt: string;
};

export type StaffOpsActivityItem = {
  id: string;
  fullName: string | null;
  branchName: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  severity: "info" | "warning" | "critical";
  reason: string | null;
  createdAt: string;
};

export type StaffOpsCoverageDay = {
  isoDate: string;
  label: string;
  assigned: number;
  confirmed: number;
  overtimeAlerts: number;
};

export type StaffOpsHeatmapCell = {
  label: string;
  assigned: number;
  attendance: number;
};

export type StaffOpsShiftTemplate = {
  id: string;
  code: string;
  name: string;
  branchId: string | null;
  branchName: string | null;
  startTime: string;
  endTime: string;
  allowedLateMinutes: number;
  overtimeThresholdMinutes: number;
  attendanceRadiusMeters: number;
  recurringWeekdays: number[];
  isTemplate: boolean;
};

export type StaffOpsShiftAssignment = {
  id: string;
  shiftId: string;
  shiftName: string;
  staffMemberId: string;
  staffName: string;
  branchId: string | null;
  branchName: string | null;
  scheduledDate: string;
  status: "scheduled" | "confirmed" | "swapped" | "cancelled" | "completed";
  source: "manual" | "template" | "copy_week" | "swap" | "system";
};

export type StaffOpsTimesheetSummary = {
  staffMemberId: string;
  fullName: string;
  branchName: string | null;
  attendanceCount: number;
  workMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  approvedOvertimeMinutes: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  lateCount: number;
  pendingApprovals: number;
  attendanceScore: number;
};

export type StaffOpsReviewItem = {
  id: string;
  staffMemberId: string;
  staffName: string;
  periodLabel: string;
  score: number;
  status: "draft" | "completed" | "archived";
  note: string | null;
  createdAt: string;
};

export type StaffOpsContractItem = {
  id: string;
  staffMemberId: string;
  staffName: string;
  contractType: "official" | "probation" | "part_time" | "service" | "other";
  templateCode: string | null;
  contractNumber: string | null;
  jobTitle: string | null;
  workLocation: string | null;
  salaryAmount: number | null;
  salaryPaymentMethod: string | null;
  workingTime: string | null;
  restTime: string | null;
  startDate: string;
  endDate: string | null;
  status: "draft" | "active" | "expired" | "terminated";
  eSignatureStatus: "draft" | "pending_employee" | "pending_employer" | "signed" | "declined" | "voided";
  eContractProvider: string | null;
  eContractId: string | null;
  signedDocumentUrl: string | null;
  note: string | null;
  createdAt: string;
};

export type StaffOpsDocumentItem = {
  id: string;
  staffMemberId: string;
  staffName: string;
  documentName: string;
  documentType: "identity_card" | "health_certificate" | "contract" | "training" | "other";
  fileUrl: string | null;
  fileSizeBytes: number | null;
  status: "complete" | "missing" | "expired";
  note: string | null;
  createdAt: string;
};

export type StaffOpsDeviceItem = {
  id: string;
  staffMemberId: string | null;
  staffName: string | null;
  deviceName: string;
  deviceType: "phone" | "tablet" | "pos" | "cash_drawer" | "other";
  serialNumber: string | null;
  deviceFingerprint: string | null;
  trustedForAttendance: boolean;
  trustedAt: string | null;
  lastSeenAt: string | null;
  issuedAt: string;
  status: "assigned" | "returned" | "lost" | "maintenance";
  note: string | null;
  createdAt: string;
};

export type StaffOpsMobileWorkItem = {
  id: string;
  kind: "order_pending" | "kitchen_order" | "payment_waiting" | "service_request";
  branchId: string | null;
  branchName: string | null;
  title: string;
  subtitle: string;
  tableName: string | null;
  priority: "high" | "medium" | "low";
  action: "accept_order" | "complete_order" | "confirm_payment" | "resolve_request" | null;
  actionLabel: string | null;
  createdAt: string;
};

export type StaffOpsMobileShiftSwapCandidate = {
  id: string;
  fullName: string;
  roleTitle: string;
  primaryBranchId: string | null;
  primaryBranchName: string | null;
  activeSessionCount: number;
};

export type StaffOpsMobileOps = {
  pendingOrders: number;
  cookingOrders: number;
  waitingPayments: number;
  serviceRequests: number;
  urgentCount: number;
  workItems: StaffOpsMobileWorkItem[];
  shiftSwapCandidates: StaffOpsMobileShiftSwapCandidate[];
};

export type StaffOpsNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  status: "unread" | "read" | "archived";
  actionUrl: string | null;
  createdAt: string;
};

export type StaffOpsIncidentItem = {
  id: string;
  staffMemberId: string;
  staffName: string;
  branchId: string | null;
  branchName: string | null;
  title: string;
  description: string;
  severity: "low" | "normal" | "high" | "urgent";
  status: "open" | "reviewing" | "resolved" | "dismissed";
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type StaffOpsOverview = {
  activeStaff: number;
  lateAttendance: number;
  absentStaff: number;
  approvalRequests: number;
  overtimeAlerts: number;
  suspiciousActivities: number;
  realtimeBranchActivity: number;
  activeCashiers: number;
  activeKitchenStaff: number;
  operationsPending: number;
  paidToday: number;
};

export type StaffOpsConfigReadiness = {
  attendanceQrSecretConfigured: boolean;
  attendanceQrSecretRequired: boolean;
  missingRequiredEnv: string[];
};

export type StaffOperationsBundle = {
  generatedAt: string;
  opsConfig: StaffOpsConfigReadiness;
  overview: StaffOpsOverview;
  roles: StaffOpsRoleSummary[];
  branches: StaffOpsBranchSummary[];
  members: StaffOpsMember[];
  attendanceFeed: StaffOpsAttendanceFeedItem[];
  approvals: StaffOpsApprovalItem[];
  activity: StaffOpsActivityItem[];
  weeklyCoverage: StaffOpsCoverageDay[];
  heatmap: StaffOpsHeatmapCell[][];
  shifts: StaffOpsShiftTemplate[];
  shiftAssignments: StaffOpsShiftAssignment[];
  timesheets: StaffOpsTimesheetSummary[];
  reviews: StaffOpsReviewItem[];
  contracts: StaffOpsContractItem[];
  documents: StaffOpsDocumentItem[];
  devices: StaffOpsDeviceItem[];
  incidents: StaffOpsIncidentItem[];
  mobileOps: StaffOpsMobileOps;
  notifications: StaffOpsNotification[];
  unreadNotificationCount: number;
  permissionGroups: StaffPermissionGroup[];
  premium: {
    isPremium: boolean;
    gpsAttendance: boolean;
    approvalWorkflows: boolean;
    anomalyDetection: boolean;
    operationalAnalytics: boolean;
    customPermissions: boolean;
  };
};

export type StaffOperationsBundleScope = "admin" | "self";
