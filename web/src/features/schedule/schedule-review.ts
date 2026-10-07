import { findRoomMatches } from "../../../../src/domain/room-matching.js";
import type { RoomOption } from "../rooms/types.js";
import type { Period } from "./types.js";

/** Stored labels are suggestions until their identity and map revision are checked. */
export function scheduleReview(periods: readonly Period[], rooms: readonly RoomOption[], mapRevision: string) {
  return periods.flatMap((period, index) => {
    if (!period.room.trim()) return [];
    const matches = findRoomMatches(rooms, period.room, period.building);
    const current = matches.length === 1 ? matches[0] : undefined;
    if (mapRevision && period.mapRevision === mapRevision &&
      (current?.id === period.roomId || (!period.roomId && !current))) return [];
    return [{ index, period, current, reason: !period.mapRevision ? "legacy" as const
      : period.mapRevision !== mapRevision ? "map-changed" as const : "identity-changed" as const }];
  });
}

/** Call only for new choices or after the user explicitly confirms displayed matches. */
export function bindCurrentRooms(periods: readonly Period[], rooms: readonly RoomOption[], mapRevision: string): Period[] {
  return periods.map(period => {
    const { roomId: _oldId, mapRevision: _oldRevision, ...fields } = period;
    const matches = findRoomMatches(rooms, period.room, period.building);
    return mapRevision && period.room.trim() && matches.length === 1
      ? { ...fields, roomId: matches[0].id, mapRevision }
      : mapRevision && period.room.trim() ? { ...fields, mapRevision } : fields;
  });
}

/** Changing a color does not confirm a restored room; replacing its input does. */
export function bindEditedRooms(next: readonly Period[], previous: readonly Period[], rooms: readonly RoomOption[], mapRevision: string): Period[] {
  return next.map((period, index) => period.room !== previous[index]?.room || period.building !== previous[index]?.building
    ? bindCurrentRooms([period], rooms, mapRevision)[0]
    : { ...period });
}
