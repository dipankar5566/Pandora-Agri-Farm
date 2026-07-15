import AddIcon from '@mui/icons-material/Add';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Tab, Table,
  TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';

const todayStr = () => new Date().toISOString().slice(0, 10);

function useAnimals(sex: 'female' | 'male') {
  return useQuery({
    queryKey: ['picker', sex],
    queryFn: () =>
      api<{ data: any[] }>(`/animals?status=active&sex=${sex}&limit=200`).then((r) => r.data),
  });
}

function AnimalPicker(props: {
  sex: 'female' | 'male';
  label: string;
  value: any;
  onChange: (v: any) => void;
}) {
  const list = useAnimals(props.sex);
  return (
    <Autocomplete
      options={list.data ?? []}
      getOptionLabel={(a) => `${a.tagNumber}${a.name ? ` “${a.name}”` : ''}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      value={props.value}
      onChange={(_, v) => props.onChange(v)}
      renderInput={(params) => <TextField {...params} label={props.label} />}
    />
  );
}

function OverridableError(props: {
  error: ApiError | null;
  confirm: boolean;
  setConfirm: (v: boolean) => void;
  reason: string;
  setReason: (v: string) => void;
}) {
  const { t } = useTranslation();
  if (!props.error) return null;
  if (props.error.code !== 'RULE_OVERRIDE_REQUIRED') {
    return <Alert severity="error">{String(t(props.error.messageCode, props.error.params as any))}</Alert>;
  }
  const warnings = (props.error.params?.warnings as string[]) ?? [];
  return (
    <Alert severity="warning">
      <Stack spacing={1}>
        <span>{warnings.map((w) => String(t(`warnings.${w.toLowerCase()}`))).join(' · ')}</span>
        <FormControlLabel
          control={<Checkbox checked={props.confirm} onChange={(e) => props.setConfirm(e.target.checked)} />}
          label={String(t('breeding.overrideAnyway'))}
        />
        {props.confirm && (
          <TextField size="small" required label={String(t('breeding.overrideReason'))}
            value={props.reason} onChange={(e) => props.setReason(e.target.value)} />
        )}
      </Stack>
    </Alert>
  );
}

export default function Breeding() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState<null | 'heat' | 'service' | { kidding: any } | { abortion: any }>(null);

  const pregnancies = useQuery({
    queryKey: ['pregnancies'],
    queryFn: () => api<{ data: any[] }>('/pregnancies?status=ongoing').then((r) => r.data),
  });
  const heats = useQuery({
    queryKey: ['heats'],
    queryFn: () => api<{ data: any[] }>('/heats?days=60').then((r) => r.data),
    enabled: tab === 1,
  });
  const [perfBy, setPerfBy] = useState<'doe' | 'buck'>('doe');
  const performance = useQuery({
    queryKey: ['performance', perfBy],
    queryFn: () => api<{ data: any[] }>(`/breeding/performance?by=${perfBy}`).then((r) => r.data),
    enabled: tab === 2,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['pregnancies'] });
    void qc.invalidateQueries({ queryKey: ['heats'] });
  };

  const stageChip = (p: any) => {
    const daysLeft = Math.ceil((new Date(p.expectedKiddingDate).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 7) return <Chip size="small" color="error" label={t('breeding.dueNow', { d: daysLeft })} />;
    if (daysLeft <= 30) return <Chip size="small" color="warning" label={t('breeding.dueSoon', { d: daysLeft })} />;
    return <Chip size="small" color="default" label={t('breeding.daysLeft', { d: daysLeft })} />;
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.breeding')}</Typography>
        <Button startIcon={<AddIcon />} onClick={() => setDialog('heat')}>{t('breeding.heat')}</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('service')}>
          {t('breeding.service')}
        </Button>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={`${t('breeding.pregnancies')} (${pregnancies.data?.length ?? 0})`} />
        <Tab label={t('breeding.heats')} />
        <Tab label={t('breeding.performance')} />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('herd.tag')}</TableCell>
              <TableCell>{t('breeding.daysPregnant')}</TableCell>
              <TableCell>{t('breeding.expected')}</TableCell>
              <TableCell />
              <TableCell />
            </TableRow></TableHead>
            <TableBody>
              {pregnancies.data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Link to={`/animals/${p.doeId}`}>{p.doe?.tagNumber}</Link></TableCell>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.daysPregnant}</TableCell>
                  <TableCell>{new Date(p.expectedKiddingDate).toLocaleDateString()}</TableCell>
                  <TableCell>{stageChip(p)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" onClick={() => setDialog({ kidding: p })}>
                      {t('breeding.recordKidding')}
                    </Button>{' '}
                    <Button size="small" color="warning" onClick={() => setDialog({ abortion: p })}>
                      {t('breeding.abortion')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pregnancies.data?.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              {t('breeding.noPregnancies')}
            </Typography>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('herd.tag')}</TableCell>
              <TableCell>{t('form.date')}</TableCell>
              <TableCell>{t('breeding.served')}</TableCell>
              <TableCell>{t('breeding.recheck')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {heats.data?.map((h) => (
                <TableRow key={h.id}>
                  <TableCell><Link to={`/animals/${h.doeId}`}>{h.doe?.tagNumber}</Link></TableCell>
                  <TableCell>{new Date(h.detectedOn).toLocaleDateString()}</TableCell>
                  <TableCell>{h.served ? '✓' : '—'}</TableCell>
                  <TableCell>{h.served ? new Date(h.recheckDue).toLocaleDateString() : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {tab === 2 && (
        <Stack spacing={1}>
          <TextField select size="small" value={perfBy} onChange={(e) => setPerfBy(e.target.value as any)} sx={{ width: 140 }}>
            <MenuItem value="doe">{t('breeding.byDoe')}</MenuItem>
            <MenuItem value="buck">{t('breeding.byBuck')}</MenuItem>
          </TextField>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>{t('herd.tag')}</TableCell>
                <TableCell>{t('breeding.services')}</TableCell>
                <TableCell>{t('breeding.conception')}</TableCell>
                <TableCell>{t('breeding.kiddings')}</TableCell>
                <TableCell>{t('breeding.kidsBorn')}</TableCell>
                <TableCell>{t('breeding.litter')}</TableCell>
                <TableCell />
              </TableRow></TableHead>
              <TableBody>
                {performance.data?.map((r) => (
                  <TableRow key={r.animal.id}>
                    <TableCell><Link to={`/animals/${r.animal.id}`}>{r.animal.tagNumber}</Link></TableCell>
                    <TableCell>{r.services}</TableCell>
                    <TableCell>{r.conceptionRatePct != null ? `${r.conceptionRatePct}%` : '—'}</TableCell>
                    <TableCell>{r.kiddings}</TableCell>
                    <TableCell>{r.kidsBorn}</TableCell>
                    <TableCell>{r.avgLitterSize ?? '—'}</TableCell>
                    <TableCell>{r.repeatBreeder && <Chip size="small" color="error" label={t('breeding.repeatBreeder')} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      )}

      {dialog === 'heat' && <HeatDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog === 'service' && <ServiceDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog && typeof dialog === 'object' && 'kidding' in dialog && (
        <KiddingDialog pregnancy={dialog.kidding} onClose={(s) => { setDialog(null); if (s) refresh(); }} />
      )}
      {dialog && typeof dialog === 'object' && 'abortion' in dialog && (
        <AbortionDialog pregnancy={dialog.abortion} onClose={(s) => { setDialog(null); if (s) refresh(); }} />
      )}
    </Stack>
  );
}

function useSave(onClose: (saved: boolean) => void) {
  const [error, setError] = useState<ApiError | null>(null);
  const m = useMutation<unknown, ApiError, () => Promise<unknown>>({
    mutationFn: (fn) => fn(),
    onSuccess: () => onClose(true),
    onError: setError,
  });
  return { error, save: (fn: () => Promise<unknown>) => m.mutate(fn), busy: m.isPending };
}

function HeatDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [doe, setDoe] = useState<any>(null);
  const [date, setDate] = useState(todayStr());
  const [signs, setSigns] = useState('');
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('breeding.heat')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <AnimalPicker sex="female" label={String(t('breeding.doe'))} value={doe} onChange={setDoe} />
          <TextField type="date" label={t('form.date')} value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField label={t('breeding.signs')} value={signs} onChange={(e) => setSigns(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!doe || busy}
          onClick={() => save(() => api('/heats', { method: 'POST', body: { doeId: doe.id, detectedOn: date, ...(signs ? { signs } : {}) } }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ServiceDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [doe, setDoe] = useState<any>(null);
  const [buck, setBuck] = useState<any>(null);
  const [type, setType] = useState<'natural' | 'ai'>('natural');
  const [semenBatch, setSemenBatch] = useState('');
  const [date, setDate] = useState(todayStr());
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const { error, save, busy } = useSave(props.onClose);

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('breeding.service')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <OverridableError error={error} confirm={confirm} setConfirm={setConfirm} reason={reason} setReason={setReason} />
          <AnimalPicker sex="female" label={String(t('breeding.doe'))} value={doe} onChange={setDoe} />
          <TextField select label={t('breeding.type')} value={type} onChange={(e) => setType(e.target.value as any)}>
            <MenuItem value="natural">{t('breeding.natural')}</MenuItem>
            <MenuItem value="ai">{t('breeding.ai')}</MenuItem>
          </TextField>
          {type === 'natural' ? (
            <AnimalPicker sex="male" label={String(t('breeding.buck'))} value={buck} onChange={setBuck} />
          ) : (
            <TextField required label={t('breeding.semenBatch')} value={semenBatch} onChange={(e) => setSemenBatch(e.target.value)} />
          )}
          <TextField type="date" label={t('form.date')} value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained"
          disabled={!doe || busy || (type === 'natural' ? !buck : !semenBatch) || (confirm && reason.length < 5)}
          onClick={() => save(() => api('/services', {
            method: 'POST',
            body: {
              doeId: doe.id, serviceType: type, serviceDate: date,
              ...(type === 'natural' ? { buckId: buck.id } : { semenBatch }),
              ...(confirm ? { confirmOverride: true, overrideReason: reason } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function KiddingDialog(props: { pregnancy: any; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const p = props.pregnancy;
  const [date, setDate] = useState(todayStr());
  const [totalBorn, setTotalBorn] = useState(2);
  const [kids, setKids] = useState<Array<{ sex: string; birthWeightKg: string }>>([
    { sex: 'female', birthWeightKg: '' }, { sex: 'male', birthWeightKg: '' },
  ]);
  const [colostrum, setColostrum] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const { error, save, busy } = useSave(props.onClose);
  const setKidCount = (alive: number) => {
    const n = Math.max(0, Math.min(6, alive));
    setKids(Array.from({ length: n }, (_, i) => kids[i] ?? { sex: 'female', birthWeightKg: '' }));
  };

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="sm">
      <DialogTitle>{t('breeding.recordKidding')} — {p.doe?.tagNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <OverridableError error={error} confirm={confirm} setConfirm={setConfirm} reason={reason} setReason={setReason} />
          <Stack direction="row" spacing={1.5}>
            <TextField type="date" label={t('form.date')} value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField type="number" label={t('breeding.totalBorn')} value={totalBorn}
              onChange={(e) => setTotalBorn(Number(e.target.value))} inputProps={{ min: 1, max: 6 }} sx={{ width: 110 }} />
            <TextField type="number" label={t('breeding.bornAlive')} value={kids.length}
              onChange={(e) => setKidCount(Number(e.target.value))} inputProps={{ min: 0, max: 6 }} sx={{ width: 110 }} />
          </Stack>
          {kids.map((k, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="center">
              <Typography variant="body2" sx={{ width: 52 }}>#{i + 1}</Typography>
              <TextField select size="small" value={k.sex} sx={{ width: 130 }}
                onChange={(e) => setKids(kids.map((x, j) => (j === i ? { ...x, sex: e.target.value } : x)))}>
                <MenuItem value="female">{t('sex.female')}</MenuItem>
                <MenuItem value="male">{t('sex.male')}</MenuItem>
              </TextField>
              <TextField size="small" type="number" inputProps={{ step: 0.1 }} label={t('form.weightKg')}
                value={k.birthWeightKg} sx={{ width: 130 }}
                onChange={(e) => setKids(kids.map((x, j) => (j === i ? { ...x, birthWeightKg: e.target.value } : x)))} />
            </Stack>
          ))}
          <FormControlLabel
            control={<Checkbox checked={colostrum} onChange={(e) => setColostrum(e.target.checked)} />}
            label={String(t('breeding.colostrum'))}
          />
          {totalBorn - kids.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('breeding.stillborn', { n: totalBorn - kids.length })}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={busy || kids.length > totalBorn}
          onClick={() => save(() => api(`/pregnancies/${p.id}/kidding`, {
            method: 'POST',
            body: {
              kiddingDate: date, totalBorn, bornAlive: kids.length,
              colostrumWithin1h: colostrum,
              kids: kids.map((k) => ({ sex: k.sex, ...(k.birthWeightKg ? { birthWeightKg: Number(k.birthWeightKg) } : {}) })),
              ...(confirm ? { confirmOverride: true } : {}),
            },
          }))}>
          {t('breeding.saveKidding', { n: kids.length })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AbortionDialog(props: { pregnancy: any; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('breeding.abortion')} — {props.pregnancy.doe?.tagNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField type="date" label={t('form.date')} value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField required multiline minRows={2} label={t('breeding.abortionReason')}
            value={reason} onChange={(e) => setReason(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" color="warning" disabled={busy || reason.length < 3}
          onClick={() => save(() => api(`/pregnancies/${props.pregnancy.id}/abortion`, {
            method: 'POST', body: { abortionDate: date, reason },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
