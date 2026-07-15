import { createTheme } from '@mui/material/styles';

// Phase 4 identity: leaf green + hay ochre on warm grounds.
export const makeTheme = (mode: 'light' | 'dark') =>
  createTheme({
    palette:
      mode === 'light'
        ? {
            mode,
            primary: { main: '#2E6B34' },
            secondary: { main: '#B8862B' },
            background: { default: '#FAFAF7', paper: '#FFFFFF' },
            success: { main: '#2E7D46' },
            warning: { main: '#C77E1F' },
            error: { main: '#B3402F' },
            info: { main: '#3A6EA5' },
          }
        : {
            mode,
            primary: { main: '#7FD48A' },
            secondary: { main: '#D9A94A' },
            background: { default: '#131712', paper: '#1C211B' },
            success: { main: '#6FC98A' },
            warning: { main: '#E0A050' },
            error: { main: '#E28273' },
            info: { main: '#8AB4DE' },
          },
    typography: {
      fontFamily:
        '-apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Bengali", "Bangla MN", sans-serif',
    },
    shape: { borderRadius: 10 },
  });

export const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  active: 'success',
  sold: 'info',
  died: 'error',
  disposed: 'default',
  culled: 'warning',
  lost: 'warning',
};
