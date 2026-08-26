# Connect 4 Agent

## Intro

Build an AI agent that can play Connect 4 against a human.

The goal of this project is not simply to build a Connect 4 game. We are interested in how you design and build an **agent that can interact with a structured environment**.

You are encouraged to use coding agents such as Claude Code, Codex, Cursor, or other tools you normally use when developing software.

You are responsible for understanding and validating the code produced by these tools.

You may use any libraries, frameworks, or APIs that you would normally use for a project like this.

You will have access to the game rules in `CONNECT_4.md` and API credentials in `.env`.

---

# Base Instructions

Build a working Connect 4 experience where a human can play against an AI agent.

At minimum:

1. Implement the Connect 4 game according to `CONNECT_4.md`.
2. Implement an AI agent that can decide what move to make.
3. Allow a human to play against the agent.
4. The agent should be able to play a complete game from beginning to end.
5. Invalid moves should not be allowed.
6. The game should correctly detect wins and draws.
7. The application should provide enough information to understand the current state of the game.

The implementation can be a CLI, local web application, or another interface you think is appropriate.

### Agent

The agent should use an LLM to help make its decisions.

You may choose:

- Which model to use
- How to represent the board to the model
- What context to provide
- How the agent decides on a move
- How the game state is communicated to the agent
- How to structure the agent's interaction with the game

You do not need to build your own model or train anything.

### Definition of Done

By the end of the base portion, we should be able to sit down at your computer and play a complete game of Connect 4 against your agent.

The implementation should be understandable enough that you can explain:

- How the agent works
- How the agent interacts with the game
- Where game state lives
- How you prevent invalid moves
- What happens when something goes wrong

---

# Follow-Up Instructions

Once the base implementation is working, we will explore additional requirements together.

These may include one or more of the following areas.

## Agent Design & Functionality

Extend the agent beyond simply asking the model for a move.

For example, you might explore:

- Giving the agent tools for interacting with the game
- Separating observation from action
- Allowing the agent to inspect legal moves
- Giving the agent the ability to make and verify moves
- Adding different strategies or personalities
- Giving the agent memory across turns
- Allowing the agent to explain its actions
- Improving the agent's decision-making
- Handling malformed or unexpected model output

You should be prepared to explain the boundaries between:

- The agent
- The game
- Tools
- State
- Model calls
- Deterministic game logic

---

## Productionization

Imagine this is no longer a local demo.

We want users to be able to visit a website and play Connect 4 against your agent.

Consider how you would:

- Host the application
- Expose the agent to multiple users
- Create and manage game sessions
- Persist game state
- Handle users disconnecting and reconnecting
- Prevent one user's game from affecting another user's game
- Handle concurrent requests
- Monitor the system
- Debug a game that went wrong
- Deploy a new version of the agent

You do not need to implement every production concern. We are interested in how you would approach the problem and, where time allows, implementing the pieces you think are most important.

---

## Evaluation

Imagine you have improved your agent and want to know whether the new version is actually better.

Design a way to evaluate different versions of your agent.

Consider:

- How you define a "good" move
- How you measure whether one agent is better than another
- How you generate representative games
- Whether you need deterministic tests
- Whether you need to play against different opponents
- How you evaluate changes to prompts, models, tools, or agent logic
- How you detect regressions
- How you would run evaluations automatically

You may implement a small evaluation suite if time allows.

---

## Bonus

If you finish the core requirements early, you can extend the project in any direction you think would make the agent substantially better.

Some examples:

- A polished web UI
- Selective search-depth refinement
- Agent-vs-agent games
- Game replay
- Persistent game history
- Agent analytics
- Automated evaluations
- Multiple agent strategies
- Streaming agent responses
- Observability / tracing
- Anything else you think would be interesting

There is no expectation that you complete all of these.

Prioritize a small number of things and be prepared to explain your decisions.