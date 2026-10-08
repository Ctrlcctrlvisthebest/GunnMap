import type { Ref } from "react";
import { buildingName } from "../rooms/room-display.js";
import type { ScheduleEvacuationEntry } from "./types.js";

export function assemblySummary(entry: ScheduleEvacuationEntry) {
  if (entry.evacuation?.status !== "mapped") return "Assembly area not confirmed";
  const reference = entry.evacuation.reference_label && !/^[A-Z]$/i.test(entry.evacuation.reference_label)
    ? `${entry.evacuation.reference_label} · ` : "";
  const destination = entry.evacuation.short_destination ?? entry.evacuation.destination;
  return `${entry.evacuation.group} group · ${reference}${destination}`;
}

export function EvacuationPeriodPicker({ entries, selectedPeriod, onSelect }: {
  entries: ScheduleEvacuationEntry[];
  selectedPeriod: number | null;
  onSelect: (period: number) => void;
}) {
  return (
    <div className="evacuation-period-picker" role="group" aria-label="Choose a schedule room to view its details">
      {entries.map(entry => (
        <button key={entry.period} type="button" aria-pressed={selectedPeriod === entry.period}
          aria-controls="evacuation-selected-room" onClick={() => onSelect(entry.period)}>
          P{entry.period} · {entry.room}
        </button>
      ))}
    </div>
  );
}

/** Details sit outside the transformed artwork, so zoom cannot hide the text. */
export function EvacuationRoomDetails({ entry, hasMarkers, detailsRef }: {
  entry?: ScheduleEvacuationEntry;
  hasMarkers: boolean;
  detailsRef?: Ref<HTMLElement>;
}) {
  return (
    <section ref={detailsRef} className="evacuation-selected-room" id="evacuation-selected-room"
      aria-labelledby="evacuation-selected-title" tabIndex={-1}>
      <h3 id="evacuation-selected-title">{entry ? `Period ${entry.period} · ${entry.room}` : "Room details"}</h3>
      {entry ? (
        <>
          <p>{buildingName(entry.building)}{entry.floor !== null && ` · Floor ${entry.floor}`}</p>
          <strong>{assemblySummary(entry)}</strong>
          <p>{entry.evacuation?.note ?? "Assembly area not confirmed. Follow current school staff directions."}</p>
        </>
      ) : <p>{hasMarkers
        ? "Select a period marker or a room button to view its location and assembly status."
        : "No confirmed schedule locations to display. Review your saved rooms in Schedule Map."}</p>}
    </section>
  );
}
