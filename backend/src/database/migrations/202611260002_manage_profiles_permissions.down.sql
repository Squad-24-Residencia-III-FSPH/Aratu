BEGIN;

DO $$
DECLARE
  role_count BIGINT;
  event_count BIGINT;
  custom_count BIGINT;
  changed_count BIGINT;
BEGIN
  SELECT count(*) INTO role_count FROM auth.roles;
  SELECT count(*) INTO event_count FROM auth.role_events;
  SELECT count(*) INTO custom_count
    FROM auth.roles
   WHERE name NOT IN ('ADMINISTRADOR','GESTOR','SOLICITANTE','MOTORISTA','ATENDENTE_SVO','EQUIPE_SVO');
  SELECT count(*) INTO changed_count FROM auth.roles WHERE revision <> 1 OR NOT active;
  IF role_count <> 6 OR event_count <> 0 OR custom_count <> 0 OR changed_count <> 0 THEN
    RAISE EXCEPTION 'Rollback de perfis cancelado: há perfis personalizados, eventos ou alterações administrativas. Faça backup e reverta por migração de dados.';
  END IF;
END;
$$;

DELETE FROM auth.role_permissions rp
 USING auth.permissions p
 WHERE rp.permission_id = p.id
   AND p.name NOT IN ('users:manage', 'permissions:manage', 'screens:access');

DROP TRIGGER auth_role_events_append_only ON auth.role_events;
DROP FUNCTION auth.reject_role_events_mutation();
DROP TABLE auth.role_events;

ALTER TABLE auth.role_permissions DROP CONSTRAINT auth_role_permissions_role_id_fkey;
ALTER TABLE auth.role_permissions DROP CONSTRAINT auth_role_permissions_permission_id_fkey;
ALTER TABLE auth.role_permissions ADD CONSTRAINT role_permissions_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES auth.roles(id) ON DELETE CASCADE;
ALTER TABLE auth.role_permissions ADD CONSTRAINT role_permissions_permission_id_fkey
  FOREIGN KEY (permission_id) REFERENCES auth.permissions(id) ON DELETE CASCADE;
ALTER TABLE auth.role_permissions DROP COLUMN is_active;

DELETE FROM auth.permissions WHERE name NOT IN ('users:manage', 'permissions:manage', 'screens:access');
DROP INDEX auth.auth_roles_creation_key;
ALTER TABLE auth.roles
  DROP CONSTRAINT auth_roles_creation_metadata_complete,
  DROP CONSTRAINT auth_roles_display_name_nonempty,
  DROP COLUMN display_name,
  DROP COLUMN active,
  DROP COLUMN revision,
  DROP COLUMN default_path,
  DROP COLUMN updated_at,
  DROP COLUMN created_by,
  DROP COLUMN creation_key,
  DROP COLUMN creation_payload;

COMMIT;
