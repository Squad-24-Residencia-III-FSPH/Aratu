BEGIN;

CREATE SCHEMA IF NOT EXISTS auth;

DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS usr_user CASCADE;
DROP TABLE IF EXISTS auth.user CASCADE;

CREATE TABLE auth.users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  email TEXT NOT NULL CHECK (btrim(email) <> ''),
  password_hash TEXT NOT NULL CHECK (btrim(password_hash) <> ''),
  role TEXT NOT NULL CHECK (role IN (
    'ADMINISTRADOR',
    'GESTOR',
    'SOLICITANTE',
    'MOTORISTA',
    'ATENDENTE_SVO',
    'EQUIPE_SVO'
  )),
  active BOOLEAN NOT NULL DEFAULT true,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX auth_users_email_lower_unique ON auth.users (lower(email));

COMMIT;
