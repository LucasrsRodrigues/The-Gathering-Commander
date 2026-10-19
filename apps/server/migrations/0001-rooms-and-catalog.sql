-- Épico 08, T8.2: online rooms and the versioned card catalog (épicos 07 and 01), moved from SQLite.
-- Dates in the catalog are ISO 'YYYY-MM-DD' text, compared as text; intervals are [valid_from, valid_to).

CREATE TABLE room (
  id text PRIMARY KEY,
  snapshot jsonb NOT NULL,
  last_active bigint NOT NULL -- epoch ms, as the room core counts time
);
CREATE INDEX room_last_active ON room (last_active);

CREATE TABLE card_current (
  oracle_id text PRIMARY KEY,
  name text NOT NULL,
  name_norm text NOT NULL,
  front_norm text,
  hash text NOT NULL,
  legal text NOT NULL,
  game_changer boolean NOT NULL,
  data jsonb NOT NULL
);
CREATE INDEX card_current_name ON card_current (name_norm);
CREATE INDEX card_current_front ON card_current (front_norm);

CREATE TABLE oracle_version (
  oracle_id text NOT NULL,
  valid_from text NOT NULL,
  valid_to text,
  hash text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (oracle_id, valid_from)
);

CREATE TABLE legality_version (
  oracle_id text NOT NULL,
  status text NOT NULL,
  valid_from text NOT NULL,
  valid_to text,
  source text NOT NULL,
  UNIQUE (oracle_id, valid_from, source)
);
CREATE INDEX legality_version_open ON legality_version (oracle_id) WHERE valid_to IS NULL;

CREATE TABLE game_changer_version (
  oracle_id text NOT NULL,
  valid_from text NOT NULL,
  valid_to text,
  source text NOT NULL,
  UNIQUE (oracle_id, valid_from, source)
);

CREATE TABLE import_run (
  id bigserial PRIMARY KEY,
  started_at text NOT NULL,
  finished_at text,
  bulk_updated_at text,
  status text NOT NULL,
  cards integer NOT NULL DEFAULT 0,
  changes integer NOT NULL DEFAULT 0,
  error text
);

CREATE TABLE catalog_meta (key text PRIMARY KEY, value text NOT NULL);
