import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeRoomInput } from './src/domain/room-matching.js';
import { readJson, ROOT, rooms } from './project.js';
type Group = 'red' | 'blue' | 'green' | 'black';
type Pixels = [number, number, number, number];
type Assignment = [Group, string, Pixels];
interface GroupInfo {
  title: string;
  color: string;
  destination: string;
  shortDestination: string;
  labels: string[];
  appendReferenceLabel?: boolean;
  description?: string;
}
interface EvacuationData {
  provenance: {
    sourceFile: string;
    sourceImageSha256: string;
    sourceRevisionDate: string | null;
    verifiedOn: string | null;
    imageSize: [number, number];
  };
  groups: Record<Group, GroupInfo>;
  inventoryExceptions: Record<string, string>;
  ranges: [string, number, number, Group, string, Pixels][];
  exact: Record<string, Assignment>;
  whole: Record<string, Assignment>;
}
export interface Evacuation {
  status: 'mapped' | 'unconfirmed'; group: Group | null; color: string | null;
  destination: string; short_destination: string | null; reference_label: string | null; note: string;
  focus: {x:number; y:number; width:number; height:number} | null;
}
const data = readJson<EvacuationData>('evacuation_data.json');

export function evacuationOverview() {
  return {
    provenance: data.provenance,
    groups: Object.fromEntries(Object.entries(data.groups).map(([key, group]) => [key, {
      ...group,
      short_destination: group.shortDestination,
    }])),
    inventoryExceptions: data.inventoryExceptions,
    validationIssues: evacuationDataIssues(),
  };
}

export function evacuationDataIssues() {
  const issues: string[] = [];
  const [imageWidth, imageHeight] = data.provenance.imageSize;
  let actualHash = '';
  try {
    const imagePath = resolve(ROOT, data.provenance.sourceFile);
    const sourceImage = readFileSync(imagePath);
    actualHash = createHash('sha256').update(sourceImage).digest('hex');
    const isPng = sourceImage.length >= 24 &&
      sourceImage.readUInt32BE(0) === 0x89504e47 &&
      sourceImage.readUInt32BE(4) === 0x0d0a1a0a;
    if (!isPng) {
      issues.push(`Source image is not a readable PNG: ${data.provenance.sourceFile}`);
    } else if (
      sourceImage.readUInt32BE(16) !== imageWidth ||
      sourceImage.readUInt32BE(20) !== imageHeight
    ) {
      issues.push('Evacuation reference dimensions do not match the source image.');
    }
  } catch {
    issues.push(`Source image is missing: ${data.provenance.sourceFile}`);
  }
  if (actualHash && actualHash !== data.provenance.sourceImageSha256) {
    issues.push('Source image changed; review evacuation assignments and reference coordinates.');
  }

  const assignments: Assignment[] = [
    ...data.ranges.map((range): Assignment => [range[3], range[4], range[5]]),
    ...Object.values(data.exact),
    ...Object.values(data.whole),
  ];
  for (const [group, label, [left, top, right, bottom]] of assignments) {
    if (!data.groups[group]?.labels.includes(label)) {
      issues.push(`The ${group} assignment “${label}” is missing from the map legend.`);
    }
    if (
      left < 0 || top < 0 || right <= left || bottom <= top ||
      right > imageWidth || bottom > imageHeight
    ) {
      issues.push(`The reference coordinates for “${label}” fall outside the source image.`);
    }
  }

  for (const [index, [prefix, start, end, , referenceLabel]] of data.ranges.entries()) {
    if (!/^[A-Z]+$/.test(prefix) || !Number.isInteger(start) || start < 1 ||
        !Number.isInteger(end) || end < start) {
      issues.push(`Evacuation range “${referenceLabel}” has invalid room-number boundaries.`);
    }
    const matchingRooms = rooms.filter((room) => {
      const match = room.label.toUpperCase().match(/^([A-Z]+)([1-9][0-9]*)$/);
      return room.building === prefix && match?.[1] === prefix &&
        Number(match[2]) >= start && Number(match[2]) <= end;
    });
    if (!matchingRooms.length && !data.inventoryExceptions[referenceLabel]) {
      issues.push(`Evacuation range ${prefix}${start}–${end} has no matching room in the inventory.`);
    }

    for (const [otherPrefix, otherStart, otherEnd, otherGroup, otherLabel] of data.ranges.slice(index + 1)) {
      const overlaps = prefix === otherPrefix && start <= otherEnd && otherStart <= end;
      const sameAssignment = data.ranges[index][3] === otherGroup && referenceLabel === otherLabel;
      if (overlaps && !sameAssignment) {
        issues.push(`Evacuation ranges “${referenceLabel}” and “${otherLabel}” overlap.`);
      }
    }
  }

  for (const label of Object.keys(data.exact)) {
    const matches = rooms.filter((room) =>
      normalizeRoomInput(room.label) === normalizeRoomInput(label));
    if (!matches.length && !data.inventoryExceptions[label]) {
      issues.push(`Evacuation assignment “${label}” is missing from the room inventory.`);
    } else if (matches.length > 1) {
      issues.push(`Evacuation assignment “${label}” matches multiple rooms in the inventory.`);
    }
  }
  for (const building of Object.keys(data.whole)) {
    if (!rooms.some((room) => room.building === building) && !data.inventoryExceptions[building]) {
      issues.push(`Evacuation building “${building}” is missing from the room inventory.`);
    }
  }
  return issues;
}

function mapped([group,reference_label,[left,top,right,bottom]]: Assignment): Evacuation {
  const info = data.groups[group];
  const [imageWidth, imageHeight] = data.provenance.imageSize;
  return {status:'mapped',group,color:info.color,short_destination:info.shortDestination,reference_label,
    destination:info.destination+(info.appendReferenceLabel ? ` — section labeled ${reference_label}` : ''),
    note:'Check the full reference map for the marked path to this assembly group.',
    focus:{x:left/imageWidth,y:top/imageHeight,width:(right-left)/imageWidth,height:(bottom-top)/imageHeight}};
}
/** Only assign rooms explicitly supported by the supplied reference. */
export function evacuationForRoom(room: {label?:string; building?:string}): Evacuation {
  const canonical = (room.label ?? '').trim().toUpperCase().replace(/[\s-]+/g,'');
  const building = (room.building ?? '').trim().toUpperCase();
  const numbered = canonical.match(/^([A-Z]+)([1-9][0-9]*)$/);
  const matches = numbered?.[1] === building;
  const special = (
    (building === 'D' && canonical === 'DLIB') ||
    (building === 'BG' && canonical === 'BOWGYM') ||
    (building === 'TG' && canonical === 'TITANGYM')
  );
  if (data.whole[building] && (matches || special)) return mapped(data.whole[building]);
  if (matches && numbered) {
    if (data.exact[canonical]) return mapped(data.exact[canonical]);
    const range = data.ranges.find(([prefix,start,end]) => prefix === building && +numbered[2] >= start && +numbered[2] <= end);
    if (range) return mapped([range[3],range[4],range[5]]);
  }
  return {status:'unconfirmed',group:null,color:null,short_destination:null,reference_label:null,focus:null,
    destination:'Assembly area not confirmed for this room',
    note: canonical === 'E01'
      ? 'The supplied map labels E1-E2, while this classroom is labeled E01. Their correspondence is unconfirmed; confirm the location with school staff.'
      : 'The supplied evacuation map does not clearly identify an assembly area for this room. Confirm the location with school staff.'};
}
