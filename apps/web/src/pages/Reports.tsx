import DownloadIcon from '@mui/icons-material/Download';
import {
  Box, Button, Card, CardContent, Grid, Stack, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { inr } from '../i18n';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const ENTITIES = [
  'animals', 'weights', 'treatments', 'vaccinations', 'ledger',
  'stock-movements', 'invoices', 'bills', 'attendance', 'payroll',
];
const DATED = new Set(['weights', 'treatments', 'vaccinations', 'ledger', 'stock-movements', 'invoices', 'bills', 'attendance', 'payroll']);

function Stat(props: { label: string; value: string | number }) {
  return (
    <Grid item xs={6} sm={4} md={3}>
      <Card><CardContent sx={{ py: 1.5 }}>
        <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>{props.value}</Typography>
        <Typography variant="caption" color="text.secondary">{props.label}</Typography>
      </CardContent></Card>
    </Grid>
  );
}

export default function Reports() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(thisMonth());
  const report = useQuery({
    queryKey: ['monthly-report', month],
    queryFn: () => api<{ data: any }>(`/reports/monthly?month=${month}`).then((r) => r.data),
  });
  const d = report.data;

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.reports')}</Typography>
        <TextField size="small" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Stack>

      {d && (
        <>
          <Typography variant="overline" color="text.secondary">{t('rep.herd')}</Typography>
          <Grid container spacing={1.5}>
            <Stat label={t('dash.active')} value={d.herd.activeNow} />
            <Stat label={t('rep.born')} value={d.herd.born} />
            <Stat label={t('rep.kiddings')} value={d.herd.kiddings} />
            <Stat label={t('rep.died')} value={d.herd.died} />
            <Stat label={t('rep.sold')} value={d.herd.sold} />
            <Stat label={t('rep.purchased')} value={d.herd.purchased} />
          </Grid>
          <Typography variant="overline" color="text.secondary">{t('rep.money')}</Typography>
          <Grid container spacing={1.5}>
            <Stat label={t('fin.income')} value={inr(d.money.income)} />
            <Stat label={t('fin.expense')} value={inr(d.money.expense)} />
            <Stat label={t('fin.net')} value={inr(d.money.net)} />
            <Stat label={t('rep.invoiced')} value={inr(d.money.invoicedTotal)} />
            <Stat label={t('rep.purchasedTotal')} value={inr(d.money.purchasedTotal)} />
            <Stat label={t('rep.payroll')} value={inr(d.money.payrollNet)} />
          </Grid>
          <Typography variant="overline" color="text.secondary">{t('rep.opsRow')}</Typography>
          <Grid container spacing={1.5}>
            <Stat label={t('rep.administrations')} value={d.health.administrations} />
            <Stat label={t('rep.casesOpened')} value={d.health.casesOpened} />
            <Stat label={t('rep.casesClosed')} value={d.health.casesClosed} />
            <Stat label={t('rep.feedUsed')} value={`${d.feed.totalFedKg} kg`} />
          </Grid>
        </>
      )}

      <Typography variant="overline" color="text.secondary">{t('rep.exports')}</Typography>
      <Typography variant="body2" color="text.secondary">{t('rep.exportsHint')}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {ENTITIES.map((e) => (
          <Button key={e} size="small" variant="outlined" startIcon={<DownloadIcon />}
            component="a"
            href={`/api/v1/exports/${e}.csv${DATED.has(e) ? `?month=${month}` : ''}`}
            download>
            {t(`export.${e}`)}
          </Button>
        ))}
      </Box>
    </Stack>
  );
}
