import AddIcon from '@mui/icons-material/Add';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import {
  Box, Button, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { STATUS_COLOR } from '../theme';

export default function Herd() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');

  const list = useQuery({
    queryKey: ['animals', q, status],
    queryFn: () =>
      api<{ data: any[]; meta: { total: number } }>(
        `/animals?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${status}` : ''}`,
      ),
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {t('herd.title')} {list.data ? `(${list.data.meta.total})` : ''}
        </Typography>
        <Button startIcon={<PlaylistAddIcon />} onClick={() => nav('/herd/bulk')}>
          {t('herd.bulk')}
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav('/herd/register')}>
          {t('herd.register')}
        </Button>
      </Stack>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small" placeholder={t('herd.search')} value={q}
          onChange={(e) => setQ(e.target.value)} sx={{ flexGrow: 1, maxWidth: 320 }}
        />
        <TextField size="small" select value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 150 }}>
          <MenuItem value="">{t('herd.allStatuses')}</MenuItem>
          {['active', 'sold', 'died', 'culled'].map((s) => (
            <MenuItem key={s} value={s}>{t(`status.${s}`)}</MenuItem>
          ))}
        </TextField>
      </Stack>

      {list.data?.data.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {t('herd.empty')}
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['tag', 'breed', 'sex', 'age', 'weight', 'status', 'pen'].map((h) => (
                  <TableCell key={h}>{t(`herd.${h}`)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.data?.data.map((a) => (
                <TableRow key={a.id} hover sx={{ cursor: 'pointer' }} onClick={() => nav(`/animals/${a.id}`)}>
                  <TableCell sx={{ fontWeight: 600 }}>{a.tagNumber}{a.name ? ` “${a.name}”` : ''}</TableCell>
                  <TableCell>{a.breed?.name}</TableCell>
                  <TableCell>{t(`sex.${a.sex}`)}</TableCell>
                  <TableCell>{t('animal.months', { m: a.ageMonths })}</TableCell>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {a.currentWeightKg ? Number(a.currentWeightKg).toFixed(1) : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={t(`status.${a.status}`)} color={STATUS_COLOR[a.status]} />
                  </TableCell>
                  <TableCell>{a.pen ? `${a.pen.shed.name} / ${a.pen.name}` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}
