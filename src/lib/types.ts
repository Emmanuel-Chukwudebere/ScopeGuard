export type ProjectStatus = "DRAFT" | "PENDING" | "LOCKED" | "COMPLETED";

export type LogEntryType = "SYSTEM" | "FREELANCER_UPDATE" | "CLIENT_REQUEST";

export type ScopeVerdict = "IN_SCOPE" | "GRAY_AREA" | "OUT_OF_SCOPE";

export type ReviewStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export interface SowData {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  totalPrice: number;
}

export interface ActivityLogEntry {
  id: string;
  date: string;
  type: LogEntryType;
  message: string;
  scopeVerdict: ScopeVerdict | null;
  reviewStatus: ReviewStatus | null;
  surcharge: number | null;
  aiReasoning: string | null;
}

export interface Project {
  projectId: string;
  status: ProjectStatus;
  createdAt: string;
  freelancerName: string;
  raenestLink: string;
  freelancerUrl: string;
  clientUrl: string;
  sowData: SowData;
  activityLog: ActivityLogEntry[];
}

export function getTotalPrice(project: Project): number {
  const approvedSurcharges = project.activityLog
    .filter((e) => e.reviewStatus === "APPROVED" && e.surcharge)
    .reduce((sum, e) => sum + (e.surcharge ?? 0), 0);
  return project.sowData.totalPrice + approvedSurcharges;
}
