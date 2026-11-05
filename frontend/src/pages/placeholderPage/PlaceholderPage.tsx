import { Box, Paper, Typography } from '@mui/material';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <Box sx={{ maxWidth: '1400px', mx: 'auto', px: { xs: 2, sm: 3, md: 4 } }}>
      <Typography
        component="h1"
        variant="h4"
        sx={{ fontWeight: 700, color: '#1e293b', fontSize: { xs: '1.5rem', sm: '2rem' }, mb: 3 }}
      >
        {title}
      </Typography>
      <Paper sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <Typography variant="body1" sx={{ color: '#64748b' }}>
          Esta área ainda está em construção. Em breve você poderá acessar os recursos deste módulo por aqui.
        </Typography>
      </Paper>
    </Box>
  );
}
