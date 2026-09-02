"use client";
import React, { useEffect, useRef } from "react";

export function OtpInput({
  length = 6,
  value,
  setValue,
  onComplete,
  error,
  autoFocus,
}: {
  length?: number;
  value: string;
  setValue: (v: string) => void;
  onComplete?: (v: string) => void;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chars = Array.from({ length }, (_, i) => value[i] || "");
  const change = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, "").slice(-1);
    const arr = chars.slice();
    arr[i] = d;
    const joined = arr.join("");
    setValue(joined);
    if (d && i < length - 1) refs.current[i + 1]?.focus();
    if (arr.every((c) => c)) onComplete && onComplete(joined);
  };
  const keyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !chars[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };
  const paste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const txt = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, length);
    if (!txt) return;
    e.preventDefault();
    setValue(txt);
    const f = Math.min(txt.length, length - 1);
    refs.current[f]?.focus();
    if (txt.length === length) onComplete && onComplete(txt);
  };
  return (
    <div className={"otp-row" + (error ? " error" : "")} onPaste={paste}>
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="otp-box"
          inputMode="numeric"
          maxLength={1}
          value={c}
          onChange={(e) => change(i, e)}
          onKeyDown={(e) => keyDown(i, e)}
          aria-label={`Cijfer ${i + 1}`}
        />
      ))}
    </div>
  );
}
