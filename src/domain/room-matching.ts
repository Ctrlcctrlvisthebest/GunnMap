export interface RoomMatchOption {
  id: string;
  label: string;
  aliases?: string[];
}

export function normalizeRoomInput(value: string) {
  return value.normalize("NFKC").replace(/[\s\-‐‑‒–—−]+/g, "").toLowerCase();
}

/** Keep all matches: duplicate labels such as K6 need an explicit location. */
export function findRoomMatches<T extends RoomMatchOption & { building: string }>(
  rooms: readonly T[], value: string, building = "",
): T[] {
  const buildingKey = normalizeRoomInput(building);
  return rooms.filter(room => (!buildingKey || normalizeRoomInput(room.building) === buildingKey)
    && roomMatchesInput(room, value));
}

export function roomMatchesInput(room: RoomMatchOption, value: string) {
  const query = normalizeRoomInput(value);
  if (!query) return false;
  return [room.id, room.label, `${room.label} (${room.id})`, ...(room.aliases ?? [])]
    .some((candidate) => normalizeRoomInput(candidate) === query);
}
