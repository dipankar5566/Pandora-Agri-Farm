import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';

export default function Login(props: { onLoggedIn: () => void }) {
  const { t, i18n } = useTranslation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: { phone, password } });
      props.onLoggedIn();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 360, maxWidth: '100%' }}>
        <CardContent>
          <Stack component="form" onSubmit={submit} spacing={2} alignItems="stretch">
            <Typography variant="h5" textAlign="center">🐐</Typography>
            <Typography variant="h6" textAlign="center">Pandora Goat Farm</Typography>
            <Typography variant="body2" textAlign="center" color="text.secondary">
              পান্ডোরা গোট ফার্ম
            </Typography>
            {error && (
              <Alert severity="error">{String(t(error.messageCode, error.params as any))}</Alert>
            )}
            <TextField
              label={t('login.phone')} value={phone} required autoFocus
              onChange={(e) => setPhone(e.target.value)} inputMode="numeric"
            />
            <TextField
              label={t('login.password')} type="password" value={password} required
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {t('login.signIn')}
            </Button>
            <Button
              size="small"
              onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'bn' : 'en')}
            >
              EN | বাংলা
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
