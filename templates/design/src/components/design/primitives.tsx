"use client";
/* Uit het Pasport-design overgenomen. Ongewijzigd, op AppIcon na - die
 * hoort bij de appcatalogus en niet bij de inlogschermen van de hub. */
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Icon } from "./icons";

/* ============================ BUTTON ============================ */
export function Btn({
  variant = "primary",
  size,
  icon,
  iconRight,
  children,
  className = "",
  ...p
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "lg";
  icon?: string;
  iconRight?: string;
  children?: React.ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ["btn", `btn-${variant}`, size ? `btn-${size}` : "", !children ? "btn-icon" : "", className].join(" ");
  return (
    <button className={cls} {...p}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 15 : 16} />}
    </button>
  );
}

/* ============================ FIELD / INPUT ============================ */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  required,
  badge,
  style,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  children?: React.ReactNode;
  required?: boolean;
  badge?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="field" style={style}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span style={{ color: "var(--red)" }}>*</span>}
          {badge}
        </label>
      )}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Input({ icon, ...p }: { icon?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  if (icon)
    return (
      <div className="input-icon-wrap">
        <Icon name={icon} />
        <input className="input" {...p} />
      </div>
    );
  return <input className="input" {...p} />;
}

export function Toggle({ on, onClick }: { on?: boolean; onClick?: () => void }) {
  return <button type="button" className="toggle" data-on={!!on} onClick={onClick} role="switch" aria-checked={!!on} />;
}

export function Badge({
  tone = "neutral",
  dot,
  icon,
  children,
}: {
  tone?: string;
  dot?: boolean;
  icon?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="dot" />}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Avatar({
  name = "",
  size = 36,
  square,
  color,
}: {
  name?: string;
  size?: number;
  square?: boolean;
  color?: string | null;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={"avatar" + (square ? " avatar-sq" : "")}
      style={{ width: size, height: size, fontSize: size * 0.38, background: color || undefined }}
    >
      {initials}
    </span>
  );
}


/* ============================ MODAL ============================ */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 480,
}: {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-blur" key="blur" />
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        {title && (
          <div className="modal-head" key="head">
            <h3 className="t-h2">{title}</h3>
            <Btn variant="ghost" size="sm" icon="x" onClick={onClose} />
          </div>
        )}
        <div className="modal-body" key="body">
          {children}
        </div>
        {footer && (
          <div className="modal-foot" key="foot">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ============================ SELECT (custom dropdown) ============================ */
export function Select({
  value,
  defaultValue,
  onChange,
  children,
  className = "",
  style,
  disabled,
  placeholder,
}: {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; width: number; top: number | null; bottom: number | null; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const opts = React.Children.toArray(children)
    .filter((c): c is React.ReactElement<any> => React.isValidElement(c) && c.type === "option")
    .map((c) => {
      const ch = c.props.children;
      const label = Array.isArray(ch) ? ch.map((x: any) => (x == null ? "" : x)).join("") : ch == null ? "" : String(ch);
      const val = c.props.value !== undefined ? c.props.value : label;
      return { value: val, label };
    });
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const selValue = controlled ? value : internal;
  const current = opts.find((o) => String(o.value) === String(selValue));

  const place = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const gap = 4,
      vh = window.innerHeight;
    const wanted = Math.min(opts.length * 38 + 10, 300);
    const below = vh - r.bottom - 8,
      above = r.top - 8;
    const up = below < wanted && above > below;
    setCoords({
      left: r.left,
      width: r.width,
      top: up ? null : Math.round(r.bottom + gap),
      bottom: up ? Math.round(vh - r.top + gap) : null,
      maxH: Math.max(120, Math.round(up ? above : below)),
    });
  };
  const toggle = () => {
    if (disabled) return;
    if (!open) place();
    setOpen((o) => !o);
  };
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (btnRef.current && !btnRef.current.contains(target) && !(target.closest && target.closest(".sel-menu"))) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const reflow = () => place();
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", reflow, true);
    window.addEventListener("scroll", reflow, true);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", reflow, true);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [open]);
  const pick = (v: string | number) => {
    setOpen(false);
    if (!controlled) setInternal(v);
    onChange && onChange({ target: { value: String(v) } });
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        disabled={disabled}
        onClick={toggle}
        style={style}
        className={
          "select sel-trigger" +
          (className ? " " + className.replace("select", "").trim() : "") +
          (current ? "" : " placeholder") +
          (open ? " open" : "")
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current ? current.label : placeholder || (opts[0] && opts[0].label) || ""}</span>
      </button>
      {open && coords && typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            className="sel-menu"
            role="listbox"
            style={{
              left: coords.left,
              width: coords.width,
              top: coords.top != null ? coords.top : "auto",
              bottom: coords.bottom != null ? coords.bottom : "auto",
              maxHeight: coords.maxH,
            }}
          >
            {opts.map((o, i) => {
              const active = String(o.value) === String(selValue);
              return (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={"sel-option" + (active ? " sel-active" : "")}
                  onClick={() => pick(o.value)}
                >
                  <span>{o.label}</span>
                  {active && (
                    <span className="sel-check">
                      <Icon name="check" size={15} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
