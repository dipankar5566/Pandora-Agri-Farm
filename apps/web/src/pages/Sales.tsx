import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Stack, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { inr } from '../i18n';

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

export default function Sales() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState<null | 'newInvoice' | 'newCustomer' | { invoice: string }>(null);

  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api<{ data: any[] }>('/sale-invoices').then((r) => r.data),
  });
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: () => api<{ data: any[] }>('/customers').then((r) => r.data),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['customers'] });
  };
  const totalOutstanding = invoices.data
    ? invoices.data.reduce((n, i) => n + i.outstanding, 0)
    : 0;

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.sales')}</Typography>
        {totalOutstanding > 0 && (
          <Chip color="warning" label={t('sales.totalOutstanding', { v: inr(totalOutstanding) })} />
        )}
        <Button startIcon={<AddIcon />} onClick={() => setDialog('newCustomer')}>{t('sales.newCustomer')}</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('newInvoice')}>
          {t('sales.newInvoice')}
        </Button>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={t('sales.invoices')} />
        <Tab label={t('sales.customers')} />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>#</TableCell>
              <TableCell>{t('form.date')}</TableCell>
              <TableCell>{t('sales.buyer')}</TableCell>
              <TableCell align="right">{t('sales.total')}</TableCell>
              <TableCell align="right">{t('sales.due')}</TableCell>
              <TableCell />
            </TableRow></TableHead>
            <TableBody>
              {invoices.data?.map((inv) => (
                <TableRow key={inv.id} hover sx={{ cursor: 'pointer', opacity: inv.cancelledAt ? 0.5 : 1 }}
                  onClick={() => setDialog({ invoice: inv.id })}>
                  <TableCell sx={{ fontWeight: 600 }}>{inv.invoiceNo}</TableCell>
                  <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                  <TableCell>{inv.customer?.name ?? inv.buyerName}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{inr(inv.total)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {inv.cancelledAt
                      ? <Chip size="small" label={t('sales.cancelled')} />
                      : inv.outstanding > 0
                        ? <Chip size="small" color="warning" label={inr(inv.outstanding)} />
                        : <Chip size="small" color="success" label={t('sales.paid')} />}
                  </TableCell>
                  <TableCell>{inv.lineTypes?.map((x: string) => t(`saleLine.${x}`)).join(', ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {invoices.data?.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{t('sales.empty')}</Typography>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('sales.customer')}</TableCell>
              <TableCell>{t('login.phone')}</TableCell>
              <TableCell>{t('inv.type')}</TableCell>
              <TableCell align="right">{t('sales.due')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {customers.data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                  <TableCell>{c.phone ?? '—'}</TableCell>
                  <TableCell>{t(`customerType.${c.customerType}`)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {c.outstanding > 0
                      ? <Chip size="small" color="warning" label={inr(c.outstanding)} />
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {dialog === 'newInvoice' && (
        <InvoiceDialog customers={customers.data ?? []} onClose={(s) => { setDialog(null); if (s) refresh(); }} />
      )}
      {dialog === 'newCustomer' && <CustomerDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog && typeof dialog === 'object' && (
        <InvoiceDetail id={dialog.invoice} onClose={() => { setDialog(null); refresh(); }} />
      )}
    </Stack>
  );
}

interface LineDraft { lineType: string; animal: any; description: string; qty: string; unitPrice: string }
const blankLine = (): LineDraft => ({ lineType: 'animal', animal: null, description: '', qty: '1', unitPrice: '' });

function InvoiceDialog(props: { customers: any[]; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [customer, setCustomer] = useState<any>(null);
  const [buyerName, setBuyerName] = useState('');
  const [date, setDate] = useState(todayStr());
  const [paidNow, setPaidNow] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const { error, save, busy } = useSave(props.onClose);

  const activeAnimals = useQuery({
    queryKey: ['picker-active'],
    queryFn: () => api<{ data: any[] }>('/animals?status=active&limit=200').then((r) => r.data),
  });
  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const valid = lines.every((l) =>
    (Number(l.qty) || 0) > 0 && l.unitPrice !== '' &&
    (l.lineType === 'animal' ? !!l.animal : l.description.length > 0),
  ) && (customer || buyerName);

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="md">
      <DialogTitle>{t('sales.newInvoice')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode, error.params as any))}</Alert>}
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Autocomplete
              options={props.customers}
              getOptionLabel={(c) => c.name}
              value={customer}
              onChange={(_, v) => setCustomer(v)}
              sx={{ minWidth: 220 }}
              renderInput={(p) => <TextField {...p} label={t('sales.customer')} size="small" />}
            />
            <TextField size="small" label={t('sales.walkIn')} value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)} disabled={!!customer} />
            <TextField size="small" type="date" label={t('form.date')} value={date}
              onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Stack>

          {lines.map((l, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField select size="small" value={l.lineType} sx={{ width: 130 }}
                onChange={(e) => setLine(i, { lineType: e.target.value, animal: null })}>
                {['animal', 'manure', 'vermicompost', 'feed', 'other'].map((x) => (
                  <MenuItem key={x} value={x}>{t(`saleLine.${x}`)}</MenuItem>
                ))}
              </TextField>
              {l.lineType === 'animal' ? (
                <Autocomplete
                  options={activeAnimals.data ?? []}
                  getOptionLabel={(a) => `${a.tagNumber}${a.name ? ` "${a.name}"` : ''} · ${a.currentWeightKg ? Number(a.currentWeightKg).toFixed(1) + ' kg' : '—'}`}
                  value={l.animal}
                  onChange={(_, v) => setLine(i, { animal: v })}
                  sx={{ minWidth: 240, flexGrow: 1 }}
                  renderInput={(p) => <TextField {...p} size="small" label={t('herd.tag')} />}
                />
              ) : (
                <TextField size="small" label={t('sales.description')} value={l.description}
                  onChange={(e) => setLine(i, { description: e.target.value })} sx={{ flexGrow: 1, minWidth: 200 }} />
              )}
              {l.lineType !== 'animal' && (
                <TextField size="small" type="number" label={t('inv.qty')} value={l.qty}
                  onChange={(e) => setLine(i, { qty: e.target.value })} sx={{ width: 90 }} />
              )}
              <TextField size="small" type="number" label="₹" value={l.unitPrice}
                onChange={(e) => setLine(i, { unitPrice: e.target.value })} sx={{ width: 120 }} />
              <IconButton size="small" disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Stack direction="row" spacing={2} alignItems="center">
            <Button size="small" startIcon={<AddIcon />} onClick={() => setLines([...lines, blankLine()])}>
              {t('form.addRow')}
            </Button>
            <Typography sx={{ flexGrow: 1 }} />
            <Typography fontWeight={700}>{t('sales.total')}: {inr(total)}</Typography>
            <TextField size="small" type="number" label={t('sales.paidNow')} value={paidNow}
              onChange={(e) => setPaidNow(e.target.value)} sx={{ width: 140 }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!valid || busy}
          onClick={() => save(() => api('/sale-invoices', {
            method: 'POST',
            body: {
              ...(customer ? { customerId: customer.id } : { buyerName }),
              invoiceDate: date,
              lines: lines.map((l) => ({
                lineType: l.lineType,
                ...(l.lineType === 'animal'
                  ? { animalId: l.animal.id, qty: 1 }
                  : { description: l.description, qty: Number(l.qty) }),
                unitPrice: Number(l.unitPrice),
              })),
              ...(paidNow ? { paidNow: Number(paidNow) } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function InvoiceDetail(props: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const inv = useQuery({
    queryKey: ['invoice', props.id],
    queryFn: () => api<{ data: any }>(`/sale-invoices/${props.id}`).then((r) => r.data),
  });
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [cancelReason, setCancelReason] = useState('');
  const [err, setErr] = useState<ApiError | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['invoice', props.id] });
  const run = (fn: () => Promise<unknown>) => fn().then(refresh).catch(setErr);
  const d = inv.data;
  if (!d) return null;

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {d.invoiceNo} — {d.customer?.name ?? d.buyerName}
        {d.cancelledAt && <Chip size="small" sx={{ ml: 1 }} label={t('sales.cancelled')} />}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {err && <Alert severity="error" onClose={() => setErr(null)}>{String(t(err.messageCode, err.params as any))}</Alert>}
          <Table size="small">
            <TableBody>
              {d.lines.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {l.animalId ? <Link to={`/animals/${l.animalId}`}>{l.description}</Link> : l.description}
                  </TableCell>
                  <TableCell align="right">{Number(l.qty)} × {inr(l.unitPrice)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{inr(l.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} sx={{ fontWeight: 700 }}>{t('sales.total')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{inr(d.total)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={2}>{t('sales.paid')}</TableCell>
                <TableCell align="right" sx={{ color: 'success.main' }}>{inr(d.paid)}</TableCell>
              </TableRow>
              {!d.cancelledAt && d.outstanding > 0 && (
                <TableRow>
                  <TableCell colSpan={2} sx={{ color: 'warning.main', fontWeight: 700 }}>{t('sales.due')}</TableCell>
                  <TableCell align="right" sx={{ color: 'warning.main', fontWeight: 700 }}>{inr(d.outstanding)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {d.payments.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {d.payments.map((p: any) =>
                `${new Date(p.paidOn).toLocaleDateString()} · ${inr(p.amount)} (${t(`payment.${p.method}`)})`,
              ).join(' · ')}
            </Typography>
          )}

          {!d.cancelledAt && d.outstanding > 0 && (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField size="small" type="number" label={t('sales.payAmount')} value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)} sx={{ width: 140 }} />
              <TextField select size="small" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} sx={{ width: 110 }}>
                {['cash', 'upi', 'bank', 'cheque'].map((m) => <MenuItem key={m} value={m}>{t(`payment.${m}`)}</MenuItem>)}
              </TextField>
              <Button size="small" variant="contained" disabled={!payAmount}
                onClick={() => {
                  run(() => api('/sale-payments', {
                    method: 'POST',
                    body: { invoiceId: d.id, amount: Number(payAmount), method: payMethod, paidOn: todayStr() },
                  }));
                  setPayAmount('');
                }}>
                {t('sales.recordPayment')}
              </Button>
            </Stack>
          )}

          {!d.cancelledAt && d.paid === 0 && (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField size="small" label={t('form.reason')} value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)} sx={{ flexGrow: 1 }} />
              <Button size="small" color="error" disabled={cancelReason.length < 3}
                onClick={() => run(() => api(`/sale-invoices/${d.id}/cancel`, {
                  method: 'POST', body: { reason: cancelReason },
                }))}>
                {t('sales.cancelInvoice')}
              </Button>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={props.onClose}>{t('form.cancel')}</Button></DialogActions>
    </Dialog>
  );
}

function CustomerDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: '', phone: '', customerType: 'individual', address: '' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('sales.newCustomer')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField required autoFocus label={t('sales.customer')} value={f.name} onChange={set('name')} />
          <TextField label={t('login.phone')} value={f.phone} onChange={set('phone')} inputMode="numeric" />
          <TextField select label={t('inv.type')} value={f.customerType} onChange={set('customerType')}>
            {['individual', 'trader', 'butcher', 'institution', 'other'].map((x) => (
              <MenuItem key={x} value={x}>{t(`customerType.${x}`)}</MenuItem>
            ))}
          </TextField>
          <TextField label={t('sales.address')} value={f.address} onChange={set('address')} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={f.name.length < 2 || busy}
          onClick={() => save(() => api('/customers', {
            method: 'POST',
            body: {
              name: f.name, customerType: f.customerType,
              ...(f.phone ? { phone: f.phone } : {}),
              ...(f.address ? { address: f.address } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
