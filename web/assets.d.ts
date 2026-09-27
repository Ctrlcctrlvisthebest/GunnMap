declare module "*.css";

import type { JSX } from "preact";

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "wa-select": JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        size?: "xs" | "s" | "m" | "l" | "xl" | "small" | "medium" | "large";
        placeholder?: string;
        appearance?: "filled" | "outlined" | "filled-outlined";
        disabled?: boolean;
      };
      "wa-option": JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        disabled?: boolean;
      };
      "wa-color-picker": JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        label?: string;
        format?: "hex" | "rgb" | "hsl" | "hsv";
        size?: "xs" | "s" | "m" | "l" | "xl" | "small" | "medium" | "large";
        swatches?: string[];
      };
      "wa-tooltip": JSX.HTMLAttributes<HTMLElement> & {
        for?: string;
        placement?: "top" | "top-start" | "top-end" | "bottom" | "bottom-start" | "bottom-end" | "left" | "left-start" | "left-end" | "right" | "right-start" | "right-end";
        trigger?: string;
      };
    }
  }
}
