BEGIN;

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE usr_user (
  usr_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usr_name TEXT NOT NULL CHECK (btrim(usr_name) <> ''),
  usr_email TEXT NOT NULL CHECK (btrim(usr_email) <> ''),
  usr_password_hash TEXT NOT NULL CHECK (btrim(usr_password_hash) <> ''),
  usr_role TEXT NOT NULL CHECK (usr_role IN (
    'ADMINISTRADOR',
    'GESTOR',
    'SOLICITANTE',
    'MOTORISTA',
    'ATENDENTE_SVO',
    'EQUIPE_SVO'
  )),
  usr_active BOOLEAN NOT NULL DEFAULT true,
  usr_revision INTEGER NOT NULL DEFAULT 1 CHECK (usr_revision > 0),
  usr_created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX usr_email_lower_unique ON usr_user (lower(usr_email));

COMMIT;
