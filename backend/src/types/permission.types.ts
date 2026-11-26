import type { Permission } from './auth'

/** Códigos com comportamento implementado, expostos no catálogo administrável. */
export const PERMISSION_DEFINITIONS = [
  { code: 'users:read', module: 'Administração', label: 'Consultar usuários', description: 'Consultar contas de usuários.', defaultPath: '/administracao/usuarios' },
  { code: 'users:create', module: 'Administração', label: 'Criar usuários', description: 'Criar contas de usuários.', defaultPath: '/administracao/usuarios' },
  { code: 'users:update', module: 'Administração', label: 'Editar usuários', description: 'Editar dados e perfil de contas.', defaultPath: '/administracao/usuarios' },
  { code: 'users:archive', module: 'Administração', label: 'Arquivar usuários', description: 'Arquivar e restaurar contas.', defaultPath: '/administracao/usuarios' },
  { code: 'profiles:read', module: 'Administração', label: 'Consultar perfis', description: 'Consultar perfis de acesso.', defaultPath: '/administracao/perfis' },
  { code: 'profiles:manage', module: 'Administração', label: 'Gerenciar perfis', description: 'Criar e editar perfis e suas permissões.', defaultPath: '/administracao/perfis' },
  { code: 'permissions:catalog:read', module: 'Administração', label: 'Consultar catálogo', description: 'Consultar as permissões disponíveis.', defaultPath: '/administracao/perfis' },
  { code: 'requests:read:own', module: 'Solicitações', label: 'Consultar próprias solicitações', description: 'Consultar somente solicitações criadas pela própria conta.', defaultPath: '/solicitacoes/minhas', scopeGroup: 'requests:read' },
  { code: 'requests:read:all', module: 'Solicitações', label: 'Consultar todas as solicitações', description: 'Consultar solicitações de todos os solicitantes.', defaultPath: '/solicitacoes/analise', scopeGroup: 'requests:read' },
  { code: 'requests:create', module: 'Solicitações', label: 'Criar solicitações', description: 'Enviar uma solicitação de viagem.', defaultPath: '/solicitacoes/minhas' },
  { code: 'requests:resubmit:own', module: 'Solicitações', label: 'Corrigir próprias solicitações', description: 'Corrigir e reenviar solicitações devolvidas próprias.', defaultPath: '/solicitacoes/minhas' },
  { code: 'requests:return', module: 'Solicitações', label: 'Devolver solicitações', description: 'Devolver uma solicitação para correção.', defaultPath: '/solicitacoes/analise' },
  { code: 'requests:reject', module: 'Solicitações', label: 'Recusar solicitações', description: 'Recusar uma solicitação.', defaultPath: '/solicitacoes/analise' },
  { code: 'requests:approve-and-schedule', module: 'Solicitações', label: 'Aprovar e agendar', description: 'Confirmar a aprovação somente ao salvar a viagem vinculada.', defaultPath: '/solicitacoes/analise' },
  { code: 'requests:history:read:own', module: 'Solicitações', label: 'Histórico próprio', description: 'Consultar eventos de solicitações próprias.', defaultPath: '/solicitacoes/minhas', scopeGroup: 'requests:history:read' },
  { code: 'requests:history:read:all', module: 'Solicitações', label: 'Histórico geral', description: 'Consultar eventos de solicitações de todos.', defaultPath: '/solicitacoes/analise', scopeGroup: 'requests:history:read' },
  { code: 'trips:availability:read', module: 'Viagens', label: 'Consultar disponibilidade', description: 'Verificar recursos elegíveis por serviço e período.', defaultPath: '/viagens/agendar' },
  { code: 'trips:read:assigned', module: 'Viagens', label: 'Consultar viagens atribuídas', description: 'Consultar viagens atribuídas à própria conta.', defaultPath: '/viagens/minhas', scopeGroup: 'trips:read' },
  { code: 'trips:read:all', module: 'Viagens', label: 'Consultar agenda', description: 'Consultar a agenda operacional de viagens.', defaultPath: '/viagens/agenda', scopeGroup: 'trips:read' },
  { code: 'trips:create-direct', module: 'Viagens', label: 'Criar viagem direta', description: 'Registrar viagem sem solicitação vinculada.', defaultPath: '/viagens/agendar' },
  { code: 'trips:execute:assigned', module: 'Viagens', label: 'Executar viagem atribuída', description: 'Iniciar e finalizar apenas viagem atribuída e elegível.', defaultPath: '/viagens/minhas' },
  { code: 'trips:confirm', module: 'Viagens', label: 'Conferir viagens', description: 'Conferir viagens finalizadas.', defaultPath: '/viagens/confirmacao' },
  { code: 'vehicles:read', module: 'Frota', label: 'Consultar veículos', description: 'Consultar dados operacionais de veículos.', defaultPath: '/frota/veiculos' },
  { code: 'vehicles:create', module: 'Frota', label: 'Cadastrar veículos', description: 'Cadastrar veículos.', defaultPath: '/frota/veiculos' },
  { code: 'vehicles:update', module: 'Frota', label: 'Editar veículos', description: 'Editar cadastro de veículos.', defaultPath: '/frota/veiculos' },
  { code: 'vehicles:status:change', module: 'Frota', label: 'Alterar situação de veículos', description: 'Alterar situação operacional conforme a máquina de estados.', defaultPath: '/frota/veiculos' },
  { code: 'vehicles:archive', module: 'Frota', label: 'Arquivar veículos', description: 'Arquivar e restaurar veículos com validações de operação.', defaultPath: '/frota/veiculos' },
  { code: 'vehicles:history:read', module: 'Auditoria', label: 'Histórico de veículos', description: 'Ler histórico de veículos permitido pelo domínio.', defaultPath: '/auditoria' },
  { code: 'drivers:read', module: 'Frota', label: 'Consultar motoristas', description: 'Consultar cadastros de motoristas.', defaultPath: '/frota/motoristas' },
  { code: 'drivers:create', module: 'Frota', label: 'Cadastrar motoristas', description: 'Cadastrar motoristas.', defaultPath: '/frota/motoristas' },
  { code: 'drivers:update', module: 'Frota', label: 'Editar motoristas', description: 'Editar dados cadastrais de motoristas.', defaultPath: '/frota/motoristas' },
  { code: 'drivers:status:change', module: 'Frota', label: 'Alterar situação de motoristas', description: 'Alterar situação operacional conforme a elegibilidade.', defaultPath: '/frota/motoristas' },
  { code: 'drivers:archive', module: 'Frota', label: 'Arquivar motoristas', description: 'Arquivar e restaurar motoristas com validação da CNH.', defaultPath: '/frota/motoristas' },
  { code: 'drivers:history:read', module: 'Auditoria', label: 'Histórico de motoristas', description: 'Ler histórico permitido de motoristas.', defaultPath: '/auditoria' },
  { code: 'services:read', module: 'Frota', label: 'Consultar tipos de serviço', description: 'Consultar catálogo de serviços.', defaultPath: '/frota/tipos-servico' },
  { code: 'services:create', module: 'Frota', label: 'Criar tipos de serviço', description: 'Cadastrar tipos de serviço.', defaultPath: '/frota/tipos-servico' },
  { code: 'services:update', module: 'Frota', label: 'Editar tipos de serviço', description: 'Editar definições de serviço.', defaultPath: '/frota/tipos-servico' },
  { code: 'services:vehicles:manage', module: 'Frota', label: 'Vincular veículos', description: 'Definir veículos compatíveis com cada serviço.', defaultPath: '/frota/tipos-servico' },
  { code: 'services:archive', module: 'Frota', label: 'Arquivar serviços', description: 'Arquivar e restaurar tipos de serviço.', defaultPath: '/frota/tipos-servico' },
  { code: 'services:history:read', module: 'Auditoria', label: 'Histórico de serviços', description: 'Ler operações de serviço permitidas pelo domínio.', defaultPath: '/auditoria' },
  { code: 'maintenance:read', module: 'Manutenção', label: 'Consultar manutenção', description: 'Consultar ordens de manutenção.', defaultPath: '/manutencao' },
  { code: 'maintenance:create', module: 'Manutenção', label: 'Abrir manutenção', description: 'Abrir ordens de manutenção.', defaultPath: '/manutencao' },
  { code: 'maintenance:update', module: 'Manutenção', label: 'Editar manutenção', description: 'Editar ordens abertas.', defaultPath: '/manutencao' },
  { code: 'maintenance:close', module: 'Manutenção', label: 'Encerrar manutenção', description: 'Registrar encerramento e resultado de manutenção.', defaultPath: '/manutencao' },
  { code: 'fuelings:read', module: 'Frota', label: 'Consultar abastecimentos', description: 'Consultar abastecimentos e retificações.', defaultPath: '/frota/abastecimentos' },
  { code: 'fuelings:create', module: 'Frota', label: 'Registrar abastecimentos', description: 'Registrar abastecimentos.', defaultPath: '/frota/abastecimentos' },
  { code: 'fuelings:rectify', module: 'Frota', label: 'Retificar abastecimentos', description: 'Registrar retificação sem apagar o fato anterior.', defaultPath: '/frota/abastecimentos' },
  { code: 'fines:read', module: 'Frota', label: 'Consultar multas', description: 'Consultar multas.', defaultPath: '/frota/multas' },
  { code: 'fines:create', module: 'Frota', label: 'Registrar multas', description: 'Registrar multas.', defaultPath: '/frota/multas' },
  { code: 'fines:update', module: 'Frota', label: 'Editar multas', description: 'Editar multas conforme as regras de revisão.', defaultPath: '/frota/multas' },
  { code: 'fines:status:change', module: 'Frota', label: 'Alterar situação de multas', description: 'Atualizar situação de multas.', defaultPath: '/frota/multas' },
  { code: 'vehicle-documents:read', module: 'Frota', label: 'Consultar documentos', description: 'Consultar documentos da frota.', defaultPath: '/frota/documentos' },
  { code: 'vehicle-documents:create', module: 'Frota', label: 'Registrar documentos', description: 'Registrar documentos de veículos.', defaultPath: '/frota/documentos' },
  { code: 'vehicle-documents:update', module: 'Frota', label: 'Editar documentos', description: 'Editar documentos não anulados.', defaultPath: '/frota/documentos' },
  { code: 'vehicle-documents:annul', module: 'Frota', label: 'Anular documentos', description: 'Anular documento com justificativa.', defaultPath: '/frota/documentos' },
  { code: 'svo:occurrences:read', module: 'SVO', label: 'Consultar ocorrências', description: 'Consultar ocorrências dentro do escopo do SVO.', defaultPath: '/svo/solicitacoes' },
  { code: 'svo:occurrences:create', module: 'SVO', label: 'Registrar ocorrências', description: 'Registrar ocorrência recebida pelo SVO.', defaultPath: '/svo/solicitacoes' },
  { code: 'svo:occurrences:confirm', module: 'SVO', label: 'Confirmar triagem', description: 'Confirmar triagem administrativa da ocorrência.', defaultPath: '/svo/solicitacoes' },
  { code: 'svo:teams:read', module: 'SVO', label: 'Consultar equipes', description: 'Consultar equipes e plantões SVO.', defaultPath: '/svo/equipes' },
  { code: 'svo:teams:manage', module: 'SVO', label: 'Gerenciar equipes', description: 'Gerenciar integrantes e plantões SVO.', defaultPath: '/svo/equipes' },
  { code: 'svo:orders:read:assigned', module: 'SVO', label: 'Consultar ordens atribuídas', description: 'Consultar ordens da equipe vinculada.', defaultPath: '/svo/ordens', scopeGroup: 'svo:orders:read' },
  { code: 'svo:orders:read:all', module: 'SVO', label: 'Consultar todas as ordens', description: 'Consultar ordens do SVO sem ampliar ações de execução.', defaultPath: '/svo/ordens', scopeGroup: 'svo:orders:read' },
  { code: 'svo:orders:update:assigned', module: 'SVO', label: 'Atualizar ordens atribuídas', description: 'Atualizar somente ordens atribuídas à equipe vigente.', defaultPath: '/svo/ordens' },
  { code: 'svo:orders:result:assigned', module: 'SVO', label: 'Registrar resultado atribuído', description: 'Registrar resultado de ordem atribuída à equipe.', defaultPath: '/svo/ordens' },
  { code: 'svo:orders:manage', module: 'SVO', label: 'Gerenciar ordens', description: 'Criar ordens e reprocessar despacho operacional.', defaultPath: '/svo/ordens' },
  { code: 'dashboard:read', module: 'Painel', label: 'Consultar painel', description: 'Consultar indicadores de gestão permitidos.', defaultPath: '/frota/dashboard' },
  { code: 'dashboard:svo:read', module: 'Painel', label: 'Consultar painel SVO', description: 'Consultar indicadores de operação SVO.', defaultPath: '/frota/dashboard' },
  { code: 'reports:read:trips', module: 'Relatórios', label: 'Relatórios de viagens', description: 'Consultar relatórios de viagens.', defaultPath: '/relatorios' },
  { code: 'reports:read:fleet', module: 'Relatórios', label: 'Relatórios de frota', description: 'Consultar relatórios de frota.', defaultPath: '/relatorios' },
  { code: 'reports:read:maintenance', module: 'Relatórios', label: 'Relatórios de manutenção', description: 'Consultar relatórios de manutenção.', defaultPath: '/relatorios' },
  { code: 'reports:read:svo', module: 'Relatórios', label: 'Relatórios SVO', description: 'Consultar relatórios SVO permitidos.', defaultPath: '/relatorios' },
  { code: 'reports:read:auth', module: 'Relatórios', label: 'Relatórios de acessos', description: 'Consultar relatórios de usuários e acessos.', defaultPath: '/relatorios' },
  { code: 'reports:export:trips', module: 'Relatórios', label: 'Exportar viagens', description: 'Exportar relatórios de viagens.', defaultPath: '/relatorios' },
  { code: 'reports:export:fleet', module: 'Relatórios', label: 'Exportar frota', description: 'Exportar relatórios de frota.', defaultPath: '/relatorios' },
  { code: 'reports:export:maintenance', module: 'Relatórios', label: 'Exportar manutenção', description: 'Exportar relatórios de manutenção.', defaultPath: '/relatorios' },
  { code: 'reports:export:svo', module: 'Relatórios', label: 'Exportar SVO', description: 'Exportar relatórios SVO permitidos.', defaultPath: '/relatorios' },
  { code: 'reports:export:auth', module: 'Relatórios', label: 'Exportar acessos', description: 'Exportar relatórios de usuários e acessos.', defaultPath: '/relatorios' },
  { code: 'audit:read', module: 'Auditoria', label: 'Consultar auditoria', description: 'Consultar operações administrativas e trilhas permitidas.', defaultPath: '/auditoria' },
  { code: 'audit:history:read', module: 'Auditoria', label: 'Consultar histórico de domínio', description: 'Consultar eventos históricos autorizados pelo domínio.', defaultPath: '/auditoria' },
] as const

