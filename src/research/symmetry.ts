import { positionKey, type State, type Rules } from "../core";
/** D4 maps only. Canonical POSITION excludes history and must NOT be a score TT key. */
export function transformCell(
  cell: number,
  n: number,
  symmetry: number,
): number {
  let r = Math.floor(cell / n),
    c = cell % n;
  if (symmetry >= 4) c = n - 1 - c;
  for (let i = 0; i < symmetry % 4; i++) {
    const nr = c;
    c = n - 1 - r;
    r = nr;
  }
  return r * n + c;
}
export function transformMoves(
  moves: readonly number[],
  n: number,
  t: number,
): number[] {
  return moves.map((m) => transformCell(m, n, t));
}
export function canonicalTrajectory(
  rules: Rules,
  moves: readonly number[],
): string {
  return Array.from({ length: 8 }, (_, t) =>
    JSON.stringify([rules, transformMoves(moves, rules.boardSize, t)]),
  ).sort()[0];
}
export function canonicalPosition(s: State): string {
  return Array.from({ length: 8 }, (_, t) =>
    positionKey({
      ...s,
      queues: {
        X: transformMoves(s.queues.X, s.rules.boardSize, t),
        O: transformMoves(s.queues.O, s.rules.boardSize, t),
      },
    }),
  ).sort()[0];
}
export function firstMoveOrbits(n: number) {
  const seen = new Set<number>(),
    orbits: { representative: number; cells: number[] }[] = [];
  for (let cell = 0; cell < n * n; cell++) {
    if (seen.has(cell)) continue;
    const cells = [
      ...new Set(
        Array.from({ length: 8 }, (_, t) => transformCell(cell, n, t)),
      ),
    ].sort((a, b) => a - b);
    cells.forEach((c) => seen.add(c));
    orbits.push({ representative: cell, cells });
  }
  return orbits;
}
