BEGIN;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  password_hash VARCHAR NOT NULL,
  role VARCHAR NOT NULL CHECK (role IN (
    'ADMINISTRADOR',
    'GESTOR',
    'SOLICITANTE',
    'MOTORISTA',
    'ATENDENTE_SVO',
    'EQUIPE_SVO'
  )),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

COMMIT;
