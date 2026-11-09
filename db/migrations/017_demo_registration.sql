-- Demo accounts/challenges cannot be used by an app running in provider mode.
ALTER TABLE users ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE registration_challenges ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
