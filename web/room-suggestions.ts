import autoComplete from "@tarekraafat/autocomplete.js";
import "@tarekraafat/autocomplete.js/dist/css/autoComplete.02.css";

export interface RoomSuggestion {
  id: string;
  label: string;
  building: string;
  floor?: number;
  aliases?: string[];
}

interface SuggestionOptions {
  getBuilding?: () => string;
  onInput?: (value: string) => void;
}

interface SuggestionRecord {
  label: string;
  searchText: string;
  building: string;
  floor?: number;
}

interface SelectionDetail {
  selection?: { value?: SuggestionRecord };
}

function normalize(value: string) {
  return value.replace(/[\s-]+/g, "").toLowerCase();
}

function humanAliases(room: RoomSuggestion) {
  return (room.aliases ?? []).filter((alias) => !/^R\d{3}$/i.test(alias.trim()));
}

function roomLabelVariant(label: string, input: string) {
  const separator = input.includes("-") ? "-" : /\s/.test(input) ? " " : "";
  const parts = label.match(/^([A-Za-z]+)(\d.*)$/);
  if (!separator || !parts) return "";
  return `${parts[1]}${separator}${parts[2]}`;
}

function suggestionRecords(rooms: RoomSuggestion[], building: string, input: string): SuggestionRecord[] {
  const eligible = rooms.filter((room) => !building || room.building === building);
  const labelCounts = new Map<string, number>();
  for (const room of eligible) {
    const key = normalize(room.label);
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }

  return eligible.map((room) => {
    const aliases = humanAliases(room);
    const locationAlias = aliases.find((alias) => /\blocation\b/i.test(alias));
    const hasDuplicateLabel = (labelCounts.get(normalize(room.label)) ?? 0) > 1;
    const label = hasDuplicateLabel && locationAlias ? locationAlias : room.label;
    const searchTerms = new Set([room.label, label, ...aliases]);
    const labelVariant = roomLabelVariant(room.label, input);
    if (labelVariant) searchTerms.add(labelVariant);

    return {
      label,
      searchText: [...searchTerms].join(" "),
      building: room.building,
      floor: room.floor,
    };
  });
}

function displayBuilding(code: string) {
  if (code === "BG") return "Bow Gym";
  if (code === "D") return "D Building / Library";
  return `${code} Building`;
}

export function mountRoomSuggestions(
  input: HTMLInputElement,
  rooms: RoomSuggestion[],
  options: SuggestionOptions = {},
) {
  input.classList.add("room-suggestion-input");
  input.setAttribute("autocomplete", "off");

  const listId = `${input.id}-suggestions`;
  const instance = new autoComplete({
    selector: () => input,
    name: "roomAutocomplete",
    threshold: 1,
    debounce: 70,
    data: {
      src: async (query: string) => suggestionRecords(rooms, options.getBuilding?.() ?? "", query),
      keys: ["searchText"],
      cache: false,
    },
    searchEngine: "strict",
    resultsList: {
      id: listId,
      class: "room-suggestion-results",
      maxResults: 8,
      tabSelect: true,
      noResults: false,
    },
    resultItem: {
      class: "room-suggestion-option",
      element: (item: HTMLLIElement, data: { value: unknown }) => {
        const suggestion = data.value as SuggestionRecord;
        const label = document.createElement("span");
        label.className = "room-suggestion-option-label";
        label.textContent = suggestion.label;

        const location = document.createElement("small");
        location.className = "room-suggestion-option-location";
        location.textContent = `${displayBuilding(suggestion.building)}${suggestion.floor === 2 ? " · 2nd floor" : ""}`;
        item.replaceChildren(label, location);
      },
    },
  });

  const handleInput = () => options.onInput?.(input.value);
  const handleSelection = (event: Event) => {
    const detail = (event as CustomEvent<SelectionDetail>).detail;
    const selected = detail.selection?.value;
    if (!selected) return;
    input.value = selected.label;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  input.addEventListener("input", handleInput);
  input.addEventListener("selection", handleSelection);

  return {
    refresh() {
      instance.start(input.value);
    },
    destroy() {
      input.removeEventListener("input", handleInput);
      input.removeEventListener("selection", handleSelection);
      instance.unInit();
      document.getElementById(listId)?.remove();
      input.classList.remove("room-suggestion-input");
    },
  };
}
