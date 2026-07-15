import {
  Alert, Button, Checkbox, FormControlLabel, Grid, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';

export default function Register() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const breeds = useQuery({ queryKey: ['breeds'], queryFn: () => api<{ data: any[] }>('/breeds').then((r) => r.data) });
  const pens = useQuery({ queryKey: ['pens'], queryFn: () => api<{ data: any[] }>('/pens').then((r) => r.data) });

  const [f, setF] = useState({
    breedId: '', sex: 'female', birthDate: '', birthDateEstimated: false,
    source: 'purchased', purchasePrice: '', currentPenId: '', name: '', weightKg: '',
  });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () =>
      api<{ data: { id: string } }>('/animals', {
        method: 'POST',
        body: {
          breedId: f.breedId, sex: f.sex, birthDate: f.birthDate,
          birthDateEstimated: f.birthDateEstimated, source: f.source,
          ...(f.purchasePrice ? { purchasePrice: Number(f.purchasePrice) } : {}),
          ...(f.currentPenId ? { currentPenId: f.currentPenId } : {}),
          ...(f.name ? { name: f.name } : {}),
          ...(f.weightKg ? { weightKg: Number(f.weightKg) } : {}),
        },
      }),
    onSuccess: (r) => nav(`/animals/${r.data.id}`),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };
  const err = create.error as ApiError | null;

  return (
    <Stack component="form" onSubmit={submit} spacing={2} sx={{ maxWidth: 560 }}>
      <Typography variant="h6">{t('herd.register')}</Typography>
      {err && <Alert severity="error">{String(t(err.messageCode, err.params as any))}</Alert>}
      <Grid container spacing={1.5}>
        <Grid item xs={6}>
          <TextField select fullWidth required label={t('herd.breed')} value={f.breedId} onChange={set('breedId')}>
            {breeds.data?.map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={6}>
          <TextField select fullWidth required label={t('herd.sex')} value={f.sex} onChange={set('sex')}>
            {['female', 'male', 'wether'].map((s) => <MenuItem key={s} value={s}>{t(`sex.${s}`)}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={6}>
          <TextField fullWidth required type="date" label={t('form.birthDate')} value={f.birthDate}
            onChange={set('birthDate')} InputLabelProps={{ shrink: true }} />
        </Grid>
        <Grid item xs={6} sx={{ display: 'flex', alignItems: 'center' }}>
          <FormControlLabel
            control={<Checkbox checked={f.birthDateEstimated}
              onChange={(e) => setF({ ...f, birthDateEstimated: e.target.checked })} />}
            label={t('form.estimated')}
          />
        </Grid>
        <Grid item xs={6}>
          <TextField select fullWidth label={t('form.source')} value={f.source} onChange={set('source')}>
            {['purchased', 'born_on_farm', 'gift', 'exchange', 'other'].map((s) => (
              <MenuItem key={s} value={s}>{t(`source.${s}`)}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={6}>
          <TextField fullWidth type="number" label={t('form.price')} value={f.purchasePrice}
            onChange={set('purchasePrice')} required={f.source === 'purchased'} />
        </Grid>
        <Grid item xs={6}>
          <TextField select fullWidth label={t('herd.pen')} value={f.currentPenId} onChange={set('currentPenId')}>
            {pens.data?.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.shed.name} / {p.name} ({p.occupancy})</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={6}>
          <TextField fullWidth type="number" inputProps={{ step: 0.1 }} label={t('form.weightKg')}
            value={f.weightKg} onChange={set('weightKg')} />
        </Grid>
        <Grid item xs={12}>
          <TextField fullWidth label={t('form.name')} value={f.name} onChange={set('name')} />
        </Grid>
      </Grid>
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={create.isPending}>{t('form.save')}</Button>
        <Button onClick={() => nav('/herd')}>{t('form.cancel')}</Button>
      </Stack>
    </Stack>
  );
}
