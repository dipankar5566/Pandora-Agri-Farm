import { CssBaseline, ThemeProvider } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import Shell from './Shell';
import Animal from './pages/Animal';
import Breeding from './pages/Breeding';
import Inventory from './pages/Inventory';
import BulkIntake from './pages/BulkIntake';
import Dashboard from './pages/Dashboard';
import Feed from './pages/Feed';
import Finance from './pages/Finance';
import Fodder from './pages/Fodder';
import Health from './pages/Health';
import Herd from './pages/Herd';
import Register from './pages/Register';
import Reports from './pages/Reports';
import Employees from './pages/Employees';
import Purchases from './pages/Purchases';
import Sales from './pages/Sales';
import Settings from './pages/Settings';
import Tasks from './pages/Tasks';
import { makeTheme } from './theme';

export interface Me {
  id: string;
  fullName: string;
  locale: 'en' | 'bn';
  theme: 'light' | 'dark';
  roles: string[];
  permissions: Record<string, 'none' | 'view' | 'edit' | 'approve'>;
}

export default function App() {
  const { i18n } = useTranslation();
  const [mode, setMode] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light',
  );
  const theme = useMemo(() => makeTheme(mode), [mode]);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ data: Me }>('/auth/me').then((r) => r.data),
    retry: false,
  });

  if (me.data && i18n.language !== me.data.locale) {
    void i18n.changeLanguage(me.data.locale);
    localStorage.setItem('locale', me.data.locale);
  }

  const toggleMode = () => {
    const next = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    localStorage.setItem('theme', next);
    void api('/auth/me', { method: 'PATCH', body: { theme: next } }).catch(() => undefined);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {me.isLoading ? null : !me.data ? (
        <Login onLoggedIn={() => me.refetch()} />
      ) : (
        <Shell me={me.data} mode={mode} onToggleMode={toggleMode}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/herd" element={<Herd />} />
            <Route path="/herd/register" element={<Register />} />
            <Route path="/herd/bulk" element={<BulkIntake />} />
            <Route path="/breeding" element={<Breeding />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/health" element={<Health />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/fodder" element={<Fodder />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/settings" element={<Settings me={me.data} />} />
            <Route path="/animals/:id" element={<Animal />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      )}
    </ThemeProvider>
  );
}
