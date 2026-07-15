import {
  Alert, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';
import type { Me } from '../App';

export default function Settings(props: { me: Me }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isOwner = props.me.permissions.settings === 'approve';
  const [newUser, setNewUser] = useState(false);

  const farm = useQuery({
    queryKey: ['farm'],
    queryFn: () => api<{ data: any }>('/farm').then((r) => r.data),
    enabled: props.me.permissions.settings !== 'none',
  });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ data: any[] }>('/users').then((r) => r.data),
    enabled: isOwner,
  });
  const health = useQuery({
    queryKey: ['ops-health'],
    queryFn: () => api<{ data: any }>('/ops/health').then((r) => r.data),
    refetchInterval: 60000,
  });
  const backup = useMutation<any, ApiError>({
    mutationFn: () => api('/ops/backup', { method: 'POST', body: {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops-health'] }),
  });

  const h = health.data;
  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <Typography variant="h6">{t('nav.settings')}</Typography>

      <Card><CardContent>
        <Typography variant="overline" color="text.secondary">{t('set.backup')}</Typography>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Typography variant="body2">
            {h?.lastBackupAt
              ? t('set.lastBackup', { d: new Date(h.lastBackupAt).toLocaleString() })
              : t('set.noBackup')}
          </Typography>
          <Typography variant="body2" color="text.secondary">{t('dash.disk')}: {h?.diskFreeGb ?? '—'} GB</Typography>
          {isOwner && (
            <Button size="small" variant="contained" disabled={backup.isPending} onClick={() => backup.mutate()}>
              {backup.isPending ? '…' : t('set.backupNow')}
            </Button>
          )}
          {backup.isSuccess && <Chip size="small" color="success" label={t('set.backupOk')} />}
          {backup.isError && <Alert severity="error">{String(t((backup.error as ApiError).messageCode))}</Alert>}
        </Stack>
      </CardContent></Card>

      {farm.data && (
        <Card><CardContent>
          <Typography variant="overline" color="text.secondary">{t('set.farm')}</Typography>
          <Typography variant="body1" fontWeight={650}>{farm.data.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {farm.data.district}, {farm.data.state} · {t('set.tagPrefix')}: {farm.data.tagPrefix}
          </Typography>
        </CardContent></Card>
      )}

      {isOwner && (
        <Card><CardContent>
          <Stack direction="row" alignItems="center">
            <Typography variant="overline" color="text.secondary" sx={{ flexGrow: 1 }}>{t('set.users')}</Typography>
            <Button size="small" onClick={() => setNewUser(true)}>{t('set.newUser')}</Button>
          </Stack>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('form.name')}</TableCell><TableCell>{t('login.phone')}</TableCell>
              <TableCell>{t('set.roles')}</TableCell><TableCell>{t('herd.status')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {users.data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.fullName}</TableCell>
                  <TableCell>{u.phone}</TableCell>
                  <TableCell>{u.roles.map((r: any) => r.name).join(', ')}</TableCell>
                  <TableCell>
                    <Chip size="small" color={u.isActive ? 'success' : 'default'}
                      label={u.isActive ? t('status.active') : t('set.inactive')} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {newUser && <NewUserDialog onClose={(saved) => { setNewUser(false); if (saved) void qc.invalidateQueries({ queryKey: ['users'] }); }} />}
    </Stack>
  );
}

function NewUserDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<{ data: any[] }>('/roles').then((r) => r.data) });
  const [f, setF] = useState({ fullName: '', phone: '', password: '', roleId: '', locale: 'bn' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const [error, setError] = useState<ApiError | null>(null);
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api('/users', {
      method: 'POST',
      body: { fullName: f.fullName, phone: f.phone, password: f.password, locale: f.locale, roleIds: [f.roleId] },
    }),
    onSuccess: () => props.onClose(true),
    onError: setError,
  });
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('set.newUser')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField required label={t('form.name')} value={f.fullName} onChange={set('fullName')} />
          <TextField required label={t('login.phone')} value={f.phone} onChange={set('phone')} inputMode="numeric" />
          <TextField required type="password" label={t('login.password')} value={f.password} onChange={set('password')} />
          <TextField select required label={t('set.role')} value={f.roleId} onChange={set('roleId')}>
            {roles.data?.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          </TextField>
          <TextField select label={t('set.language')} value={f.locale} onChange={set('locale')}>
            <MenuItem value="bn">বাংলা</MenuItem><MenuItem value="en">English</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={!f.fullName || !f.phone || f.password.length < 8 || !f.roleId || save.isPending}
          onClick={() => save.mutate()}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
