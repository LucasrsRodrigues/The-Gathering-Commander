-- Épico 10, T10.13: public links to cloud decks. The link reads the live deck in cloud_doc; turning it off deletes
-- the row, and a new link never reuses an old slug. Deleting the account removes its links (cascade).

CREATE TABLE deck_share (
  slug text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  deck_id text NOT NULL,
  created_at bigint NOT NULL,
  UNIQUE (user_id, deck_id)
);

-- Slugs ever handed out, so a link that was turned off never points to another deck later.
CREATE TABLE deck_share_used (
  slug text PRIMARY KEY
);
