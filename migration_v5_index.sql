-- Migration v5: State Machine Index Optimization
CREATE INDEX IF NOT EXISTS idx_checkin_state_machine ON checkin_records (line_user_id, status, id DESC);
