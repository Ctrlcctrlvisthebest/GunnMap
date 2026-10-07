/** A review records evidence; a site map alone never confirms an evacuation plan. */
export interface EvacuationReview {
  status: 'pending_school_plan' | 'verified_school_plan';
  checkedOn: string;
  checkedBy: string;
  mapRevision: string;
  inventorySha256: string;
  verifiedBy: string | null;
  note: string;
  missingEvidence: string[];
}
