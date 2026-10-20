-- Épico 08, T8.7: decks and house-rule presets in the cloud, one row per document and account.
-- updated_at = when the document was edited (the device's clock, clamped); changed_at = when the server stored it,
-- used for "what changed since" so a device with a wrong clock never hides changes from the others.
-- A deletion keeps the row with data NULL (a tombstone), so other devices learn about it.

CREATE TABLE cloud_doc (
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('deck', 'preset')),
  id text NOT NULL,
  data jsonb,
  updated_at bigint NOT NULL,
  changed_at bigint NOT NULL,
  PRIMARY KEY (user_id, kind, id)
);
CREATE INDEX cloud_doc_changes ON cloud_doc (user_id, changed_at);
