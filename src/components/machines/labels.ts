import type { ServiceOutcome, ServiceType } from "@/server/domain/enums";

/** Words for service record types and outcomes (history and the log-service form). */
export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  repair: "Repair",
  scheduled_checkup: "Scheduled checkup",
  inspection: "Inspection",
  cleaning: "Cleaning",
  calibration: "Calibration",
  other: "Other",
};

export const OUTCOME_LABELS: Record<ServiceOutcome, string> = {
  returned_to_service: "Returned to service",
  still_out_of_service: "Still out of service",
  passed: "Passed",
  issues_found: "Issues found",
};
