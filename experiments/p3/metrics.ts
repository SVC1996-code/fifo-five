import { type Game } from "./runner";
export function numeric(values: number[]) {
  if (!values.length)
    return { n: 0, mean: null, median: null, min: null, max: null };
  const a = [...values].sort((x, y) => x - y);
  return {
    n: a.length,
    mean: a.reduce((s, x) => s + x, 0) / a.length,
    median:
      a.length % 2
        ? a[(a.length - 1) / 2]
        : (a[a.length / 2 - 1] + a[a.length / 2]) / 2,
    min: a[0],
    max: a.at(-1)!,
  };
}
const ratio = (n: number, d: number) => ({
  numerator: n,
  denominator: d,
  rate: d ? n / d : null,
});
export function metrics(games: Game[]) {
  const unique = [...new Map(games.map((g) => [g.trajectoryHash, g])).values()],
    terminal = unique.filter((g) => g.result.kind !== "cutoff"),
    wins = terminal.filter((g) => g.result.kind === "win"),
    pre = terminal.filter((g) => g.opening.deletions === 0);
  const counts = {
    X: 0,
    O: 0,
    repetition: 0,
    "no-moves": 0,
    "ply-limit": 0,
    cutoff: 0,
  };
  for (const g of unique) {
    if (g.result.kind === "win") counts[g.result.winner]++;
    else if (g.result.kind === "draw") counts[g.result.reason]++;
    else counts.cutoff++;
  }
  return {
    executed: games.length,
    uniqueTrajectories: unique.length,
    symmetryUnique: new Set(unique.map((g) => g.symmetryHash)).size,
    counts,
    cutoff: ratio(counts.cutoff, unique.length),
    allLengthsIncludingCutoffs: numeric(unique.map((g) => g.plies)),
    terminalLengths: numeric(terminal.map((g) => g.plies)),
    decisiveLengths: numeric(wins.map((g) => g.plies)),
    terminalContinuationLengths: numeric(
      terminal.map((g) => g.plies - g.opening.moves.length),
    ),
    decisiveContinuationLengths: numeric(
      wins.map((g) => g.plies - g.opening.moves.length),
    ),
    firstDeletionPly: numeric(
      unique.flatMap((g) =>
        g.firstDeletionPly === null ? [] : [g.firstDeletionPly],
      ),
    ),
    deletionsAll: numeric(unique.map((g) => g.deletions)),
    deletionsNonCutoff: numeric(terminal.map((g) => g.deletions)),
    fifoActivation: ratio(
      terminal.filter((g) => g.deletions > 0).length,
      terminal.length,
    ),
    activationFromPreDeletionOpenings: ratio(
      pre.filter((g) => g.deletions > 0).length,
      pre.length,
    ),
    newDeletionDuringContinuation: ratio(
      terminal.filter((g) => g.deletions > g.opening.deletions).length,
      terminal.length,
    ),
    winsAfterDeletion: ratio(
      wins.filter((g) => g.deletions > 0).length,
      wins.length,
    ),
    bothPlayersReachedDeletion: ratio(
      terminal.filter((g) => g.deletions >= 2).length,
      terminal.length,
    ),
    deletionChangedGeometricCompletions: ratio(
      terminal.filter((g) => g.swingPlies.length > 0).length,
      terminal.length,
    ),
    firstDeletionToTerminal: numeric(
      terminal.flatMap((g) =>
        g.pliesAfterFirstDeletion === null ? [] : [g.pliesAfterFirstDeletion],
      ),
    ),
    byOpeningPhase: Object.fromEntries(
      [
        "empty",
        "centre",
        "edge-corner",
        "early",
        "age-pressure",
        "post-deletion",
      ].map((phase) => [
        phase,
        {
          games: unique.filter((g) => g.opening.phase === phase).length,
          terminal: terminal.filter((g) => g.opening.phase === phase).length,
          cutoff: unique.filter(
            (g) => g.opening.phase === phase && g.result.kind === "cutoff",
          ).length,
        },
      ]),
    ),
  };
}
