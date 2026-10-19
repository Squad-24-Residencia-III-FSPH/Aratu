BEGIN;

-- 1. Criar tabela de perfis de acesso (auth.roles)
CREATE TABLE IF NOT EXISTS auth.roles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_roles_name_unique ON auth.roles (upper(name));

-- 2. Popular os 6 perfis canônicos na migração para suportar a FK de usuários imediatamente
INSERT INTO auth.roles (name, description) VALUES
  ('ADMINISTRADOR', 'Acesso global de parametrização e administração do sistema'),
  ('GESTOR', 'Gestão operacional de frotas, condutores e aprovação de viagens FSPH'),
  ('SOLICITANTE', 'Abertura e acompanhamento de requisições de transporte institucional'),
  ('MOTORISTA', 'Acesso a viagens atribuídas e registro de hodômetro/execução'),
  ('ATENDENTE_SVO', 'Recepção, triagem de chamados e solicitação de remoção cadavérica'),
  ('EQUIPE_SVO', 'Atendimento operacional sigiloso, coleta e entrega cadavérica no SVO')
ON CONFLICT DO NOTHING;

-- 3. Criar tabela de permissões granulares (auth.permissions)
CREATE TABLE IF NOT EXISTS auth.permissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_permissions_name_unique ON auth.permissions (lower(name));

-- 3.1 Popular permissões canônicas
INSERT INTO auth.permissions (name, description) VALUES
  ('users:manage', 'Gerenciar contas de usuários do sistema'),
  ('permissions:manage', 'Gerenciar perfis e permissões de acesso do sistema'),
  ('screens:access', 'Acessar as telas disponíveis para o perfil')
ON CONFLICT DO NOTHING;

-- 4. Criar tabela associativa N:N entre perfis e permissões (auth.role_permissions)
CREATE TABLE IF NOT EXISTS auth.role_permissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT auth_role_permissions_unique UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS auth_role_permissions_by_role ON auth.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS auth_role_permissions_by_permission ON auth.role_permissions (permission_id);

-- 4.1 Provisionar matriz RBAC canônica de forma idempotente
-- Todos os perfis recebem acesso às telas
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM auth.roles r
 CROSS JOIN auth.permissions p
 WHERE p.name = 'screens:access'
ON CONFLICT DO NOTHING;

-- Perfil ADMINISTRADOR recebe gestão de usuários e permissões
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM auth.roles r
 CROSS JOIN auth.permissions p
 WHERE r.name = 'ADMINISTRADOR'
   AND p.name IN ('users:manage', 'permissions:manage')
ON CONFLICT DO NOTHING;

-- 5. Atualizar tabela auth.users: adicionar updated_at e migrar role para role_id
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS role_id BIGINT REFERENCES auth.roles(id) ON DELETE RESTRICT;

-- Se a tabela já contiver linhas com role textual, migrar para role_id
UPDATE auth.users u
   SET role_id = r.id
  FROM auth.roles r
 WHERE u.role_id IS NULL AND upper(r.name) = upper(u.role);

-- Tornar role_id obrigatório e remover coluna textual legada
ALTER TABLE auth.users
  ALTER COLUMN role_id SET NOT NULL;

ALTER TABLE auth.users
  DROP COLUMN IF EXISTS role;

CREATE INDEX IF NOT EXISTS auth_users_by_role ON auth.users (role_id);

COMMIT;
