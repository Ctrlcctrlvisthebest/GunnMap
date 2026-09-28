export function buildingName(code: string) {
  if (code === "BG") return "Bow Gym";
  if (code === "D") return "D Building / Library";
  return `${code} Building`;
}

export function roomLocationLabel(room: { label: string; aliases: string[] }) {
  const prefix = `${room.label.toLocaleUpperCase()} (`;
  return room.aliases.find(alias =>
    alias.toLocaleUpperCase().startsWith(prefix)
      && /\blocation\)/i.test(alias),
  ) ?? room.label;
}
