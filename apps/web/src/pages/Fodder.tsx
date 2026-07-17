import AddIcon from '@mui/icons-material/Add';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, MenuItem, Stack, Tab, Table, TableBody,
  TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';

const todayStr = () => new Date().toISOString().slice(0, 10);

function useSave(onClose: (saved: boolean) => void) {
  const [error, setError] = useState<ApiError | null>(null);
  const m = useMutation<unknown, ApiError, () => Promise<unknown>>({
    mutationFn: (fn) => fn(),
    onSuccess: () => onClose(true),
    onError: setError,
  });
  return { error, save: (fn: () => Promise<unknown>) => m.mutate(fn), busy: m.isPending };
}

export default function Fodder() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // /fodder?plot=<id> (from the farm map) lands on the plots tab with that row highlighted
  const [params] = useSearchParams();
  const highlightPlot = params.get('plot');
  const [tab, setTab] = useState(highlightPlot ? 1 : 0);
  const [dialog, setDialog] = useState<null | 'sow' | 'newPlot' | { harvest: any } | { close: any }>(null);

  const crops = useQuery({
    queryKey: ['fodder-crops'],
    queryFn: () => api<{ data: any[] }>('/fodder-crops').then((r) => r.data),
  });
  const plots = useQuery({
    queryKey: ['fodder-plots'],
    queryFn: () => api<{ data: any[] }>('/fodder-plots').then((r) => r.data),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['fodder-crops'] });
    void qc.invalidateQueries({ queryKey: ['fodder-plots'] });
    void qc.invalidateQueries({ queryKey: ['items'] });
  };
  const growing = crops.data?.filter((c) => c.status === 'growing') ?? [];
  const past = crops.data?.filter((c) => c.status !== 'growing') ?? [];

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.fodder')}</Typography>
        <Button startIcon={<AddIcon />} onClick={() => setDialog('newPlot')}>{t('fod.newPlot')}</Button>
        <Button variant="contained" startIcon={<AgricultureIcon />} onClick={() => setDialog('sow')}>
          {t('fod.sow')}
        </Button>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={`${t('fod.growing')} (${growing.length})`} />
        <Tab label={t('fod.plots')} />
        <Tab label={t('fod.history')} />
      </Tabs>

      {tab === 0 && (
        <Grid container spacing={1.5}>
          {growing.map((c) => (
            <Grid item xs={12} sm={6} md={4} key={c.id}>
              <Card>
                <CardContent sx={{ pb: 1.5 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography fontWeight={700} sx={{ flexGrow: 1 }}>
                      {c.cropName}{c.variety ? ` (${c.variety})` : ''}
                    </Typography>
                    <Chip size="small" label={t('fod.ageDays', { d: c.ageDays })} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {c.plot?.name}{c.plot?.block ? ` · ${t('fod.block')} ${c.plot.block}` : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {t('fod.yieldSoFar', { kg: c.totalYieldKg, cuts: c.cuts })}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button size="small" variant="contained" onClick={() => setDialog({ harvest: c })}>
                      {t('fod.harvest')}
                    </Button>
                    <Button size="small" color="warning" onClick={() => setDialog({ close: c })}>
                      {t('fod.close')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
          {growing.length === 0 && (
            <Grid item xs={12}>
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{t('fod.empty')}</Typography>
            </Grid>
          )}
        </Grid>
      )}

      {tab === 1 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('fod.plot')}</TableCell>
              <TableCell>{t('fod.block')}</TableCell>
              <TableCell align="right">{t('fod.area')}</TableCell>
              <TableCell>{t('fod.growing')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {plots.data?.map((p) => (
                <TableRow key={p.id} selected={p.id === highlightPlot}>
                  <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                  <TableCell>{p.block ?? '—'}</TableCell>
                  <TableCell align="right">{p.areaDecimal ? `${Number(p.areaDecimal)} dec` : '—'}</TableCell>
                  <TableCell>{p.growing.map((c: any) => c.cropName).join(', ') || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {tab === 2 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('fod.crop')}</TableCell>
              <TableCell>{t('fod.plot')}</TableCell>
              <TableCell align="right">{t('fod.yield')}</TableCell>
              <TableCell>{t('herd.status')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {past.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.cropName}</TableCell>
                  <TableCell>{c.plot?.name}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{c.totalYieldKg} kg</TableCell>
                  <TableCell>
                    <Chip size="small" color={c.status === 'harvested' ? 'success' : 'error'}
                      label={t(`crop.${c.status}`)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {dialog === 'sow' && <SowDialog plots={plots.data ?? []} onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog === 'newPlot' && <PlotDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog && typeof dialog === 'object' && 'harvest' in dialog && (
        <HarvestDialog crop={dialog.harvest} onClose={(s) => { setDialog(null); if (s) refresh(); }} />
      )}
      {dialog && typeof dialog === 'object' && 'close' in dialog && (
        <CloseDialog crop={dialog.close} onClose={(s) => { setDialog(null); if (s) refresh(); }} />
      )}
    </Stack>
  );
}

function PlotDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: '', block: 'A', areaDecimal: '' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('fod.newPlot')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField required autoFocus label={t('fod.plot')} value={f.name} onChange={set('name')} />
          <TextField select label={t('fod.block')} value={f.block} onChange={set('block')}>
            {['A', 'B', '—'].map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
          </TextField>
          <TextField type="number" label={t('fod.area')} value={f.areaDecimal} onChange={set('areaDecimal')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={f.name.length < 2 || busy}
          onClick={() => save(() => api('/fodder-plots', {
            method: 'POST',
            body: {
              name: f.name,
              ...(f.block !== '—' ? { block: f.block } : {}),
              ...(f.areaDecimal ? { areaDecimal: Number(f.areaDecimal) } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SowDialog(props: { plots: any[]; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ plotId: '', cropName: '', variety: '', sownOn: todayStr(), costTotal: '' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('fod.sow')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField select required label={t('fod.plot')} value={f.plotId} onChange={set('plotId')}>
            {props.plots.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField required label={t('fod.crop')} value={f.cropName} onChange={set('cropName')}
            helperText={t('fod.cropHint')} />
          <TextField label={t('fod.variety')} value={f.variety} onChange={set('variety')} />
          <TextField type="date" label={t('fod.sownOn')} value={f.sownOn} onChange={set('sownOn')} InputLabelProps={{ shrink: true }} />
          <TextField type="number" label={t('fod.cost')} value={f.costTotal} onChange={set('costTotal')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!f.plotId || f.cropName.length < 2 || busy}
          onClick={() => save(() => api('/fodder-crops', {
            method: 'POST',
            body: {
              plotId: f.plotId, cropName: f.cropName, sownOn: f.sownOn,
              ...(f.variety ? { variety: f.variety } : {}),
              ...(f.costTotal ? { costTotal: Number(f.costTotal) } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function HarvestDialog(props: { crop: any; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const items = useQuery({
    queryKey: ['feed-items'],
    queryFn: () => api<{ data: any[] }>('/items?type=feed').then((r) => r.data),
  });
  const [f, setF] = useState({ harvestedOn: todayStr(), form: 'green', qtyKg: '', itemId: '', dryMatterPct: '' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('fod.harvest')} — {props.crop.cropName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          {items.data?.length === 0 && <Alert severity="info">{String(t('fod.noFeedItems'))}</Alert>}
          <TextField type="date" label={t('form.date')} value={f.harvestedOn} onChange={set('harvestedOn')} InputLabelProps={{ shrink: true }} />
          <TextField select label={t('fod.form')} value={f.form} onChange={set('form')}>
            {['green', 'hay', 'silage'].map((x) => <MenuItem key={x} value={x}>{t(`fodform.${x}`)}</MenuItem>)}
          </TextField>
          <TextField required type="number" label={t('fod.qtyKg')} value={f.qtyKg} onChange={set('qtyKg')} />
          <TextField select required label={t('fod.targetItem')} value={f.itemId} onChange={set('itemId')}
            helperText={t('fod.targetHint')}>
            {items.data?.map((i) => <MenuItem key={i.id} value={i.id}>{i.name} ({i.onHand} {i.unit})</MenuItem>)}
          </TextField>
          <TextField type="number" label={t('fod.dryMatter')} value={f.dryMatterPct} onChange={set('dryMatterPct')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!f.qtyKg || !f.itemId || busy}
          onClick={() => save(() => api(`/fodder-crops/${props.crop.id}/harvests`, {
            method: 'POST',
            body: {
              harvestedOn: f.harvestedOn, form: f.form, qtyKg: Number(f.qtyKg), itemId: f.itemId,
              ...(f.dryMatterPct ? { dryMatterPct: Number(f.dryMatterPct) } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CloseDialog(props: { crop: any; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('harvested');
  const [failReason, setFailReason] = useState('');
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('fod.close')} — {props.crop.cropName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField select label={t('herd.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="harvested">{t('crop.harvested')}</MenuItem>
            <MenuItem value="failed">{t('crop.failed')}</MenuItem>
          </TextField>
          {status === 'failed' && (
            <TextField required label={t('form.reason')} value={failReason} onChange={(e) => setFailReason(e.target.value)} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" color="warning" disabled={busy || (status === 'failed' && failReason.length < 3)}
          onClick={() => save(() => api(`/fodder-crops/${props.crop.id}`, {
            method: 'PATCH',
            body: {
              status, closedOn: todayStr(),
              ...(status === 'failed' ? { failReason } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
