-- Épico 11, T11.3: how much each card is played in Commander (Scryfall's edhrec_rank; 1 = most played), so card
-- automation is measured and prioritized by real use. Refreshed on every import.

ALTER TABLE card_current ADD COLUMN edhrec_rank integer;
CREATE INDEX card_current_rank ON card_current (edhrec_rank) WHERE edhrec_rank IS NOT NULL;
