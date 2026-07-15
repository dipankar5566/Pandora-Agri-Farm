import AddIcon from '@mui/icons-material/Add';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableRow, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';
import { inr } from '../i18n';

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Finance() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [month, setMonth] = useState(thisMonth());
  const [dialog, setDialog] = useState<null | 'income' | 'expense'>(null);

  const summary = useQuery({
    queryKey: ['fin-summary', month],
    queryFn: () => api<{ data: any }>(`/finance/summary?month=${month}`).then((r) => r.data),
  });
  const ledger = useQuery({
    queryKey: ['ledger', month],
    queryFn: () => api<{ data: any[] }>(`/ledger-entries?month=${month}`).then((r) => r.data),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['fin-summary', month] });
    void qc.invalidateQueries({ queryKey: ['ledger', month] });
  };
  const s = summary.data;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.finance')}</Typography>
        <TextField size="small" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <Button startIcon={<AddIcon />} color="success" variant="outlined" onClick={() => setDialog('income')}>
          {t('fin.income')}
        </Button>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setDialog('expense')}>
          {t('fin.expense')}
        </Button>
      </Stack>

      {s && (
        <Grid container spacing={1.5}>
          {[
            { label: t('fin.income'), v: s.income, color: 'success.main' },
            { label: t('fin.expense'), v: s.expense, color: 'warning.main' },
            { label: t('fin.net'), v: s.net, color: s.net >= 0 ? 'success.main' : 'error.main' },
            { label: t('fin.costPerGoat'), v: s.costPerGoat, color: 'text.primary' },
          ].map((x) => (
            <Grid item xs={6} md={3} key={x.label}>
              <Card><CardContent sx={{ py: 1.5 }}>
                <Typography variant="h6" sx={{ color: x.color, fontVariantNumeric: 'tabular-nums' }}>
                  {x.v == null ? '—' : inr(x.v)}
                </Typography>
                <Typography variant="caption" color="text.secondary">{x.label}</Typography>
              </CardContent></Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableBody>
            {ledger.data?.map((e) => (
              <TableRow key={e.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.entryDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Chip size="small" label={(i18n.language === 'bn' && e.category?.nameBn) || e.category?.name}
                    color={e.kind === 'income' ? 'success' : 'default'} />
                </TableCell>
                <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.description ?? e.counterpartyName ?? (e.refType ? t('fin.auto') : '')}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: e.kind === 'income' ? 'success.main' : undefined }}>
                  {e.kind === 'income' ? '+' : '−'}{inr(e.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {ledger.data?.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{t('fin.empty')}</Typography>
        )}
      </Box>

      {dialog && <EntryDialog kind={dialog} onClose={(saved) => { setDialog(null); if (saved) refresh(); }} />}
    </Stack>
  );
}

function EntryDialog(props: { kind: 'income' | 'expense'; onClose: (saved: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const cats = useQuery({
    queryKey: ['fin-cats'],
    queryFn: () => api<{ data: any[] }>('/finance-categories').then((r) => r.data),
  });
  const [f, setF] = useState({ categoryId: '', amount: '', description: '', entryDate: todayStr(), paymentMethod: 'cash' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const [error, setError] = useState<ApiError | null>(null);
  const save = useMutation<unknown, ApiError>({
    mutationFn: () =>
      api('/ledger-entries', {
        method: 'POST',
        body: {
          entryDate: f.entryDate, kind: props.kind, categoryId: f.categoryId,
          amount: Number(f.amount), paymentMethod: f.paymentMethod,
          ...(f.description ? { description: f.description } : {}),
        },
      }),
    onSuccess: () => props.onClose(true),
    onError: setError,
  });
  const myCats = cats.data?.filter((c) => c.kind === props.kind) ?? [];

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t(`fin.${props.kind}`)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField autoFocus required type="number" label="₹" value={f.amount} onChange={set('amount')} />
          <TextField select required label={t('fin.category')} value={f.categoryId} onChange={set('categoryId')}>
            {myCats.map((c) => (
              <MenuItem key={c.id} value={c.id}>{(i18n.language === 'bn' && c.nameBn) || c.name}</MenuItem>
            ))}
          </TextField>
          <TextField type="date" label={t('form.date')} value={f.entryDate} onChange={set('entryDate')} InputLabelProps={{ shrink: true }} />
          <TextField select label={t('fin.method')} value={f.paymentMethod} onChange={set('paymentMethod')}>
            {['cash', 'upi', 'bank', 'cheque', 'credit'].map((m) => <MenuItem key={m} value={m}>{t(`payment.${m}`)}</MenuItem>)}
          </TextField>
          <TextField label={t('form.notes')} value={f.description} onChange={set('description')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!f.amount || !f.categoryId || save.isPending} onClick={() => save.mutate()}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
