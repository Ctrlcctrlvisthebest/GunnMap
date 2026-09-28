import { Fragment, h, render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { normalizeRoomInput, roomMatchesInput } from "./room-matching.js";
import { mountRoomSuggestions, type RoomSuggestion } from "./room-suggestions.js";

export interface Period {
  building: string;
  room: string;
  color: string;
}

export type RoomOption = RoomSuggestion;

interface PeriodEditorProps {
  periods: Period[];
  rooms: RoomOption[];
  buildings: string[];
  resetKey: number;
  onChange(periods: Period[]): void;
  onRoomNotice?(message: string): void;
}

export interface PeriodEditorHandle {
  setPeriods(periods: Period[]): void;
}

function buildingName(code: string) {
  if (code === "BG") return "Bow Gym";
  if (code === "D") return "D Building / Library";
  return `${code} Building`;
}

function inferredBuildings(periods: Period[], rooms: RoomOption[]) {
  return periods.map((period) => {
    const matches = rooms.filter((room) => roomMatchesInput(room, period.room));
    const candidates = [...new Set(matches.map((room) => room.building))];
    return candidates.length === 1 && candidates[0] === period.building ? period.building : "";
  });
}

interface RoomInputProps {
  id: string;
  value: string;
  building: string;
  rooms: RoomOption[];
  resetKey: number;
  onInput(value: string): void;
  onBlur(value: string, building: string): void;
}

function RoomInput({ id, value, building, rooms, resetKey, onInput, onBlur }: RoomInputProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<ReturnType<typeof mountRoomSuggestions> | null>(null);
  const current = useRef({ building, onInput, onBlur });
  current.current = { building, onInput, onBlur };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const input = document.createElement("input");
    input.id = id;
    input.type = "text";
    input.placeholder = "e.g. N211";
    input.setAttribute("aria-label", id.replaceAll("-", " "));
    input.value = value;
    host.replaceChildren(input);

    const suggestions = mountRoomSuggestions(input, rooms, {
      getBuilding: () => current.current.building,
      onInput: (nextValue) => current.current.onInput(nextValue),
    });
    suggestionsRef.current = suggestions;
    const handleBlur = () => current.current.onBlur(input.value, current.current.building);
    input.addEventListener("blur", handleBlur);

    return () => {
      input.removeEventListener("blur", handleBlur);
      suggestions.destroy();
      suggestionsRef.current = null;
      host.replaceChildren();
    };
  }, [id, rooms, rooms.length]);

  useEffect(() => {
    suggestionsRef.current?.refresh();
  }, [building]);

  useEffect(() => {
    const input = hostRef.current?.querySelector("input");
    if (input instanceof HTMLInputElement && input.value !== value) input.value = value;
  }, [value, resetKey]);

  return <div ref={hostRef} class="room-suggestion-host" />;
}

function PeriodList({ periods, rooms, buildings, resetKey, onChange, onRoomNotice }: PeriodEditorProps) {
  const [autoBuildings, setAutoBuildings] = useState<string[]>(() => inferredBuildings(periods, rooms));

  useEffect(() => {
    setAutoBuildings(inferredBuildings(periods, rooms));
  }, [resetKey]);

  function updateRoom(index: number, value: string) {
    const next = periods.map((period) => ({ ...period }));
    const auto = [...autoBuildings];
    const period = next[index];
    period.room = value;
    const matches = rooms.filter((room) => roomMatchesInput(room, value));
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

  function roomNotice(value: string, building: string) {
    if (!normalizeRoomInput(value)) return "";
    const candidates = rooms.filter((room) =>
      (!building || room.building === building) && roomMatchesInput(room, value));
    if (candidates.length === 1) return "";
    if (candidates.length > 1) {
      return "More than one room matches. Choose its location from the suggestions.";
    }
    return "Room not found. Check the number or choose a listed suggestion.";
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
        return (
          <div class="period-card" data-period={number} style={{ "--period-accent": period.color }} key={number}>
            <div class="period-number" role="group" aria-label={`Period ${number}`}>
              <span aria-hidden="true">PERIOD</span>
              <strong>{number}</strong>
            </div>
            <label class="field field-room">
              <span>Room</span>
              <RoomInput
                id={`period-${number}-room`}
                value={period.room}
                building={period.building}
                rooms={rooms}
                resetKey={resetKey}
                onInput={(value) => updateRoom(index, value)}
                onBlur={(value, building) => {
                  const message = roomNotice(value, building);
                  if (message) onRoomNotice?.(message);
                }}
              />
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
  onRoomNotice?: (message: string) => void,
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
        onRoomNotice={onRoomNotice}
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
