// Ported from the "Notion Design System" claude.ai/design project
// (components/buttons/Button.jsx) — same inline-style-reading-var()
// implementation, typed for this app. Reads tokens from
// src/design-tokens.css (loaded globally in main.tsx). Not wired into any
// existing page; available for future use, distinct from MUI's Button.
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

export interface ButtonProps {
  /** Visual variant controlling shape, fill, and size. */
  variant?: 'primary' | 'secondary' | 'utility';
  /** Button label content. */
  children: ReactNode;
  /** Disables interaction and reduces opacity. */
  disabled?: boolean;
  /** Click handler. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Renders as an <a> tag when provided. */
  href?: string;
  /** Additional inline styles. */
  style?: CSSProperties;
}

export function Button({
  variant = 'primary',
  children,
  disabled = false,
  onClick,
  href,
  style: extraStyle,
  ...props
}: ButtonProps) {
  const base: CSSProperties = {
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--font-size-button)',
    fontWeight: 'var(--font-weight-button)' as CSSProperties['fontWeight'],
    lineHeight: 'var(--line-height-button)',
    letterSpacing: 'var(--letter-spacing-button)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, transform 0.1s, box-shadow 0.15s',
    outline: 'none',
    userSelect: 'none',
  };

  const variantStyles: Record<string, CSSProperties> = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--color-on-primary)',
      borderRadius: 'var(--rounded-full)',
      padding: '10px 20px',
    },
    secondary: {
      background: 'var(--color-surface)',
      color: 'var(--color-ink)',
      borderRadius: 'var(--rounded-full)',
      padding: '10px 20px',
      border: '1px solid var(--color-hairline)',
      boxShadow: 'var(--shadow-level-1)',
    },
    utility: {
      background: 'var(--color-surface)',
      color: 'var(--color-ink)',
      borderRadius: 'var(--rounded-md)',
      padding: '4px 14px',
      border: '1px solid var(--color-hairline)',
    },
  };

  const style = { ...base, ...(variantStyles[variant] || variantStyles.primary), ...extraStyle };

  if (href && !disabled) {
    return (
      <a href={href} style={style} {...props}>{children}</a>
    );
  }

  return (
    <button
      style={style}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.95)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...props}
    >
      {children}
    </button>
  );
}
