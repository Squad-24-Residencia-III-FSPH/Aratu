import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  TextField,
  MenuItem,
  Select,
  FormControl,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';

interface AndamentoStep {
  titulo: string;
  data: string;
  concluido: boolean;
}

interface Solicitacao {
  id: string;
  destino: string;
  dataHora: string;
  dataIso: string;
  finalidade: string;
  status: string;
  veiculo: string;
  origem: string;
  passageiros: string;
  necessidadeEspecial: string;
  motivoRecusa: string;
  andamento: AndamentoStep[];
}

function StatusChip({ status }: { status: string }) {
  let bgcolor = '#e5e7eb';
  let color = '#e55d00';

  switch (status) {
    case 'Pendente':
      bgcolor = '#fef3c7';
      color = '#d97706';
      break;
    case 'Aprovada':
    case 'Concluída':
      bgcolor = '#d1fae5';
      color = '#059669';
      break;
    case 'Recusada':
      bgcolor = '#fee2e2';
      color = '#dc2626';
      break;
    default:
      break;
  }

  return (
    <Box
      component="span"
      role="status"
      sx={{
        backgroundColor: bgcolor,
        color: color,
        px: 1.5,
        py: 0.5,
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 600,
        display: 'inline-block',
      }}
    >
      {status}
    </Box>
  );
}

const mockRequests: Solicitacao[] = [
  { 
    id: 'SOL-241', 
    destino: 'Hospital Santa Casa de Misericórdia', 
    dataHora: '21/09/2026 — 14:00', 
    dataIso: '2026-09-21',
    finalidade: 'Consulta especializada', 
    status: 'Pendente', 
    veiculo: '—',
    origem: 'FSPH — Unidade Central',
    passageiros: '2',
    necessidadeEspecial: 'Acessibilidade (cadeira de rodas)',
    motivoRecusa: '',
    andamento: [
      { titulo: 'Solicitação enviada', data: '21/09 09:12', concluido: true },
      { titulo: 'Em análise pelo Gestor de Frota', data: '21/09 09:15', concluido: true },
      { titulo: 'Aprovação e Alocação', data: '—', concluido: false },
      { titulo: 'Viagem Confirmada', data: '—', concluido: false },
    ]
  },
  { 
    id: 'SOL-201', 
    destino: 'HPS', 
    dataHora: '28/08/2026 — 09:00', 
    dataIso: '2026-08-28',
    finalidade: 'Visita técnica', 
    status: 'Recusada', 
    veiculo: '—',
    origem: 'FSPH — Unidade Central',
    passageiros: '1',
    necessidadeEspecial: 'Nenhuma',
    motivoRecusa: 'Veículos indisponíveis para o horário solicitado devido a manutenções preventivas na frota.',
    andamento: [
      { titulo: 'Solicitação enviada', data: '28/08 08:00', concluido: true },
      { titulo: 'Recusada pelo Gestor de Frota', data: '28/08 09:30', concluido: true },
    ]
  },
];

