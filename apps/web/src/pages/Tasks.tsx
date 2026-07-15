import AddIcon from '@mui/icons-material/Add';
import {
  Alert, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Tasks() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | 'new' | { skip: any }>(null);
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<{ data: any[] }>(`/tasks?date=${todayStr()}`).then((r) => r.data),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['tasks'] });

  const complete = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}/complete`, { method: 'POST', body: {} }),
    onSuccess: refresh,
  });

  const pending = tasks.data?.filter((x) => x.status === 'pending') ?? [];
  const doneToday = tasks.data?.filter((x) => x.status !== 'pending') ?? [];

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.tasks')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('new')}>{t('tasks.new')}</Button>
      </Stack>

      {pending.map((task) => (
        <Stack key={task.id} direction="row" alignItems="center" spacing={1}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 2, px: 1, py: 0.5 }}>
          <Checkbox checked={false} onChange={() => complete.mutate(task.id)} />
          <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>{task.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t(`taskType.${task.taskType}`)}{task.recurrence ? ` · ${t(`tasks.${task.recurrence}`)}` : ''}
            </Typography>
          </Stack>
          {task.overdueDays > 0 && <Chip size="small" color="error" label={t('health.overdueDays', { n: task.overdueDays })} />}
          <Button size="small" color="warning" onClick={() => setDialog({ skip: task })}>{t('tasks.skip')}</Button>
        </Stack>
      ))}
      {pending.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>{t('tasks.allDone')}</Typography>
      )}

      {doneToday.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary">{t('tasks.doneToday')}</Typography>
          {doneToday.map((task) => (
            <Typography key={task.id} variant="body2" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
              {task.title}
            </Typography>
          ))}
        </>
      )}

      {dialog === 'new' && <NewTaskDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog && typeof dialog === 'object' && (
        <SkipDialog task={dialog.skip} onClose={(s) => { setDialog(null); if (s) refresh(); }} />
      )}
    </Stack>
  );
}

function NewTaskDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ title: '', taskType: 'custom', dueOn: todayStr(), recurrence: '' });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const [error, setError] = useState<ApiError | null>(null);
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api('/tasks', {
      method: 'POST',
      body: {
        title: f.title, taskType: f.taskType, dueOn: f.dueOn,
        ...(f.recurrence ? { recurrence: f.recurrence } : {}),
      },
    }),
    onSuccess: () => props.onClose(true),
    onError: setError,
  });
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('tasks.new')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField autoFocus required label={t('tasks.title')} value={f.title} onChange={set('title')} />
          <TextField select label={t('inv.type')} value={f.taskType} onChange={set('taskType')}>
            {['feeding', 'cleaning', 'inspection', 'maintenance', 'custom'].map((x) => (
              <MenuItem key={x} value={x}>{t(`taskType.${x}`)}</MenuItem>
            ))}
          </TextField>
          <TextField type="date" label={t('form.date')} value={f.dueOn} onChange={set('dueOn')} InputLabelProps={{ shrink: true }} />
          <TextField select label={t('tasks.repeat')} value={f.recurrence} onChange={set('recurrence')}>
            <MenuItem value="">{t('tasks.once')}</MenuItem>
            <MenuItem value="daily">{t('tasks.daily')}</MenuItem>
            <MenuItem value="weekly">{t('tasks.weekly')}</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={f.title.length < 2 || save.isPending} onClick={() => save.mutate()}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SkipDialog(props: { task: any; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/tasks/${props.task.id}/skip`, { method: 'POST', body: { reason } }),
    onSuccess: () => props.onClose(true),
  });
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('tasks.skip')} — {props.task.title}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth required sx={{ mt: 1 }} label={t('form.reason')}
          value={reason} onChange={(e) => setReason(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" color="warning" disabled={reason.length < 3 || save.isPending} onClick={() => save.mutate()}>
          {t('tasks.skip')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
