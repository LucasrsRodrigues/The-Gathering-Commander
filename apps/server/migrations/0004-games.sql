-- Épico 08, T8.10: history of finished online games. Every game is recorded, with or without accounts; a player with
-- an account is linked by user_id, so "Minhas partidas" can list it. Deleting the account anonymizes its rows
-- (user_id NULL, generic name) instead of removing the game for the others.
-- initial + actions are what a future replay needs; the lists the app shows only read the small columns.

CREATE TABLE game (
  id uuid PRIMARY KEY,
  room_id text NOT NULL,
  started_at bigint NOT NULL,
  ended_at bigint NOT NULL,
  preset_name text NOT NULL,
  preset jsonb NOT NULL,
  initial jsonb NOT NULL,
  actions jsonb NOT NULL,
  winners jsonb NOT NULL
);

CREATE TABLE game_player (
  game_id uuid NOT NULL REFERENCES game (id) ON DELETE CASCADE,
  seat int NOT NULL,
  player_id text NOT NULL,
  user_id uuid REFERENCES app_user (id) ON DELETE SET NULL,
  name text NOT NULL,
  commanders jsonb NOT NULL,
  won boolean NOT NULL,
  loss_reason text,
  PRIMARY KEY (game_id, seat)
);
CREATE INDEX game_player_by_user ON game_player (user_id, game_id);
CREATE INDEX game_by_end ON game (ended_at DESC, id DESC);
