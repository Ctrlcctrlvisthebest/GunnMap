import { useEffect, useState } from "react";
import type { CSSVariables } from "../../shared/css-types.js";
import { findRoomMatches } from "../../../../src/domain/room-matching.js";
import { RoomInput } from "../rooms/RoomInput.js";
import { buildingName, roomLocationLabel } from "../rooms/room-display.js";
import { periodRoomState } from "./room-validation.js";
import { WebAwesomeColorPicker, WebAwesomeSelect } from "../../shared/WebAwesomeControls.js";
import { PERIOD_COLORS } from "./schedule-storage.js";
import type { Period } from "./types.js";
import type { RoomOption } from "../rooms/types.js";

interface PeriodEditorProps {
  periods: Period[];
  rooms: RoomOption[];
  buildings: string[];
  disabled?: boolean;
  onChange(next: Period[], previous: Period[]): void;
}

export function PeriodEditor({
  periods,
  rooms,
  buildings,
  disabled = false,
  onChange,
}: PeriodEditorProps) {
  const [autoBuildings, setAutoBuildings] = useState<string[]>(() => periods.map((period) => {
    const matches = findRoomMatches(rooms, period.room);
    const candidates = [...new Set(matches.map((room) => room.building))];
    return candidates.length === 1 && candidates[0] === period.building
      ? period.building
      : "";
  }));

  useEffect(() => {
    setAutoBuildings(periods.map((period) => {
      const matches = findRoomMatches(rooms, period.room);
      const candidates = [...new Set(matches.map((room) => room.building))];
      return candidates.length === 1 && candidates[0] === period.building
        ? period.building
        : "";
    }));
  }, [periods, rooms]);

  function update(index: number, mutate: (period: Period, nextAuto: string[]) => void) {
    const previous = periods.map((period) => ({ ...period }));
    const next = previous.map((period) => ({ ...period }));
    const nextAuto = [...autoBuildings];
    mutate(next[index], nextAuto);
    setAutoBuildings(nextAuto);
    onChange(next, previous);
  }

  function updateRoom(index: number, value: string) {
    update(index, (period, nextAuto) => {
      period.room = value;
      const matches = findRoomMatches(rooms, value);
      const candidates = [...new Set(matches.map(room => room.building))];
      if (candidates.length === 1) {
        period.building = candidates[0];
        nextAuto[index] = period.building;
      } else if (nextAuto[index] && period.building === nextAuto[index]) {
        period.building = "";
        nextAuto[index] = "";
      }
    });
  }

  return (
    <div className="period-list">
      {periods.map((period, index) => {
        const number = index + 1;
        const { matches, state, invalid } = periodRoomState(period, rooms);
        const feedback = state === "empty" ? "No class this period"
          : state === "matched" ? `Found ${roomLocationLabel(matches[0])} · ${buildingName(matches[0].building)}${matches[0].floor === 2 ? " · 2nd floor" : ""}`
          : state === "ambiguous" ? "More than one room matches. Choose a location below."
          : `Room not found${period.building ? ` in ${buildingName(period.building)}` : ""}. Check the room or building.`;
        return (
          <div
            className="period-card"
            data-period={number}
            data-room-state={disabled ? "loading" : state}
            style={{ "--period-accent": period.color } as CSSVariables}
            key={number}
          >
            <div
              className="period-number"
              role="group"
              aria-label={`Period ${number}`}
            >
              <span aria-hidden="true">PERIOD</span>
              <strong>{number}</strong>
            </div>
            <label className="field field-room" htmlFor={`period-${number}-room`}>
              <span>Room</span>
              <RoomInput
                id={`period-${number}-room`}
                label={`Period ${number} room`}
                value={period.room}
                building={period.building}
                rooms={rooms}
                placeholder="e.g. N211"
                disabled={disabled}
                invalid={!disabled && invalid}
                describedBy={`period-${number}-feedback`}
                onValueChange={value => updateRoom(index, value)}
              />
            </label>
            <label className="field field-building">
              <span>Building</span>
              <WebAwesomeSelect
                ariaLabel={`Period ${number} building`}
                value={period.building}
                disabled={disabled}
                onValueChange={value => {
                  update(index, (current, nextAuto) => {
                    current.building = value;
                    nextAuto[index] = "";
                  });
                }}
              >
                <wa-option value="">Auto-detect</wa-option>
                {buildings.map(building => (
                  <wa-option value={building} key={building}>
                    {buildingName(building)}
                  </wa-option>
                ))}
              </WebAwesomeSelect>
            </label>
            <p className="period-room-feedback" id={`period-${number}-feedback`} aria-live="polite">
              {disabled ? "Loading room list…" : feedback}
            </p>
            {!disabled && state === "ambiguous" && (
              <div className="period-room-choices" aria-label={`Choose period ${number} room`}>
                {matches.map(room => (
                  <button className="room-lookup-choice" type="button" key={room.id}
                    onClick={() => updateRoom(index, roomLocationLabel(room) === room.label ? `${room.label} (${room.id})` : roomLocationLabel(room))}>
                    {roomLocationLabel(room) === room.label ? `${room.label} (${room.id})` : roomLocationLabel(room)}
                  </button>
                ))}
              </div>
            )}
            <label className="field field-color">
              <span>Color</span>
              <WebAwesomeColorPicker
                ariaLabel={`Period ${number} color`}
                value={period.color}
                swatches={PERIOD_COLORS}
                disabled={disabled}
                onValueChange={value => {
                  update(index, current => {
                    current.color = value;
                  });
                }}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
