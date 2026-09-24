import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = existsSync(resolve(here, 'room_regions.json')) ? here : resolve(here, '..');
export function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, name), 'utf8')) as T;
}
export type Point = [number, number];
export interface Room {
  id: string; label: string; building: string; floor?: number;
  aliases?: string[]; polygon: Point[]; label_box: [number, number, number, number]; tag_point?: Point;
}
export interface RoomData { base_image: string; image_size: Point; rooms: Room[] }
export const roomData = readJson<RoomData>('room_regions.json');
export const rooms = roomData.rooms;
export const buildings = [...new Set(rooms.map(room => room.building))].sort((a,b) => a === 'BG' ? 1 : b === 'BG' ? -1 : a.localeCompare(b));
export const normalize = (value: string) => value.replace(/[\s-]+/g, '').toLowerCase();
export function resolveRoom(building: string, value: string): Room {
  const inventory = rooms.filter(room => room.building === building);
  if (!inventory.length) throw new Error(`Unknown building: ${building}`);
  const key = (value.trim().match(/^.+\((R\d{3})\)$/i)?.[1] ?? value.trim()).toLowerCase();
  const byId = rooms.find(room => room.id.toLowerCase() === key);
  if (byId) {
    if (byId.building !== building) throw new Error(`${byId.label} is not in ${building} Building`);
    return byId;
  }
  const matches = inventory.filter(room => [room.label, ...(room.aliases ?? [])].some(label => normalize(label) === normalize(value)));
  if (!matches.length) throw new Error(`Room '${value}' was not found in ${building} Building`);
  if (matches.length > 1) throw new Error(`${value} appears twice on the map. Choose ${matches.map(room => `${room.label} (${room.id})`).join('、')}`);
  return matches[0];
}
