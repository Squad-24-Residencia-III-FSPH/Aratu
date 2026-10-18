BEGIN;

DROP INDEX IF EXISTS auth.auth_users_email_lower_unique;
DROP TABLE IF EXISTS auth.users;

COMMIT;
