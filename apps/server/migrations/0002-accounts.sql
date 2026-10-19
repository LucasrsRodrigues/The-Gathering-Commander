-- Épico 08, T8.4: optional accounts. Only what is needed: the provider's user id, a display name and an avatar URL.
-- No passwords, no e-mail, no provider tokens (they are discarded right after reading the profile).

CREATE TABLE app_user (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE identity (
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX identity_by_user ON identity (user_id);

-- The cookie holds a random id; only its sha256 is stored.
CREATE TABLE session (
  id_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_by_user ON session (user_id);
