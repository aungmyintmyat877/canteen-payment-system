"use client";

import { useEffect } from "react";

/**
 * Numeric PIN pad used at the cashier terminal: the student types their own
 * PIN to authorize a payment. Controlled component (value/onChange) so the
 * parent clears it after each attempt. Keyboard input works too, but only
 * when focus is outside text fields — typing in the amount input never
 * touches the PIN.
 */
export default function PinPad({
  value,
  onChange,
  onSubmit,
  disabled,
  length = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  length?: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (disabled) return;
      // Ignore keystrokes that originate from text-entry elements (the amount
      // input, any other field) so the pad never double-consumes typing.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        onChange((value + e.key).slice(0, length));
      } else if (e.key === "Backspace") {
        onChange(value.slice(0, -1));
      } else if (e.key === "Enter" && value.length === length) {
        onSubmit?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const push = (d: string) => {
    if (disabled) return;
    onChange((value + d).slice(0, length));
  };

  const keyBtn =
    "h-12 rounded-xl bg-white border border-slate-300 text-lg font-semibold hover:bg-slate-50 active:scale-95 disabled:opacity-40";

  return (
    <div className="select-none w-60">
      <div className="mb-3 flex justify-between gap-1.5">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`flex h-10 w-8 items-center justify-center rounded-lg border text-lg ${
              i < value.length
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-300 bg-white"
            }`}
          >
            {i < value.length ? "•" : ""}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={keyBtn} disabled={disabled} onClick={() => push(d)}>
            {d}
          </button>
        ))}
        <button
          type="button"
          className="h-12 rounded-xl bg-slate-200 text-sm font-semibold hover:bg-slate-300 disabled:opacity-40"
          disabled={disabled}
          onClick={() => onChange("")}
        >
          C
        </button>
        <button type="button" className={keyBtn} disabled={disabled} onClick={() => push("0")}>
          0
        </button>
        <button
          type="button"
          className="h-12 rounded-xl bg-slate-200 text-sm font-semibold hover:bg-slate-300 disabled:opacity-40"
          disabled={disabled}
          onClick={() => onChange(value.slice(0, -1))}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
