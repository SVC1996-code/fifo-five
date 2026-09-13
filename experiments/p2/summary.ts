import type { Result } from "../../src/core";
interface GameLike {
  trajectoryHash: string;
  result: Result | { kind: "cutoff" };
  players: { X: { name: string }; O: { name: string } };
}
export function summarize(rows: GameLike[], agentA: string) {
  const groups = new Map<string, GameLike[]>();
  for (const row of rows)
    groups.set(row.trajectoryHash, [
      ...(groups.get(row.trajectoryHash) ?? []),
      row,
    ]);
  const empty = () => ({
    agentAWin: 0,
    agentBWin: 0,
    repetition: 0,
    "no-moves": 0,
    "ply-limit": 0,
    cutoff: 0,
    "ambiguous-role-assignment": 0,
  });
  const outcome = (g: GameLike) =>
    g.result.kind === "win"
      ? g.players[g.result.winner].name === agentA
        ? "agentAWin"
        : "agentBWin"
      : g.result.kind === "draw"
        ? g.result.reason
        : "cutoff";
  const all = empty(),
    deduplicated = empty();
  for (const row of rows) all[outcome(row)]++;
  for (const group of groups.values()) {
    const labels = new Set(group.map(outcome));
    if (labels.size === 1) deduplicated[outcome(group[0])]++;
    else deduplicated["ambiguous-role-assignment"]++;
  }
  return {
    completed: rows.length,
    uniqueTrajectories: groups.size,
    all,
    deduplicated,
  };
}
