import { useState, useEffect, useId } from 'react';
import {
  Alert,
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
import { useInRouterContext, useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import { consumeCreatedRequestNotice, listCreatedRequests } from '../../requests/createdRequestsStore.ts';
import { NEW_REQUEST_PATH } from '../../requests/requestAccess.ts';
import { formatRequestDateTimePtBr } from '../../requests/requestForm.ts';
import type { SubmittedTripRequest } from '../../requests/requestTypes.ts';

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
      color = '#b45309';
      break;
    case 'Aprovada':
    case 'Concluída':
      bgcolor = '#d1fae5';
      color = '#047857';
      break;
    case 'Recusada':
      bgcolor = '#fee2e2';
      color = '#b91c1c';
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

// TODO(FROTA-82/FROTA-84): Estes registros fictícios e a mesclagem com `listCreatedRequests()`
// mantêm a listagem funcional antes da entrega do endpoint backend `GET /requests` (`FROTA-82`, US12).
// Na task `FROTA-84`, remover `mockRequests` e `mapSubmittedRequestToSolicitacao` e consumir
// diretamente `listMyRequests(api)` em `frontend/src/services/requestsService.ts`.
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

function mapSubmittedRequestToSolicitacao(submitted: SubmittedTripRequest): Solicitacao {
  return {
    id: submitted.id,
    destino: submitted.destination,
    dataHora: formatRequestDateTimePtBr(submitted.requestedDate, submitted.requestedTime),
    dataIso: submitted.requestedDate,
    finalidade: submitted.purpose,
    status: 'Pendente',
    veiculo: '—',
    origem: submitted.origin,
    passageiros: '1',
    necessidadeEspecial: submitted.serviceName,
    motivoRecusa: '',
    andamento: [
      { titulo: 'Solicitação enviada', data: 'Agora mesmo', concluido: true },
      { titulo: 'Em análise pelo Gestor de Frota', data: '—', concluido: false },
      { titulo: 'Aprovação e Alocação', data: '—', concluido: false },
      { titulo: 'Viagem Confirmada', data: '—', concluido: false },
    ],
  };
}

function buildInitialRequests(): Solicitacao[] {
  const created = listCreatedRequests().map(mapSubmittedRequestToSolicitacao);
  const createdIds = new Set(created.map((item) => item.id));
  return [...created, ...mockRequests.filter((item) => !createdIds.has(item.id))];
}

function RouterNavigator({ target, onDone }: { target: string | null; onDone: () => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!target) return;
    navigate(target);
    onDone();
  }, [target, navigate, onDone]);
  return null;
}

export interface SolicitacaoPageProps {
  /** Callback opcional para navegação ao formulário de nova solicitação em testes sem Router. */
  onNavigate?: (path: string) => void;
}

