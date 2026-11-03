import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  IconButton,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import '../../index.css';
import Topbar from '../../components/Topbar';
import Sidebar from '../../components/Sidebar';

interface Veiculo {
  id: number;
  placa: string;
  modelo: string;
  anoFabricacao: string;
  anoModelo: string;
  chassi: string;
  vencimentoIpva: string;
  combustivel: string;
  capacidade: number;
  kmTotal: string;
  status: 'Disponível' | 'Em uso' | 'Manutenção';
  tipo: string;
}

const initialVeiculos: Veiculo[] = [
  { id: 1, placa: 'HPC-3312', modelo: 'S10 Cabine Dupla', anoFabricacao: '2022', anoModelo: '2022', chassi: '9BG1234567890', vencimentoIpva: '15/10/2026', combustivel: 'Diesel', capacidade: 5, kmTotal: '128.420', status: 'Manutenção', tipo: 'Utilitário' },
  { id: 2, placa: 'PBT-4421', modelo: 'Fiat Fiorino', anoFabricacao: '2021', anoModelo: '2021', chassi: '9BG9876543210', vencimentoIpva: '20/08/2026', combustivel: 'Flex', capacidade: 2, kmTotal: '87.300', status: 'Disponível', tipo: 'Furgão' },
  { id: 3, placa: 'RJG-9912', modelo: 'Sprinter CDI 415', anoFabricacao: '2020', anoModelo: '2020', chassi: '8AC1122334455', vencimentoIpva: '10/05/2026', combustivel: 'Diesel', capacidade: 15, kmTotal: '201.500', status: 'Em uso', tipo: 'Van' },
  { id: 4, placa: 'MGT-1103', modelo: 'Gol Voyage', anoFabricacao: '2023', anoModelo: '2023', chassi: '3BW5566778899', vencimentoIpva: '01/12/2026', combustivel: 'Flex', capacidade: 5, kmTotal: '41.200', status: 'Disponível', tipo: 'Sedan' },
  { id: 5, placa: 'KBP-7722', modelo: 'HB20 Sedan', anoFabricacao: '2022', anoModelo: '2023', chassi: '9BR9988776655', vencimentoIpva: '30/09/2026', combustivel: 'Flex', capacidade: 5, kmTotal: '62.800', status: 'Disponível', tipo: 'Sedan' },
  { id: 6, placa: 'QRS-8814', modelo: 'Fiat Fiorino SVO', anoFabricacao: '2019', anoModelo: '2019', chassi: '9BG4433221100', vencimentoIpva: '12/04/2026', combustivel: 'Flex', capacidade: 2, kmTotal: '168.900', status: 'Manutenção', tipo: 'Furgão' },
];

