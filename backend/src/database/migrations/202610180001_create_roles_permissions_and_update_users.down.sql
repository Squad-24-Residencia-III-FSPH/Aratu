BEGIN;

-- 1. Restaurar coluna role textual com as mesmas invariantes da migration original
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS role TEXT;

UPDATE auth.users u
   SET role = r.name
  FROM auth.roles r
 WHERE u.role_id = r.id;

ALTER TABLE auth.users
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE auth.users
  DROP CONSTRAINT IF EXISTS auth_users_role_check,
  ADD CONSTRAINT auth_users_role_check CHECK (role IN (
    'ADMINISTRADOR',
    'GESTOR',
    'SOLICITANTE',
    'MOTORISTA',
    'ATENDENTE_SVO',
    'EQUIPE_SVO'
  ));

-- 2. Remover constraints e colunas novas de auth.users
DROP INDEX IF EXISTS auth.auth_users_by_role;
ALTER TABLE auth.users
  DROP CONSTRAINT IF EXISTS auth_users_role_id_fkey,
  DROP COLUMN IF EXISTS role_id,
  DROP COLUMN IF EXISTS updated_at;

-- 3. Remover tabelas associativas e de perfis
DROP TABLE IF EXISTS auth.role_permissions;
DROP TABLE IF EXISTS auth.permissions;
DROP TABLE IF EXISTS auth.roles;

COMMIT;
