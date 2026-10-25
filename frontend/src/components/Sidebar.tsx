import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, Divider } from '@mui/material';
import Home from '@mui/icons-material/Home';
import Assignment from '@mui/icons-material/Assignment';
import LocalShipping from '@mui/icons-material/LocalShipping';
import CheckCircle from '@mui/icons-material/CheckCircle';
import DirectionsCar from '@mui/icons-material/DirectionsCar';
import Person from '@mui/icons-material/Person';
import Build from '@mui/icons-material/Build';
import LocalGasStation from '@mui/icons-material/LocalGasStation';
import Description from '@mui/icons-material/Description';
import Warning from '@mui/icons-material/Warning';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BarChart from '@mui/icons-material/BarChart';
import Security from '@mui/icons-material/Security';
import Help from '@mui/icons-material/Help';

const drawerWidth = 260;

export default function Sidebar() {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', backgroundColor: '#fff', borderRight: '1px solid #e2e8f0', mt: '64px' },
      }}
    >
      <Box sx={{ overflow: 'auto', p: 2 }}>
        <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 1, display: 'block', mb: 1 }}>
          Gestor de Frota
        </Typography>

        {/* Inicio */}
        <List disablePadding>
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton selected sx={{ borderRadius: 1, backgroundColor: 'rgba(255, 107, 0, 0.08) !important', color: '#111827', '&:hover': { backgroundColor: 'rgba(255, 107, 0, 0.12)' } }}>
              <ListItemIcon sx={{ color: '#FF6B00', minWidth: 36 }}><Home fontSize="small" /></ListItemIcon>
              <ListItemText primary={
          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                 Início
          </Typography>} />
            </ListItemButton>
          </ListItem>
        </List>

        <Divider sx={{ my: 2 }} />
        {/* Funçoes */}
        <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, fontSize: '0.7rem' }}>OPERAÇÃO</Typography>
        <List dense>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><Assignment fontSize="small" /></ListItemIcon><ListItemText primary="Solicitações" /></ListItemButton></ListItem>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><LocalShipping fontSize="small" /></ListItemIcon><ListItemText primary="Viagens" /></ListItemButton></ListItem>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><CheckCircle fontSize="small" /></ListItemIcon><ListItemText primary="Confirmar viagens" /></ListItemButton></ListItem>
        </List>

        <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, mt: 2, display: 'block', fontSize: '0.7rem' }}>FROTA</Typography>
        <List dense>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><DirectionsCar fontSize="small" /></ListItemIcon><ListItemText primary="Veículos" /></ListItemButton></ListItem>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><Person fontSize="small" /></ListItemIcon><ListItemText primary="Motoristas" /></ListItemButton></ListItem>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><Assignment fontSize="small" /></ListItemIcon><ListItemText primary="Tipos de serviço" /></ListItemButton></ListItem>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><Build fontSize="small" /></ListItemIcon><ListItemText primary="Manutenção" /></ListItemButton></ListItem>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><LocalGasStation fontSize="small" /></ListItemIcon><ListItemText primary="Abastecimento" /></ListItemButton></ListItem>
        </List>

        <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, mt: 2, display: 'block', fontSize: '0.7rem' }}>CONTROLE</Typography>
        <List dense>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><Description fontSize="small" /></ListItemIcon><ListItemText primary="Documentos" /></ListItemButton></ListItem>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><Warning fontSize="small" /></ListItemIcon><ListItemText primary="Multas e Infrações" /></ListItemButton></ListItem>
        </List>

        <Typography variant="caption" sx={{ color: '#FF6B00', fontWeight: 700, px: 2, mt: 2, display: 'block', fontSize: '0.7rem' }}>GESTÃO</Typography>
        <List dense>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><DashboardIcon fontSize="small" /></ListItemIcon><ListItemText primary="Dashboard" /></ListItemButton></ListItem>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><BarChart fontSize="small" /></ListItemIcon><ListItemText primary="Relatórios" /></ListItemButton></ListItem>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><Security fontSize="small" /></ListItemIcon><ListItemText primary="Auditoria" /></ListItemButton></ListItem>
        </List>

        <Divider sx={{ my: 2 }} />

        <List dense>
          <ListItem disablePadding><ListItemButton sx={{ borderRadius: 1, '&:hover': { backgroundColor: '#df68061e', } }}><ListItemIcon sx={{ minWidth: 36 }}><Help fontSize="small" /></ListItemIcon><ListItemText primary="Ajuda" /></ListItemButton></ListItem>
        </List>
      </Box>
    </Drawer>
  );
}