export default function VeiculosPage() {
  const [veiculosList, setVeiculosList] = useState<Veiculo[]>(initialVeiculos);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'Disponível' | 'Em uso' | 'Manutenção'>('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [page, setPage] = useState(1);
  const itemsPerPage = 5;

  const [ocultarConfidencialMap, setOcultarConfidencialMap] = useState<{ [key: number]: boolean }>({});

  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modelo, setModelo] = useState('');
  const [anoFabricacao, setAnoFabricacao] = useState('');
  const [anoModelo, setAnoModelo] = useState('');
  const [chassi, setChassi] = useState('');
  const [placa, setPlaca] = useState('');
  const [vencimentoIpva, setVencimentoIpva] = useState('');
  const [tipo, setTipo] = useState('Utilitário');

  const counts = useMemo(() => {
    return {
      todos: veiculosList.length,
      disponiveis: veiculosList.filter(v => v.status === 'Disponível').length,
      emUso: veiculosList.filter(v => v.status === 'Em uso').length,
      manutencao: veiculosList.filter(v => v.status === 'Manutenção').length,
    };
  }, [veiculosList]);

  const filteredVeiculos = useMemo(() => {
    return veiculosList.filter((v) => {
      const matchesSearch = 
        v.placa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.tipo.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesTab = activeTab === 'todos' || v.status === activeTab;
      const matchesTipo = tipoFilter === 'todos' || v.tipo === tipoFilter;

      return matchesSearch && matchesTab && matchesTipo;
    });
  }, [veiculosList, searchTerm, activeTab, tipoFilter]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredVeiculos.slice(start, start + itemsPerPage);
  }, [filteredVeiculos, page]);

  const totalPages = Math.ceil(filteredVeiculos.length / itemsPerPage) || 1;

  const handleOpenNovo = () => {
    setEditingId(null);
    setModelo('');
    setAnoFabricacao('');
    setAnoModelo('');
    setChassi('');
    setPlaca('');
    setVencimentoIpva('');
    setTipo('Utilitário');
    setOpenModal(true);
  };

  const handleOpenEditar = (veiculo: Veiculo) => {
    setEditingId(veiculo.id);
    setModelo(veiculo.modelo);
    setAnoFabricacao(veiculo.anoFabricacao);
    setAnoModelo(veiculo.anoModelo);
    setChassi(veiculo.chassi);
    setPlaca(veiculo.placa);
    setVencimentoIpva(veiculo.vencimentoIpva);
    setTipo(veiculo.tipo);
    setOpenModal(true);
  };

  const handleDeletarVeiculo = (id: number) => {
    if (window.confirm('Tem certeza que deseja remover este veículo?')) {
      setVeiculosList(veiculosList.filter(v => v.id !== id));
    }
  };

  const handleSalvarVeiculo = () => {
    if (!modelo || !placa || !chassi) {
      alert('Por favor, preencha pelo menos o Modelo, a Placa e o Chassi!');
      return;
    }

    if (editingId !== null) {
      setVeiculosList(veiculosList.map(v => v.id === editingId ? {
        ...v,
        modelo,
        anoFabricacao,
        anoModelo,
        chassi: chassi.toUpperCase(),
        placa: placa.toUpperCase(),
        vencimentoIpva,
        tipo,
      } : v));
    } else {
      const novoVeiculo: Veiculo = {
        id: Date.now(),
        placa: placa.toUpperCase(),
        modelo,
        anoFabricacao,
        anoModelo,
        chassi: chassi.toUpperCase(),
        vencimentoIpva,
        combustivel: 'Flex',
        capacidade: 5,
        kmTotal: '0',
        status: 'Disponível',
        tipo: tipo || 'Utilitário',
      };
      setVeiculosList([novoVeiculo, ...veiculosList]);
    }
    
    setOpenModal(false);
  };

  const getStatusChipColor = (status: string) => {
    switch (status) {
      case 'Disponível':
        return { bgcolor: '#dcfce7', color: '#16a34a' };
      case 'Em uso':
        return { bgcolor: '#dbeafe', color: '#2563eb' };
      case 'Manutenção':
        return { bgcolor: '#fee2e2', color: '#dc2626' };
      default:
        return { bgcolor: '#f1f5f9', color: '#64748b' };
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Topbar />
      <Sidebar />

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, sm: 3, md: 4 }, mt: '64px', overflowX: 'hidden' }}>
        <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.5 }}>
          Início &gt; Veículos
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b' }}>
            Veículos da Frota
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Button 
              variant="outlined" 
              startIcon={<FileDownloadIcon />} 
              sx={{ textTransform: 'none', borderColor: '#cbd5e1', color: '#334155', fontWeight: 600 }}
            >
              Exportar
            </Button>
            <Button 
              variant="contained" 
              startIcon={<AddIcon />} 
              onClick={handleOpenNovo}
              sx={{ textTransform: 'none', bgcolor: '#FF6B00', '&:hover': { bgcolor: '#e05e00' }, fontWeight: 600 }}
            >
              Cadastrar Veículo
            </Button>
          </Stack>
        </Box>

        {/* Filtro de Abas */}
        <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Button
            onClick={() => { setActiveTab('todos'); setPage(1); }}
            variant={activeTab === 'todos' ? 'contained' : 'outlined'}
            sx={{
              textTransform: 'none',
              borderRadius: 5,
              fontWeight: 600,
              bgcolor: activeTab === 'todos' ? '#1e293b' : 'transparent',
              color: activeTab === 'todos' ? '#fff' : '#64748b',
              borderColor: '#cbd5e1',
              '&:hover': { bgcolor: activeTab === 'todos' ? '#0f172a' : '#f8fafc' }
            }}
          >
            Todos ({counts.todos})
          </Button>
          <Button
            onClick={() => { setActiveTab('Disponível'); setPage(1); }}
            variant={activeTab === 'Disponível' ? 'contained' : 'outlined'}
            sx={{
              textTransform: 'none',
              borderRadius: 5,
              fontWeight: 600,
              bgcolor: activeTab === 'Disponível' ? '#16a34a' : 'transparent',
              color: activeTab === 'Disponível' ? '#fff' : '#16a34a',
              borderColor: '#16a34a',
              '&:hover': { bgcolor: activeTab === 'Disponível' ? '#15803d' : '#f0fdf4' }
            }}
          >
            Disponíveis ({counts.disponiveis})
          </Button>
          <Button
            onClick={() => { setActiveTab('Em uso'); setPage(1); }}
            variant={activeTab === 'Em uso' ? 'contained' : 'outlined'}
            sx={{
              textTransform: 'none',
              borderRadius: 5,
              fontWeight: 600,
              bgcolor: activeTab === 'Em uso' ? '#2563eb' : 'transparent',
              color: activeTab === 'Em uso' ? '#fff' : '#2563eb',
              borderColor: '#2563eb',
              '&:hover': { bgcolor: activeTab === 'Em uso' ? '#1d4ed8' : '#eff6ff' }
            }}
          >
            Em uso ({counts.emUso})
          </Button>
          <Button
            onClick={() => { setActiveTab('Manutenção'); setPage(1); }}
            variant={activeTab === 'Manutenção' ? 'contained' : 'outlined'}
            sx={{
              textTransform: 'none',
              borderRadius: 5,
              fontWeight: 600,
              bgcolor: activeTab === 'Manutenção' ? '#dc2626' : 'transparent',
              color: activeTab === 'Manutenção' ? '#fff' : '#dc2626',
              borderColor: '#dc2626',
              '&:hover': { bgcolor: activeTab === 'Manutenção' ? '#b91c1c' : '#fef2f2' }
            }}
          >
            Manutenção ({counts.manutencao})
          </Button>
        </Stack>

        {/* Pesquisa e Filtros */}
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Placa, modelo ou tipo..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#94a3b8' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <FormControl size="small" sx={{ minWidth: 180, width: { xs: '100%', md: 'auto' } }}>
              <InputLabel>Todos os tipos</InputLabel>
              <Select
                value={tipoFilter}
                label="Todos os tipos"
                onChange={(e) => { setTipoFilter(e.target.value); setPage(1); }}
              >
                <MenuItem value="todos">Todos os tipos</MenuItem>
                <MenuItem value="Utilitário">Utilitário</MenuItem>
                <MenuItem value="Furgão">Furgão</MenuItem>
                <MenuItem value="Van">Van</MenuItem>
                <MenuItem value="Sedan">Sedan</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        {/* Tabela de Veículos */}
        <Paper sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead sx={{ bgcolor: '#f8fafc' }}>
                <TableRow>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Placa</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Modelo</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Ano Fab./Mod.</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Chassi</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Venc. IPVA</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600, textAlign: 'right' }}>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedData.length > 0 ? (
                  paginatedData.map((row) => {
                    const style = getStatusChipColor(row.status);
                    const isOculto = !!ocultarConfidencialMap[row.id];
                    return (
                      <TableRow key={row.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{row.placa}</TableCell>
                        <TableCell sx={{ fontSize: '0.85rem' }}>{row.modelo}</TableCell>
                        
                        {/* Dados Confidenciais Ocultáveis individualmente */}
                        <TableCell sx={{ fontSize: '0.85rem' }}>
                          {isOculto ? '**** / ****' : `${row.anoFabricacao} / ${row.anoModelo}`}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.85rem' }}>
                          {isOculto ? '***************' : row.chassi}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.85rem' }}>
                          {isOculto ? '**/**/****' : row.vencimentoIpva}
                        </TableCell>

                        <TableCell>
                          <Chip 
                            label={row.status} 
                            size="small" 
                            sx={{ 
                              height: 22, 
                              fontSize: '0.75rem', 
                              fontWeight: 600, 
                              bgcolor: style.bgcolor, 
                              color: style.color 
                            }} 
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right' }}>
                          {/* Botão Olho com cor laranja quando ativo */}
                          <IconButton 
                            size="small" 
                            onClick={() => setOcultarConfidencialMap(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                            sx={{ color: isOculto ? '#FF6B00' : '#64748b' }} 
                            title={isOculto ? "Mostrar Informações" : "Ocultar Informações Confidenciais"}
                          >
                            {isOculto ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                          {/* Botão Lápis para Edição */}
                          <IconButton 
                            size="small" 
                            onClick={() => handleOpenEditar(row)}
                            sx={{ color: '#64748b', '&:hover': { color: '#FF6B00' } }} 
                            title="Editar Veículo"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          {/* Botão Lixeira para Exclusão */}
                          <IconButton 
                            size="small" 
                            onClick={() => handleDeletarVeiculo(row.id)}
                            sx={{ color: '#64748b', '&:hover': { color: '#dc2626' } }} 
                            title="Remover Veículo"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: '#64748b' }}>
                      Nenhum veículo encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Paginação Inferior */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderTop: '1px solid #f1f5f9' }}>
            <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.85rem' }}>
              Mostrando {filteredVeiculos.length > 0 ? `${(page - 1) * itemsPerPage + 1}–${Math.min(page * itemsPerPage, filteredVeiculos.length)}` : 0} de {filteredVeiculos.length} veículos
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <IconButton 
                size="small" 
                disabled={page === 1} 
                onClick={() => setPage(p => Math.max(p - 1, 1))}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  size="small"
                  onClick={() => setPage(p)}
                  sx={{
                    minWidth: '28px',
                    height: '28px',
                    p: 0,
                    borderRadius: 1,
                    bgcolor: page === p ? '#1e293b' : 'transparent',
                    color: page === p ? '#fff' : '#334155',
                    fontWeight: 600,
                    '&:hover': { bgcolor: page === p ? '#0f172a' : '#f1f5f9' }
                  }}
                >
                  {p}
                </Button>
              ))}
              <IconButton 
                size="small" 
                disabled={page === totalPages} 
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Box>
        </Paper>

        {/* Modal de Cadastro de Veículo */}
        <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 'bold' }}>
            {editingId !== null ? 'Editar Veículo' : 'Cadastrar Novo Veículo'}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5} sx={{ mt: 0.5 }}>
              <TextField
                label="Modelo"
                fullWidth
                size="small"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
                <TextField
                  label="Ano de Fabricação"
                  fullWidth
                  size="small"
                  value={anoFabricacao}
                  onChange={(e) => setAnoFabricacao(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="Ano Modelo"
                  fullWidth
                  size="small"
                  value={anoModelo}
                  onChange={(e) => setAnoModelo(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>
              <TextField
                label="Placa"
                fullWidth
                size="small"
                value={placa}
                onChange={(e) => setPlaca(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Chassi"
                fullWidth
                size="small"
                value={chassi}
                onChange={(e) => setChassi(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <FormControl size="small" fullWidth>
                <InputLabel shrink>Tipo de Veículo</InputLabel>
                <Select
                  value={tipo}
                  label="Tipo de Veículo"
                  onChange={(e) => setTipo(e.target.value)}
                  notched
                >
                  <MenuItem value="Utilitário">Utilitário</MenuItem>
                  <MenuItem value="Furgão">Furgão</MenuItem>
                  <MenuItem value="Van">Van</MenuItem>
                  <MenuItem value="Sedan">Sedan</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Data de IPVA"
                placeholder="DD/MM/AAAA"
                size="small"
                fullWidth
                value={vencimentoIpva}
                onChange={(e) => {
                  let valor = e.target.value.replace(/\D/g, '');
                  if (valor.length > 8) valor = valor.slice(0, 8);
                  if (valor.length > 4) {
                    valor = `${valor.slice(0, 2)}/${valor.slice(2, 4)}/${valor.slice(4)}`;
                  } else if (valor.length > 2) {
                    valor = `${valor.slice(0, 2)}/${valor.slice(2)}`;
                  }
                  setVencimentoIpva(valor);
                }}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { maxLength: 10 },
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenModal(false)} color="inherit" sx={{ textTransform: 'none' }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSalvarVeiculo} 
              variant="contained" 
              sx={{ textTransform: 'none', bgcolor: '#FF6B00', '&:hover': { bgcolor: '#e05e00' }, fontWeight: 600 }}
            >
              {editingId !== null ? 'Atualizar' : 'Salvar'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}