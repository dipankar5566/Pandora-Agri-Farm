import AddIcon from '@mui/icons-material/Add';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';
import { inr } from '../i18n';

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const STATUSES = ['present', 'half_day', 'leave', 'absent'] as const;

function useSave(onClose: (saved: boolean) => void) {
  const [error, setError] = useState<ApiError | null>(null);
  const m = useMutation<unknown, ApiError, () => Promise<unknown>>({
    mutationFn: (fn) => fn(),
    onSuccess: () => onClose(true),
    onError: setError,
  });
  return { error, save: (fn: () => Promise<unknown>) => m.mutate(fn), busy: m.isPending };
}

export default function Employees() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState<null | 'newEmployee' | { payroll: any }>(null);

  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<{ data: any[] }>('/employees').then((r) => r.data),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['employees'] });
    void qc.invalidateQueries({ queryKey: ['payroll'] });
    void qc.invalidateQueries({ queryKey: ['attendance'] });
  };
  const active = employees.data?.filter((e) => !e.leftOn) ?? [];

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{t('nav.employees')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('newEmployee')}>
          {t('emp.new')}
        </Button>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={t('emp.attendance')} />
        <Tab label={t('emp.staff')} />
        <Tab label={t('emp.payroll')} />
      </Tabs>

      {tab === 0 && <AttendanceTab employees={active} onSaved={refresh} />}

      {tab === 1 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('form.name')}</TableCell>
              <TableCell>{t('emp.designation')}</TableCell>
              <TableCell>{t('emp.wage')}</TableCell>
              <TableCell align="right">{t('emp.attendanceMonth')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {employees.data?.map((e) => (
                <TableRow key={e.id} sx={{ opacity: e.leftOn ? 0.5 : 1 }}>
                  <TableCell sx={{ fontWeight: 600 }}>{e.fullName}</TableCell>
                  <TableCell>{e.designation ?? '—'}</TableCell>
                  <TableCell>
                    {inr(e.wageRate)} / {t(`wage.${e.wageType}`)}
                  </TableCell>
                  <TableCell align="right">
                    {e.thisMonth.attendancePct != null
                      ? <Chip size="small" color={e.thisMonth.attendancePct >= 90 ? 'success' : 'warning'}
                          label={`${e.thisMonth.attendancePct}%`} />
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {tab === 2 && <PayrollTab employees={active} onOpen={(p) => setDialog({ payroll: p })} />}

      {dialog === 'newEmployee' && <EmployeeDialog onClose={(s) => { setDialog(null); if (s) refresh(); }} />}
      {dialog && typeof dialog === 'object' && (
        <PayrollDialog preview={dialog.payroll} onClose={(s) => { setDialog(null); if (s) refresh(); }} />
      )}
    </Stack>
  );
}

function AttendanceTab(props: { employees: any[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const existing = useQuery({
    queryKey: ['attendance', date.slice(0, 7)],
    queryFn: () => api<{ data: any[] }>(`/attendance?month=${date.slice(0, 7)}`).then((r) => r.data),
  });
  useEffect(() => {
    if (!existing.data) return;
    const next: Record<string, string> = {};
    for (const a of existing.data) {
      if (a.date.slice(0, 10) === date) next[a.employeeId] = a.status;
    }
    setMarks(next);
    setSaved(false);
  }, [existing.data, date]);

  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api('/attendance', {
      method: 'POST',
      body: {
        date,
        entries: Object.entries(marks).map(([employeeId, status]) => ({ employeeId, status })),
      },
    }),
    onSuccess: () => { setSaved(true); props.onSaved(); },
  });

  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <TextField size="small" type="date" value={date} onChange={(e) => setDate(e.target.value)} sx={{ width: 170 }} />
      {saved && <Alert severity="success">{String(t('emp.attendanceSaved'))}</Alert>}
      {save.error && <Alert severity="error">{String(t((save.error as ApiError).messageCode))}</Alert>}
      {props.employees.map((e) => (
        <Stack key={e.id} direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Typography sx={{ width: 150 }} noWrap fontWeight={600}>{e.fullName}</Typography>
          <ToggleButtonGroup
            exclusive size="small"
            value={marks[e.id] ?? null}
            onChange={(_, v) => v && setMarks({ ...marks, [e.id]: v })}
          >
            {STATUSES.map((s) => (
              <ToggleButton key={s} value={s} color={s === 'present' ? 'success' : s === 'absent' ? 'error' : 'warning'}>
                {t(`att.${s}`)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
      ))}
      {props.employees.length === 0 ? (
        <Typography color="text.secondary">{t('emp.none')}</Typography>
      ) : (
        <Button variant="contained" disabled={Object.keys(marks).length === 0 || save.isPending}
          onClick={() => save.mutate()}>
          {t('emp.saveDay')}
        </Button>
      )}
    </Stack>
  );
}

function PayrollTab(props: { employees: any[]; onOpen: (preview: any) => void }) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(thisMonth());
  const runs = useQuery({
    queryKey: ['payroll', month],
    queryFn: () => api<{ data: any[] }>(`/payroll?month=${month}`).then((r) => r.data),
  });
  const runByEmp = new Map((runs.data ?? []).map((r) => [r.employeeId, r]));
  const [err, setErr] = useState<ApiError | null>(null);
  const qc = useQueryClient();

  const openPreview = (employeeId: string) =>
    api<{ data: any }>('/payroll/preview', { method: 'POST', body: { employeeId, month } })
      .then((r) => props.onOpen(r.data))
      .catch(setErr);

  const pay = (runId: string) =>
    api(`/payroll/${runId}/pay`, { method: 'POST', body: { paidOn: todayStr(), method: 'cash' } })
      .then(() => void qc.invalidateQueries({ queryKey: ['payroll', month] }))
      .catch(setErr);

  return (
    <Stack spacing={2}>
      <TextField size="small" type="month" value={month} onChange={(e) => setMonth(e.target.value)} sx={{ width: 170 }} />
      {err && <Alert severity="error" onClose={() => setErr(null)}>{String(t(err.messageCode))}</Alert>}
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>{t('form.name')}</TableCell>
            <TableCell align="right">{t('emp.net')}</TableCell>
            <TableCell>{t('herd.status')}</TableCell>
            <TableCell />
          </TableRow></TableHead>
          <TableBody>
            {props.employees.map((e) => {
              const run = runByEmp.get(e.id);
              return (
                <TableRow key={e.id}>
                  <TableCell>{e.fullName}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {run ? inr(run.netAmount) : '—'}
                  </TableCell>
                  <TableCell>
                    {run
                      ? run.paidOn
                        ? <Chip size="small" color="success" label={t('sales.paid')} />
                        : <Chip size="small" color="warning" label={t('emp.unpaid')} />
                      : <Chip size="small" label={t('emp.notRun')} />}
                  </TableCell>
                  <TableCell align="right">
                    {!run && <Button size="small" onClick={() => void openPreview(e.id)}>{t('emp.generate')}</Button>}
                    {run && !run.paidOn && (
                      <Button size="small" variant="contained" onClick={() => void pay(run.id)}>{t('emp.payNow')}</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
}

function PayrollDialog(props: { preview: any; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const p = props.preview;
  const [bonus, setBonus] = useState('');
  const [deductions, setDeductions] = useState('');
  const { error, save, busy } = useSave(props.onClose);
  const net = p.suggestedGross + (Number(bonus) || 0) - (Number(deductions) || 0);

  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('emp.payroll')} — {p.employee.fullName} · {p.month}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <Typography variant="body2" color="text.secondary">
            {t('emp.daysSummary', { p: p.daysPresent, h: p.daysHalf, l: p.daysLeave, a: p.daysAbsent })}
          </Typography>
          <Typography variant="body2">
            {t('emp.gross')}: <b>{inr(p.suggestedGross)}</b> ({t(`wage.${p.employee.wageType}`)} {inr(p.employee.wageRate)})
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" type="number" label={t('emp.bonus')} value={bonus}
              onChange={(e) => setBonus(e.target.value)} />
            <TextField size="small" type="number" label={t('emp.deductions')} value={deductions}
              onChange={(e) => setDeductions(e.target.value)} />
          </Stack>
          <Typography fontWeight={700}>{t('emp.net')}: {inr(net)}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={busy || net < 0}
          onClick={() => save(() => api('/payroll', {
            method: 'POST',
            body: {
              employeeId: p.employee.id, month: p.month,
              ...(bonus ? { bonus: Number(bonus) } : {}),
              ...(deductions ? { deductions: Number(deductions) } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function EmployeeDialog(props: { onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ fullName: '', phone: '', designation: '', wageType: 'monthly', wageRate: '', joinedOn: todayStr() });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, save, busy } = useSave(props.onClose);
  return (
    <Dialog open onClose={() => props.onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>{t('emp.new')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{String(t(error.messageCode))}</Alert>}
          <TextField required autoFocus label={t('form.name')} value={f.fullName} onChange={set('fullName')} />
          <TextField label={t('login.phone')} value={f.phone} onChange={set('phone')} inputMode="numeric" />
          <TextField label={t('emp.designation')} value={f.designation} onChange={set('designation')} />
          <Stack direction="row" spacing={1.5}>
            <TextField select label={t('emp.wageType')} value={f.wageType} onChange={set('wageType')} sx={{ flexGrow: 1 }}>
              <MenuItem value="monthly">{t('wage.monthly')}</MenuItem>
              <MenuItem value="daily">{t('wage.daily')}</MenuItem>
            </TextField>
            <TextField required type="number" label="₹" value={f.wageRate} onChange={set('wageRate')} sx={{ width: 130 }} />
          </Stack>
          <TextField type="date" label={t('emp.joined')} value={f.joinedOn} onChange={set('joinedOn')} InputLabelProps={{ shrink: true }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => props.onClose(false)}>{t('form.cancel')}</Button>
        <Button variant="contained" disabled={f.fullName.length < 2 || !f.wageRate || busy}
          onClick={() => save(() => api('/employees', {
            method: 'POST',
            body: {
              fullName: f.fullName, wageType: f.wageType, wageRate: Number(f.wageRate), joinedOn: f.joinedOn,
              ...(f.phone ? { phone: f.phone } : {}),
              ...(f.designation ? { designation: f.designation } : {}),
            },
          }))}>
          {t('form.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
