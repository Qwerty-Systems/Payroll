import {
  AppBar, Box, Button, Card, CardContent, Chip, Container, Divider, Stack,
  Toolbar, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import OfflineBoltRounded from '@mui/icons-material/OfflineBoltRounded';
import Groups2Rounded from '@mui/icons-material/Groups2Rounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import InsightsRounded from '@mui/icons-material/InsightsRounded';
import PhoneIphoneRounded from '@mui/icons-material/PhoneIphoneRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';

const features = [
  { icon: <Groups2Rounded />, title: 'Your whole workforce', text: 'Keep worker profiles, contracts, pay rates and site assignments together.' },
  { icon: <ConstructionRounded />, title: 'Every site in view', text: 'Capture attendance, timesheets and project costs from the office or the field.' },
  { icon: <PaymentsRounded />, title: 'Payroll you can explain', text: 'See how earnings, deductions and employer costs are calculated, with a clear audit trail.' },
  { icon: <OfflineBoltRounded />, title: 'Keep working offline', text: 'Record approved site activity without a connection and sync safely when you are back online.' },
  { icon: <InsightsRounded />, title: 'Know where money goes', text: 'Understand labour costs by project, site, team and pay period.' },
  { icon: <PhoneIphoneRounded />, title: 'Fits every screen', text: 'A clean experience on phones, tablets, laptops and large desktop displays.' },
];

const steps = [
  ['01', 'Set up your company', 'Add your company, projects, sites and payroll preferences.'],
  ['02', 'Bring your team on board', 'Create worker profiles, assign roles and set contract rates.'],
  ['03', 'Run the workday', 'Capture attendance and review approved timesheets.'],
  ['04', 'Review and pay', 'Check the payroll preview, approve it and keep a permanent record.'],
];

export default function App() {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box sx={{ bgcolor: '#f7f9fc', color: '#0a192f', overflow: 'hidden' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'rgba(10,25,47,.97)', backdropFilter: 'blur(14px)' }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ minHeight: 76, gap: 2 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: '#64ffda', color: '#0a192f', display: 'grid', placeItems: 'center' }}>
              <ConstructionRounded />
            </Box>
            <Box sx={{ flexGrow: 1 }}>
              <Typography fontWeight={850} letterSpacing="-.04em" fontSize="1.25rem" color="white">JengaFlow</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)', letterSpacing: '.12em' }}>BY QWERTY SYSTEMS</Typography>
            </Box>
            {!compact && (
              <Stack direction="row" spacing={3} sx={{ mr: 2 }}>
                <Button href="#platform" color="inherit" sx={{ color: 'rgba(255,255,255,.82)' }}>Platform</Button>
                <Button href="#how-it-works" color="inherit" sx={{ color: 'rgba(255,255,255,.82)' }}>How it works</Button>
                <Button href="#contact" color="inherit" sx={{ color: 'rgba(255,255,255,.82)' }}>Contact</Button>
              </Stack>
            )}
            <Button variant="contained" href="mailto:contact@qwerty.co.ke?subject=JengaFlow%20demo%20request"
              endIcon={<ArrowForwardRounded />} sx={{ bgcolor: '#64ffda', color: '#0a192f', fontWeight: 800, '&:hover': { bgcolor: '#8fffe7' } }}>
              Request a demo
            </Button>
          </Toolbar>
        </Container>
      </AppBar>

      <Box sx={{ bgcolor: '#0a192f', color: 'white', position: 'relative' }}>
        <Box sx={{ position: 'absolute', width: 540, height: 540, borderRadius: '50%', bgcolor: 'rgba(100,255,218,.10)', filter: 'blur(90px)', right: '-12%', top: '-20%' }} />
        <Container maxWidth="xl" sx={{ position: 'relative', py: { xs: 8, md: 13 } }}>
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={7}>
              <Chip label="CONSTRUCTION WORKFORCE & PAYROLL" sx={{ bgcolor: 'rgba(100,255,218,.12)', color: '#64ffda', fontWeight: 800, letterSpacing: '.08em', mb: 3 }} />
              <Typography component="h1" fontWeight={900} letterSpacing="-.055em" sx={{ fontSize: { xs: '2.8rem', sm: '3.8rem', lg: '5rem' }, lineHeight: 1.02, maxWidth: 850 }}>
                Build with confidence. <Box component="span" sx={{ color: '#64ffda' }}>Account for every hour.</Box>
              </Typography>
              <Typography sx={{ mt: 3, maxWidth: 650, color: 'rgba(255,255,255,.72)', fontSize: { xs: '1rem', md: '1.2rem' }, lineHeight: 1.8 }}>
                JengaFlow brings your construction teams, site attendance, project labour costs and payroll into one simple workspace — online or offline.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
                <Button size="large" variant="contained" href="mailto:contact@qwerty.co.ke?subject=JengaFlow%20demo%20request"
                  endIcon={<ArrowForwardRounded />} sx={{ px: 3, py: 1.5, bgcolor: '#64ffda', color: '#0a192f', fontWeight: 850, '&:hover': { bgcolor: '#8fffe7' } }}>
                  Talk to our team
                </Button>
                <Button size="large" variant="outlined" href="#platform" sx={{ px: 3, py: 1.5, color: 'white', borderColor: 'rgba(255,255,255,.35)' }}>
                  Explore the platform
                </Button>
              </Stack>
              <Stack direction="row" spacing={2.5} sx={{ mt: 4, flexWrap: 'wrap', rowGap: 1 }}>
                {['Made for construction teams', 'Kenya-ready payroll setup', 'Offline-first workflows'].map((item) => (
                  <Stack key={item} direction="row" spacing={.75} alignItems="center">
                    <CheckCircleRounded sx={{ color: '#64ffda', fontSize: 18 }} />
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.7)' }}>{item}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Box sx={{ maxWidth: 480, ml: 'auto', p: { xs: 2, sm: 3 }, border: '1px solid rgba(100,255,218,.22)', borderRadius: 4, bgcolor: 'rgba(255,255,255,.055)', boxShadow: '0 30px 100px rgba(0,0,0,.25)' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                  <Box>
                    <Typography variant="overline" sx={{ color: '#64ffda', letterSpacing: '.15em' }}>WORKSPACE OVERVIEW</Typography>
                    <Typography variant="h5" fontWeight={800} color="white">Your sites, at a glance</Typography>
                  </Box>
                  <Chip size="small" icon={<SyncRounded />} label="Sync ready" sx={{ color: '#64ffda', bgcolor: 'rgba(100,255,218,.10)' }} />
                </Stack>
                <Grid container spacing={1.5}>
                  {[['ACTIVE SITES','08'],['ON-SITE TEAM','126'],['TIMESHEETS','94%']].map(([label,value]) => (
                    <Grid item xs={4} key={label}>
                      <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,.07)', borderRadius: 2 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)', fontSize: '.62rem' }}>{label}</Typography>
                        <Typography variant="h5" fontWeight={850} color="white" sx={{ mt: .5 }}>{value}</Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
                <Divider sx={{ borderColor: 'rgba(255,255,255,.12)', my: 2.5 }} />
                <Stack spacing={1.4}>
                  {[['Riverside Apartments','32 workers','78%'],['Westlands Commercial','21 workers','64%'],['Industrial Park Phase 2','18 workers','92%']].map(([name,workers,progress]) => (
                    <Box key={name}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: .7 }}>
                        <Typography fontWeight={700} fontSize=".86rem" color="white">{name}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)' }}>{workers}</Typography>
                      </Stack>
                      <Box sx={{ height: 6, bgcolor: 'rgba(255,255,255,.12)', borderRadius: 8 }}>
                        <Box sx={{ width: progress, height: '100%', bgcolor: '#64ffda', borderRadius: 8 }} />
                      </Box>
                    </Box>
                  ))}
                </Stack>
                <Typography variant="caption" sx={{ display: 'block', mt: 2.5, color: 'rgba(255,255,255,.4)' }}>Illustrative product preview · Sample figures</Typography>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container id="platform" maxWidth="xl" sx={{ py: { xs: 8, md: 12 } }}>
        <Typography variant="overline" color="primary" fontWeight={850} letterSpacing=".16em">ONE CONNECTED WORKSPACE</Typography>
        <Typography variant="h2" fontWeight={900} letterSpacing="-.045em" sx={{ mt: 1, maxWidth: 760, fontSize: { xs: '2.2rem', md: '3.4rem' } }}>
          Less paperwork. More control on every project.
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 700, lineHeight: 1.8 }}>
          Designed around the way construction businesses actually work — from the site gate to payroll review.
        </Typography>
        <Grid container spacing={2} sx={{ mt: 4 }}>
          {features.map((feature) => (
            <Grid item xs={12} sm={6} lg={4} key={feature.title}>
              <Card variant="outlined" sx={{ height: '100%', borderColor: '#e4eaf0', borderRadius: 3, boxShadow: 'none', transition: 'transform .2s, box-shadow .2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 16px 40px rgba(10,25,47,.08)' } }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: '#e8fbf6', color: '#087e69', '& svg': { fontSize: 26 } }}>{feature.icon}</Box>
                  <Typography variant="h6" fontWeight={850} sx={{ mt: 2 }}>{feature.title}</Typography>
                  <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.75 }}>{feature.text}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Box sx={{ bgcolor: '#edf3f6' }} id="how-it-works">
        <Container maxWidth="xl" sx={{ py: { xs: 8, md: 11 } }}>
          <Grid container spacing={6}>
            <Grid item xs={12} md={4}>
              <Typography variant="overline" color="primary" fontWeight={850} letterSpacing=".16em">SIMPLE BY DESIGN</Typography>
              <Typography variant="h2" fontWeight={900} letterSpacing="-.045em" sx={{ mt: 1, fontSize: { xs: '2.2rem', md: '3.1rem' } }}>
                From first setup to payday.
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 2, lineHeight: 1.8 }}>
                A guided flow keeps the important work clear, with permissions and approvals where they matter.
              </Typography>
            </Grid>
            <Grid item xs={12} md={8}>
              <Stack spacing={0}>
                {steps.map(([number,title,text], index) => (
                  <Stack key={number} direction="row" spacing={2.5} sx={{ py: 2.5, borderBottom: index === steps.length - 1 ? 0 : '1px solid #d7e1e7' }}>
                    <Typography fontWeight={900} sx={{ color: '#087e69', fontSize: '1.2rem', minWidth: 38 }}>{number}</Typography>
                    <Box>
                      <Typography variant="h6" fontWeight={850}>{title}</Typography>
                      <Typography color="text.secondary" sx={{ mt: .5 }}>{text}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box sx={{ bgcolor: '#0a192f', color: 'white' }} id="contact">
        <Container maxWidth="xl" sx={{ py: { xs: 7, md: 9 } }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={8}>
              <Typography variant="overline" sx={{ color: '#64ffda', letterSpacing: '.16em', fontWeight: 850 }}>DESIGN → INNOVATE → TRANSFORM</Typography>
              <Typography variant="h2" fontWeight={900} letterSpacing="-.045em" sx={{ mt: 1, fontSize: { xs: '2.1rem', md: '3.3rem' } }}>
                Ready to make site operations simpler?
              </Typography>
              <Typography sx={{ mt: 2, color: 'rgba(255,255,255,.68)' }}>
                JengaFlow is built by Qwerty Systems. Let’s talk about how your teams work.
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Button fullWidth size="large" variant="contained" href="mailto:contact@qwerty.co.ke?subject=JengaFlow%20enquiry"
                endIcon={<ArrowForwardRounded />} sx={{ py: 1.7, bgcolor: '#64ffda', color: '#0a192f', fontWeight: 850, '&:hover': { bgcolor: '#8fffe7' } }}>
                Contact Qwerty Systems
              </Button>
              <Typography variant="body2" sx={{ mt: 2, textAlign: 'center', color: 'rgba(255,255,255,.58)' }}>contact@qwerty.co.ke · +254 743 411403</Typography>
            </Grid>
          </Grid>
          <Divider sx={{ borderColor: 'rgba(255,255,255,.15)', my: 5 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
            <Typography fontWeight={850}>JengaFlow <Box component="span" sx={{ color: '#64ffda' }}>by Qwerty Systems</Box></Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.5)' }}>© {new Date().getFullYear()} Qwerty Systems. All rights reserved.</Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