export default function SolicitacaoPage({ onNavigate }: SolicitacaoPageProps = {}) {
  const inRouter = useInRouterContext();
  const searchInputId = useId();
  const dateFilterId = useId();
  const statusFilterId = useId();
  const resendReasonId = useId();

  // TODO(FROTA-82/FROTA-84): Substituir a inicialização síncrona via `buildInitialRequests()`
  // pela busca assíncrona em `GET /requests` quando a US12 for conectada.
  const [requests, setRequests] = useState<Solicitacao[]>(() => buildInitialRequests());
  const [notice, setNotice] = useState<string | null>(() => consumeCreatedRequestNotice());
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const [selectedSolicitacao, setSelectedSolicitacao] = useState<Solicitacao | null>(null);
  const [openModal, setOpenModal] = useState(false);

  const [openResendModal, setOpenResendModal] = useState(false);
  const [justificativaReenvio, setJustificativaReenvio] = useState('');

  const handleOpenNewRequest = () => {
    if (onNavigate) {
      onNavigate(NEW_REQUEST_PATH);
      return;
    }
    if (inRouter) {
      setPendingRedirect(NEW_REQUEST_PATH);
    }
  };

  const handleOpenDetails = (solicitacao: Solicitacao) => {
    setSelectedSolicitacao(solicitacao);
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setSelectedSolicitacao(null);
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
      {inRouter && <RouterNavigator target={pendingRedirect} onDone={() => setPendingRedirect(null)} />}

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
            onClick={handleOpenNewRequest}
            sx={{
              backgroundColor: '#FF6B00',
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 44,
              '&:hover': { backgroundColor: '#e55d00' },
            }}
            aria-label="Nova Solicitação"
          >
            Nova Solicitação
          </Button>
        </Box>
      </Box>

      {notice && (
        <Box role="status" aria-live="polite" sx={{ mb: 3 }}>
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        </Box>
      )}

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
          id={searchInputId}
          placeholder="Buscar solicitação..."
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Buscar solicitação' } }}
          sx={{ flexGrow: 1, minWidth: '240px' }}
        />

        <TextField
          id={dateFilterId}
          type="date"
          size="small"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Filtrar por data da solicitação' } }}
          sx={{ minWidth: '160px' }}
        />

        <FormControl size="small" sx={{ minWidth: '180px' }}>
          <Select
            id={statusFilterId}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            displayEmpty
            inputProps={{ 'aria-label': 'Filtrar por status da solicitação' }}
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
                <TableCell scope="col" sx={{ fontWeight: 600, color: '#e55d00' }}>Nº</TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: '#e55d00' }}>Destino</TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: '#e55d00' }}>Data/Hora</TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: '#e55d00' }}>Finalidade</TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: '#e55d00' }}>Status</TableCell>
                <TableCell scope="col" sx={{ fontWeight: 600, color: '#e55d00' }}>Veículo Alocado</TableCell>
                <TableCell scope="col" align="center" sx={{ fontWeight: 600, color: '#e55d00' }}>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRequests.length > 0 ? (
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
            Mostrando {filteredRequests.length === 0 ? 0 : 1}–{filteredRequests.length} de {filteredRequests.length} registros
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

      {/* Detalhes, Motivo de Recusa e Reenvio */}
      <Dialog open={openModal} onClose={handleCloseModal} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Detalhes da Solicitação {selectedSolicitacao?.id}</DialogTitle>
        <DialogContent dividers>
          {selectedSolicitacao && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {selectedSolicitacao.status === 'Recusada' && (
                <Box sx={{ p: 2, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 1.5 }}>
                  <Box component="div" sx={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#dc2626', mb: 0.5 }}>
                    Solicitação Recusada pelo Gestor
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
                    <Box component="div" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Tipo de Serviço / Necessidade</Box>
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
              sx={{ backgroundColor: '#FF6B00', '&:hover': { backgroundColor: '#e55d00' }, textTransform: 'none', minHeight: 44 }}
            >
              Reenviar Solicitação
            </Button>
          ) : <Box />}

          <Button onClick={handleCloseModal} variant="contained" sx={{ backgroundColor: '#FF6B00', '&:hover': { backgroundColor: '#e55d00' }, textTransform: 'none', minHeight: 44 }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resposta do gestor */}
      <Dialog open={openResendModal} onClose={() => setOpenResendModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Reenviar Solicitação {selectedSolicitacao?.id}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box component="label" htmlFor={resendReasonId} sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              Justifique o motivo pelo qual esta solicitação deve ser aceita ou reanalisada pela frota:
            </Box>
            <TextField
              id={resendReasonId}
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
          <Button onClick={() => setOpenResendModal(false)} variant="outlined" sx={{ textTransform: 'none', color: '#374151', minHeight: 44 }}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirmResend} 
            variant="contained" 
            disabled={!justificativaReenvio.trim()}
            sx={{ backgroundColor: '#FF6B00', '&:hover': { backgroundColor: '#e55d00' }, textTransform: 'none', minHeight: 44 }}
          >
            Confirmar Reenvio
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
