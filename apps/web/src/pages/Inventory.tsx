import AddIcon from '@mui/icons-material/Add';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs,
  TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';

const todayStr = () => new Date().toISOString().slice(0, 10);
const ITEM_TYPES = ['medicine', 'vaccine', 'dewormer', 'feed', 'mineral', 'supplement', 'consumable', 'equipment'];
const UNITS = ['kg', 'g', 'l', 'ml', 'piece', 'dose', 'vial', 'bag', 'bottle', 'packet', 'tablet'];
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

export default function Inventory() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState<null | 'newItem' | 'newSupplier' | { item: any }>(null);

  const items = useQuery({
    queryKey: ['items'],
    queryFn: () => api<{ data: any[] }>('/items').then((r) => r.data),
  });
  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<{ data: any[] }>('/suppliers').then((r) => r.data),
    enabled: tab === 1,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['items'] });
    void qc.invalidateQueries({ queryKey: ['suppliers'] });
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.inventory')}</Typography>
        {tab === 0 ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('newItem')}>
            {t('inv.newItem')}
          </Button>
        ) : (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('newSupplier')}>
            {t('inv.newSupplier')}
          </Button>
        )}
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={t('inv.items')} />
        <Tab label={t('inv.suppliers')} />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('inv.item')}</TableCell>
              <TableCell>{t('inv.type')}</TableCell>
              <TableCell align="right">{t('inv.onHand')}</TableCell>
              <TableCell align="right">{t('inv.minLevel')}</TableCell>
              <TableCell>{t('inv.alerts')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {items.data?.map((i) => (
                <TableRow key={i.id} hover sx={{ cursor: 'pointer' }} onClick={() => setDialog({ item: i })}>
                  <TableCell sx={{ fontWeight: 600 }}>{i.name}</TableCell>
                  <TableCell><Chip size="small" label={t(`itemType.${i.itemType}`)} /></TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {i.onHand} {i.unit}
                  </TableCell>
                  <TableCell align="right">{i.minStockLevel ? `${Number(i.minStockLevel)}` : '—'}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      {i.belowMin && <Chip size="small" color="error" label={t('inv.belowMin')} />}
                      {i.hasExpiringBatch && <Chip size="small" color="warning" label={t('inv.expiring')} />}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {items.data?.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{t('inv.empty')}</Typography>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('inv.supplier')}</TableCell><TableCell>{t('login.phone')}</TableCell>
              <TableCell>GSTIN</TableCell><TableCell>{t('inv.type')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {suppliers.data?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell><TableCell>{s.phone ?? '—'}</TableCell>
                  <TableCell>{s.gstin ?? '—'}</TableCell><TableCell>{s.supplierType ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {dialog === 'newItem' && <ItemDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog === 'newSupplier' && <SupplierDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog && typeof dialog === 'object' && (
        <ItemDetail item={dialog.item} onClose={() => { setDialog(null); refresh(); }} />
      )}
    </Stack>
  );
}

function ItemDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ itemType: 'medicine', name: '', unit: 'ml', minStockLevel: '', withdrawalDays: '', defaultDosePerKg: '' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('inv.newItem')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField select label={t('inv.type')} value={f.itemType} onChange={set('itemType')}>
            {ITEM_TYPES.map((x) => <MenuItem key={x} value={x}>{t(`itemType.${x}`)}</MenuItem>)}
          </TextField>
          <TextField required label={t('inv.item')} value={f.name} onChange={set('name')} />
          <TextField select label={t('inv.unit')} value={f.unit} onChange={set('unit')}>
            {UNITS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
          </TextField>
          <TextField type="number" label={t('inv.minLevel')} value={f.minStockLevel} onChange={set('minStockLevel')} />
          {MED_TYPES.has(f.itemType) && (
            <>
              <TextField type="number" label={t('inv.dosePerKg')} value={f.defaultDosePerKg} onChange={set('defaultDosePerKg')} />
              <TextField type="number" label={t('inv.withdrawalDays')} value={f.withdrawalDays} onChange={set('withdrawalDays')} />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!f.name || busy}
          onClick={() => save(() => api('/items', {
            method: 'POST',
            body: {
              itemType: f.itemType, name: f.name, unit: f.unit,
              ...(f.minStockLevel ? { minStockLevel: Number(f.minStockLevel) } : {}),
              ...(f.defaultDosePerKg ? { defaultDosePerKg: Number(f.defaultDosePerKg), doseUnit: f.unit } : {}),
              ...(f.withdrawalDays ? { withdrawalDays: Number(f.withdrawalDays) } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ItemDetail(props: { item: any; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [action, setAction] = useState<null | 'in' | 'adjust'>(null);
  const batches = useQuery({
    queryKey: ['batches', props.item.id],
    queryFn: () => api<{ data: any[] }>(`/items/${props.item.id}/batches?all=true`).then((r) => r.data),
  });
  const movements = useQuery({
    queryKey: ['movements', props.item.id],
    queryFn: () => api<{ data: any[] }>(`/items/${props.item.id}/movements`).then((r) => r.data),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['batches', props.item.id] });
    void qc.invalidateQueries({ queryKey: ['movements', props.item.id] });
    void qc.invalidateQueries({ queryKey: ['items'] });
  };

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {props.item.name} — {props.item.onHand} {props.item.unit}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={() => setAction('in')}>{t('inv.stockIn')}</Button>
            <Button size="small" variant="outlined" color="warning" onClick={() => setAction('adjust')}>{t('inv.adjust')}</Button>
          </Stack>
          <Typography variant="subtitle2">{t('inv.batches')}</Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>{t('inv.batchNo')}</TableCell><TableCell>{t('inv.expiry')}</TableCell>
                <TableCell align="right">{t('inv.remaining')}</TableCell><TableCell align="right">₹/{props.item.unit}</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {batches.data?.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.batchNo ?? '—'}</TableCell>
                    <TableCell>{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : '—'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{Number(b.qtyRemaining)}/{Number(b.qtyReceived)}</TableCell>
                    <TableCell align="right">{b.unitCost ? Number(b.unitCost) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Typography variant="subtitle2">{t('inv.movements')}</Typography>
          <Box sx={{ overflowX: 'auto', maxHeight: 240 }}>
            <Table size="small" stickyHeader>
              <TableBody>
                {movements.data?.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{new Date(m.movedAt).toLocaleDateString()}</TableCell>
                    <TableCell>{t(`movement.${m.movementType}`)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: Number(m.qty) < 0 ? 'error.main' : 'success.main' }}>
                      {Number(m.qty) > 0 ? '+' : ''}{Number(m.qty)}
                    </TableCell>
                    <TableCell>{m.reason ?? m.refType ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={props.onClose}>{t('form.cancel')}</Button></DialogActions>
      {action === 'in' && (
        <StockInDialog item={props.item} onClose={(s) => { setAction(null); if (s) refresh(); }} />
      )}
      {action === 'adjust' && (
        <AdjustDialog item={props.item} batches={batches.data ?? []} onClose={(s) => { setAction(null); if (s) refresh(); }} />
      )}
    </Dialog>
  );
}

function StockInDialog(props: { item: any; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<{ data: any[] }>('/suppliers').then((r) => r.data),
  });
  const [f, setF] = useState({ batchNo: '', expiryDate: '', qtyReceived: '', unitCost: '', supplierId: '', receivedOn: todayStr() });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('inv.stockIn')} — {props.item.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField type="date" label={t('form.date')} value={f.receivedOn} onChange={set('receivedOn')} InputLabelProps={{ shrink: true }} />
          <TextField required type="number" label={`${t('inv.qty')} (${props.item.unit})`} value={f.qtyReceived} onChange={set('qtyReceived')} />
          <TextField label={t('inv.batchNo')} value={f.batchNo} onChange={set('batchNo')} />
          <TextField type="date" label={t('inv.expiry')} value={f.expiryDate} onChange={set('expiryDate')} InputLabelProps={{ shrink: true }} />
          <TextField type="number" label={`₹ / ${props.item.unit}`} value={f.unitCost} onChange={set('unitCost')} />
          <TextField select label={t('inv.supplier')} value={f.supplierId} onChange={set('supplierId')}>
            {suppliers.data?.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!f.qtyReceived || busy}
          onClick={() => save(() => api(`/items/${props.item.id}/batches`, {
            method: 'POST',
            body: {
              receivedOn: f.receivedOn, qtyReceived: Number(f.qtyReceived),
              ...(f.batchNo ? { batchNo: f.batchNo } : {}),
              ...(f.expiryDate ? { expiryDate: f.expiryDate } : {}),
              ...(f.unitCost ? { unitCost: Number(f.unitCost) } : {}),
              ...(f.supplierId ? { supplierId: f.supplierId } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AdjustDialog(props: { item: any; batches: any[]; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ batchId: '', movementType: 'adjustment', qty: '', reason: '' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('inv.adjust')} — {props.item.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField select label={t('inv.batchNo')} value={f.batchId} onChange={set('batchId')}>
            {props.batches.filter((b) => Number(b.qtyRemaining) > 0).map((b) => (
              <MenuItem key={b.id} value={b.id}>{b.batchNo ?? b.id.slice(-6)} ({Number(b.qtyRemaining)})</MenuItem>
            ))}
          </TextField>
          <TextField select label={t('inv.type')} value={f.movementType} onChange={set('movementType')}>
            {['adjustment', 'wastage', 'expiry_writeoff', 'return'].map((x) => (
              <MenuItem key={x} value={x}>{t(`movement.${x}`)}</MenuItem>
            ))}
          </TextField>
          <TextField required type="number" label={`${t('inv.qty')} (± ${props.item.unit})`} value={f.qty} onChange={set('qty')}
            helperText={t('inv.signedHint')} />
          <TextField required label={t('form.reason')} value={f.reason} onChange={set('reason')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" color="warning" disabled={!f.qty || f.reason.length < 3 || busy}
          onClick={() => save(() => api(`/items/${props.item.id}/adjust`, {
            method: 'POST',
            body: {
              movementType: f.movementType, qty: Number(f.qty), reason: f.reason,
              ...(f.batchId ? { batchId: f.batchId } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SupplierDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: '', phone: '', supplierType: 'general' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('inv.newSupplier')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField required label={t('inv.supplier')} value={f.name} onChange={set('name')} />
          <TextField label={t('login.phone')} value={f.phone} onChange={set('phone')} />
          <TextField select label={t('inv.type')} value={f.supplierType} onChange={set('supplierType')}>
            {['medicine', 'feed', 'equipment', 'animal', 'general'].map((x) => (
              <MenuItem key={x} value={x}>{x}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!f.name || busy}
          onClick={() => save(() => api('/suppliers', {
            method: 'POST',
            body: { name: f.name, supplierType: f.supplierType, ...(f.phone ? { phone: f.phone } : {}) },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
