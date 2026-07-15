import DashboardIcon from '@mui/icons-material/Dashboard';
import FavoriteIcon from '@mui/icons-material/Favorite';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import PetsIcon from '@mui/icons-material/Pets';
import {
  AppBar, BottomNavigation, BottomNavigationAction, Box, Drawer, IconButton,
  List, ListItemButton, ListItemIcon, ListItemText, Paper, Toolbar, Typography, useMediaQuery,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import type { Me } from './App';

const DRAWER = 210;

export default function Shell(props: {
  me: Me;
  mode: 'light' | 'dark';
  onToggleMode: () => void;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const desktop = useMediaQuery('(min-width:900px)');

  const items = [
    { path: '/', label: t('nav.dashboard'), icon: <DashboardIcon /> },
    { path: '/herd', label: t('nav.herd'), icon: <PetsIcon /> },
    { path: '/breeding', label: t('nav.breeding'), icon: <FavoriteIcon /> },
    { path: '/inventory', label: t('nav.inventory'), icon: <Inventory2Icon /> },
  ];
  const current = loc.pathname.startsWith('/inventory')
    ? '/inventory'
    : loc.pathname.startsWith('/breeding')
    ? '/breeding'
    : loc.pathname.startsWith('/herd') || loc.pathname.startsWith('/animals')
      ? '/herd'
      : '/';

  const switchLocale = () => {
    const next = i18n.language === 'en' ? 'bn' : 'en';
    void i18n.changeLanguage(next);
    localStorage.setItem('locale', next);
    void api('/auth/me', { method: 'PATCH', body: { locale: next } }).catch(() => undefined);
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    location.href = '/';
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (th) => th.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ flexGrow: 1, fontSize: 17 }}>
            🐐 {t('app.title')}
          </Typography>
          <IconButton color="inherit" onClick={switchLocale} aria-label="language">
            <Typography fontWeight={700} fontSize={13}>{i18n.language === 'en' ? 'বাং' : 'EN'}</Typography>
          </IconButton>
          <IconButton color="inherit" onClick={props.onToggleMode} aria-label="theme">
            {props.mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
          <IconButton color="inherit" onClick={logout} aria-label={t('logout')}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {desktop && (
        <Drawer variant="permanent" sx={{ width: DRAWER, [`& .MuiDrawer-paper`]: { width: DRAWER } }}>
          <Toolbar variant="dense" />
          <List>
            {items.map((it) => (
              <ListItemButton key={it.path} selected={current === it.path} onClick={() => nav(it.path)}>
                <ListItemIcon>{it.icon}</ListItemIcon>
                <ListItemText primary={it.label} />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, p: 2, pb: desktop ? 2 : 9 }}>
        <Toolbar variant="dense" />
        {props.children}
      </Box>

      {!desktop && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }} elevation={4}>
          <BottomNavigation value={current} onChange={(_, v) => nav(v)} showLabels>
            {items.map((it) => (
              <BottomNavigationAction key={it.path} value={it.path} label={it.label} icon={it.icon} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
}
