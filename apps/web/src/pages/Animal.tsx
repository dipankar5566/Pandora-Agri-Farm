import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import {
  Alert, Avatar, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Grid, MenuItem, Stack, Tab, Table, TableBody,
  TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { STATUS_COLOR } from '../theme';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Animal() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState<null | 'weigh' | 'move' | 'exit' | 'qr'>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const animal = useQuery({
    queryKey: ['animal', id],
    queryFn: () => api<{ data: any }>(`/animals/${id}`).then((r) => r.data),
  });
  const timeline = useQuery({
    queryKey: ['timeline', id],
    queryFn: () => api<{ data: any[] }>(`/animals/${id}/timeline`).then((r) => r.data),
    enabled: tab === 0,
  });
  const weights = useQuery({
    queryKey: ['weights', id],
    queryFn: () => api<{ data: any[] }>(`/animals/${id}/weights`).then((r) => r.data),
    enabled: tab === 1,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['animal', id] });
    void qc.invalidateQueries({ queryKey: ['timeline', id] });
    void qc.invalidateQueries({ queryKey: ['weights', id] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api(`/animals/${id}/photos`, { method: 'POST', form });
    },
    onSuccess: refresh,
  });

  const a = animal.data;
  if (!a) return null;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
        <Avatar
          variant="rounded"
          src={a.photoAttachmentId ? `/api/v1/attachments/${a.photoAttachmentId}` : undefined}
          sx={{ width: 72, height: 72, fontSize: 36 }}
        >
          🐐
        </Avatar>
        <Box sx={{ flexGrow: 1, minWidth: 220 }}>
          <Typography variant="h6">
            {a.tagNumber}{a.name ? ` “${a.name}”` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {a.breed?.name} · {t(`sex.${a.sex}`)} · {t('animal.months', { m: a.ageMonths })}
            {a.pen ? ` · ${a.pen.shed.name}/${a.pen.name}` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ⚖ {a.currentWeightKg ? `${Number(a.currentWeightKg).toFixed(1)} kg` : '—'}
            {a.currentBcs ? ` · ${t('animal.bcs')} ${a.currentBcs}` : ''}
            {a.dam ? <> · {t('animal.dam')} <Link to={`/animals/${a.dam.id}`}>{a.dam.tagNumber}</Link></> : null}
            {a.sire ? <> · {t('animal.sire')} <Link to={`/animals/${a.sire.id}`}>{a.sire.tagNumber}</Link></> : null}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
            <Chip size="small" label={t(`status.${a.status}`)} color={STATUS_COLOR[a.status]} />
            {a.birthDateEstimated && <Chip size="small" variant="outlined" label={t('form.estimated')} />}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={() => setDialog('weigh')} disabled={a.status !== 'active'}>
            {t('animal.weigh')}
          </Button>
          <Button size="small" variant="outlined" onClick={() => setDialog('move')} disabled={a.status !== 'active'}>
            {t('animal.move')}
          </Button>
          <Button size="small" variant="outlined" color="warning" onClick={() => setDialog('exit')} disabled={a.status !== 'active'}>
            {t('animal.exit')}
          </Button>
          <Button size="small" startIcon={<PhotoCameraIcon />} onClick={() => fileInput.current?.click()}>
            {t('animal.photo')}
          </Button>
          <Button size="small" startIcon={<QrCode2Icon />} onClick={() => setDialog('qr')}>
            {t('animal.qr')}
          </Button>
          <input
            ref={fileInput} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
          />
        </Stack>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={t('animal.timeline')} />
        <Tab label={t('animal.weights')} />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={0}>
          {timeline.data?.map((e) => (
            <Stack key={e.id} direction="row" spacing={1.5} sx={{ py: 1, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 88, fontVariantNumeric: 'tabular-nums' }}>
                {new Date(e.occurredAt).toLocaleDateString()}
              </Typography>
              <Typography variant="body2">{String(t(e.summaryCode, (e.summaryParams ?? {}) as any))}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
      {tab === 1 && (
        <Box sx={{ overflowX: 'auto', maxWidth: 480 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('form.date')}</TableCell>
                <TableCell>{t('form.weightKg')}</TableCell>
                <TableCell>{t('animal.bcs')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {weights.data?.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>{new Date(w.weighedOn).toLocaleDateString()}</TableCell>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{Number(w.weightKg).toFixed(1)}</TableCell>
                  <TableCell>{w.bcs ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {dialog === 'weigh' && <WeighDialog id={id} last={a.currentWeightKg} onClose={(saved) => { setDialog(null); if (saved) refresh(); }} />}
      {dialog === 'move' && <MoveDialog id={id} onClose={(saved) => { setDialog(null); if (saved) refresh(); }} />}
      {dialog === 'exit' && <ExitDialog id={id} onClose={(saved) => { setDialog(null); if (saved) refresh(); }} />}
      {dialog === 'qr' && (
        <Dialog open onClose={() => setDialog(null)}>
          <DialogTitle>{a.tagNumber}</DialogTitle>
          <DialogContent><img src={`/api/v1/animals/${id}/qr`} alt="QR" width={280} height={280} /></DialogContent>
        </Dialog>
      )}
    </Stack>
  );
}

function useDialogSave(onClose: (saved: boolean) => void) {
  const [error, setError] = useState<ApiError | null>(null);
  const m = useMutation<unknown, ApiError, () => Promise<unknown>>({
    mutationFn: (fn) => fn(),
    onSuccess: () => onClose(true),
    onError: (e) => setError(e),
  });
  return { error, save: (fn: () => Promise<unknown>) => m.mutate(fn), busy: m.isPending };
}

function WeighDialog(props: { id: string; last?: string; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [kg, setKg] = useState('');
  const [bcs, setBcs] = useState('');
  const [date, setDate] = useState(todayStr());
  const [confirm, setConfirm] = useState(false);
  const { error, save, busy } = useDialogSave(props.onClose);
  const anomaly = error?.code === 'WEIGHT_ANOMALIES';

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('animal.weigh')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && !anomaly && <Alert severity="error">{t(error.messageCode)}</Alert>}
          {anomaly && (
            <FormControlLabel
              control={<Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />}
              label={<Typography variant="body2" color="warning.main">{t('form.confirmAnomaly')}</Typography>}
            />
          )}
          <TextField type="date" label={t('form.date')} value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField autoFocus type="number" inputProps={{ step: 0.1 }} label={t('form.weightKg')}
            helperText={props.last ? `← ${Number(props.last).toFixed(1)} kg` : undefined}
            value={kg} onChange={(e) => setKg(e.target.value)} />
          <TextField type="number" inputProps={{ step: 0.5, min: 1, max: 5 }} label={t('animal.bcs')} value={bcs} onChange={(e) => setBcs(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!kg || busy || (anomaly && !confirm)}
          onClick={() => save(() => api('/weights', {
            method: 'POST',
            body: {
              date, confirmAnomalies: confirm,
              entries: [{ animalId: props.id, weightKg: Number(kg), ...(bcs ? { bcs: Number(bcs) } : {}) }],
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function MoveDialog(props: { id: string; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const pens = useQuery({ queryKey: ['pens'], queryFn: () => api<{ data: any[] }>('/pens').then((r) => r.data) });
  const [toPenId, setToPenId] = useState('');
  const [reason, setReason] = useState('routine');
  const { error, save, busy } = useDialogSave(props.onClose);

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('animal.move')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{t(error.messageCode)}</Alert>}
          <TextField select label={t('form.toPen')} value={toPenId} onChange={(e) => setToPenId(e.target.value)}>
            {pens.data?.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.shed.name} / {p.name} ({p.occupancy}{p.capacity ? `/${p.capacity}` : ''})</MenuItem>
            ))}
          </TextField>
          <TextField select label={t('form.reason')} value={reason} onChange={(e) => setReason(e.target.value)}>
            {['routine', 'isolation', 'kidding', 'weaning', 'sale_prep', 'treatment', 'other'].map((r) => (
              <MenuItem key={r} value={r}>{r}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!toPenId || busy}
          onClick={() => save(() => api(`/animals/${props.id}/move`, { method: 'POST', body: { toPenId, reason } }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ExitDialog(props: { id: string; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ exitType: 'sale', exitDate: todayStr(), buyerName: '', price: '', liveWeightKg: '', causeCategory: 'disease' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useDialogSave(props.onClose);
  const isSale = f.exitType === 'sale' || f.exitType === 'cull_sale';

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('animal.exit')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{t(error.messageCode)}</Alert>}
          <TextField select label={t('exit.type')} value={f.exitType} onChange={set('exitType')}>
            {['sale', 'cull_sale', 'death', 'disposal', 'lost'].map((x) => (
              <MenuItem key={x} value={x}>{t(`status.${{ sale: 'sold', cull_sale: 'culled', death: 'died', disposal: 'disposed', lost: 'lost' }[x]}`)}</MenuItem>
            ))}
          </TextField>
          <TextField type="date" label={t('form.date')} value={f.exitDate} onChange={set('exitDate')} InputLabelProps={{ shrink: true }} />
          {isSale && <TextField label={t('exit.buyer')} value={f.buyerName} onChange={set('buyerName')} />}
          {isSale && <TextField type="number" label="₹" value={f.price} onChange={set('price')} required />}
          {isSale && <TextField type="number" inputProps={{ step: 0.1 }} label={t('form.weightKg')} value={f.liveWeightKg} onChange={set('liveWeightKg')} />}
          {f.exitType === 'death' && (
            <TextField select label={t('exit.cause')} value={f.causeCategory} onChange={set('causeCategory')}>
              {['disease', 'accident', 'predator', 'poisoning', 'birth_complication', 'unknown'].map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" color="warning" disabled={busy || (isSale && !f.price)}
          onClick={() => save(() => api(`/animals/${props.id}/exit`, {
            method: 'POST',
            body: {
              exitType: f.exitType, exitDate: f.exitDate,
              ...(isSale ? { buyerName: f.buyerName || undefined, price: Number(f.price), ...(f.liveWeightKg ? { liveWeightKg: Number(f.liveWeightKg) } : {}) } : {}),
              ...(f.exitType === 'death' ? { causeCategory: f.causeCategory } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
