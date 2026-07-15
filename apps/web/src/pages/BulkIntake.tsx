import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert, Button, IconButton, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography, Box,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';

interface Row { sex: string; ageMonths: string; weightKg: string; purchasePrice: string }
const blank = (): Row => ({ sex: 'female', ageMonths: '', weightKg: '', purchasePrice: '' });

export default function BulkIntake() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const breeds = useQuery({ queryKey: ['breeds'], queryFn: () => api<{ data: any[] }>('/breeds').then((r) => r.data) });
  const pens = useQuery({ queryKey: ['pens'], queryFn: () => api<{ data: any[] }>('/pens').then((r) => r.data) });

  const [breedId, setBreedId] = useState('');
  const [penId, setPenId] = useState('');
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const setRow = (i: number, k: keyof Row, v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const valid = rows.filter((r) => r.ageMonths !== '');
  const save = useMutation({
    mutationFn: () =>
      api('/animals/bulk-intake', {
        method: 'POST',
        body: {
          defaults: { breedId, source: 'purchased', ...(penId ? { currentPenId: penId } : {}) },
          rows: valid.map((r) => ({
            sex: r.sex,
            ageMonths: Number(r.ageMonths),
            ...(r.weightKg ? { weightKg: Number(r.weightKg) } : {}),
            ...(r.purchasePrice ? { purchasePrice: Number(r.purchasePrice) } : {}),
          })),
        },
      }),
    onSuccess: () => nav('/herd'),
  });
  const err = save.error as ApiError | null;

  return (
    <Stack spacing={2} sx={{ maxWidth: 760 }}>
      <Typography variant="h6">{t('herd.bulk')}</Typography>
      {err && <Alert severity="error">{String(t(err.messageCode, err.params as any))}</Alert>}
      <Stack direction="row" spacing={1.5}>
        <TextField select size="small" required label={t('herd.breed')} value={breedId}
          onChange={(e) => setBreedId(e.target.value)} sx={{ minWidth: 200 }}>
          {breeds.data?.map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label={t('herd.pen')} value={penId}
          onChange={(e) => setPenId(e.target.value)} sx={{ minWidth: 180 }}>
          {pens.data?.map((p) => <MenuItem key={p.id} value={p.id}>{p.shed.name} / {p.name}</MenuItem>)}
        </TextField>
      </Stack>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>{t('herd.sex')}</TableCell>
              <TableCell>{t('form.ageMonths')}</TableCell>
              <TableCell>{t('form.weightKg')}</TableCell>
              <TableCell>{t('form.price')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <TextField select size="small" value={r.sex} onChange={(e) => setRow(i, 'sex', e.target.value)} sx={{ width: 110 }}>
                    {['female', 'male', 'wether'].map((s) => <MenuItem key={s} value={s}>{t(`sex.${s}`)}</MenuItem>)}
                  </TextField>
                </TableCell>
                <TableCell><TextField size="small" type="number" value={r.ageMonths} onChange={(e) => setRow(i, 'ageMonths', e.target.value)} sx={{ width: 90 }} /></TableCell>
                <TableCell><TextField size="small" type="number" inputProps={{ step: 0.1 }} value={r.weightKg} onChange={(e) => setRow(i, 'weightKg', e.target.value)} sx={{ width: 90 }} /></TableCell>
                <TableCell><TextField size="small" type="number" value={r.purchasePrice} onChange={(e) => setRow(i, 'purchasePrice', e.target.value)} sx={{ width: 110 }} /></TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Stack direction="row" spacing={1}>
        <Button startIcon={<AddIcon />} onClick={() => setRows([...rows, blank()])}>{t('form.addRow')}</Button>
        <Button variant="contained" disabled={!breedId || valid.length === 0 || save.isPending} onClick={() => save.mutate()}>
          {t('form.create', { n: valid.length })}
        </Button>
        <Button onClick={() => nav('/herd')}>{t('form.cancel')}</Button>
      </Stack>
    </Stack>
  );
}
