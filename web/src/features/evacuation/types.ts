import type { EvacuationInfo } from "../rooms/types.js";
import type { EvacuationReview } from "../../../../src/domain/evacuation-review.js";

export interface EvacuationGroupInfo {
  title: string;
  color: string;
  destination: string;
  short_destination: string;
  labels: string[];
  description?: string;
}

export interface EvacuationOverview {
  provenance: {
    sourceKind: "supplied_reference" | "official_site_map" | "official_evacuation_plan";
    originalFilename: string;
    sourceFile: string;
    sourceImageSha256: string;
    sourceRevisionDate: string | null;
    verifiedOn: string | null;
    imageSize: [number, number];
  };
  review: EvacuationReview;
  routesAvailable: boolean;
  groups: Record<string, EvacuationGroupInfo>;
  inventoryExceptions: Record<string, string>;
  validationIssues: string[];
}

export interface ScheduleEvacuationEntry {
  period: number;
  id: string;
  room: string;
  building: string;
  floor: number | null;
  reviewRequired: boolean;
  color: string;
  marker: [number, number] | null;
  evacuation: EvacuationInfo | null;
}

export interface ScheduleLookupResponse {
  map_revision: string;
  rooms: Array<{
    id: string;
    label: string;
    building: string;
    floor: number;
    marker: [number, number];
    evacuation: EvacuationInfo;
  }>;
  map_size: [number, number];
}
