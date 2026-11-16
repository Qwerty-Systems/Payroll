import { useEffect, useState, type ReactNode } from 'react';
import {
  AppBar, Box, Button, Chip, Container, Paper, Stack, Toolbar, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import ConstructionOutlined from '@mui/icons-material/ConstructionOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    deferredInstallPrompt?: InstallPromptEvent;
  }
}

function Metric({ label, value, detail, icon }: {
  label: string; value: string; detail: string; icon: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography color="text.secondary" variant="body2">{label}</Typography>
        {icon}
      </Stack>
      <Typography variant="h5" fontWeight={700} sx={{ mt: 1.5 }}>{value}</Typography>
      <Typography color="text.secondary" variant="caption">{detail}</Typography>
    </Paper>
  );
}

export default function App() {
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState('');

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine);
    const captureInstall = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as InstallPromptEvent;
      window.deferredInstallPrompt = promptEvent;
      setInstallPrompt(promptEvent);
    };
    const installed = () => {
      setInstallPrompt(null);
      window.deferredInstallPrompt = undefined;
      setInstallMessage('CrewLedger has been installed on this device.');
    };

    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    window.addEventListener('beforeinstallprompt', captureInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      window.removeEventListener('beforeinstallprompt', captureInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallMessage('Installation started.');
    setInstallPrompt(null);
    window.deferredInstallPrompt = undefined;
  };

  const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0} color="primary">
        <Toolbar sx={{ px: { xs: 2, sm: 3 }, minHeight: { xs: 58, sm: 64 } }}>
          <ConstructionOutlined sx={{ mr: 1.25 }} />
          <Typography variant="h6" fontWeight={750} sx={{ flexGrow: 1, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            CrewLedger
          </Typography>
          <Chip size="small" icon={<SyncOutlined />} label={online ? 'Online' : 'Offline'}
            color={online ? 'success' : 'warning'} variant="outlined"
            sx={{ color: 'white', borderColor: 'rgba(255,255,255,.5)' }} />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 }, px: { xs: 2, sm: 3 } }}>
        <Stack spacing={1}>
          <Typography variant="overline" color="primary.main" fontWeight={800}>A QWERTY SYSTEMS PRODUCT</Typography>
          <Typography variant="h3" fontWeight={800} sx={{ fontSize: { xs: '2rem', sm: '2.75rem' }, lineHeight: 1.12 }}>
            Construction work. Accounted for.
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
            One workspace for construction teams, projects, site attendance, workforce records and payroll.
            Designed for the office and the job site.
          </Typography>
        </Stack>

        {(installPrompt || isAppleMobile || installMessage) && (
          <Paper variant="outlined" sx={{ mt: 3, p: 2, borderColor: 'primary.light' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography fontWeight={700}>Take CrewLedger with you</Typography>
                <Typography variant="body2" color="text.secondary">
                  {installMessage || (isAppleMobile
                    ? 'On iPhone or iPad, open the browser Share menu and choose “Add to Home Screen”.'
                    : 'Install CrewLedger on this device for an app-like experience.')}
                </Typography>
              </Box>
              {installPrompt && <Button variant="contained" startIcon={<DownloadOutlined />} onClick={installApp}>Install app</Button>}
            </Stack>
          </Paper>
        )}

        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Metric label="Workforce" value="Coming next" detail="Workers, contracts and pay rates" icon={<GroupsOutlined color="primary" />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Metric label="Projects & sites" value="Coming next" detail="Site teams, assignments and attendance" icon={<ConstructionOutlined color="primary" />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Metric label="Payroll" value="In development" detail="Auditable earnings and deductions" icon={<ReceiptLongOutlined color="primary" />} />
          </Grid>
        </Grid>

        <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 2.5 } }}>
          <Typography fontWeight={750}>Development environment</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            The PostgreSQL schema foundation and API health checks are being implemented. This preview does not yet process real employee payroll or store customer records.
          </Typography>
          <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mt: 1.5 }}>
            {online ? 'Network available' : 'You are offline'} · Qwerty Systems
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
