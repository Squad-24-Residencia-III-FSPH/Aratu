import { Box, Typography, Paper, Grid, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material';
import DirectionsCar from '@mui/icons-material/DirectionsCar';
import Build from '@mui/icons-material/Build';
import Assignment from '@mui/icons-material/Assignment';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import ArrowForward from '@mui/icons-material/ArrowForward';
import Warning from '@mui/icons-material/Warning';
import CheckCircle from '@mui/icons-material/CheckCircle';

export default function GestorPage() {
  return (
    <Box sx={{ maxWidth: '1400px', mx: 'auto', px: { xs: 2, sm: 3, md: 4 } }}>
      {/* Cabeçalho */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ color: '#64748b' }}>Segunda-feira, 21 de setembro</Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b', mt: 0.5, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
          Bom dia, Marcos
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b' }}>Acompanhe a operação e resolva o que precisa de atenção.</Typography>
      </Box>

      {/* Métricas Superiores */}
      <Grid container spacing={2.5} sx={{ mb: 3 }} alignItems="stretch">
        <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
          <Paper 
            sx={{ 
              p: 2.5, 
              minHeight: '115px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              borderRadius: 2, 
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)', 
              width: '100%', 
              height: '100%' 
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>12</Typography>
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.85rem', mt: 0.5 }}>Veículos disponíveis</Typography>
            </Box>
            <Box sx={{ bgcolor: '#dcfce7', p: 1.5, borderRadius: 2, color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', flexShrink: 0 }}>
              <DirectionsCar />
            </Box>
          </Paper>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
          <Paper 
            sx={{ 
              p: 2.5, 
              minHeight: '115px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              borderRadius: 2, 
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)', 
              width: '100%', 
              height: '100%' 
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>3</Typography>
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.85rem', mt: 0.5 }}>Em manutenção</Typography>
            </Box>
            <Box sx={{ bgcolor: '#fee2e2', p: 1.5, borderRadius: 2, color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', flexShrink: 0 }}>
              <Build />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
          <Paper 
            sx={{ 
              p: 2.5, 
              minHeight: '115px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              borderRadius: 2, 
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)', 
              width: '100%', 
              height: '100%' 
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 'calc(100% - 55px)' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>5</Typography>
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.85rem', mt: 0.5 }}>Solicitações pendentes</Typography>
            </Box>
            <Box sx={{ bgcolor: '#fef3c7', p: 1.5, borderRadius: 2, color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', flexShrink: 0 }}>
              <Assignment />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex' }}>
          <Paper 
            sx={{ 
              p: 2.5, 
              minHeight: '115px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              borderRadius: 2, 
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)', 
              width: '100%', 
              height: '100%' 
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>8</Typography>
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.85rem', mt: 0.5 }}>Viagens hoje</Typography>
            </Box>
            <Box sx={{ bgcolor: '#dbeafe', p: 1.5, borderRadius: 2, color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', flexShrink: 0 }}>
              <SwapHoriz />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Seção de Ações Pendentes (Mais finas/compactas na altura) */}
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b', mb: 1 }}>Ações pendentes</Typography>
      <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 2 }}>Itens que precisam da sua decisão</Typography>
      
      <Grid container spacing={2.5} sx={{ mb: 4 }} alignItems="stretch">
        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Paper sx={{ py: 2, px: 2.5, borderRadius: 2, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Assignment sx={{ color: '#d97706', fontSize: '20px' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>5 solicitações aguardando aprovação</Typography>
              </Box>
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.8rem' }}>2 são para viagens ainda hoje</Typography>
            </Box>
            <Button size="small" endIcon={<ArrowForward />} sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600, p: 0, justifyContent: 'flex-start', color: '#FF6B00', fontSize: '0.85rem' }}>Ver solicitações</Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Paper sx={{ py: 2, px: 2.5, borderRadius: 2, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Warning sx={{ color: '#dc2626', fontSize: '20px' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>2 veículos com documentos a vencer</Typography>
              </Box>
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.8rem' }}>Vencimento nos próximos 15 dias</Typography>
            </Box>
            <Button size="small" endIcon={<ArrowForward />} sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600, p: 0, justifyContent: 'flex-start', color: '#FF6B00', fontSize: '0.85rem' }}>Ver documentos</Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Paper sx={{ py: 2, px: 2.5, borderRadius: 2, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircle sx={{ color: '#2563eb', fontSize: '20px' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>3 viagens aguardando confirmação</Typography>
              </Box>
              <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.8rem' }}>Execuções finalizadas pelo motorista</Typography>
            </Box>
            <Button size="small" endIcon={<ArrowForward />} sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600, p: 0, justifyContent: 'flex-start', color: '#FF6B00', fontSize: '0.85rem' }}>Ver viagens</Button>
          </Paper>
        </Grid>
      </Grid>

      {/* Grid Inferior: Agenda de hoje (Maior - lg={9}) e Status da Frota (lg={3}) */}
      <Grid container spacing={3} alignItems="stretch">
        <Grid item xs={12} lg={9} sx={{ display: 'flex' }}>
          <Paper sx={{ p: 3, borderRadius: 2, width: '100%', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b' }}>Agenda de hoje</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>8 viagens programadas</Typography>
                </Box>
                <Button size="small" sx={{ textTransform: 'none', fontSize: '0.85rem', color: '#FF6B00' }}>Ver agenda completa</Button>
              </Box>

              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Horário</TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Viagem</TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Origem</TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Destino</TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Veículo</TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[
                      { time: '08:00', type: 'Institucional', orig: 'FSPH', dest: 'Hospital Regional', car: 'MGT-1103', status: 'Em andamento', color: 'info' },
                      { time: '10:30', type: 'Institucional', orig: 'FSPH', dest: 'Unidade Norte', car: 'KBP-7722', status: 'Agendada', color: 'primary' },
                      { time: '14:00', type: 'Visita técnica', orig: 'FSPH', dest: 'Unidade Centro', car: 'PBT-4421', status: 'Agendada', color: 'primary' },
                      { time: '16:30', type: 'Administrativa', orig: 'Almoxarifado', dest: 'FSPH', car: 'RJG-9912', status: 'Agendada', color: 'primary' },
                    ].map((row, index) => (
                      <TableRow key={index} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell sx={{ fontSize: '0.85rem' }}>{row.time}</TableCell>
                        <TableCell sx={{ fontSize: '0.85rem', fontWeight: 500 }}>{row.type}</TableCell>
                        <TableCell sx={{ fontSize: '0.85rem' }}>{row.orig}</TableCell>
                        <TableCell sx={{ fontSize: '0.85rem' }}>{row.dest}</TableCell>
                        <TableCell sx={{ fontSize: '0.85rem' }}>{row.car}</TableCell>
                        <TableCell>
                          <Chip label={row.status} size="small" color={row.color as any} sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600 }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={3} sx={{ display: 'flex' }}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b' }}>Status da frota</Typography>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 3 }}>22 veículos cadastrados</Typography>

              <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', mb: 3, gap: '2px' }}>
                <Box sx={{ width: '55%', bgcolor: '#22c55e' }} />
                <Box sx={{ width: '25%', bgcolor: '#3b82f6' }} />
                <Box sx={{ width: '10%', bgcolor: '#FF6B00' }} />
                <Box sx={{ width: '10%', bgcolor: '#94a3b8' }} />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e' }} />
                    <Typography variant="body2" sx={{ fontSize: '0.85rem', color: '#475569' }}>Disponíveis</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>12</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#3b82f6' }} />
                    <Typography variant="body2" sx={{ fontSize: '0.85rem', color: '#475569' }}>Em viagem</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>5</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#FF6B00' }} />
                    <Typography variant="body2" sx={{ fontSize: '0.85rem', color: '#475569' }}>Em manutenção</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>3</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#94a3b8' }} />
                    <Typography variant="body2" sx={{ fontSize: '0.85rem', color: '#475569' }}>Indisponíveis</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>2</Typography>
                </Box>
              </Box>
            </Box>

            <Button variant="outlined" fullWidth sx={{ mt: 3, textTransform: 'none', borderColor: '#cbd5e1', color: '#334155', fontWeight: 600 }}>
              Ver todos os veículos
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}