export type PermissionName = typeof PERMISSION_DEFINITIONS[number]['code']

/** Grants usados somente por adaptadores de aplicação legados sem leitor de sessão persistido. */
export const LEGACY_ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  ADMINISTRADOR: ['users:read', 'users:create', 'users:update', 'users:archive', 'profiles:read', 'profiles:manage', 'permissions:catalog:read', 'requests:read:all', 'trips:read:all', 'vehicles:read', 'vehicles:create', 'vehicles:update', 'vehicles:status:change', 'vehicles:archive', 'vehicles:history:read', 'drivers:read', 'drivers:create', 'drivers:update', 'drivers:status:change', 'drivers:archive', 'drivers:history:read', 'services:read', 'services:create', 'services:update', 'services:vehicles:manage', 'services:archive', 'maintenance:read', 'maintenance:create', 'maintenance:update', 'maintenance:close', 'fuelings:read', 'fuelings:create', 'fuelings:rectify', 'fines:read', 'fines:create', 'fines:update', 'fines:status:change', 'vehicle-documents:read', 'vehicle-documents:create', 'vehicle-documents:update', 'vehicle-documents:annul', 'svo:occurrences:read', 'svo:occurrences:create', 'svo:occurrences:confirm', 'svo:teams:read', 'svo:teams:manage', 'svo:orders:read:all', 'svo:orders:manage', 'dashboard:read', 'dashboard:svo:read', 'reports:read:trips', 'reports:read:fleet', 'reports:read:maintenance', 'reports:read:svo', 'reports:read:auth', 'reports:export:trips', 'reports:export:fleet', 'reports:export:maintenance', 'reports:export:svo', 'reports:export:auth', 'audit:read', 'audit:history:read'],
  GESTOR: ['requests:read:all', 'requests:return', 'requests:reject', 'requests:approve-and-schedule', 'trips:availability:read', 'trips:read:all', 'trips:create-direct', 'trips:confirm', 'vehicles:read', 'vehicles:create', 'vehicles:update', 'vehicles:status:change', 'vehicles:archive', 'vehicles:history:read', 'drivers:read', 'drivers:create', 'drivers:update', 'drivers:status:change', 'drivers:archive', 'drivers:history:read', 'services:read', 'services:create', 'services:update', 'services:vehicles:manage', 'services:archive', 'maintenance:read', 'maintenance:create', 'maintenance:update', 'maintenance:close', 'fuelings:read', 'fuelings:create', 'fuelings:rectify', 'fines:read', 'fines:create', 'fines:update', 'fines:status:change', 'vehicle-documents:read', 'vehicle-documents:create', 'vehicle-documents:update', 'vehicle-documents:annul', 'svo:occurrences:read', 'svo:teams:read', 'svo:teams:manage', 'svo:orders:read:all', 'svo:orders:manage', 'dashboard:read', 'dashboard:svo:read', 'reports:read:trips', 'reports:read:fleet', 'reports:read:maintenance', 'reports:read:svo', 'reports:export:trips', 'reports:export:fleet', 'reports:export:maintenance', 'reports:export:svo', 'audit:read', 'audit:history:read'],
  SOLICITANTE: ['requests:read:own', 'requests:create', 'requests:resubmit:own', 'requests:history:read:own'],
  MOTORISTA: ['trips:read:assigned', 'trips:execute:assigned'],
  ATENDENTE_SVO: ['vehicles:read', 'services:read', 'svo:occurrences:read', 'svo:occurrences:create', 'svo:occurrences:confirm', 'svo:orders:read:all', 'reports:read:svo', 'reports:export:svo'],
  EQUIPE_SVO: ['svo:orders:read:assigned', 'svo:orders:update:assigned', 'svo:orders:result:assigned'],
}

