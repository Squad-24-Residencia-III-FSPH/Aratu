BEGIN;

ALTER TABLE auth.roles
  ADD COLUMN display_name TEXT,
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN default_path TEXT,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN created_by BIGINT REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN creation_key UUID,
  ADD COLUMN creation_payload JSONB,
  ADD CONSTRAINT auth_roles_creation_metadata_complete CHECK (
    (created_by IS NULL AND creation_key IS NULL AND creation_payload IS NULL)
    OR (created_by IS NOT NULL AND creation_key IS NOT NULL
      AND jsonb_typeof(creation_payload) = 'object')
  );

UPDATE auth.roles
   SET display_name = CASE name
     WHEN 'ADMINISTRADOR' THEN 'Administrador do Sistema'
     WHEN 'GESTOR' THEN 'Gestor de Frota'
     WHEN 'SOLICITANTE' THEN 'Solicitante Interno'
     WHEN 'MOTORISTA' THEN 'Motorista'
     WHEN 'ATENDENTE_SVO' THEN 'Atendente SVO'
     WHEN 'EQUIPE_SVO' THEN 'Equipe SVO'
     ELSE name
   END,
   default_path = CASE name
     WHEN 'ADMINISTRADOR' THEN '/administracao/usuarios'
     WHEN 'GESTOR' THEN '/frota/dashboard'
     WHEN 'SOLICITANTE' THEN '/solicitacoes/minhas'
     WHEN 'MOTORISTA' THEN '/viagens/minhas'
     WHEN 'ATENDENTE_SVO' THEN '/svo/solicitacoes'
     WHEN 'EQUIPE_SVO' THEN '/svo/ordens'
     ELSE NULL
   END;

ALTER TABLE auth.roles ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE auth.roles ADD CONSTRAINT auth_roles_display_name_nonempty CHECK (btrim(display_name) <> '');
CREATE UNIQUE INDEX auth_roles_creation_key ON auth.roles(created_by, creation_key)
  WHERE creation_key IS NOT NULL;

ALTER TABLE auth.role_permissions ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE auth.role_permissions DROP CONSTRAINT role_permissions_role_id_fkey;
ALTER TABLE auth.role_permissions DROP CONSTRAINT role_permissions_permission_id_fkey;
ALTER TABLE auth.role_permissions ADD CONSTRAINT auth_role_permissions_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES auth.roles(id) ON DELETE RESTRICT;
ALTER TABLE auth.role_permissions ADD CONSTRAINT auth_role_permissions_permission_id_fkey
  FOREIGN KEY (permission_id) REFERENCES auth.permissions(id) ON DELETE RESTRICT;

CREATE TABLE auth.role_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES auth.roles(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CREATED', 'UPDATED', 'PERMISSIONS_CHANGED', 'DEACTIVATED', 'REACTIVATED'
  )),
  occurred_at TIMESTAMPTZ NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL CHECK (btrim(reported_by) <> ''),
  registered_by BIGINT NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL CHECK (jsonb_typeof(actor_snapshot) = 'object'),
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  evidence_description TEXT,
  before_state JSONB,
  after_state JSONB NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX auth_role_events_by_role
  ON auth.role_events(role_id, occurred_at DESC, id DESC);

CREATE FUNCTION auth.reject_role_events_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auth.role_events is append-only';
END;
$$;

CREATE TRIGGER auth_role_events_append_only
  BEFORE UPDATE OR DELETE ON auth.role_events
  FOR EACH ROW EXECUTE FUNCTION auth.reject_role_events_mutation();

