export interface RoomMatchOption {
  id: string;
  label: string;
  aliases?: string[];
}

export function normalizeRoomInput(value: string) {
  return value.replace(/[\s-]+/g, "").toLowerCase();
}

export function roomMatchesInput(room: RoomMatchOption, value: string) {
  const query = normalizeRoomInput(value);
  if (!query) return false;
  return [room.id, room.label, `${room.label} (${room.id})`, ...(room.aliases ?? [])]
    .some((candidate) => normalizeRoomInput(candidate) === query);
}
