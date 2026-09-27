import { Fragment, h, render } from "preact";
import { useEffect, useState } from "preact/hooks";

export interface Period {
  building: string;
  room: string;
  color: string;
}

export interface RoomOption {
  id: string;
  label: string;
  building: string;
  floor?: number;
  aliases?: string[];
}

interface PeriodEditorProps {
  periods: Period[];
  rooms: RoomOption[];
  buildings: string[];
  resetKey: number;
  onChange(periods: Period[]): void;
}

export interface PeriodEditorHandle {
  setPeriods(periods: Period[]): void;
}

function buildingName(code: string) {
  if (code === "BG") return "Bow Gym";
  if (code === "D") return "D Building / Library";
  return `${code} Building`;
}

function matchesRoom(room: RoomOption, value: string) {
  const key = value.trim().toUpperCase();
  return [room.id, room.label, `${room.label} (${room.id})`, ...(room.aliases ?? [])]
    .some((candidate) => candidate.toUpperCase() === key);
}

function visibleRoomValue(room: RoomOption, candidates: RoomOption[]) {
  if (candidates.filter((candidate) => candidate.label === room.label).length < 2) return room.label;
  return room.aliases?.find((alias) => alias.startsWith(`${room.label} (`)) ?? room.label;
}

function inferredBuildings(periods: Period[], rooms: RoomOption[]) {
  return periods.map((period) => {
    const matches = rooms.filter((room) => matchesRoom(room, period.room));
    const candidates = [...new Set(matches.map((room) => room.building))];
    return candidates.length === 1 && candidates[0] === period.building ? period.building : "";
  });
}

function PeriodList({ periods, rooms, buildings, resetKey, onChange }: PeriodEditorProps) {
  const [autoBuildings, setAutoBuildings] = useState<string[]>(() => inferredBuildings(periods, rooms));

  useEffect(() => setAutoBuildings(inferredBuildings(periods, rooms)), [resetKey]);

  function updateRoom(index: number, value: string) {
    const next = periods.map((period) => ({ ...period }));
    const auto = [...autoBuildings];
    const period = next[index];
    period.room = value;
    const matches = rooms.filter((room) => matchesRoom(room, value));
    const buildingCandidates = [...new Set(matches.map((room) => room.building))];
    if (buildingCandidates.length === 1) {
      period.building = buildingCandidates[0];
      auto[index] = period.building;
    } else if (auto[index] && period.building === auto[index]) {
      period.building = "";
      auto[index] = "";
    }
    setAutoBuildings(auto);
    onChange(next);
  }

  function updateBuilding(index: number, value: string) {
    const next = periods.map((period) => ({ ...period }));
    next[index].building = value;
    next[index].room = "";
    const auto = [...autoBuildings];
    auto[index] = "";
    setAutoBuildings(auto);
    onChange(next);
  }

  function updateColor(index: number, value: string) {
    const next = periods.map((period) => ({ ...period }));
    next[index].color = value;
    onChange(next);
  }

  return (
    <Fragment>
      {periods.map((period, index) => {
        const number = index + 1;
        const candidates = rooms.filter((room) => !period.building || room.building === period.building);
        return (
          <div class="period-card" data-period={number} style={{ "--period-accent": period.color }} key={number}>
            <div class="period-number" role="group" aria-label={`Period ${number}`}>
              <span aria-hidden="true">PERIOD</span>
              <strong>{number}</strong>
            </div>
            <label class="field field-room">
              <span>Room</span>
              <input
                type="text"
                list={`rooms-${number}`}
                placeholder="e.g. N211"
                autocomplete="off"
                aria-label={`Period ${number} room`}
                value={period.room}
                onInput={(event) => updateRoom(index, event.currentTarget.value)}
              />
              <datalist id={`rooms-${number}`}>
                {candidates.map((room) => (
                  <option
                    value={visibleRoomValue(room, candidates)}
                    label={`${buildingName(room.building)}${room.floor === 2 ? " · 2nd floor" : ""}`}
                    key={room.id}
                  />
                ))}
              </datalist>
            </label>
            <label class="field field-building">
              <span>Building</span>
              <wa-select
                aria-label={`Period ${number} building`}
                value={period.building}
                size="s"
                onChange={(event) => updateBuilding(index, (event.currentTarget as HTMLElement & { value: string }).value)}
              >
                <wa-option value="">Auto-detect</wa-option>
                {buildings.map((building) => (
                  <wa-option value={building} key={building}>{buildingName(building)}</wa-option>
                ))}
              </wa-select>
            </label>
            <label class="field field-color">
              <span>Color</span>
              <wa-color-picker
                value={period.color}
                aria-label={`Period ${number} color`}
                format="hex"
                size="s"
                swatches={["#e11d48", "#7c3aed", "#0284c7", "#059669", "#f97316", "#d4a017", "#dc2626"]}
                onInput={(event) => updateColor(index, (event.currentTarget as HTMLElement & { value: string }).value)}
              />
            </label>
          </div>
        );
      })}
    </Fragment>
  );
}

export function mountPeriodEditor(
  target: HTMLElement,
  initialPeriods: Period[],
  rooms: RoomOption[],
  buildings: string[],
  onChange: (periods: Period[]) => void,
): PeriodEditorHandle {
  let periods = initialPeriods;
  let resetKey = 0;
  function draw() {
    render(
      <PeriodList
        periods={periods}
        rooms={rooms}
        buildings={buildings}
        resetKey={resetKey}
        onChange={(next) => {
          periods = next;
          draw();
          onChange(next);
        }}
      />,
      target,
    );
  }
  draw();
  return {
    setPeriods(next) {
      periods = next;
      resetKey += 1;
      draw();
    },
  };
}