INSERT INTO auth.permissions(name, description) VALUES
  ('users:read', 'Consultar contas de usuários'),
  ('users:create', 'Criar contas de usuários'),
  ('users:update', 'Editar contas e perfis de usuários'),
  ('users:archive', 'Arquivar e restaurar contas de usuários'),
  ('profiles:read', 'Consultar perfis de acesso'),
  ('profiles:manage', 'Criar e editar perfis e suas permissões'),
  ('permissions:catalog:read', 'Consultar o catálogo de permissões'),
  ('requests:read:own', 'Consultar solicitações próprias'),
  ('requests:read:all', 'Consultar solicitações de todos os solicitantes'),
  ('requests:create', 'Criar solicitações de viagem'),
  ('requests:resubmit:own', 'Corrigir e reenviar solicitação própria'),
  ('requests:return', 'Devolver solicitações para correção'),
  ('requests:reject', 'Recusar solicitações'),
  ('requests:approve-and-schedule', 'Aprovar e agendar solicitações'),
  ('requests:history:read:own', 'Consultar histórico de solicitações próprias'),
  ('requests:history:read:all', 'Consultar histórico de solicitações de todos'),
  ('trips:availability:read', 'Consultar disponibilidade para agendamento'),
  ('trips:read:assigned', 'Consultar viagens atribuídas à própria conta'),
  ('trips:read:all', 'Consultar agenda de viagens'),
  ('trips:create-direct', 'Criar viagem direta'),
  ('trips:execute:assigned', 'Executar viagem atribuída'),
  ('trips:confirm', 'Conferir viagens concluídas'),
  ('vehicles:read', 'Consultar veículos'),
  ('vehicles:create', 'Cadastrar veículos'),
  ('vehicles:update', 'Editar veículos'),
  ('vehicles:status:change', 'Alterar situação operacional de veículos'),
  ('vehicles:archive', 'Arquivar e restaurar veículos'),
  ('vehicles:history:read', 'Consultar histórico de veículos'),
  ('drivers:read', 'Consultar motoristas'),
  ('drivers:create', 'Cadastrar motoristas'),
  ('drivers:update', 'Editar motoristas'),
  ('drivers:status:change', 'Alterar situação operacional de motoristas'),
  ('drivers:archive', 'Arquivar e restaurar motoristas'),
  ('drivers:history:read', 'Consultar histórico de motoristas'),
  ('services:read', 'Consultar tipos de serviço'),
  ('services:create', 'Cadastrar tipos de serviço'),
  ('services:update', 'Editar tipos de serviço'),
  ('services:vehicles:manage', 'Vincular veículos a tipos de serviço'),
  ('services:archive', 'Arquivar e restaurar tipos de serviço'),
  ('services:history:read', 'Consultar histórico de tipos de serviço'),
  ('maintenance:read', 'Consultar ordens de manutenção'),
  ('maintenance:create', 'Abrir ordens de manutenção'),
  ('maintenance:update', 'Editar ordens de manutenção'),
  ('maintenance:close', 'Encerrar ordens de manutenção'),
  ('fuelings:read', 'Consultar abastecimentos'),
  ('fuelings:create', 'Registrar abastecimentos'),
  ('fuelings:rectify', 'Retificar abastecimentos'),
  ('fines:read', 'Consultar multas'),
  ('fines:create', 'Registrar multas'),
  ('fines:update', 'Editar multas'),
  ('fines:status:change', 'Alterar situação de multas'),
  ('vehicle-documents:read', 'Consultar documentos de veículos'),
  ('vehicle-documents:create', 'Registrar documentos de veículos'),
  ('vehicle-documents:update', 'Editar documentos de veículos'),
  ('vehicle-documents:annul', 'Anular documentos de veículos'),
  ('svo:occurrences:read', 'Consultar ocorrências SVO'),
  ('svo:occurrences:create', 'Registrar ocorrências SVO'),
  ('svo:occurrences:confirm', 'Confirmar triagem de ocorrências SVO'),
  ('svo:teams:read', 'Consultar equipes e plantões SVO'),
  ('svo:teams:manage', 'Gerenciar equipes e plantões SVO'),
  ('svo:orders:read:assigned', 'Consultar ordens SVO atribuídas à equipe'),
  ('svo:orders:read:all', 'Consultar todas as ordens SVO'),
  ('svo:orders:update:assigned', 'Atualizar ordem SVO atribuída à equipe'),
  ('svo:orders:result:assigned', 'Registrar resultado de ordem SVO atribuída'),
  ('svo:orders:manage', 'Criar ordens SVO e reprocessar despacho'),
  ('dashboard:read', 'Consultar painel operacional'),
  ('dashboard:svo:read', 'Consultar indicadores operacionais SVO'),
  ('reports:read:trips', 'Consultar relatórios de viagens'),
  ('reports:read:fleet', 'Consultar relatórios de frota'),
  ('reports:read:maintenance', 'Consultar relatórios de manutenção'),
  ('reports:read:svo', 'Consultar relatórios SVO'),
  ('reports:read:auth', 'Consultar relatórios de acessos'),
  ('reports:export:trips', 'Exportar relatórios de viagens'),
  ('reports:export:fleet', 'Exportar relatórios de frota'),
  ('reports:export:maintenance', 'Exportar relatórios de manutenção'),
  ('reports:export:svo', 'Exportar relatórios SVO'),
  ('reports:export:auth', 'Exportar relatórios de acessos'),
  ('audit:read', 'Consultar registros de auditoria'),
  ('audit:history:read', 'Consultar históricos de domínio permitidos')
