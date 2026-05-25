CREATE TABLE IF NOT EXISTS persistent_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company TEXT NOT NULL,
  target_role TEXT,
  motivation TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_persistent_goals_user_updated
  ON persistent_goals (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS persistent_goal_followups (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES persistent_goals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  note TEXT NOT NULL,
  next_action_date TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_persistent_goal_followups_goal_created
  ON persistent_goal_followups (user_id, goal_id, created_at DESC);
