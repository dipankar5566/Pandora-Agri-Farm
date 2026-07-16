import NotificationsIcon from '@mui/icons-material/Notifications';
import {
  Badge, Box, Button, IconButton, Popover, Stack, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

export default function NotificationBell() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ data: any[]; meta: { unreadCount: number } }>('/notifications'),
    refetchInterval: 120000,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST', body: {} }),
    onSuccess: refresh,
  });
  const readOne = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST', body: {} }),
    onSuccess: refresh,
  });

  const unread = q.data?.meta.unreadCount ?? 0;
  const items = q.data?.data ?? [];

  return (
    <>
      <IconButton color="inherit" onClick={(e) => setAnchor(e.currentTarget)} aria-label="notifications">
        <Badge badgeContent={unread} color="error" max={9}>
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 340, maxHeight: 420, overflowY: 'auto', p: 1.5 }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{t('notif.title')}</Typography>
            {unread > 0 && (
              <Button size="small" onClick={() => readAll.mutate()}>{t('notif.readAll')}</Button>
            )}
          </Stack>
          {items.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              {t('notif.empty')}
            </Typography>
          )}
          {items.map((n) => (
            <Box key={n.id}
              onClick={() => !n.readAt && readOne.mutate(n.id)}
              sx={{
                px: 1.5, py: 1, mb: 0.5, borderRadius: 2, cursor: n.readAt ? 'default' : 'pointer',
                bgcolor: n.readAt ? 'transparent' : 'action.hover',
                borderLeft: 3,
                borderColor: n.severity === 'critical' ? 'error.main' : n.severity === 'warning' ? 'warning.main' : 'info.main',
              }}>
              <Typography variant="caption" color="text.secondary">
                {new Date(n.createdAt).toLocaleString()}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line', fontWeight: n.readAt ? 400 : 600 }}>
                {n.body ?? String(t(n.titleCode))}
              </Typography>
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  );
}
