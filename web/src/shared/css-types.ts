import type { CSSProperties } from "react";

export type CSSVariables = CSSProperties & {
  [property: `--${string}`]: string | number | undefined;
};
