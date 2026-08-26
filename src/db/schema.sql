CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'playing'
    CHECK (status IN ('playing', 'won', 'draw')),
  current_player SMALLINT NOT NULL DEFAULT 1
    CHECK (current_player IN (1, 2)),
  winner SMALLINT CHECK (winner IN (1, 2)),
  version SMALLINT NOT NULL DEFAULT 0
    CHECK (version BETWEEN 0 AND 42),
  provider TEXT NOT NULL DEFAULT 'openai'
    CHECK (provider IN ('openai', 'anthropic')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (
    (status = 'won' AND winner IS NOT NULL)
    OR (status <> 'won' AND winner IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS moves (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply SMALLINT NOT NULL CHECK (ply BETWEEN 1 AND 42),
  player SMALLINT NOT NULL CHECK (player IN (1, 2)),
  column_index SMALLINT NOT NULL CHECK (column_index BETWEEN 0 AND 6),
  row_index SMALLINT NOT NULL CHECK (row_index BETWEEN 0 AND 5),
  strategy TEXT CHECK (
    strategy IN ('llm-tools', 'tactical-guard', 'search-fallback')
  ),
  explanation TEXT,
  trace JSONB,
  provider TEXT,
  model TEXT,
  latency_ms DOUBLE PRECISION,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, ply),
  CHECK (
    (player = 1 AND strategy IS NULL AND trace IS NULL)
    OR player = 2
  )
);

CREATE TABLE IF NOT EXISTS game_commands (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  expected_version SMALLINT NOT NULL,
  resulting_version SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS games_created_at_idx ON games (created_at DESC);
CREATE INDEX IF NOT EXISTS games_status_idx ON games (status);
CREATE INDEX IF NOT EXISTS moves_agent_analytics_idx
  ON moves (player, strategy, provider, model);

CREATE TABLE IF NOT EXISTS eval_runs (
  id UUID PRIMARY KEY,
  dataset_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  scenario_ids TEXT[] NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed')),
  total_cases SMALLINT NOT NULL CHECK (total_cases > 0),
  completed_cases SMALLINT NOT NULL DEFAULT 0,
  passed_cases SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (completed_cases BETWEEN 0 AND total_cases),
  CHECK (passed_cases BETWEEN 0 AND completed_cases)
);

CREATE TABLE IF NOT EXISTS eval_results (
  run_id UUID NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  ordinal SMALLINT NOT NULL,
  scenario_name TEXT NOT NULL,
  category TEXT NOT NULL,
  move_history JSONB NOT NULL,
  golden_moves SMALLINT[] NOT NULL,
  selected_move SMALLINT CHECK (selected_move BETWEEN 0 AND 6),
  passed BOOLEAN NOT NULL,
  strategy TEXT,
  explanation TEXT,
  trace JSONB,
  provider TEXT,
  model TEXT,
  latency_ms DOUBLE PRECISION,
  total_tokens INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, scenario_id)
);

CREATE INDEX IF NOT EXISTS eval_runs_created_at_idx
  ON eval_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS eval_results_score_idx
  ON eval_results (scenario_id, passed);

ALTER TABLE games DROP COLUMN IF EXISTS difficulty;
ALTER TABLE eval_runs DROP COLUMN IF EXISTS difficulty;
ALTER TABLE eval_runs ADD COLUMN IF NOT EXISTS policy_version TEXT;
UPDATE eval_runs
SET policy_version = 'legacy-unversioned'
WHERE policy_version IS NULL;
ALTER TABLE eval_runs ALTER COLUMN policy_version SET NOT NULL;
