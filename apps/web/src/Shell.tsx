import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import FavoriteIcon from '@mui/icons-material/Favorite';
import GrassIcon from '@mui/icons-material/Grass';
import GroupsIcon from '@mui/icons-material/Groups';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import AssessmentIcon from '@mui/icons-material/Assessment';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import MenuIcon from '@mui/icons-material/Menu';
import PetsIcon from '@mui/icons-material/Pets';
import SettingsIcon from '@mui/icons-material/Settings';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StorefrontIcon from '@mui/icons-material/Storefront';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import {
  AppBar, BottomNavigation, BottomNavigationAction, Box, Drawer, IconButton,
  List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper,
  Toolbar, Typography, useMediaQuery,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import type { Me } from './App';
import GlobalSearch from './components/GlobalSearch';
import NotificationBell from './components/NotificationBell';
import { useOnlineStatus } from './useOnlineStatus';

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
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);
  const online = useOnlineStatus();

  const all = [
    { path: '/', label: t('nav.dashboard'), icon: <DashboardIcon /> },
    { path: '/herd', label: t('nav.herd'), icon: <PetsIcon /> },
    { path: '/breeding', label: t('nav.breeding'), icon: <FavoriteIcon /> },
    { path: '/health', label: t('nav.health'), icon: <MedicalServicesIcon /> },
    { path: '/inventory', label: t('nav.inventory'), icon: <Inventory2Icon /> },
    { path: '/feed', label: t('nav.feed'), icon: <GrassIcon /> },
    { path: '/fodder', label: t('nav.fodder'), icon: <AgricultureIcon /> },
    { path: '/sales', label: t('nav.sales'), icon: <StorefrontIcon /> },
    { path: '/purchases', label: t('nav.purchases'), icon: <ShoppingCartIcon /> },
    { path: '/finance', label: t('nav.finance'), icon: <CurrencyRupeeIcon /> },
    { path: '/employees', label: t('nav.employees'), icon: <GroupsIcon /> },
    { path: '/tasks', label: t('nav.tasks'), icon: <TaskAltIcon /> },
    { path: '/reports', label: t('nav.reports'), icon: <AssessmentIcon /> },
    { path: '/settings', label: t('nav.settings'), icon: <SettingsIcon /> },
  ];
  const primary = all.slice(0, 4); // phone bottom nav: Home, Herd, Breeding, Health
  const more = all.slice(4);
  const current =
    all.slice(1).find((it) => loc.pathname.startsWith(it.path))?.path ??
    (loc.pathname.startsWith('/animals') ? '/herd' : '/');

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
          <Typography variant="h6" sx={{ fontSize: 17, whiteSpace: 'nowrap' }}>
            🐐 {desktop ? t('app.title') : ''}
          </Typography>
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', px: 1 }}>
            <GlobalSearch />
          </Box>
          <NotificationBell />
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
          <List dense>
            {all.map((it) => (
              <ListItemButton key={it.path} selected={current === it.path} onClick={() => nav(it.path)}>
                <ListItemIcon sx={{ minWidth: 38 }}>{it.icon}</ListItemIcon>
                <ListItemText primary={it.label} />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, p: 2, pb: desktop ? 2 : 9, minWidth: 0 }}>
        <Toolbar variant="dense" />
        {!online && (
          <Box sx={{
            bgcolor: 'warning.main', color: 'warning.contrastText', borderRadius: 2,
            px: 2, py: 0.75, mb: 2, fontSize: 14, fontWeight: 600,
          }}>
            {t('offline.banner')}
          </Box>
        )}
        {props.children}
      </Box>

      {!desktop && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }} elevation={4}>
          <BottomNavigation
            value={primary.some((p) => p.path === current) ? current : 'more'}
            onChange={(e, v) => {
              if (v === 'more') setMoreAnchor(e.currentTarget as HTMLElement);
              else nav(v);
            }}
            showLabels
          >
            {primary.map((it) => (
              <BottomNavigationAction key={it.path} value={it.path} label={it.label} icon={it.icon} />
            ))}
            <BottomNavigationAction value="more" label={t('nav.more')} icon={<MenuIcon />} />
          </BottomNavigation>
          <Menu open={!!moreAnchor} anchorEl={moreAnchor} onClose={() => setMoreAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
            {more.map((it) => (
              <MenuItem key={it.path} selected={current === it.path}
                onClick={() => { setMoreAnchor(null); nav(it.path); }}>
                <ListItemIcon>{it.icon}</ListItemIcon>
                {it.label}
              </MenuItem>
            ))}
          </Menu>
        </Paper>
      )}
    </Box>
  );
}