/** Perfil de acesso com grants explícitos, pronto para a tela administrativa. */
export interface ProfilePermissionSet {
  roleId: string
  permissionNames: readonly PermissionName[]
}

/** Dados que definem criação ou alteração de um perfil administrável. */
export interface ProfileMutationInput {
  code?: string
  displayName: string
  description: string | null
  defaultPath: string | null
  permissionNames: readonly string[]
  expectedRevision?: number
  reason: string
  idempotencyKey?: string
}

/** Filtros de listagem administrativa de perfis. */
export interface ProfileFilters {
  active?: boolean
  search?: string
  page?: number
  pageSize?: number
}

/** Página de perfis para as consultas administrativas paginadas. */
export interface PaginatedProfiles {
  profiles: import('./auth').Role[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Dados imutáveis necessários para registrar uma mutação de perfil. */
export interface CreateRoleEventInput {
  roleId: string
  eventType: 'CREATED' | 'UPDATED' | 'PERMISSIONS_CHANGED' | 'DEACTIVATED' | 'REACTIVATED'
  actorId: string
  actorSnapshot: Record<string, unknown>
  reason: string
  beforeState: Record<string, unknown> | null
  afterState: Record<string, unknown>
  evidenceDescription?: string | null
}

/** Permissão persistida com metadados de apresentação e seleção. */
export interface PermissionCatalogItem extends Permission {
  module: string
  label: string
  defaultPath: string
  scopeGroup?: string
  dependencies: readonly string[]
}

/** Grupo visual do catálogo por módulo funcional. */
export interface PermissionCatalogGroup {
  module: string
  permissions: PermissionCatalogItem[]
}
