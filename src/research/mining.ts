import {
  applyMove,
  legalMoves,
  lines,
  other,
  type State,
  type Player,
} from "../core";
import { proveMate } from "./mate";
/** Geometric (non-proof) single-empty completion set. This helper deliberately
 * does not claim that an upcoming FIFO placement can keep the whole line. */
export function completions(s: State, p: Player): number[] {
  const own = new Set(s.queues[p]),
    enemy = new Set(s.queues[other(p)]);
  return [
    ...new Set(
      lines(s.rules).flatMap((line) => {
        if (line.some((c) => enemy.has(c))) return [];
        const empty = line.filter((c) => !own.has(c));
        return empty.length === 1 ? empty : [];
      }),
    ),
  ].sort((a, b) => a - b);
}
export function expiringThreats(s: State) {
  if (
    s.result ||
    s.rules.retention.kind !== "fifo" ||
    s.queues[s.turn].length !== s.rules.retention.maxStones
  )
    return [];
  const oldest = s.queues[s.turn][0];
  return completions(s, s.turn).flatMap((move) => {
    const targets = lines(s.rules).filter(
      (line) =>
        line.includes(oldest) &&
        line.includes(move) &&
        line.every((c) => c === move || s.queues[s.turn].includes(c)),
    );
    if (!targets.length) return [];
    const next = applyMove(s, move);
    return [
      {
        move,
        removed: next.event.removed,
        vanishedLines: targets,
        stableWinner:
          next.state.result?.kind === "win" ? next.state.result.winner : null,
      },
    ];
  });
}
export function expiryLock(s: State) {
  if (
    s.result ||
    s.rules.retention.kind !== "fifo" ||
    s.queues[s.turn].length !== s.rules.retention.maxStones
  )
    return null;
  const oldest = s.queues[s.turn][0],
    enemy = other(s.turn);
  const targetLines = lines(s.rules).filter(
    (line) =>
      line.includes(oldest) &&
      line.every((c) => c === oldest || s.queues[enemy].includes(c)),
  );
  if (!targetLines.length) return null;
  return {
    defender: s.turn,
    attacker: enemy,
    removedCell: oldest,
    targetLines,
    proof: proveMate(s, {
      attacker: enemy,
      maxPly: 2,
      maxNodes: 20000,
      timeMs: null,
    }),
  };
}
/** Significant = deletion changes at least one side's geometric completion SET.
 * Compare post-placement/pre-removal counterfactual to actual stable successor.
 * No arbitrary score threshold; counterfactual never enters move/proof search. */
export function expirySwing(s: State, move: number) {
  const next = applyMove(s, move);
  if (next.event.removed === null) return null;
  const transient: State = {
    ...s,
    queues: { ...s.queues, [s.turn]: [...s.queues[s.turn], move] },
  };
  const changes = (["X", "O"] as Player[]).flatMap((player) => {
    const before = completions(transient, player),
      after = completions(next.state, player);
    const gained = after.filter((c) => !before.includes(c)),
      lost = before.filter((c) => !after.includes(c));
    return gained.length || lost.length
      ? [{ player, before, after, gained, lost }]
      : [];
  });
  return changes.length ? { move, removed: next.event.removed, changes } : null;
}
export function uniqueDefense(s: State, maxPly = 1) {
  if (s.result) return null;
  const replies = legalMoves(s).map((move) => ({
    move,
    proof: proveMate(applyMove(s, move).state, {
      attacker: other(s.turn),
      maxPly,
      maxNodes: 20000,
      timeMs: null,
    }),
  }));
  const safe = replies.filter((r) => r.proof.result === "not-found");
  return {
    horizonAfterDefense: maxPly,
    unique:
      safe.length === 1 && replies.every((r) => r.proof.result !== "unknown"),
    bestMove: safe.length === 1 ? safe[0].move : null,
    replies,
  };
}
