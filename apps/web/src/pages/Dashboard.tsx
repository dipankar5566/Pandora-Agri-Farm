import { Box, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { inr } from '../i18n';

function Tile(props: { label: string; value: string | number; warn?: boolean; to?: string }) {
  const inner = (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="h5" fontWeight={700} color={props.warn ? 'error' : undefined}
          sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {props.value}
        </Typography>
        <Typography variant="caption" color="text.secondary">{props.label}</Typography>
      </CardContent>
    </Card>
  );
  return (
    <Grid item xs={6} sm={4} md={2}>
      {props.to ? <Link to={props.to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner}
    </Grid>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<{ data: any }>('/dashboard').then((r) => r.data),
    refetchInterval: 60000,
  });
  const d = q.data;
  if (!d) return null;
  const backupAgeH = d.backup.lastSuccessAt
    ? Math.round((Date.now() - new Date(d.backup.lastSuccessAt).getTime()) / 3600000)
    : null;

  type Attention = { label: string; count: number; to: string; severity: 'error' | 'warning' | 'info' };
  const attentionAll: Attention[] = [
    { label: t('dash.att.duesOverdue'), count: d.attention.duesOverdue, to: '/health', severity: 'error' },
    { label: t('dash.att.openCases'), count: d.attention.openCases, to: '/health', severity: 'warning' },
    { label: t('dash.att.lowStock'), count: d.attention.lowStockItems, to: '/inventory', severity: 'warning' },
    { label: t('dash.att.expiring'), count: d.attention.expiringBatches30d, to: '/inventory', severity: 'warning' },
    { label: t('dash.att.tasks'), count: d.attention.tasksDueToday, to: '/tasks', severity: 'info' },
  ];
  const attention = attentionAll.filter((a) => a.count > 0);

  return (
    <Stack spacing={2}>
      <Grid container spacing={1.5}>
        <Tile label={t('dash.active')} value={d.herd.active} to="/herd" />
        <Tile label={t('dash.females')} value={d.herd.females} />
        <Tile label={t('dash.kids')} value={d.herd.kidsUnder6m} />
        <Tile label={t('dash.mortality')} value={`${d.herd.mortality90dPct}%`} warn={d.herd.mortality90dPct > 10} />
        <Tile label={t('dash.month')} value={inr(d.money.net)} warn={d.money.net < 0} to="/finance" />
        <Tile label={t('dash.backup')} value={backupAgeH == null ? t('dash.never') : t('dash.hoursAgo', { h: backupAgeH })} warn={backupAgeH == null || backupAgeH > 26} to="/settings" />
      </Grid>

      <Grid container spacing={1.5}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">{t('dash.attention')}</Typography>
              {attention.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>{t('dash.allClear')}</Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {attention.map((a) => (
                    <Stack key={a.label} direction="row" alignItems="center" spacing={1}
                      component={Link} to={a.to} sx={{ textDecoration: 'none', color: 'inherit' }}>
                      <Chip size="small" color={a.severity} label={a.count} />
                      <Typography variant="body2">{a.label}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">{t('dash.kiddings')}</Typography>
              {d.upcomingKiddings.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>{t('dash.noKiddings')}</Typography>
              ) : (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  {d.upcomingKiddings.map((k: any) => (
                    <Stack key={k.pregnancyId} direction="row" justifyContent="space-between">
                      <Link to={`/animals/${k.doeId}`}>{k.doeTag}</Link>
                      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(k.expected).toLocaleDateString()}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
          <Box sx={{ mt: 1.5 }}>
            <Card>
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="overline" color="text.secondary">{t('dash.moneyMonth', { m: d.money.month })}</Typography>
                <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                  <Typography variant="body2">▲ {inr(d.money.income)}</Typography>
                  <Typography variant="body2">▼ {inr(d.money.expense)}</Typography>
                  {d.money.costPerGoat != null && (
                    <Typography variant="body2" color="text.secondary">{t('dash.costPerGoat', { v: inr(d.money.costPerGoat) })}</Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Box>
        </Grid>
      </Grid>
    </Stack>
  );
}
