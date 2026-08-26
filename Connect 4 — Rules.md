# Connect 4 — Rules

## Objective

Connect 4 is a two-player game played on a vertical grid.

The goal is to be the first player to connect **four of your pieces in a row**, either:

- Horizontally
- Vertically
- Diagonally

## Board

The standard board is:

- **7 columns**
- **6 rows**

The board starts completely empty.

Players take turns dropping one piece into a column.

## Making a Move

On each turn, a player chooses a column.

Their piece falls to the lowest available position in that column.

For example:

```text
. . . . . . .
. . . . . . .
. . . . . . .
. . . . . . .
. . . . . . .
X . . O . . .
```

If another piece is already at the bottom, the new piece is placed on top of it:

```text
. . . . . . .
. . . . . . .
. . . . . . .
. . . . . . .
X . . . . . .
X O . . . . .
```

A player may only choose a column that is not full.

## Winning

A player wins immediately when they have four pieces connected in any direction.

### Horizontal

```text
. . . . . . .
. . . . . . .
. . . . . . .
. . . . . . .
. . . . . . .
X X X X . . .
```

### Vertical

```text
. . . . . . .
. . . . . . .
X . . . . . .
X . . . . . .
X . . . . . .
X . . . . . .
```

### Diagonal

```text
. . . . . . .
. . . . X . .
. . . X O . .
. . X O O . .
. X O O O . .
```

## Draw

If the board is completely full and neither player has won, the game ends in a draw.

## Players

There are two players:

- **Human**
- **Agent**

The human and agent alternate turns.

## Game State

At minimum, a game state needs to represent:

- The board
- Whose turn it is
- Whether the game is ongoing, won, or drawn
- The winner, if there is one

## Important

The game rules are authoritative.

The agent should not be able to change the board arbitrarily. A move must be valid according to the rules above.