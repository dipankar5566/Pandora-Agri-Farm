import { Alert, Button, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, Box } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Feed() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<Record<string, { itemId: string; qty: string }>>({});
  const [saved, setSaved] = useState(false);

  const pens = useQuery({ queryKey: ['pens'], queryFn: () => api<{ data: any[] }>('/pens').then((r) => r.data) });
  const items = useQuery({
    queryKey: ['feed-items'],
    queryFn: () => api<{ data: any[] }>('/items?type=feed').then((r) => r.data),
  });
  const existing = useQuery({
    queryKey: ['feed-logs', date],
    queryFn: () => api<{ data: any[] }>(`/feed-logs?date=${date}`).then((r) => r.data),
  });

  useEffect(() => {
    if (!existing.data) return;
    const next: Record<string, { itemId: string; qty: string }> = {};
    for (const log of existing.data) {
      next[log.penId] = { itemId: log.itemId, qty: String(Number(log.qty)) };
    }
    setRows(next);
    setSaved(false);
  }, [existing.data]);

  const save = useMutation<unknown, ApiError>({
    mutationFn: () =>
      api('/feed-logs', {
        method: 'POST',
        body: {
          date,
          rows: Object.entries(rows)
            .filter(([, r]) => r.itemId && r.qty)
            .map(([penId, r]) => ({ penId, itemId: r.itemId, qty: Number(r.qty) })),
        },
      }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['feed-logs', date] });
      void qc.invalidateQueries({ queryKey: ['feed-items'] });
    },
  });
  const err = save.error;
  const occupiedPens = pens.data?.filter((p) => p.occupancy > 0) ?? [];

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.feed')}</Typography>
        <TextField size="small" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Stack>
      {err && <Alert severity="error">{String(t(err.messageCode, err.params as any))}</Alert>}
      {saved && <Alert severity="success">{String(t('feed.saved'))}</Alert>}
      {items.data?.length === 0 && <Alert severity="info">{String(t('feed.noItems'))}</Alert>}
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>{t('herd.pen')}</TableCell>
            <TableCell>{t('itemType.feed')}</TableCell>
            <TableCell>{t('inv.qty')} (kg)</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {occupiedPens.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.shed.name} / {p.name} ({p.occupancy}🐐)</TableCell>
                <TableCell>
                  <TextField select size="small" value={rows[p.id]?.itemId ?? ''} sx={{ minWidth: 170 }}
                    onChange={(e) => setRows({ ...rows, [p.id]: { itemId: e.target.value, qty: rows[p.id]?.qty ?? '' } })}>
                    {items.data?.map((i) => (
                      <MenuItem key={i.id} value={i.id}>{i.name} ({i.onHand} {i.unit})</MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  <TextField size="small" type="number" inputProps={{ step: 0.1 }} sx={{ width: 100 }}
                    value={rows[p.id]?.qty ?? ''}
                    onChange={(e) => setRows({ ...rows, [p.id]: { itemId: rows[p.id]?.itemId ?? '', qty: e.target.value } })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Button variant="contained" disabled={save.isPending || Object.values(rows).every((r) => !r.qty)}
        onClick={() => save.mutate()}>
        {t('feed.saveDay')}
      </Button>
    </Stack>
  );
}
