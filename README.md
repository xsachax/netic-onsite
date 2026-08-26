# Connect Four Agent

A production-minded Connect Four environment where a human plays against a
hybrid LLM and alpha-beta search agent.

**Live demo:** https://netic-onsite.vercel.app

This is intentionally not an LLM wrapper. The model cannot edit the board. A
deterministic engine owns all state transitions, the model operates through
typed tools, every proposed action is validated, and each turn produces an
inspectable execution trace.

## Run locally

Requirements: Node.js 22+ and npm.

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

Add at least one provider key to `.env`:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5
AGENT_PROVIDER=openai
DATABASE_URL=
```

Open the URL printed by Next.js. If no model key is configured, the UI clearly
reports degraded mode and the deterministic search policy keeps the game
playable.

## Architecture

```mermaid
flowchart LR
    UI[React client] -->|game ID + expected version| API[Versioned turn API]
    API --> DB[(Neon Postgres)]
    DB --> REPLAY[Replay append-only moves]
    REPLAY --> ENGINE[Deterministic engine]
    API --> ORCH[Agent orchestrator]
    ORCH --> GUARD[Tactical guard]
    ORCH --> LLM[OpenAI or Anthropic]
    LLM <--> TOOLS[Typed tool loop]
    TOOLS --> SEARCH[Alpha-beta search]
    TOOLS --> ACTION[playMove proposal]
    ACTION --> ENGINE
    ENGINE --> CAS[Atomic compare-and-swap commit]
    CAS --> DB
    DB -->|state + trace + analytics| UI
```

### State ownership

- The board is a pure, immutable `GameState`.
- Only `applyMove` can create the next state.
- PostgreSQL stores games, append-only moves, command IDs, and agent traces.
- The API reconstructs state by replaying database moves through the engine.
- Browser storage holds only the durable game ID and a validated local cache.
- Every command carries `expectedVersion` and a UUID idempotency key.
- A single SQL statement commits both human and agent moves only when the stored
  version still matches.
- No server process memory is required, so Vercel functions scale horizontally.

Model execution occurs before the atomic database commit and outside a database
transaction. Competing requests can both calculate, but PostgreSQL allows only
one to commit; the loser receives `409 VERSION_CONFLICT` and reloads canonical
state. Retrying the winning idempotency key returns the existing result.

## Agent loop

The system instruction is stable and defines the objective, role, immutable
rules, decision priorities, and tool-only action boundary. Every turn adds a
fresh user observation containing:

- The complete 6x7 board.
- Current player.
- Legal columns.
- Canonical move history.
- Validation feedback from a prior invalid proposal, when applicable.

The AI SDK maintains the assistant/tool messages within that turn. Across game
turns, the server sends the current authoritative observation again instead of
replaying conversational prose. This avoids context drift and keeps serverless
requests stateless.

### Tools

| Tool | Purpose |
| --- | --- |
| `getLegalMoves` | Observe columns accepted by the current engine state |
| `analyzeMoves` | Rank legal actions with bounded alpha-beta search |
| `inspectMove` | Check one candidate for wins, blocks, and tactical risk |
| `playMove` | Propose a typed `{ column, explanation }` action |

The model is required to use tools and finish with `playMove`. The orchestrator
validates the selected column against the unchanged state. An illegal proposal
gets one corrective retry; a second invalid proposal, timeout, provider error,
or missing key activates an explicit search fallback.

Immediate wins and forced blocks are deterministic tactical guards. They avoid
spending latency or tokens on decisions with only one rational action.

## Search

The tactical engine uses:

- Alpha-beta minimax from the current player's perspective.
- Center-first move ordering to improve pruning.
- Immediate terminal scoring that prefers faster wins and slower losses.
- Four-cell window scoring across horizontal, vertical, and both diagonal axes.
- Configurable depth: easy 2, medium 4, hard 6.
- Principal variations, category labels, node count, and duration in its result.

Search is both an agent tool and the transparent reliability fallback.

## Observability

The UI exposes a per-turn trace with:

- Strategy (`llm-tools`, `tactical-guard`, or `search-fallback`).
- Provider and model version.
- Legal moves and game version.
- Tool calls and results.
- Ranked search candidates and principal variations.
- Search depth, explored nodes, and latency.
- Model attempts and token usage.
- Explicit fallback reason.

No API key or hidden model reasoning is included in the trace.

Aggregate analytics are computed directly from normalized game and move events:
games, outcomes, model/tool strategies, fallback rate, model latency, and token
usage. The UI shows live totals without exposing individual users or prompts.

## API

`POST /api/games` creates a durable game.

`GET /api/games/:gameId` reconstructs its authoritative state.

`POST /api/games/:gameId/turns`

```json
{
  "column": 3,
  "expectedVersion": 2,
  "idempotencyKey": "08adc0d8-8c52-48bc-ae6e-2631ff25cf26",
  "difficulty": "medium",
  "provider": "openai"
}
```

The server validates the request with Zod, loads canonical moves, applies the
human move, runs the agent if the game remains active, and atomically commits the
complete turn against the expected version.

`GET /api/config` reports which providers are available and their public model
names. It never returns credentials.

`GET /api/analytics` returns aggregate gameplay and agent-operational metrics.

The original stateless `POST /api/turn` remains as a local fallback when
`DATABASE_URL` is not configured.

## Verification

```bash
npm test       # deterministic engine, search, orchestration, history
npm run eval   # tactical fixtures and seeded baseline matches
npm run db:migrate
npm run lint
npm run build
```

The evaluation suite checks immediate wins, mandatory blocks, center preference,
full-column avoidance, legality, and seeded matches against random and shallow
heuristic baselines.

Current deterministic baseline:

```text
Tactical accuracy: 5/5 (100%)
search vs random: 20-0-0
search vs heuristic: 20-0-0
0 illegal moves
```

The seeded suite is a regression gate, not a claim that Connect Four is solved.
A production evaluation pipeline would add deeper-search regret, historical
position replay, prompt/model version comparisons, latency, and cost budgets.

## Failure handling

| Failure | Behavior |
| --- | --- |
| Invalid request/history | Reject before invoking a model |
| Full or out-of-range column | Deterministic engine error |
| Model proposes illegal move | Return validation feedback and retry once |
| Model timeout/provider error | Visible deterministic search fallback |
| Missing provider key | Visible deterministic search fallback |
| Concurrent/stale action | Atomic version check; one commit, one `409` |
| Duplicate request | Idempotency key returns current canonical result |
| Refresh/new instance | Reload and replay PostgreSQL move events |

## Project structure

```text
src/
  agent/
    ai-sdk-model.ts     # OpenAI/Anthropic tool loop
    orchestrator.ts     # guards, retries, fallback, trace
    search/             # alpha-beta search and evaluation
  app/
    api/                # versioned game and analytics routes
    page.tsx            # playable UI and trace inspector
  db/                   # Neon schema, repository, CAS commits, analytics
  domain/connect4/      # authoritative rules and state transitions
  evals/                # seeded tactical and head-to-head evaluation
  game/                 # history replay and shared API contracts
```

## Production path

1. Move model turns to a retryable worker queue and stream completion with SSE.
2. Add authentication, authorization by game owner, and per-user spend limits.
3. Emit OpenTelemetry spans across API, replay, search, model calls, and storage.
4. Pin an agent version per game and use seeded evaluations, canaries, and
   rollback thresholds for model/prompt/tool changes.

See [`ROADMAP.md`](./ROADMAP.md) for the complete delivery and scaling plan.
