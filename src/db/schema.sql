CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'playing'
    CHECK (status IN ('playing', 'won', 'draw')),
  current_player SMALLINT NOT NULL DEFAULT 1
    CHECK (current_player IN (1, 2)),
  winner SMALLINT CHECK (winner IN (1, 2)),
  version SMALLINT NOT NULL DEFAULT 0
    CHECK (version BETWEEN 0 AND 42),
  difficulty TEXT NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
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
