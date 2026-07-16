// Ported from the "Notion Design System" claude.ai/design project
// (components/feedback/Badge.jsx). See Button.tsx for the general notes.
import type { CSSProperties, ReactNode } from 'react';

export interface BadgeProps {
  /** Badge label. */
  children: ReactNode;
  /** Visual variant. */
  variant?: 'default' | 'primary' | 'soft' | 'neutral';
  /** Additional inline styles. */
  style?: CSSProperties;
}

export function Badge({ children, variant = 'default', style: extraStyle, ...props }: BadgeProps) {
  const base: CSSProperties = {
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--font-size-eyebrow)',
    fontWeight: 'var(--font-weight-eyebrow)' as CSSProperties['fontWeight'],
    lineHeight: 'var(--line-height-eyebrow)',
    letterSpacing: 'var(--letter-spacing-eyebrow)',
    borderRadius: 'var(--rounded-full)',
    padding: '4px 8px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  };

  const variantStyles: Record<string, CSSProperties> = {
    default: {
      background: 'var(--color-surface)',
      color: 'var(--color-primary)',
      border: '1px solid var(--color-hairline)',
    },
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--color-on-primary)',
      border: 'none',
    },
    soft: {
      background: 'rgba(0,117,222,0.08)',
      color: 'var(--color-primary)',
      border: 'none',
    },
    neutral: {
      background: 'var(--color-canvas-soft)',
      color: 'var(--color-ink-secondary)',
      border: '1px solid var(--color-hairline)',
    },
  };

  return (
    <span
      style={{ ...base, ...(variantStyles[variant] || variantStyles.default), ...extraStyle }}
      {...props}
    >
      {children}
    </span>
  );
}
