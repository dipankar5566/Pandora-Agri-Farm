import AddIcon from '@mui/icons-material/Add';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, MenuItem, Stack, Tab, Table, TableBody,
  TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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

export default function Health() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState<null | 'newCase' | { administer: any[] } | { caseDetail: string }>(null);

  const dues = useQuery({
    queryKey: ['dues'],
    queryFn: () => api<{ data: any[] }>('/protocol-dues?refresh=true&window=60').then((r) => r.data),
  });
  const cases = useQuery({
    queryKey: ['cases'],
    queryFn: () => api<{ data: any[] }>('/health-cases?status=open').then((r) => r.data),
    enabled: tab === 1,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['dues'] });
    void qc.invalidateQueries({ queryKey: ['cases'] });
  };

  // Group dues by protocol for batch action
  const groups = useMemo(() => {
    const m = new Map<string, { protocol: any; dues: any[] }>();
    for (const d of dues.data ?? []) {
      if (!m.has(d.protocolId)) m.set(d.protocolId, { protocol: { id: d.protocolId, ...d.protocol }, dues: [] });
      m.get(d.protocolId)!.dues.push(d);
    }
    return [...m.values()].sort((a, b) => b.dues.length - a.dues.length);
  }, [dues.data]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.health')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('newCase')}>
          {t('health.newCase')}
        </Button>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={`${t('health.dues')} (${dues.data?.length ?? 0})`} />
        <Tab label={`${t('health.cases')} (${cases.data?.length ?? '…'})`} />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={1.5}>
          {groups.map((g) => {
            const overdue = g.dues.filter((d) => d.overdueDays > 0).length;
            return (
              <Box key={g.protocol.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                  <Typography fontWeight={650}>{g.protocol.name}</Typography>
                  <Chip size="small" label={t(`protocolType.${g.protocol.type}`)} />
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {t('health.animalsDue', { n: g.dues.length })}
                  </Typography>
                  {overdue > 0 && <Chip size="small" color="error" label={t('health.overdueN', { n: overdue })} />}
                  <Button size="small" variant="outlined" onClick={() => setDialog({ administer: g.dues })}>
                    {t('health.administer')}
                  </Button>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {g.dues.slice(0, 8).map((d) => d.animal?.tagNumber).join(' · ')}
                  {g.dues.length > 8 ? ` +${g.dues.length - 8}` : ''}
                </Typography>
              </Box>
            );
          })}
          {groups.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{t('health.noDues')}</Typography>
          )}
        </Stack>
      )}

      {tab === 1 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('herd.tag')}</TableCell>
              <TableCell>{t('health.symptoms')}</TableCell>
              <TableCell>{t('health.severity')}</TableCell>
              <TableCell>{t('herd.status')}</TableCell>
              <TableCell />
            </TableRow></TableHead>
            <TableBody>
              {cases.data?.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell><Link to={`/animals/${c.animalId}`}>{c.animal?.tagNumber}</Link></TableCell>
                  <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.symptoms}</TableCell>
                  <TableCell>
                    <Chip size="small" label={t(`severity.${c.severity}`)}
                      color={c.severity === 'critical' ? 'error' : c.severity === 'severe' ? 'warning' : 'default'} />
                  </TableCell>
                  <TableCell>{c.isIsolated ? <Chip size="small" color="error" label={t('health.isolated')} /> : t(`caseStatus.${c.status}`)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => setDialog({ caseDetail: c.id })}>{t('health.open')}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {cases.data?.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{t('health.noCases')}</Typography>
          )}
        </Box>
      )}

      {dialog === 'newCase' && <NewCaseDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog && typeof dialog === 'object' && 'administer' in dialog && (
        <AdministerDialog dues={dialog.administer} onClose={(s) => { setDialog(null); if (s) refresh(); }} />
      )}
      {dialog && typeof dialog === 'object' && 'caseDetail' in dialog && (
        <CaseDialog caseId={dialog.caseDetail} onClose={() => { setDialog(null); refresh(); }} />
      )}
    </Stack>
  );
}

