// Frozen P1 algorithm; P2 adds only timing instrumentation. Do not optimize this reference.
import {
  applyMove,
  legalMoves,
  lines,
  other,
  positionKey,
  type Player,
  type State,
} from "../../src/core";
export const AI_VERSION = "fifo-ab-1";
export type Algorithm = "random" | "tactical" | "search";
export interface Budget {
  maxNodes: number;
  timeMs: number | null;
  seed: number;
  maxDepth: number;
}
export const DIFFICULTIES: Record<string, Budget> = {
  简单: { maxNodes: 0, timeMs: null, seed: 1, maxDepth: 0 },
  正常: { maxNodes: 8000, timeMs: 500, seed: 1, maxDepth: 5 },
  困难: { maxNodes: 60000, timeMs: 1800, seed: 1, maxDepth: 8 },
};
export interface Diagnostics {
  move: number | null;
  depth: number;
  nodes: number;
  tacticalNodes: number;
  elapsedMs: number;
  tacticalMs: number;
  searchMs: number;
  exhausted: boolean;
  pv: number[];
  score: number | null;
  safeMoves: number;
  algorithmVersion: string;
}
export function seeded(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
const WIN = 1_000_000;
export function evaluate(s: State, player: Player): number {
  if (s.result)
    return s.result.kind === "draw"
      ? 0
      : s.result.winner === player
        ? WIN
        : -WIN;
  let score = 0;
  for (const p of [player, other(player)]) {
    const q = s.queues[p],
      theirs = new Set(s.queues[other(p)]),
      ours = new Set(q);
    const expiry =
      s.rules.retention.kind === "fifo" &&
      q.length === s.rules.retention.maxStones
        ? q[0]
        : null;
    const enemyQueue = s.queues[other(p)];
    const enemyExpiry =
      s.rules.retention.kind === "fifo" &&
      enemyQueue.length === s.rules.retention.maxStones
        ? enemyQueue[0]
        : null;
    for (const line of lines(s.rules)) {
      const blockers = line.filter((i) => theirs.has(i));
      if (blockers.some((i) => i !== enemyExpiry)) continue;
      let count = 0,
        age = 0;
      for (const cell of line)
        if (ours.has(cell)) {
          count++;
          age += (q.indexOf(cell) + 1) / Math.max(1, q.length);
        }
      if (count) {
        // An expiring own stone cannot sustain the next turn's threat. A line
        // blocked only by the enemy's oldest stone may reopen, but is uncertain.
        const durable =
          count - Number(expiry !== null && line.includes(expiry));
        const potential = 4 ** durable + age;
        score +=
          (p === player ? 1 : -1) * potential * (blockers.length ? 0.15 : 1);
      }
    }
  }
  return Math.max(-WIN / 2, Math.min(WIN / 2, score));
}
// Tactical preflight is exact and bounded by board area squared. Search budgets
// apply after it; separate tacticalNodes makes this cost visible, never hidden.
export function chooseMove(
  s: State,
  budget: Budget,
  algorithm: Algorithm = "search",
): Diagnostics {
  const start = performance.now(),
    all = legalMoves(s),
    random = seeded(budget.seed);
  const result: Diagnostics = {
    move: null,
    depth: 0,
    nodes: 0,
    tacticalNodes: 0,
    elapsedMs: 0,
    tacticalMs: 0,
    searchMs: 0,
    exhausted: false,
    pv: [],
    score: null,
    safeMoves: 0,
    algorithmVersion: AI_VERSION,
  };
  let searchStarted: number | null = null;
  const finish = () => {
    const end = performance.now();
    return { ...result, elapsedMs: end - start, tacticalMs: (searchStarted ?? end) - start, searchMs: searchStarted === null ? 0 : end - searchStarted };
  };
  if (!all.length) return finish();
  result.move = all[Math.floor(random() * all.length)];
  if (algorithm === "random") {
    result.pv = [result.move];
    return finish();
  }
  const children = all.map((move) => {
    result.tacticalNodes++;
    return { move, state: applyMove(s, move).state };
  });
  const win = children.find((c) => c.state.result?.kind === "win");
  if (win) {
    result.move = win.move;
    result.score = WIN;
    result.pv = [win.move];
    return finish();
  }
  const safe = children.filter(
    (c) =>
      !legalMoves(c.state).some((m) => {
        result.tacticalNodes++;
        return applyMove(c.state, m).state.result?.kind === "win";
      }),
  );
  result.safeMoves = safe.length;
  const roots = (safe.length ? safe : children).sort(
    (a, b) => evaluate(b.state, s.turn) - evaluate(a.state, s.turn),
  );
  result.move = roots[0].move;
  result.pv = [result.move];
  if (algorithm === "tactical") return finish();
  const searchStart = searchStarted = performance.now(),
    ordering = new Map<string, number>(),
    STOP = Symbol("budget");
  function visit(
    state: State,
    depth: number,
    alpha: number,
    beta: number,
    player: Player,
  ): { score: number; pv: number[] } {
    if (
      result.nodes >= budget.maxNodes ||
      (budget.timeMs !== null &&
        performance.now() - searchStart >= budget.timeMs)
    )
      throw STOP;
    result.nodes++;
    if (state.result || depth === 0)
      return { score: evaluate(state, player), pv: [] };
    const key = positionKey(state),
      preferred = ordering.get(key);
    const moves = legalMoves(state).map((move) => ({
      move,
      state: applyMove(state, move).state,
    }));
    moves.sort(
      (a, b) =>
        (b.move === preferred ? 2 * WIN : evaluate(b.state, player)) -
        (a.move === preferred ? 2 * WIN : evaluate(a.state, player)),
    );
    let best = -Infinity,
      pv: number[] = [];
    for (const child of moves) {
      const reply = visit(child.state, depth - 1, -beta, -alpha, other(player));
      const score = -reply.score;
      if (score > best) {
        best = score;
        pv = [child.move, ...reply.pv];
      }
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    if (pv.length) ordering.set(key, pv[0]); // ordering only: never cache history-dependent scores
    return { score: best, pv };
  }
  for (let depth = 1; depth <= budget.maxDepth; depth++) {
    try {
      let best = -Infinity,
        pv: number[] = [];
      roots.sort(
        (a, b) =>
          Number(b.move === result.move) - Number(a.move === result.move),
      );
      for (const child of roots) {
        const reply = visit(
            child.state,
            depth - 1,
            -Infinity,
            -best,
            other(s.turn),
          ),
          score = -reply.score;
        if (score > best) {
          best = score;
          pv = [child.move, ...reply.pv];
        }
      }
      result.move = pv[0];
      result.pv = pv;
      result.score = best;
      result.depth = depth;
    } catch (e) {
      if (e !== STOP) throw e;
      result.exhausted = true;
      break;
    }
  }
  return finish();
}
