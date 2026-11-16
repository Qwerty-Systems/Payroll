import { useEffect, useState, type ReactNode } from 'react';
import { AppBar, Box, Chip, Container, Paper, Stack, Toolbar, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import ConstructionOutlined from '@mui/icons-material/ConstructionOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import SyncOutlined from '@mui/icons-material/SyncOutlined';

function Metric({ label, value, detail, icon }: {
  label: string; value: string; detail: string; icon: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography color="text.secondary" variant="body2">{label}</Typography>
        {icon}
      </Stack>
      <Typography variant="h4" fontWeight={700} sx={{ mt: 1.5 }}>{value}</Typography>
      <Typography color="text.secondary" variant="caption">{detail}</Typography>
    </Paper>
  );
}

export default function App() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0} color="primary">
        <Toolbar sx={{ px: { xs: 2, sm: 3 } }}>
          <ConstructionOutlined sx={{ mr: 1.5 }} />
          <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            JengaFlow
          </Typography>
          <Chip size="small" icon={<SyncOutlined />} label={online ? 'Online' : 'Offline'}
            color={online ? 'success' : 'warning'} variant="outlined"
            sx={{ color: 'white', borderColor: 'rgba(255,255,255,.5)' }} />
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 }, px: { xs: 2, sm: 3 } }}>
        <Typography variant="overline" color="primary.main" fontWeight={700}>WORKFORCE OPERATIONS</Typography>
        <Typography variant="h4" fontWeight={750} sx={{ mt: 0.5, fontSize: { xs: '1.8rem', sm: '2.25rem' } }}>
          Construction operations, connected.
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 720 }}>
          A mobile-friendly workspace for projects, site teams, attendance, payroll and business administration.
        </Typography>
        <Grid container spacing={2.5} sx={{ mt: 2 }}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Metric label="Workforce" value="Coming next" detail="Worker and contract management" icon={<GroupsOutlined color="primary" />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Metric label="Projects & sites" value="Coming next" detail="Site operations and cost allocation" icon={<ConstructionOutlined color="primary" />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Metric label="Payroll" value="In specification" detail="Auditable payroll calculation" icon={<ReceiptLongOutlined color="primary" />} />
          </Grid>
        </Grid>
        <Paper variant="outlined" sx={{ mt: 3, p: 2.5 }}>
          <Typography fontWeight={700}>Implementation status</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            The product specification and initial application foundation are committed. Operational modules are not enabled yet.
          </Typography>
          <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mt: 1 }}>
            A Qwerty Systems product · Working product name, subject to approval
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
