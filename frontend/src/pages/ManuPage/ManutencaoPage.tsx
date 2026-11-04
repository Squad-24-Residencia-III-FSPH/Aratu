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
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BuildIcon from '@mui/icons-material/Build';
import DeleteIcon from '@mui/icons-material/Delete';

import '../../index.css';

interface Peca {
  nome: string;
  quantidade: number;
  valorUnitario: number;
}

interface Servico {
  descricao: string;
  valor: number;
}

interface Manutencao {
  id: number;
  placa: string;
  modelo: string;
  tipo: 'Preventiva' | 'Corretiva';
  descricao: string;
  oficina: string;
  entrada: string;
  previsao: string;
  custo: number;
  impeditiva: boolean;
  status: 'Manutenção' | 'Concluída' | 'Em Aberto';
  pecasTrocadas: Peca[];
  servicosRealizados: Servico[];
}

const getTodayDate = () => {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const initialManutencoes: Manutencao[] = [
  {
    id: 1,
    placa: 'HPC-3312',
    modelo: 'S10',
    tipo: 'Corretiva',
    descricao: 'Motor — troca de junta',
    oficina: 'Of. Central',
    entrada: '2026-09-18',
    previsao: '2026-09-25',
    custo: 2400,
    impeditiva: true,
    status: 'Manutenção',
    pecasTrocadas: [
      { nome: 'Junta do Cabeçote', quantidade: 1, valorUnitario: 850 },
      { nome: 'Retentor de Válvulas', quantidade: 1, valorUnitario: 350 },
      { nome: 'Óleo de Motor 5W30 (Litro)', quantidade: 6, valorUnitario: 60 },
    ],
    servicosRealizados: [
      { descricao: 'Mão de Obra Retífica e Montagem', valor: 840 },
    ],
  },
  {
    id: 2,
    placa: 'PBT-2381',
    modelo: 'Gol',
    tipo: 'Preventiva',
    descricao: 'Troca de óleo e filtros',
    oficina: 'A.M. Silva',
    entrada: '2026-09-20',
    previsao: '2026-09-21',
    custo: 380,
    impeditiva: false,
    status: 'Concluída',
    pecasTrocadas: [
      { nome: 'Filtro de Óleo', quantidade: 1, valorUnitario: 45 },
      { nome: 'Óleo 5W40 (Litro)', quantidade: 4, valorUnitario: 50 },
    ],
    servicosRealizados: [
      { descricao: 'Troca de Fluidos e Inspeção', valor: 85 },
    ],
  },
];

const listaVeiculosDisponiveis = [
  { placa: 'HPC-3312', modelo: 'S10' },
  { placa: 'PBT-2381', modelo: 'Gol' },
  { placa: 'QRS-8814', modelo: 'Fiorino' },
  { placa: 'RJG-9912', modelo: 'Sprinter' },
  { placa: 'MGT-1103', modelo: 'Voyage' },
];

export default function ManutencaoPage() {
  const [manutencoesList, setManutencoesList] = useState<Manutencao[]>(initialManutencoes);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'todos' | Manutencao['tipo']>('todos');
  const [mesFilter, setMesFilter] = useState('todos');

  const [selectedManutencao, setSelectedManutencao] = useState<Manutencao | null>(null);

  const [openRegModal, setOpenRegModal] = useState(false);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState('');
  const [tipoRevisao, setTipoRevisao] = useState('Corretiva');
  const [oficina, setOficina] = useState('');
  const [previsao, setPrevisao] = useState(() => getTodayDate());
  const [impeditiva, setImpeditiva] = useState(false);

  const minDate = useMemo(() => getTodayDate(), []);

  const veiculosDisponiveis = listaVeiculosDisponiveis.filter(v =>
    !manutencoesList.some(m => m.placa === v.placa && m.status !== 'Concluída') || v.placa === veiculoSelecionado
  );

  const handleSalvarManutencao = () => {
    if (!veiculoSelecionado || !oficina.trim()) {
      alert('Por favor, selecione o veículo e informe a oficina!');
      return;
    }

    const hojeIso = getTodayDate();
    if (!previsao || previsao < hojeIso) {
      alert('A data de previsão de término deve ser hoje ou uma data futura');
      return;
    }

    const veiculoObj = listaVeiculosDisponiveis.find(v => v.placa === veiculoSelecionado);

    const pecasPadrao: Peca[] = [
      { nome: tipoRevisao.includes('Corretiva') ? 'Reparo / Peça Avulsa' : 'Filtro de Óleo', quantidade: 1, valorUnitario: 0 },
    ];
    const servicosPadrao: Servico[] = [
      { descricao: 'Mão de Obra Geral', valor: 0 },
    ];

    const custoTotal = pecasPadrao.reduce((acc, p) => acc + (p.quantidade * p.valorUnitario), 0) +
                       servicosPadrao.reduce((acc, s) => acc + s.valor, 0);

    const tipoFinal = tipoRevisao === 'Corretiva' ? 'Corretiva' : 'Preventiva';

    const novaManutencao: Manutencao = {
      id: Date.now(),
      placa: veiculoSelecionado,
      modelo: veiculoObj ? veiculoObj.modelo : 'Veículo',
      tipo: tipoFinal,
      descricao: tipoRevisao,
      oficina,
      entrada: getTodayDate(),
      previsao: previsao,
      custo: custoTotal,
      impeditiva,
      status: 'Manutenção',
      pecasTrocadas: pecasPadrao,
      servicosRealizados: servicosPadrao,
    };

    setManutencoesList(lista => [novaManutencao, ...lista]);
    setOpenRegModal(false);

    setVeiculoSelecionado('');
    setOficina('');
    setPrevisao(hojeIso);
    setImpeditiva(false);
  };

  const handleAddPeca = () => {
    if (!selectedManutencao) return;
    const novasPecas = [...selectedManutencao.pecasTrocadas, { nome: '', quantidade: 1, valorUnitario: 0 }];
    recalcularOrcamento(novasPecas, selectedManutencao.servicosRealizados);
  };

  const handleRemovePeca = (index: number) => {
    if (!selectedManutencao) return;
    const novasPecas = selectedManutencao.pecasTrocadas.filter((_, i) => i !== index);
    recalcularOrcamento(novasPecas, selectedManutencao.servicosRealizados);
  };

  const handleAddServico = () => {
    if (!selectedManutencao) return;
    const novosServicos = [...selectedManutencao.servicosRealizados, { descricao: '', valor: 0 }];
    recalcularOrcamento(selectedManutencao.pecasTrocadas, novosServicos);
  };

  const handleRemoveServico = (index: number) => {
    if (!selectedManutencao) return;
    const novosServicos = selectedManutencao.servicosRealizados.filter((_, i) => i !== index);
    recalcularOrcamento(selectedManutencao.pecasTrocadas, novosServicos);
  };

  const recalcularOrcamento = (novasPecas: Peca[], novosServicos: Servico[]) => {
    if (!selectedManutencao) return;
    const totalPecas = novasPecas.reduce((acc, p) => acc + (p.quantidade * (Number(p.valorUnitario) || 0)), 0);
    const totalServicos = novosServicos.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);

    setSelectedManutencao(atual => atual ? ({
      ...atual,
      pecasTrocadas: novasPecas,
      servicosRealizados: novosServicos,
      custo: totalPecas + totalServicos,
    }) : null);
  };

  const handleSalvarEdicaoModal = () => {
    if (!selectedManutencao) return;
    setManutencoesList(lista => lista.map(m => m.id === selectedManutencao.id ? selectedManutencao : m));
    setSelectedManutencao(null);
  };

  const filteredManutencoes = useMemo(() => {
    return manutencoesList.filter((m) => {
      const matchesSearch =
        m.placa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.descricao.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesTipo = tipoFilter === 'todos' || m.tipo === tipoFilter;

      const mesItem = m.entrada.slice(5, 7);
      const matchesMes = mesFilter === 'todos' || mesItem === mesFilter;

      return matchesSearch && matchesTipo && matchesMes;
    });
  }, [manutencoesList, searchTerm, tipoFilter, mesFilter]);

  const totalEmAberto = filteredManutencoes.filter(m => m.status === 'Manutenção' || m.status === 'Em Aberto').length;
  const totalConcluidas = filteredManutencoes.filter(m => m.status === 'Concluída').length;
  const custoTotalFiltrado = filteredManutencoes.reduce((acc, m) => acc + m.custo, 0);
  const totalImpeditivas = filteredManutencoes.filter(m => m.impeditiva).length;

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.5 }}>
        Início &gt; Manutenção
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b' }}>
          Manutenção da Frota
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenRegModal(true)}
          sx={{
            textTransform: 'none',
            bgcolor: '#FF6B00',
            '&:hover': { bgcolor: '#e05e00' },
            fontWeight: 600,
            borderRadius: 1.5,
            px: 2.5,
          }}
        >
          Registrar Manutenção
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 45%', md: '1 1 22%' } }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #f1f5f9', boxShadow: 'none' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>Em aberto</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#FF6B00', mt: 0.5 }}>{totalEmAberto}</Typography>
          </Paper>
        </Box>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 45%', md: '1 1 22%' } }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #f1f5f9', boxShadow: 'none' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>Concluídas (Período)</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#FF6B00', mt: 0.5 }}>{totalConcluidas}</Typography>
          </Paper>
        </Box>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 45%', md: '1 1 22%' } }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #f1f5f9', boxShadow: 'none' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>Custo Total (Período)</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#FF6B00', mt: 0.5 }}>
              R$ {custoTotalFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Typography>
          </Paper>
        </Box>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 45%', md: '1 1 22%' } }}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #f1f5f9', boxShadow: 'none' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>Impeditivas</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#FF6B00', mt: 0.5 }}>{totalImpeditivas}</Typography>
          </Paper>
        </Box>
      </Box>

      <Paper sx={{ borderRadius: 2, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#334155' }}>Registros</Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', sm: 'auto' }, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Placa ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ width: { xs: '100%', sm: 220 } }}
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

            <FormControl size="small" sx={{ minWidth: 130 }}>
              <Select value={mesFilter} onChange={(e) => setMesFilter(e.target.value)} displayEmpty>
                <MenuItem value="todos">Todos os Meses</MenuItem>
                <MenuItem value="01">Janeiro</MenuItem>
                <MenuItem value="02">Fevereiro</MenuItem>
                <MenuItem value="03">Março</MenuItem>
                <MenuItem value="04">Abril</MenuItem>
                <MenuItem value="05">Maio</MenuItem>
                <MenuItem value="06">Junho</MenuItem>
                <MenuItem value="07">Julho</MenuItem>
                <MenuItem value="08">Agosto</MenuItem>
                <MenuItem value="09">Setembro</MenuItem>
                <MenuItem value="10">Outubro</MenuItem>
                <MenuItem value="11">Novembro</MenuItem>
                <MenuItem value="12">Dezembro</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value as 'todos' | Manutencao['tipo'])} displayEmpty>
                <MenuItem value="todos">Tipo</MenuItem>
                <MenuItem value="Preventiva">Preventiva</MenuItem>
                <MenuItem value="Corretiva">Corretiva</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Box>

        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={{ minWidth: { xs: 1050, md: 800 } }}>
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Placa</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Modelo</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Tipo</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Descrição</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Oficina</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Entrada</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Previsão</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Custo</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Impeditiva</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ color: '#64748b', fontWeight: 600, textAlign: 'center' }}>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredManutencoes.map((row) => (
                <TableRow key={row.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{row.placa}</TableCell>
                  <TableCell sx={{ fontSize: '0.85rem' }}>{row.modelo}</TableCell>
                  <TableCell sx={{ fontSize: '0.85rem' }}>{row.tipo}</TableCell>
                  <TableCell sx={{ fontSize: '0.85rem' }}>{row.descricao}</TableCell>
                  <TableCell sx={{ fontSize: '0.85rem' }}>{row.oficina}</TableCell>
                  <TableCell sx={{ fontSize: '0.85rem' }}>{new Date(`${row.entrada}T12:00:00`).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell sx={{ fontSize: '0.85rem' }}>{new Date(`${row.previsao}T12:00:00`).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell sx={{ fontSize: '0.85rem', fontWeight: 500 }}>
                    R$ {row.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.impeditiva ? 'Sim' : 'Não'}
                      size="small"
                      sx={{
                        height: 22, fontSize: '0.75rem', fontWeight: 600,
                        bgcolor: row.impeditiva ? '#fee2e2' : '#dcfce7',
                        color: row.impeditiva ? '#dc2626' : '#16a34a',
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.status}
                      size="small"
                      sx={{
                        height: 22, fontSize: '0.75rem', fontWeight: 600,
                        bgcolor: row.status === 'Concluída' ? '#dcfce7' : '#fee2e2',
                        color: row.status === 'Concluída' ? '#16a34a' : '#dc2626',
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ReceiptLongIcon fontSize="small" />}
                      onClick={() => setSelectedManutencao(row)}
                      sx={{
                        textTransform: 'none', borderColor: '#cbd5e1', color: '#FF6B00',
                        fontWeight: 600, fontSize: '0.75rem', py: 0.3, px: 1.2,
                        '&:hover': { bgcolor: '#eff6ff', borderColor: '#FF6B00' },
                      }}
                    >
                      Ver Orçamento
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Modal de Registro */}
      <Dialog open={openRegModal} onClose={() => setOpenRegModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold' }}>Alocar Veículo para Oficina</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Selecione o Veículo</InputLabel>
              <Select
                value={veiculoSelecionado}
                label="Selecione o Veículo"
                onChange={(e) => setVeiculoSelecionado(e.target.value)}
                notched
              >
                {veiculosDisponiveis.map((v) => (
                  <MenuItem key={v.placa} value={v.placa}>
                    {v.modelo} — <strong>{v.placa}</strong>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel shrink>Tipo / Descrição da Manutenção</InputLabel>
              <Select
                value={tipoRevisao}
                label="Tipo / Descrição da Manutenção"
                onChange={(e) => setTipoRevisao(e.target.value)}
                notched
              >
                <MenuItem value="Corretiva">Corretiva (Reparo / Peça avulsa ex: Pneu, Pastilha, Lona)</MenuItem>
                <MenuItem value="Preventiva (10.000 km) — Troca de Óleo e Filtros">Preventiva (10.000 km ou 12 meses) — Troca de Óleo e Filtros</MenuItem>
                <MenuItem value="Preventiva (20.000 km) — Filtros, Ar e Óleo Completo">Preventiva (20.000 km ou 24 meses) — Filtros, Ar e Óleo Completo</MenuItem>
                <MenuItem value="Preventiva (30.000 km) — Correia Dentada e Velas">Preventiva (30.000 km ou 36 meses) — Correia Dentada e Velas</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Oficina Responsável"
              placeholder="Ex: Oficina Central FSPH"
              size="small"
              fullWidth
              value={oficina}
              onChange={(e) => setOficina(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Previsão de Término"
                type="date"
                size="small"
                fullWidth
                value={previsao}
                onChange={(e) => setPrevisao(e.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: {
                    min: minDate,
                  },
                }}
              />

              <FormControl size="small" fullWidth>
                <InputLabel shrink>Manutenção Impeditiva?</InputLabel>
                <Select
                  value={impeditiva ? 'sim' : 'nao'}
                  label="Manutenção Impeditiva?"
                  onChange={(e) => setImpeditiva(e.target.value === 'sim')}
                  notched
                >
                  <MenuItem value="sim">Sim (Veículo Parado)</MenuItem>
                  <MenuItem value="nao">Não (Veículo Rodando)</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenRegModal(false)} color="inherit" sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button onClick={handleSalvarManutencao} variant="contained" sx={{ textTransform: 'none', bgcolor: '#FF6B00', '&:hover': { bgcolor: '#e05e00' }, fontWeight: 600 }}>
            Salvar e Alocar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de Orçamento / Edição */}
      <Dialog open={Boolean(selectedManutencao)} onClose={() => setSelectedManutencao(null)} maxWidth="md" fullWidth>
        {selectedManutencao && (
          <>
            <DialogTitle sx={{ pb: 1, borderBottom: '1px solid #f1f5f9' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <BuildIcon sx={{ color: '#FF6B00' }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>Editar Orçamento / Ordem de Serviço</Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      Veículo: <strong>{selectedManutencao.modelo} ({selectedManutencao.placa})</strong>
                    </Typography>
                  </Box>
                </Box>
                <Chip label={selectedManutencao.tipo} size="small" sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }} />
              </Box>
            </DialogTitle>

            <DialogContent sx={{ py: 3 }} dividers>
              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 48%', md: '1 1 23%' } }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.5 }}>Status</Typography>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={selectedManutencao.status}
                      onChange={(e) => setSelectedManutencao({ ...selectedManutencao, status: e.target.value as Manutencao['status'] })}
                    >
                      <MenuItem value="Manutenção">Manutenção</MenuItem>
                      <MenuItem value="Concluída">Concluída</MenuItem>
                      <MenuItem value="Em Aberto">Em Aberto</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 48%', md: '1 1 23%' } }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.5 }}>Previsão</Typography>
                  <TextField
                    size="small"
                    value={selectedManutencao.previsao}
                    type="date"
                    onChange={(e) => setSelectedManutencao({ ...selectedManutencao, previsao: e.target.value })}
                    fullWidth
                  />
                </Box>

                <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 48%', md: '1 1 23%' } }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Oficina</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, mt: 1 }}>{selectedManutencao.oficina}</Typography>
                </Box>

                <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 48%', md: '1 1 23%' } }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Impeditiva?</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, mt: 1, color: selectedManutencao.impeditiva ? '#dc2626' : '#16a34a' }}>
                    {selectedManutencao.impeditiva ? 'Sim (Parado)' : 'Não'}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ mb: 3 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FF6B00' }}>Relação de Peças Trocadas</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={handleAddPeca} sx={{ textTransform: 'none', fontWeight: 600 }}>Adicionar Peça</Button>
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, boxShadow: 'none', overflowX: "auto" }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#f8fafc' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Item / Peça</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 90, textAlign: 'center' }}>Qtd.</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 130, textAlign: 'right' }}>Valor Unit. (R$)</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 110, textAlign: 'right' }}>Subtotal</TableCell>
                      <TableCell sx={{ width: 50 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedManutencao.pecasTrocadas.map((peca, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <TextField
                            size="small"
                            value={peca.nome}
                            onChange={(e) => {
                              const novas = selectedManutencao.pecasTrocadas.map((item, i) => i === idx ? { ...item, nome: e.target.value } : item);
                              recalcularOrcamento(novas, selectedManutencao.servicosRealizados);
                            }}
                            fullWidth
                            variant="standard"
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <TextField
                            type="number"
                            size="small"
                            value={peca.quantidade}
                            onChange={(e) => {
                              const novas = selectedManutencao.pecasTrocadas.map((item, i) => i === idx ? { ...item, quantidade: Math.max(1, Number(e.target.value) || 1) } : item);
                              recalcularOrcamento(novas, selectedManutencao.servicosRealizados);
                            }}
                            slotProps={{ htmlInput: { min: 1, style: { textAlign: 'center' } } }}
                            variant="standard"
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right' }}>
                          <TextField
                            type="number"
                            size="small"
                            value={peca.valorUnitario}
                            onChange={(e) => {
                              const novas = selectedManutencao.pecasTrocadas.map((item, i) => i === idx ? { ...item, valorUnitario: Math.max(0, Number(e.target.value) || 0) } : item);
                              recalcularOrcamento(novas, selectedManutencao.servicosRealizados);
                            }}
                            slotProps={{ htmlInput: { style: { textAlign: 'right' } } }}
                            variant="standard"
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontWeight: 600 }}>
                          R$ {(peca.quantidade * (Number(peca.valorUnitario) || 0)).toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <IconButton size="small" color="error" onClick={() => handleRemovePeca(idx)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FF6B00' }}>Mão de Obra & Serviços</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={handleAddServico} sx={{ textTransform: 'none', fontWeight: 600 }}>Adicionar Serviço</Button>
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, boxShadow: 'none', overflowX: "auto" }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#f8fafc' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Descrição do Serviço</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 140, textAlign: 'right' }}>Valor (R$)</TableCell>
                      <TableCell sx={{ width: 50 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedManutencao.servicosRealizados.map((serv, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <TextField
                            size="small"
                            value={serv.descricao}
                            onChange={(e) => {
                              const novos = selectedManutencao.servicosRealizados.map((item, i) => i === idx ? { ...item, descricao: e.target.value } : item);
                              recalcularOrcamento(selectedManutencao.pecasTrocadas, novos);
                            }}
                            fullWidth
                            variant="standard"
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right' }}>
                          <TextField
                            type="number"
                            size="small"
                            value={serv.valor}
                            onChange={(e) => {
                              const novos = selectedManutencao.servicosRealizados.map((item, i) => i === idx ? { ...item, valor: Math.max(0, Number(e.target.value) || 0) } : item);
                              recalcularOrcamento(selectedManutencao.pecasTrocadas, novos);
                            }}
                            slotProps={{ htmlInput: { style: { textAlign: 'right' } } }}
                            variant="standard"
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <IconButton size="small" color="error" onClick={() => handleRemoveServico(idx)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b' }}>
                  Custo Total: R$ {selectedManutencao.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setSelectedManutencao(null)} color="inherit" sx={{ textTransform: 'none' }}>Cancelar</Button>
              <Button onClick={handleSalvarEdicaoModal} variant="contained" sx={{ textTransform: 'none', bgcolor: '#FF6B00', '&:hover': { bgcolor: '#e05e00' }, fontWeight: 600 }}>
                Salvar Alterações
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}