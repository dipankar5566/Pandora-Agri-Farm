import { createTheme } from '@mui/material/styles';
import type { Shadows } from '@mui/material/styles';

// Notion Design System identity (claude.ai/design project
// 509557b6-140d-42bb-941f-a36fae4faf3f), applied via theme so all existing
// MUI usage across every page picks it up with no page-level changes.
//
// Font: 'Inter' is prepended to the prior stack — the Bengali fallbacks
// ("Noto Sans Bengali", "Bangla MN") are preserved, not dropped. Inter has
// no Bengali glyphs, so bn locale text still falls through correctly
// (CLAUDE.md rule 13: bilingual EN/BN everywhere).
const FONT_FAMILY =
  '\'Inter\', -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Bengali", "Bangla MN", sans-serif';

// --shadow-level-1 / --shadow-level-2 (tokens/elevation.css) — "barely
// there" soft shadows, replacing MUI's sharper defaults. MUI's Shadows
// type is a fixed 25-entry tuple (index 0 is always 'none'); Notion's
// tokens only define two soft levels, so levels 3-24 reuse level-2 rather
// than falling back to MUI's much harder default shadows.
const SHADOW_LEVEL_1 =
  'rgba(0,0,0,0.010) 0px 0.175px 1.041px, rgba(0,0,0,0.020) 0px 0.800px 2.925px, rgba(0,0,0,0.027) 0px 2.025px 7.847px, rgba(0,0,0,0.040) 0px 4.000px 18.000px';
const SHADOW_LEVEL_2 = `${SHADOW_LEVEL_1}, rgba(0,0,0,0.050) 0px 23.00px 52.000px`;
const NOTION_SHADOWS: Shadows = [
  'none',
  SHADOW_LEVEL_1,
  ...(Array(23).fill(SHADOW_LEVEL_2) as string[]),
] as Shadows;

export const makeTheme = (mode: 'light' | 'dark') =>
  createTheme({
    palette:
      mode === 'light'
        ? {
            mode,
            primary: { main: '#0075de' }, // --color-primary
            secondary: { main: '#213183' }, // --color-secondary
            background: { default: '#f6f5f4', paper: '#ffffff' }, // --color-canvas-soft / --color-canvas
            text: { primary: '#000000', secondary: '#31302e' }, // --color-ink / --color-ink-secondary
            // Notion's tokens don't define semantic state colors — unchanged.
            success: { main: '#2E7D46' },
            warning: { main: '#C77E1F' },
            error: { main: '#B3402F' },
            info: { main: '#3A6EA5' },
          }
        : {
            mode,
            // Dark-mode primary reuses the design system's own
            // --color-accent-sky rather than an invented color, matching
            // the existing pattern of a lighter primary shade on dark bg.
            primary: { main: '#62aef0' },
            secondary: { main: '#8b9fe8' },
            background: { default: '#131712', paper: '#1C211B' },
            success: { main: '#6FC98A' },
            warning: { main: '#E0A050' },
            error: { main: '#E28273' },
            info: { main: '#8AB4DE' },
          },
    typography: {
      fontFamily: FONT_FAMILY,
      h1: { fontSize: 64, fontWeight: 700, lineHeight: 1.0, letterSpacing: '-2.125px' }, // display-1
      h2: { fontSize: 54, fontWeight: 700, lineHeight: 1.04, letterSpacing: '-1.875px' }, // display-2
      h3: { fontSize: 40, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-1px' }, // heading-1
      h4: { fontSize: 26, fontWeight: 700, lineHeight: 1.23, letterSpacing: '-0.625px' }, // heading-2
      h5: { fontSize: 22, fontWeight: 700, lineHeight: 1.27, letterSpacing: '-0.25px' }, // heading-3
      h6: { fontSize: 20, fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.125px' }, // title
      subtitle1: { fontSize: 20, fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.125px' }, // title
      body1: { fontSize: 16, fontWeight: 400, lineHeight: 1.5, letterSpacing: '0px' }, // body-md
      body2: { fontSize: 15, fontWeight: 400, lineHeight: 1.33, letterSpacing: '0px' }, // body-sm
      button: { fontSize: 16, fontWeight: 500, lineHeight: 1.5, letterSpacing: '0px', textTransform: 'none' }, // button
      caption: { fontSize: 14, fontWeight: 400, lineHeight: 1.43, letterSpacing: '0px' }, // caption
      overline: { fontSize: 12, fontWeight: 600, lineHeight: 1.33, letterSpacing: '0.125px' }, // eyebrow
    },
    shape: { borderRadius: 8 }, // --rounded-md
    shadows: NOTION_SHADOWS,
    components: {
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 9999 }, // --rounded-full, matching Button.jsx primary/secondary variants
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: 12 }, // --rounded-lg
        },
      },
    },
  });

export const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  active: 'success',
  sold: 'info',
  died: 'error',
  disposed: 'default',
  culled: 'warning',
  lost: 'warning',
};
