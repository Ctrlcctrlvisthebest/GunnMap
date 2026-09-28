import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type WebAwesomeValueElement = HTMLElement & { value: string; disabled: boolean };

interface WebAwesomeSelectProps {
  value: string;
  children: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  placeholder?: string;
  size?: "xs" | "s" | "m" | "l" | "xl" | "small" | "medium" | "large";
  onValueChange(value: string): void;
}

export function WebAwesomeSelect({
  value,
  children,
  ariaLabel,
  disabled = false,
  placeholder,
  size = "s",
  onValueChange,
}: WebAwesomeSelectProps) {
  const elementRef = useRef<WebAwesomeValueElement>(null);
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const handleChange = () => onValueChangeRef.current(element.value);
    element.addEventListener("change", handleChange);
    return () => {
      element.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (element && element.value !== value) element.value = value;
  }, [value]);

  return (
    <wa-select
      ref={elementRef}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      size={size}
    >
      {children}
    </wa-select>
  );
}

interface WebAwesomeColorPickerProps {
  value: string;
  ariaLabel: string;
  disabled?: boolean;
  swatches: string[];
  onValueChange(value: string): void;
}

export function WebAwesomeColorPicker({
  value,
  ariaLabel,
  disabled = false,
  swatches,
  onValueChange,
}: WebAwesomeColorPickerProps) {
  const elementRef = useRef<WebAwesomeValueElement>(null);
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const handleChange = () => onValueChangeRef.current(element.value);
    element.addEventListener("input", handleChange);
    return () => {
      element.removeEventListener("input", handleChange);
    };
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (element && element.value !== value) element.value = value;
  }, [value]);

  return (
    <wa-color-picker
      ref={elementRef}
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      format="hex"
      size="s"
      swatches={swatches}
    />
  );
}
