import PetsIcon from '@mui/icons-material/Pets';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import SearchIcon from '@mui/icons-material/Search';
import {
  Autocomplete, Box, ListItemIcon, ListItemText, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

interface Hit {
  group: 'animals' | 'items' | 'suppliers' | 'tasks' | 'ledger';
  id: string;
  label: string;
  sub?: string;
  to: string;
}

const ICONS: Record<Hit['group'], JSX.Element> = {
  animals: <PetsIcon fontSize="small" />,
  items: <Inventory2Icon fontSize="small" />,
  suppliers: <LocalShippingIcon fontSize="small" />,
  tasks: <TaskAltIcon fontSize="small" />,
  ledger: <CurrencyRupeeIcon fontSize="small" />,
};

export default function GlobalSearch() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  // Debounce: only fire the request 250ms after typing stops.
  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(id);
  }, [input]);

  const results = useQuery({
    queryKey: ['search', q],
    queryFn: () => api<{ data: Record<string, any[]> }>(`/search?q=${encodeURIComponent(q)}`).then((r) => r.data),
    enabled: q.length >= 1,
  });

  const hits: Hit[] = [];
  const d = results.data;
  if (d?.animals) {
    for (const a of d.animals) hits.push({ group: 'animals', id: a.id, label: `${a.tagNumber}${a.name ? ` "${a.name}"` : ''}`, sub: t(`status.${a.status}`), to: `/animals/${a.id}` });
  }
  if (d?.items) {
    for (const i of d.items) hits.push({ group: 'items', id: i.id, label: i.name, sub: t(`itemType.${i.itemType}`), to: '/inventory' });
  }
  if (d?.suppliers) {
    for (const s of d.suppliers) hits.push({ group: 'suppliers', id: s.id, label: s.name, sub: s.phone ?? undefined, to: '/inventory' });
  }
  if (d?.tasks) {
    for (const x of d.tasks) hits.push({ group: 'tasks', id: x.id, label: x.title, sub: new Date(x.dueOn).toLocaleDateString(), to: '/tasks' });
  }
  if (d?.ledger) {
    for (const e of d.ledger) hits.push({ group: 'ledger', id: e.id, label: e.description ?? e.counterpartyName ?? '—', sub: `₹${Number(e.amount)}`, to: '/finance' });
  }

  return (
    <Autocomplete
      size="small"
      freeSolo
      forcePopupIcon={false}
      options={hits}
      loading={results.isFetching}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      groupBy={(o) => t(`search.${o.group}`)}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      onChange={(_, v) => {
        if (v && typeof v !== 'string') {
          nav(v.to);
          setInput('');
          setQ('');
        }
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.id}>
          <ListItemIcon sx={{ minWidth: 32 }}>{ICONS[option.group]}</ListItemIcon>
          <ListItemText
            primary={option.label}
            secondary={option.sub}
            primaryTypographyProps={{ fontSize: 14 }}
            secondaryTypographyProps={{ fontSize: 12 }}
          />
        </Box>
      )}
      noOptionsText={q.length >= 1 ? t('search.noResults') : t('search.placeholder')}
      sx={{ width: { xs: 160, sm: 280, md: 360 } }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={t('search.placeholder')}
          size="small"
          InputProps={{
            ...params.InputProps,
            startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5, opacity: 0.6 }} />,
            sx: { bgcolor: 'action.hover', borderRadius: 999, '& fieldset': { border: 'none' } },
          }}
        />
      )}
    />
  );
}
