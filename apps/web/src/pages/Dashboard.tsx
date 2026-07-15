import { Card, CardContent, Grid, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

function Tile(props: { label: string; value: string | number; warn?: boolean }) {
  return (
    <Grid item xs={6} sm={4} md={2}>
      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Typography variant="h5" fontWeight={700} color={props.warn ? 'error' : undefined}
            sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {props.value}
          </Typography>
          <Typography variant="caption" color="text.secondary">{props.label}</Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const stats = useQuery({
    queryKey: ['herd-stats'],
    queryFn: () => api<{ data: any }>('/herd/stats').then((r) => r.data),
  });
  const health = useQuery({
    queryKey: ['ops-health'],
    queryFn: () => api<{ data: any }>('/ops/health').then((r) => r.data),
    refetchInterval: 60000,
  });

  const s = stats.data;
  const h = health.data;
  return (
    <Grid container spacing={1.5}>
      <Tile label={t('dash.active')} value={s?.active ?? '—'} />
      <Tile label={t('dash.females')} value={s?.females ?? '—'} />
      <Tile label={t('dash.males')} value={s?.males ?? '—'} />
      <Tile label={t('dash.kids')} value={s?.kidsUnder6m ?? '—'} />
      <Tile label={t('dash.mortality')} value={s ? `${s.mortality90dPct}%` : '—'} warn={!!s && s.mortality90dPct > 10} />
      <Tile label={t('dash.disk')} value={h ? `${h.diskFreeGb} GB` : '—'} warn={!!h && h.diskFreeGb < 5} />
      <Tile label={t('dash.backup')} value={h?.lastBackupAt ? new Date(h.lastBackupAt).toLocaleDateString() : t('dash.never')} warn={!!h && !h.lastBackupAt} />
    </Grid>
  );
}
