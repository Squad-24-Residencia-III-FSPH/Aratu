import { Box, Paper, Typography } from '@mui/material';
import PageHeader from '../../components/ui/PageHeader';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PageHeader title={title} />
      <Paper sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <Typography variant="body1" color="text.secondary">
          Esta área ainda está em construção. Em breve você poderá acessar os recursos deste módulo por aqui.
        </Typography>
      </Paper>
    </Box>
  );
}
