BEGIN;

DROP INDEX IF EXISTS usr_email_lower_unique;
DROP TABLE IF EXISTS usr_user;

COMMIT;