ON CONFLICT DO NOTHING;

-- A migração única converte os seis perfis existentes em grants explícitos.
-- Seeds posteriores não repõem revogações administrativas.
WITH initial_grants(role_name, permission_name) AS (VALUES
  ('ADMINISTRADOR','users:read'), ('ADMINISTRADOR','users:create'), ('ADMINISTRADOR','users:update'), ('ADMINISTRADOR','users:archive'),
  ('ADMINISTRADOR','profiles:read'), ('ADMINISTRADOR','profiles:manage'), ('ADMINISTRADOR','permissions:catalog:read'),
  ('ADMINISTRADOR','requests:read:all'), ('ADMINISTRADOR','requests:history:read:all'), ('ADMINISTRADOR','trips:read:all'),
  ('ADMINISTRADOR','vehicles:read'), ('ADMINISTRADOR','vehicles:create'), ('ADMINISTRADOR','vehicles:update'), ('ADMINISTRADOR','vehicles:status:change'), ('ADMINISTRADOR','vehicles:archive'), ('ADMINISTRADOR','vehicles:history:read'),
  ('ADMINISTRADOR','drivers:read'), ('ADMINISTRADOR','drivers:create'), ('ADMINISTRADOR','drivers:update'), ('ADMINISTRADOR','drivers:status:change'), ('ADMINISTRADOR','drivers:archive'), ('ADMINISTRADOR','drivers:history:read'),
  ('ADMINISTRADOR','services:read'), ('ADMINISTRADOR','services:create'), ('ADMINISTRADOR','services:update'), ('ADMINISTRADOR','services:vehicles:manage'), ('ADMINISTRADOR','services:archive'), ('ADMINISTRADOR','services:history:read'),
  ('ADMINISTRADOR','maintenance:read'), ('ADMINISTRADOR','maintenance:create'), ('ADMINISTRADOR','maintenance:update'), ('ADMINISTRADOR','maintenance:close'),
  ('ADMINISTRADOR','fuelings:read'), ('ADMINISTRADOR','fuelings:create'), ('ADMINISTRADOR','fuelings:rectify'),
  ('ADMINISTRADOR','fines:read'), ('ADMINISTRADOR','fines:create'), ('ADMINISTRADOR','fines:update'), ('ADMINISTRADOR','fines:status:change'),
  ('ADMINISTRADOR','vehicle-documents:read'), ('ADMINISTRADOR','vehicle-documents:create'), ('ADMINISTRADOR','vehicle-documents:update'), ('ADMINISTRADOR','vehicle-documents:annul'),
  ('ADMINISTRADOR','svo:occurrences:read'), ('ADMINISTRADOR','svo:occurrences:create'), ('ADMINISTRADOR','svo:occurrences:confirm'), ('ADMINISTRADOR','svo:orders:read:all'), ('ADMINISTRADOR','svo:orders:manage'), ('ADMINISTRADOR','svo:teams:read'), ('ADMINISTRADOR','svo:teams:manage'),
  ('ADMINISTRADOR','dashboard:read'), ('ADMINISTRADOR','dashboard:svo:read'), ('ADMINISTRADOR','reports:read:trips'), ('ADMINISTRADOR','reports:read:fleet'),
  ('ADMINISTRADOR','reports:read:maintenance'), ('ADMINISTRADOR','reports:read:svo'), ('ADMINISTRADOR','reports:read:auth'),
  ('ADMINISTRADOR','reports:export:trips'), ('ADMINISTRADOR','reports:export:fleet'), ('ADMINISTRADOR','reports:export:maintenance'), ('ADMINISTRADOR','reports:export:svo'), ('ADMINISTRADOR','reports:export:auth'), ('ADMINISTRADOR','audit:read'), ('ADMINISTRADOR','audit:history:read'),
  ('GESTOR','requests:read:all'), ('GESTOR','requests:history:read:all'), ('GESTOR','requests:return'), ('GESTOR','requests:reject'), ('GESTOR','requests:approve-and-schedule'),
  ('GESTOR','trips:availability:read'), ('GESTOR','trips:read:all'), ('GESTOR','trips:create-direct'), ('GESTOR','trips:confirm'),
  ('GESTOR','vehicles:read'), ('GESTOR','vehicles:create'), ('GESTOR','vehicles:update'), ('GESTOR','vehicles:status:change'), ('GESTOR','vehicles:archive'), ('GESTOR','vehicles:history:read'),
  ('GESTOR','drivers:read'), ('GESTOR','drivers:create'), ('GESTOR','drivers:update'), ('GESTOR','drivers:status:change'), ('GESTOR','drivers:archive'), ('GESTOR','drivers:history:read'),
  ('GESTOR','services:read'), ('GESTOR','services:create'), ('GESTOR','services:update'), ('GESTOR','services:vehicles:manage'), ('GESTOR','services:archive'), ('GESTOR','services:history:read'),
  ('GESTOR','maintenance:read'), ('GESTOR','maintenance:create'), ('GESTOR','maintenance:update'), ('GESTOR','maintenance:close'),
  ('GESTOR','fuelings:read'), ('GESTOR','fuelings:create'), ('GESTOR','fuelings:rectify'), ('GESTOR','fines:read'), ('GESTOR','fines:create'), ('GESTOR','fines:update'), ('GESTOR','fines:status:change'),
  ('GESTOR','vehicle-documents:read'), ('GESTOR','vehicle-documents:create'), ('GESTOR','vehicle-documents:update'), ('GESTOR','vehicle-documents:annul'),
  ('GESTOR','svo:occurrences:read'), ('GESTOR','svo:teams:read'), ('GESTOR','svo:teams:manage'), ('GESTOR','svo:orders:read:all'), ('GESTOR','svo:orders:manage'),
  ('GESTOR','dashboard:read'), ('GESTOR','dashboard:svo:read'), ('GESTOR','reports:read:trips'), ('GESTOR','reports:read:fleet'), ('GESTOR','reports:read:maintenance'), ('GESTOR','reports:read:svo'), ('GESTOR','reports:export:trips'), ('GESTOR','reports:export:fleet'), ('GESTOR','reports:export:maintenance'), ('GESTOR','reports:export:svo'), ('GESTOR','audit:read'), ('GESTOR','audit:history:read'),
  ('SOLICITANTE','requests:read:own'), ('SOLICITANTE','requests:create'), ('SOLICITANTE','requests:resubmit:own'), ('SOLICITANTE','requests:history:read:own'), ('SOLICITANTE','services:read'),
  ('MOTORISTA','trips:read:assigned'), ('MOTORISTA','trips:execute:assigned'),
  ('ATENDENTE_SVO','vehicles:read'), ('ATENDENTE_SVO','services:read'), ('ATENDENTE_SVO','svo:occurrences:read'), ('ATENDENTE_SVO','svo:occurrences:create'), ('ATENDENTE_SVO','svo:occurrences:confirm'), ('ATENDENTE_SVO','svo:orders:read:all'), ('ATENDENTE_SVO','reports:read:svo'), ('ATENDENTE_SVO','reports:export:svo'),
  ('EQUIPE_SVO','svo:orders:read:assigned'), ('EQUIPE_SVO','svo:orders:update:assigned'), ('EQUIPE_SVO','svo:orders:result:assigned')
)
INSERT INTO auth.role_permissions(role_id, permission_id)
SELECT r.id, p.id
  FROM initial_grants g
  JOIN auth.roles r ON r.name = g.role_name
  JOIN auth.permissions p ON p.name = g.permission_name
ON CONFLICT (role_id, permission_id) DO NOTHING;

UPDATE auth.role_permissions SET is_active = true;

COMMIT;