function AdministerDialog(props: { dues: any[]; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const protocol = props.dues[0].protocol;
  const protocolId = props.dues[0].protocolId;
  const [selected, setSelected] = useState<Set<string>>(new Set(props.dues.map((d) => d.animalId)));
  const [date, setDate] = useState(todayStr());
  const [itemId, setItemId] = useState(protocol.defaultItemId ?? '');
  const [confirm, setConfirm] = useState(false);
  const { error, save, busy } = useSave(props.onClose);
  const items = useQuery({
    queryKey: ['items'],
    queryFn: () => api<{ data: any[] }>('/items').then((r) => r.data),
  });
  const medItems = items.data?.filter((i) => ['medicine', 'vaccine', 'dewormer'].includes(i.itemType)) ?? [];
  const rotationNudge = error?.code === 'RULE_OVERRIDE_REQUIRED';

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="sm">
      <DialogTitle>{t('health.administer')} — {protocol.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && !rotationNudge && <Alert severity="error">{String(t(error.messageCode, error.params as any))}</Alert>}
          {rotationNudge && (
            <Alert severity="warning">
              {String(t('warnings.dewormer_same_class'))}
              <FormControlLabel sx={{ display: 'block', mt: 1 }}
                control={<Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />}
                label={String(t('breeding.overrideAnyway'))} />
            </Alert>
          )}
          <Stack direction="row" spacing={1.5}>
            <TextField type="date" label={t('form.date')} value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField select label={t('inv.item')} value={itemId} onChange={(e) => setItemId(e.target.value)} sx={{ minWidth: 220 }}>
              {medItems.map((i) => (
                <MenuItem key={i.id} value={i.id}>{i.name} ({i.onHand} {i.unit})</MenuItem>
              ))}
            </TextField>
          </Stack>
          <Box sx={{ maxHeight: 260, overflowY: 'auto' }}>
            <Table size="small">
              <TableBody>
                {props.dues.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={selected.has(d.animalId)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          e.target.checked ? next.add(d.animalId) : next.delete(d.animalId);
                          setSelected(next);
                        }} />
                    </TableCell>
                    <TableCell>{d.animal?.tagNumber}</TableCell>
                    <TableCell>{d.animal?.currentWeightKg ? `${Number(d.animal.currentWeightKg).toFixed(1)} kg` : '—'}</TableCell>
                    <TableCell>{d.suggestedDose != null ? `${d.suggestedDose} ${d.protocol.doseUnit ?? ''}` : '—'}</TableCell>
                    <TableCell>
                      {d.overdueDays > 0
                        ? <Chip size="small" color="error" label={t('health.overdueDays', { n: d.overdueDays })} />
                        : new Date(d.dueDate).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={selected.size === 0 || !itemId || busy || (rotationNudge && !confirm)}
          onClick={() => save(() => api('/protocol-administrations', {
            method: 'POST',
            body: {
              protocolId, givenOn: date, itemId,
              entries: [...selected].map((animalId) => ({ animalId })),
              ...(confirm ? { confirmOverride: true } : {}),
            },
          }))}>
          {t('health.administerN', { n: selected.size })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AnimalPickerAll(props: { value: any; onChange: (v: any) => void }) {
  const { t } = useTranslation();
  const list = useQuery({
    queryKey: ['picker-all'],
    queryFn: () => api<{ data: any[] }>('/animals?status=active&limit=200').then((r) => r.data),
  });
  return (
    <TextField select label={t('herd.tag')} value={props.value?.id ?? ''}
      onChange={(e) => props.onChange(list.data?.find((a) => a.id === e.target.value))}>
      {list.data?.map((a) => (
        <MenuItem key={a.id} value={a.id}>{a.tagNumber}{a.name ? ` “${a.name}”` : ''}</MenuItem>
      ))}
    </TextField>
  );
}

function NewCaseDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [animal, setAnimal] = useState<any>(null);
  const [symptoms, setSymptoms] = useState('');
  const [severity, setSeverity] = useState('moderate');
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('health.newCase')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <AnimalPickerAll value={animal} onChange={setAnimal} />
          <TextField required multiline minRows={2} label={t('health.symptoms')}
            value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
          <TextField select label={t('health.severity')} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {['mild', 'moderate', 'severe', 'critical'].map((s) => (
              <MenuItem key={s} value={s}>{t(`severity.${s}`)}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!animal || symptoms.length < 3 || busy}
          onClick={() => save(() => api('/health-cases', {
            method: 'POST', body: { animalId: animal.id, symptoms, severity },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CaseDialog(props: { caseId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const c = useQuery({
    queryKey: ['case', props.caseId],
    queryFn: () => api<{ data: any }>(`/health-cases/${props.caseId}`).then((r) => r.data),
  });
  const pens = useQuery({ queryKey: ['pens'], queryFn: () => api<{ data: any[] }>('/pens').then((r) => r.data) });
  const items = useQuery({ queryKey: ['items'], queryFn: () => api<{ data: any[] }>('/items').then((r) => r.data) });
  const [vital, setVital] = useState({ temperatureC: '', respirationRpm: '' });
  const [treat, setTreat] = useState({ itemId: '', doseAmount: '', route: 'im' });
  const [closeAs, setCloseAs] = useState('');
  const [err, setErr] = useState<ApiError | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['case', props.caseId] });
  const run = (fn: () => Promise<unknown>) => fn().then(refresh).catch(setErr);
  const d = c.data;
  if (!d) return null;
  const isoPens = pens.data?.filter((p) => ['isolation', 'hospital', 'quarantine'].includes(p.purpose)) ?? [];
  const medItems = items.data?.filter((i) => ['medicine', 'vaccine', 'dewormer'].includes(i.itemType)) ?? [];
  const closed = !!d.closedAt;

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {d.animal?.tagNumber} — {t(`severity.${d.severity}`)} · {t(`caseStatus.${d.status}`)}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {err && <Alert severity="error" onClose={() => setErr(null)}>{String(t(err.messageCode, err.params as any))}</Alert>}
          <Typography variant="body2">{d.symptoms}</Typography>

          <Typography variant="subtitle2">{t('health.vitals')}</Typography>
          {d.vitals.map((v: any) => (
            <Typography key={v.id} variant="body2" color="text.secondary">
              {new Date(v.recordedAt).toLocaleString()} — {v.temperatureC ? `${v.temperatureC}°C` : ''} {v.respirationRpm ? `· ${v.respirationRpm}/min` : ''}
            </Typography>
          ))}
          {!closed && (
            <Stack direction="row" spacing={1}>
              <TextField size="small" type="number" inputProps={{ step: 0.1 }} label="°C" value={vital.temperatureC}
                onChange={(e) => setVital({ ...vital, temperatureC: e.target.value })} sx={{ width: 100 }} />
              <TextField size="small" type="number" label={t('health.resp')} value={vital.respirationRpm}
                onChange={(e) => setVital({ ...vital, respirationRpm: e.target.value })} sx={{ width: 110 }} />
              <Button size="small" disabled={!vital.temperatureC && !vital.respirationRpm}
                onClick={() => run(() => api(`/health-cases/${props.caseId}/vitals`, {
                  method: 'POST',
                  body: {
                    ...(vital.temperatureC ? { temperatureC: Number(vital.temperatureC) } : {}),
                    ...(vital.respirationRpm ? { respirationRpm: Number(vital.respirationRpm) } : {}),
                  },
                }))}>
                {t('form.save')}
              </Button>
            </Stack>
          )}

          <Typography variant="subtitle2">{t('health.treatments')}</Typography>
          {d.treatments.map((tr: any) => (
            <Typography key={tr.id} variant="body2" color="text.secondary">
              {new Date(tr.treatedAt).toLocaleDateString()} — {tr.itemName} {Number(tr.doseAmount)} {tr.doseUnit} ({tr.route})
              {tr.withdrawalUntil ? ` · ${t('health.withdrawalTill', { d: new Date(tr.withdrawalUntil).toLocaleDateString() })}` : ''}
            </Typography>
          ))}
          {!closed && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <TextField select size="small" label={t('inv.item')} value={treat.itemId}
                onChange={(e) => setTreat({ ...treat, itemId: e.target.value })} sx={{ minWidth: 180 }}>
                {medItems.map((i) => <MenuItem key={i.id} value={i.id}>{i.name} ({i.onHand})</MenuItem>)}
              </TextField>
              <TextField size="small" type="number" label={t('health.dose')} value={treat.doseAmount}
                onChange={(e) => setTreat({ ...treat, doseAmount: e.target.value })} sx={{ width: 90 }} />
              <TextField select size="small" label={t('health.route')} value={treat.route}
                onChange={(e) => setTreat({ ...treat, route: e.target.value })} sx={{ width: 100 }}>
                {['oral', 'sc', 'im', 'iv', 'topical'].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
              <Button size="small" disabled={!treat.itemId || !treat.doseAmount}
                onClick={() => run(() => api('/treatments', {
                  method: 'POST',
                  body: {
                    animalId: d.animalId, caseId: props.caseId, itemId: treat.itemId,
                    doseAmount: Number(treat.doseAmount),
                    doseUnit: medItems.find((i) => i.id === treat.itemId)?.unit ?? 'ml',
                    route: treat.route,
                  },
                }))}>
                {t('health.treat')}
              </Button>
            </Stack>
          )}

          {!closed && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              {!d.isIsolated && isoPens.length > 0 && (
                <Button size="small" color="warning" variant="outlined"
                  onClick={() => run(() => api(`/health-cases/${props.caseId}/isolate`, {
                    method: 'POST', body: { penId: isoPens[0].id },
                  }))}>
                  {t('health.isolate')}
                </Button>
              )}
              <TextField select size="small" label={t('health.closeAs')} value={closeAs}
                onChange={(e) => setCloseAs(e.target.value)} sx={{ minWidth: 140 }}>
                {['recovered', 'referred'].map((s) => <MenuItem key={s} value={s}>{t(`caseStatus.${s}`)}</MenuItem>)}
              </TextField>
              <Button size="small" variant="contained" disabled={!closeAs}
                onClick={() => run(() => api(`/health-cases/${props.caseId}/close`, {
                  method: 'POST', body: { status: closeAs },
                }))}>
                {t('health.close')}
              </Button>
              <Typography variant="caption" color="text.secondary">{t('health.diedHint')}</Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={props.onClose}>{t('form.cancel')}</Button></DialogActions>
    </Dialog>
  );
}
