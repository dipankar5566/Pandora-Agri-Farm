import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';
import { inr } from '../i18n';

const todayStr = () => new Date().toISOString().slice(0, 10);
const MED_TYPES = new Set(['medicine', 'vaccine', 'dewormer']);

function useSave(onClose: (saved: boolean) => void) {
  const [error, setError] = useState<ApiError | null>(null);
  const m = useMutation<unknown, ApiError, () => Promise<unknown>>({
    mutationFn: (fn) => fn(),
    onSuccess: () => onClose(true),
    onError: setError,
  });
  return { error, save: (fn: () => Promise<unknown>) => m.mutate(fn), busy: m.isPending };
}

export default function Purchases() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | 'newBill' | { bill: string }>(null);

  const bills = useQuery({
    queryKey: ['purchase-bills'],
    queryFn: () => api<{ data: any[] }>('/purchase-bills').then((r) => r.data),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['purchase-bills'] });
    void qc.invalidateQueries({ queryKey: ['items'] });
  };
  const totalOutstanding = bills.data ? bills.data.reduce((n, b) => n + b.outstanding, 0) : 0;

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.purchases')}</Typography>
        {totalOutstanding > 0 && (
          <Chip color="warning" label={t('pur.totalOutstanding', { v: inr(totalOutstanding) })} />
        )}
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('newBill')}>
          {t('pur.newBill')}
        </Button>
      </Stack>

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>#</TableCell>
            <TableCell>{t('form.date')}</TableCell>
            <TableCell>{t('inv.supplier')}</TableCell>
            <TableCell align="right">{t('sales.total')}</TableCell>
            <TableCell align="right">{t('sales.due')}</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {bills.data?.map((b) => (
              <TableRow key={b.id} hover sx={{ cursor: 'pointer', opacity: b.cancelledAt ? 0.5 : 1 }}
                onClick={() => setDialog({ bill: b.id })}>
                <TableCell sx={{ fontWeight: 600 }}>{b.purchaseNo}{b.billNo ? ` (${b.billNo})` : ''}</TableCell>
                <TableCell>{new Date(b.billDate).toLocaleDateString()}</TableCell>
                <TableCell>{b.supplier?.name}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{inr(b.total)}</TableCell>
                <TableCell align="right">
                  {b.cancelledAt
                    ? <Chip size="small" label={t('sales.cancelled')} />
                    : b.outstanding > 0
                      ? <Chip size="small" color="warning" label={inr(b.outstanding)} />
                      : <Chip size="small" color="success" label={t('sales.paid')} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {bills.data?.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{t('pur.empty')}</Typography>
        )}
      </Box>

      {dialog === 'newBill' && <BillDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog && typeof dialog === 'object' && (
        <BillDetail id={dialog.bill} onClose={() => { setDialog(null); refresh(); }} />
      )}
    </Stack>
  );
}

interface LineDraft { item: any; qty: string; unitCost: string; batchNo: string; expiryDate: string }
const blankLine = (): LineDraft => ({ item: null, qty: '', unitCost: '', batchNo: '', expiryDate: '' });

function BillDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [supplier, setSupplier] = useState<any>(null);
  const [billNo, setBillNo] = useState('');
  const [date, setDate] = useState(todayStr());
  const [otherCharges, setOtherCharges] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const { error, save, busy } = useSave(props.onClose);

  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<{ data: any[] }>('/suppliers').then((r) => r.data),
  });
  const items = useQuery({
    queryKey: ['items'],
    queryFn: () => api<{ data: any[] }>('/items').then((r) => r.data),
  });
  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0)
    + (Number(otherCharges) || 0);
  const valid = supplier && lines.every((l) =>
    l.item && (Number(l.qty) || 0) > 0 && l.unitCost !== '' &&
    (!MED_TYPES.has(l.item.itemType) || l.expiryDate),
  );

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="md">
      <DialogTitle>{t('pur.newBill')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode, error.params as any))}</Alert>}
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Autocomplete
              options={suppliers.data ?? []}
              getOptionLabel={(s) => s.name}
              value={supplier}
              onChange={(_, v) => setSupplier(v)}
              sx={{ minWidth: 220 }}
              renderInput={(p) => <TextField {...p} label={t('inv.supplier')} size="small" required />}
            />
            <TextField size="small" label={t('pur.supplierBillNo')} value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            <TextField size="small" type="date" label={t('form.date')} value={date}
              onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Stack>

          {lines.map((l, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Autocomplete
                options={items.data ?? []}
                getOptionLabel={(x) => `${x.name} (${x.unit})`}
                value={l.item}
                onChange={(_, v) => setLine(i, { item: v })}
                sx={{ minWidth: 220, flexGrow: 1 }}
                renderInput={(p) => <TextField {...p} size="small" label={t('inv.item')} />}
              />
              <TextField size="small" type="number" label={t('inv.qty')} value={l.qty}
                onChange={(e) => setLine(i, { qty: e.target.value })} sx={{ width: 90 }} />
              <TextField size="small" type="number" label={`₹/${l.item?.unit ?? 'unit'}`} value={l.unitCost}
                onChange={(e) => setLine(i, { unitCost: e.target.value })} sx={{ width: 110 }} />
              <TextField size="small" label={t('inv.batchNo')} value={l.batchNo}
                onChange={(e) => setLine(i, { batchNo: e.target.value })} sx={{ width: 110 }} />
              <TextField size="small" type="date" label={t('inv.expiry')} value={l.expiryDate}
                required={l.item && MED_TYPES.has(l.item.itemType)}
                onChange={(e) => setLine(i, { expiryDate: e.target.value })}
                InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
              <IconButton size="small" disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setLines([...lines, blankLine()])}>
              {t('form.addRow')}
            </Button>
            <Typography sx={{ flexGrow: 1 }} />
            <TextField size="small" type="number" label={t('pur.otherCharges')} value={otherCharges}
              onChange={(e) => setOtherCharges(e.target.value)} sx={{ width: 140 }} />
            <Typography fontWeight={700}>{t('sales.total')}: {inr(total)}</Typography>
            <TextField size="small" type="number" label={t('sales.paidNow')} value={paidNow}
              onChange={(e) => setPaidNow(e.target.value)} sx={{ width: 140 }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!valid || busy}
          onClick={() => save(() => api('/purchase-bills', {
            method: 'POST',
            body: {
              supplierId: supplier.id, billDate: date,
              ...(billNo ? { billNo } : {}),
              lines: lines.map((l) => ({
                itemId: l.item.id, qty: Number(l.qty), unitCost: Number(l.unitCost),
                ...(l.batchNo ? { batchNo: l.batchNo } : {}),
                ...(l.expiryDate ? { expiryDate: l.expiryDate } : {}),
              })),
              ...(otherCharges ? { otherCharges: Number(otherCharges) } : {}),
              ...(paidNow ? { paidNow: Number(paidNow) } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BillDetail(props: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const bill = useQuery({
    queryKey: ['purchase-bill', props.id],
    queryFn: () => api<{ data: any }>(`/purchase-bills/${props.id}`).then((r) => r.data),
  });
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [cancelReason, setCancelReason] = useState('');
  const [err, setErr] = useState<ApiError | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['purchase-bill', props.id] });
  const run = (fn: () => Promise<unknown>) => fn().then(refresh).catch(setErr);
  const d = bill.data;
  if (!d) return null;

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {d.purchaseNo} — {d.supplier?.name}
        {d.cancelledAt && <Chip size="small" sx={{ ml: 1 }} label={t('sales.cancelled')} />}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {err && <Alert severity="error" onClose={() => setErr(null)}>{String(t(err.messageCode, err.params as any))}</Alert>}
          <Table size="small">
            <TableBody>
              {d.lines.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{l.item?.name}</TableCell>
                  <TableCell align="right">{Number(l.qty)} {l.item?.unit} × {inr(l.unitCost)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{inr(l.amount)}</TableCell>
                </TableRow>
              ))}
              {Number(d.otherCharges) > 0 && (
                <TableRow>
                  <TableCell colSpan={2}>{t('pur.otherCharges')}</TableCell>
                  <TableCell align="right">{inr(d.otherCharges)}</TableCell>
                </TableRow>
              )}
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

          {!d.cancelledAt && d.outstanding > 0 && (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField size="small" type="number" label={t('sales.payAmount')} value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)} sx={{ width: 140 }} />
              <TextField select size="small" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} sx={{ width: 110 }}>
                {['cash', 'upi', 'bank', 'cheque'].map((m) => <MenuItem key={m} value={m}>{t(`payment.${m}`)}</MenuItem>)}
              </TextField>
              <Button size="small" variant="contained" disabled={!payAmount}
                onClick={() => {
                  run(() => api('/purchase-payments', {
                    method: 'POST',
                    body: { billId: d.id, amount: Number(payAmount), method: payMethod, paidOn: todayStr() },
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
                onClick={() => run(() => api(`/purchase-bills/${d.id}/cancel`, {
                  method: 'POST', body: { reason: cancelReason },
                }))}>
                {t('pur.cancelBill')}
              </Button>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={props.onClose}>{t('form.cancel')}</Button></DialogActions>
    </Dialog>
  );
}