export default function SolicitacaoPage() {
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<Solicitacao[]>(mockRequests);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const [selectedSolicitacao, setSelectedSolicitacao] = useState<Solicitacao | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [openNewModal, setOpenNewModal] = useState(false);
 
  const [openResendModal, setOpenResendModal] = useState(false);
  const [justificativaReenvio, setJustificativaReenvio] = useState('');

  const [novaData, setNovaData] = useState('');
  const [novoHorario, setNovoHorario] = useState('');
  const [novaOrigem, setNovaOrigem] = useState('FSPH — Unidade Central');
  const [novoDestino, setNovoDestino] = useState('');
  const [novaFinalidade, setNovaFinalidade] = useState('');
  const [novosPassageiros, setNovosPassageiros] = useState('1');
  const [novaNecessidade, setNovaNecessidade] = useState('Nenhuma');
  const [novasObservacoes, setNovasObservacoes] = useState('');

  const handleOpenDetails = (solicitacao: Solicitacao) => {
    setSelectedSolicitacao(solicitacao);
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setSelectedSolicitacao(null);
  };

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const novaReq: Solicitacao = {
      id: `SOL-${Math.floor(100 + Math.random() * 900)}`,
      destino: novoDestino || 'Destino Padrão',
      dataHora: `${novaData ? novaData.split('-').reverse().join('/') : '21/09/2026'} — ${novoHorario || '12:00'}`,
      dataIso: novaData || '2026-09-21',
      finalidade: novaFinalidade || 'Deslocamento',
      status: 'Pendente',
      veiculo: '—',
      origem: novaOrigem,
      passageiros: novosPassageiros,
      necessidadeEspecial: novaNecessidade,
      motivoRecusa: '',
      andamento: [
        { titulo: 'Solicitação enviada', data: 'Agora mesmo', concluido: true },
        { titulo: 'Em análise pelo Gestor de Frota', data: '—', concluido: false },
        { titulo: 'Aprovação e Alocação', data: '—', concluido: false },
        { titulo: 'Viagem Confirmada', data: '—', concluido: false },
      ]
    };

    setRequests([novaReq, ...requests]);
    setOpenNewModal(false);
    setNovaData('');
    setNovoHorario('');
    setNovoDestino('');
    setNovaFinalidade('');
    setNovosPassageiros('1');
    setNovaNecessidade('Nenhuma');
    setNovasObservacoes('');
  };

  const handleConfirmResend = () => {
    if (!selectedSolicitacao) return;

    const updatedRequests = requests.map((item) => {
      if (item.id === selectedSolicitacao.id) {
        return {
          ...item,
          status: 'Pendente',
          motivoRecusa: '',
          andamento: [
            ...item.andamento,
            { titulo: `Reenviada: ${justificativaReenvio}`, data: 'Agora mesmo', concluido: true },
            { titulo: 'Em análise pelo Gestor de Frota', data: 'Pendente', concluido: false }
          ]
        };
      }
      return item;
    });

    setRequests(updatedRequests);
    setOpenResendModal(false);
    setOpenModal(false);
    setJustificativaReenvio('');
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Chamada de dados simulada
      } catch (error: unknown) {
        console.error('Erro ao carregar solicitações', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredRequests = requests.filter((item) => {
    const matchesSearch = 
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.destino.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.finalidade.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'todos' || item.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesDate = !dateFilter || item.dataIso === dateFilter;
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  return (
    <Box sx={{ p: 3, maxWidth: '1200px', mx: 'auto' }} component="main" aria-label="Minhas Solicitações">
      <Box sx={{ mb: 3 }}>
        <Box component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary', display: 'block', mb: 0.5 }}>
          Início &gt; Minhas Solicitações
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', m: 0 }}>
            Minhas Solicitações
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenNewModal(true)}
            sx={{
              backgroundColor: '#FF6B00',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { backgroundColor: '#e55d00' },
            }}
            aria-label="Criar nova solicitação"
          >
            Nova Solicitação
          </Button>
        </Box>
      </Box>

      {/* Barra de Filtros */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          border: '1px solid #e2e8f0',
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
          backgroundColor: '#ffffff',
        }}
      >
        <TextField
          placeholder="Buscar solicitação..."
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flexGrow: 1, minWidth: '240px' }}
        />

        <TextField
          type="date"
          size="small"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          sx={{ minWidth: '160px' }}
        />

        <FormControl size="small" sx={{ minWidth: '180px' }}>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            displayEmpty
          >
            <MenuItem value="todos">Todos os status</MenuItem>
            <MenuItem value="pendente">Pendente</MenuItem>
            <MenuItem value="aprovada">Aprovada</MenuItem>
            <MenuItem value="concluída">Concluída</MenuItem>
            <MenuItem value="recusada">Recusada</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      {/* Tabela */}
      <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden', backgroundColor: '#ffffff' }}>
        <TableContainer>
          <Table aria-label="Tabela de listagem de solicitações">
            <TableHead sx={{ backgroundColor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: '#e55d00' }}>Nº</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#e55d00' }}>Destino</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#e55d00' }}>Data/Hora</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#e55d00' }}>Finalidade</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#e55d00' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#e55d00' }}>Veículo Alocado</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#e55d00' }}>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Box component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Carregando solicitações...
                    </Box>
                  </TableCell>
                </TableRow>
              ) : filteredRequests.length > 0 ? (
                filteredRequests.map((row) => (
                  <TableRow key={row.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell component="th" scope="row" sx={{ fontWeight: 500, color: '#111827' }}>
                      {row.id}
                    </TableCell>
                    <TableCell>{row.destino}</TableCell>
                    <TableCell>{row.dataHora}</TableCell>
                    <TableCell>{row.finalidade}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                    <TableCell>{row.veiculo}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Ver detalhes da solicitação">
                        <IconButton 
                          size="small" 
                          onClick={() => handleOpenDetails(row)}
                          aria-label={`Ver detalhes da solicitação ${row.id}`}
                        >
                          <VisibilityIcon fontSize="small" color="action" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Box component="div" sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.primary', mb: 1 }}>
                      Nenhuma solicitação encontrada
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            Mostrando 1–{filteredRequests.length} de {filteredRequests.length} registros
          </Box>
          <Pagination
            count={1}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
            shape="rounded"
            size="small"
            aria-label="Navegação por páginas"
          />
        </Box>
      </Paper>

      {/* Nova Solicitação de Viagem */}
      <Dialog open={openNewModal} onClose={() => setOpenNewModal(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.25rem' }}>Nova Solicitação de Viagem</DialogTitle>
        <DialogContent dividers>
          <Box component="form" onSubmit={handleCreateRequest} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ p: 2, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 1.5, fontSize: '0.875rem', color: '#c2410c' }}>
               Preencha os dados abaixo. O Gestor de Frota analisará a solicitação e confirmará a disponibilidade de veículo e motorista.
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ flex: '1 1 48%' }}>
                <Box component="div" sx={{ fontSize: '0.813rem', fontWeight: 600, color: '#374151', mb: 0.5 }}>Data da Viagem *</Box>
                <TextField type="date" size="small" fullWidth required value={novaData} onChange={(e) => setNovaData(e.target.value)} />
              </Box>
              <Box sx={{ flex: '1 1 48%' }}>
                <Box component="div" sx={{ fontSize: '0.813rem', fontWeight: 600, color: '#374151', mb: 0.5 }}>Horário de Saída *</Box>
                <TextField type="time" size="small" fullWidth required value={novoHorario} onChange={(e) => setNovoHorario(e.target.value)} />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ flex: '1 1 48%' }}>
                <Box component="div" sx={{ fontSize: '0.813rem', fontWeight: 600, color: '#374151', mb: 0.5 }}>Origem *</Box>
                <TextField size="small" fullWidth value={novaOrigem} onChange={(e) => setNovaOrigem(e.target.value)} />
              </Box>
              <Box sx={{ flex: '1 1 48%' }}>
                <Box component="div" sx={{ fontSize: '0.813rem', fontWeight: 600, color: '#374151', mb: 0.5 }}>Destino *</Box>
                <TextField size="small" fullWidth required placeholder="Endereço completo de destino" value={novoDestino} onChange={(e) => setNovoDestino(e.target.value)} />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ flex: '1 1 48%' }}>
                <Box component="div" sx={{ fontSize: '0.813rem', fontWeight: 600, color: '#374151', mb: 0.5 }}>Finalidade / Motivo *</Box>
                <TextField size="small" fullWidth required placeholder="Ex: Consulta especializada, Reunião..." value={novaFinalidade} onChange={(e) => setNovaFinalidade(e.target.value)} />
              </Box>
              <Box sx={{ flex: '1 1 48%' }}>
                <Box component="div" sx={{ fontSize: '0.813rem', fontWeight: 600, color: '#374151', mb: 0.5 }}>Nº de Passageiros *</Box>
                <TextField type="number" size="small" fullWidth required value={novosPassageiros} onChange={(e) => setNovosPassageiros(e.target.value)} />
              </Box>
            </Box>

            <Box>
              <Box component="div" sx={{ fontSize: '0.813rem', fontWeight: 600, color: '#374151', mb: 0.5 }}>Necessidades Especiais</Box>
              <FormControl size="small" fullWidth>
                <Select value={novaNecessidade} onChange={(e) => setNovaNecessidade(e.target.value)}>
                  <MenuItem value="Nenhuma">Nenhuma</MenuItem>
                  <MenuItem value="Acessibilidade (cadeira de rodas)">Acessibilidade (cadeira de rodas)</MenuItem>
                  <MenuItem value="Transporte de material/equipamento">Transporte de material/equipamento</MenuItem>
                  <MenuItem value="Veículo de maior capacidade">Veículo de maior capacidade</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box>
              <Box component="div" sx={{ fontSize: '0.813rem', fontWeight: 600, color: '#374151', mb: 0.5 }}>Observações Adicionais</Box>
              <TextField multiline rows={3} size="small" fullWidth placeholder="Insira detalhes extras se necessário..." value={novasObservacoes} onChange={(e) => setNovasObservacoes(e.target.value)} />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
              <Button onClick={() => setOpenNewModal(false)} variant="outlined" sx={{ textTransform: 'none', color: '#374151', borderColor: '#d1d5db' }}>
                Cancelar
              </Button>
              <Button type="submit" variant="contained" startIcon={<SendIcon />} sx={{ backgroundColor: '#FF6B00', '&:hover': { backgroundColor: '#e55d00' }, textTransform: 'none' }}>
                Enviar Solicitação
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Detalhes, Motivo de Recusa e Reenvio */}
      <Dialog open={openModal} onClose={handleCloseModal} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Detalhes da Solicitação {selectedSolicitacao?.id}</DialogTitle>
        <DialogContent dividers>
          {selectedSolicitacao && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {selectedSolicitacao.status === 'Recusada' && (
                <Box sx={{ p: 2, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 1.5 }}>
                  <Box component="div" sx={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#dc2626', mb: 0.5 }}>
                    ⚠️ Solicitação Recusada pelo Gestor
                  </Box>
                  <Box component="div" sx={{ fontSize: '0.813rem', color: '#7f1d1d' }}>
                    <strong>Motivo:</strong> {selectedSolicitacao.motivoRecusa || 'Nenhum motivo especificado.'}
                  </Box>
                </Box>
              )}

              <Box>
                <Box component="div" sx={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', mb: 2 }}>
                  Detalhes
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  <Box sx={{ flex: '1 1 45%' }}>
                    <Box component="div" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Data/Hora</Box>
                    <Box component="div" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{selectedSolicitacao.dataHora}</Box>
                  </Box>
                  <Box sx={{ flex: '1 1 45%' }}>
                    <Box component="div" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Origem</Box>
                    <Box component="div" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{selectedSolicitacao.origem}</Box>
                  </Box>
                  <Box sx={{ flex: '1 1 45%' }}>
                    <Box component="div" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Destino</Box>
                    <Box component="div" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{selectedSolicitacao.destino}</Box>
                  </Box>
                  <Box sx={{ flex: '1 1 45%' }}>
                    <Box component="div" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Passageiros</Box>
                    <Box component="div" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{selectedSolicitacao.passageiros}</Box>
                  </Box>
                  <Box sx={{ flex: '1 1 45%' }}>
                    <Box component="div" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Finalidade</Box>
                    <Box component="div" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{selectedSolicitacao.finalidade}</Box>
                  </Box>
                  <Box sx={{ flex: '1 1 45%' }}>
                    <Box component="div" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Necessidade Especial</Box>
                    <Box component="div" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{selectedSolicitacao.necessidadeEspecial}</Box>
                  </Box>
                </Box>
              </Box>

              <Box>
                <Box component="div" sx={{ fontSize: '1rem', fontWeight: 'bold', color: '#111827', mb: 2, mt: 1 }}>
                  Andamento
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 1, position: 'relative' }}>
                  {selectedSolicitacao.andamento.map((step: AndamentoStep, index: number) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box 
                        sx={{ 
                          width: 12, 
                          height: 12, 
                          borderRadius: '50%', 
                          bgcolor: step.concluido ? (selectedSolicitacao.status === 'Recusada' && index === selectedSolicitacao.andamento.length - 1 ? '#dc2626' : 'primary.main') : 'grey.400', 
                          mt: 0.5,
                          zIndex: 1
                        }} 
                      />
                      <Box>
                        <Box component="div" sx={{ fontSize: '0.875rem', fontWeight: step.concluido ? 'bold' : 'normal', color: step.concluido ? 'text.primary' : 'text.secondary' }}>
                          {step.titulo}
                        </Box>
                        <Box component="div" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                          {step.data}
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 2 }}>
          {selectedSolicitacao?.status === 'Recusada' ? (
            <Button 
              variant="contained" 
              startIcon={<RefreshIcon />}
              onClick={() => setOpenResendModal(true)}
              sx={{ backgroundColor: '#FF6B00', '&:hover': { backgroundColor: '#e55d00' }, textTransform: 'none' }}
            >
              Reenviar Solicitação
            </Button>
          ) : <Box />}

          <Button onClick={handleCloseModal} variant="contained" sx={{ backgroundColor: '#FF6B00', '&:hover': { backgroundColor: '#e55d00' }, textTransform: 'none' }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resposta do gestor */}
      <Dialog open={openResendModal} onClose={() => setOpenResendModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Reenviar Solicitação {selectedSolicitacao?.id}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box component="div" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              Justifique o motivo pelo qual esta solicitação deve ser aceita ou reanalisada pela frota:
            </Box>
            <TextField
              multiline
              rows={4}
              size="small"
              fullWidth
              required
              placeholder="Ex: A consulta é de caráter de urgência e não pode ser reagendada..."
              value={justificativaReenvio}
              onChange={(e) => setJustificativaReenvio(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenResendModal(false)} variant="outlined" sx={{ textTransform: 'none', color: '#374151' }}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirmResend} 
            variant="contained" 
            disabled={!justificativaReenvio.trim()}
            sx={{ backgroundColor: '#FF6B00', '&:hover': { backgroundColor: '#e55d00' }, textTransform: 'none' }}
          >
            Confirmar Reenvio
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}