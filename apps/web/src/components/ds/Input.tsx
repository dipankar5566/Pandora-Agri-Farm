// Ported from the "Notion Design System" claude.ai/design project
// (components/inputs/Input.jsx). See Button.tsx for the general notes.
import type { ChangeEventHandler, CSSProperties } from 'react';

export interface InputProps {
  /** Optional visible label rendered above the field. */
  label?: string;
  /** Placeholder text. */
  placeholder?: string;
  /** Input type. */
  type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url';
  /** Controlled value. */
  value?: string;
  /** Uncontrolled default value. */
  defaultValue?: string;
  /** Change handler. */
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Disables the field. */
  disabled?: boolean;
  /** Explicit id — auto-derived from label when omitted. */
  id?: string;
  /** Styles for the outer wrapper div. */
  style?: CSSProperties;
  /** Styles for the inner <input> element. */
  inputStyle?: CSSProperties;
}

export function Input({
  label,
  placeholder,
  type = 'text',
  value,
  defaultValue,
  onChange,
  disabled = false,
  id,
  style: extraStyle,
  inputStyle: extraInputStyle,
  ...props
}: InputProps) {
  const wrapStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxSizing: 'border-box',
    ...extraStyle,
  };

  const labelStyle: CSSProperties = {
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--font-size-caption)',
    fontWeight: 600,
    lineHeight: 1.4,
    color: 'var(--color-ink-secondary)',
  };

  const fieldStyle: CSSProperties = {
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--font-size-body-sm)',
    fontWeight: 'var(--font-weight-body-sm)' as CSSProperties['fontWeight'],
    lineHeight: 'var(--line-height-body-sm)',
    color: 'var(--color-ink)',
    background: 'var(--color-surface)',
    border: '1px solid rgb(221,221,221)',
    borderRadius: 'var(--rounded-xs)',
    padding: '6px 8px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.15s, border-color 0.15s',
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'text',
    ...extraInputStyle,
  };

  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div style={wrapStyle}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>{label}</label>
      )}
      <input
        id={inputId}
        type={type}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        style={fieldStyle}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = 'var(--shadow-level-1)';
          e.currentTarget.style.borderColor = 'rgb(180,180,180)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.borderColor = 'rgb(221,221,221)';
        }}
        {...props}
      />
    </div>
  );
}
