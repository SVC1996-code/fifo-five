export type Player = "X" | "O";
export type Retention =
  { kind: "fifo"; maxStones: number } | { kind: "permanent" };
export interface Rules {
  rulesVersion: "1";
  boardSize: number;
  winLength: number;
  retention: Retention;
  repetitionThreshold: 3;
  matchPlyLimit: number | null;
}
export const DEFAULT_RULES: Rules = {
  rulesVersion: "1",
  boardSize: 6,
  winLength: 5,
  retention: { kind: "fifo", maxStones: 6 },
  repetitionThreshold: 3,
  matchPlyLimit: null,
};
export function validateRules(value: unknown): Rules {
  if (!value || typeof value !== "object") throw Error("规则必须是对象");
  const r = value as Rules;
  if (r.rulesVersion !== "1") throw Error("不支持的规则版本");
  if (!Number.isInteger(r.boardSize) || r.boardSize < 3 || r.boardSize > 9)
    throw Error("棋盘边长必须是 3～9 的整数");
  if (
    !Number.isInteger(r.winLength) ||
    r.winLength < 3 ||
    r.winLength > r.boardSize
  )
    throw Error("连线长度必须是 3～棋盘边长的整数");
  if (!r.retention || !["fifo", "permanent"].includes(r.retention.kind))
    throw Error("棋子保留策略不合法");
  if (
    r.retention.kind === "fifo" &&
    (!Number.isInteger(r.retention.maxStones) ||
      r.retention.maxStones < r.winLength ||
      r.retention.maxStones > r.boardSize ** 2)
  )
    throw Error("FIFO 上限必须是连线长度～棋盘格数的整数");
  if (r.repetitionThreshold !== 3) throw Error("规则版本 1 固定为三次重复和棋");
  if (
    r.matchPlyLimit != null &&
    (!Number.isSafeInteger(r.matchPlyLimit) || r.matchPlyLimit < 1)
  )
    throw Error("规则手数上限必须是正整数或留空");
  return Object.freeze({
    rulesVersion: "1",
    boardSize: r.boardSize,
    winLength: r.winLength,
    retention: Object.freeze(
      r.retention.kind === "fifo"
        ? { kind: "fifo", maxStones: r.retention.maxStones }
        : { kind: "permanent" },
    ),
    repetitionThreshold: 3,
    matchPlyLimit: r.matchPlyLimit ?? null,
  });
}
export const PRESETS: { name: string; rules: Rules }[] = [
  [6, 5, 6],
  [5, 4, 4],
  [5, 4, 5],
  [5, 4, 6],
  [6, 5, 5],
  [6, 5, 7],
  [7, 5, 6],
  [3, 3, 0],
].map(([n, w, k]) => ({
  name: `${n}×${n} / 连${w} / ${k ? `K${k}` : "永久棋"}`,
  rules: validateRules({
    ...DEFAULT_RULES,
    boardSize: n,
    winLength: w,
    retention: k ? { kind: "fifo", maxStones: k } : { kind: "permanent" },
  }),
}));
export type Result =
  | { kind: "win"; winner: Player; line: number[] }
  | { kind: "draw"; reason: "repetition" | "no-moves" | "ply-limit" };
export interface State {
  rules: Rules;
  turn: Player;
  queues: Record<Player, readonly number[]>;
  ply: number;
  counts: Readonly<Record<string, number>>;
  result: Result | null;
  lastMove: number | null;
}
export const other = (p: Player): Player => (p === "X" ? "O" : "X");
export function positionKey(s: State): string {
  return JSON.stringify([s.rules, s.turn, s.queues.X, s.queues.O]);
}
export function initialState(r: Rules = DEFAULT_RULES): State {
  const s: State = {
    rules: validateRules(r),
    turn: "X",
    queues: { X: [], O: [] },
    ply: 0,
    counts: {},
    result: null,
    lastMove: null,
  };
  return { ...s, counts: { [positionKey(s)]: 1 } };
}
export function legalMoves(s: State): number[] {
  if (s.result) return [];
  const taken = new Set([...s.queues.X, ...s.queues.O]);
  return Array.from({ length: s.rules.boardSize ** 2 }, (_, i) => i).filter(
    (i) => !taken.has(i),
  );
}
const lineCache = new Map<string, number[][]>();
export function lines(r: Rules): number[][] {
  const key = `${r.boardSize}/${r.winLength}`;
  const cached = lineCache.get(key);
  if (cached) return cached;
  const all: number[][] = [],
    n = r.boardSize;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      for (const [dy, dx] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]) {
        const ey = y + (r.winLength - 1) * dy,
          ex = x + (r.winLength - 1) * dx;
        if (ey >= 0 && ey < n && ex >= 0 && ex < n)
          all.push(
            Array.from(
              { length: r.winLength },
              (_, j) => (y + j * dy) * n + x + j * dx,
            ),
          );
      }
  lineCache.set(key, all);
  return all;
}
export function winningLine(s: State, p: Player): number[] | null {
  const occupied = new Set(s.queues[p]);
  return (
    lines(s.rules).find((line) => line.every((i) => occupied.has(i))) ?? null
  );
}
export interface MoveEvent {
  added: number;
  removed: number | null;
  player: Player;
  winningLine: number[];
}
export function applyMove(
  s: State,
  move: number,
): { state: State; event: MoveEvent } {
  if (s.result) throw Error("对局已结束，不能继续落子");
  if (!Number.isInteger(move) || move < 0 || move >= s.rules.boardSize ** 2)
    throw Error("落点坐标超出棋盘");
  if (s.queues.X.includes(move) || s.queues.O.includes(move))
    throw Error("必须在当前空格落子，不能原地续命");
  const queue = [...s.queues[s.turn], move];
  const removed =
    s.rules.retention.kind === "fifo" &&
    queue.length > s.rules.retention.maxStones
      ? queue.shift()!
      : null;
  let next: State = {
    ...s,
    queues: { ...s.queues, [s.turn]: queue },
    ply: s.ply + 1,
    lastMove: move,
  };
  const line = winningLine(next, s.turn);
  if (line) next = { ...next, result: { kind: "win", winner: s.turn, line } };
  else {
    next = { ...next, turn: other(s.turn) };
    const key = positionKey(next),
      count = (s.counts[key] ?? 0) + 1;
    next = { ...next, counts: { ...s.counts, [key]: count } };
    const reason =
      count >= s.rules.repetitionThreshold
        ? "repetition"
        : legalMoves(next).length === 0
          ? "no-moves"
          : s.rules.matchPlyLimit !== null && next.ply >= s.rules.matchPlyLimit
            ? "ply-limit"
            : null;
    if (reason) next = { ...next, result: { kind: "draw", reason } };
  }
  return {
    state: next,
    event: { added: move, removed, player: s.turn, winningLine: line ?? [] },
  };
}
export function replay(rules: Rules, moves: readonly number[]): State[] {
  const states = [initialState(rules)];
  for (const move of moves)
    states.push(applyMove(states[states.length - 1], move).state);
  return states;
}
export const MAX_RECORD_BYTES = 1_000_000,
  MAX_RECORD_MOVES = 10_000;
export interface RecordFile {
  schemaVersion: 1;
  rules: Rules;
  moves: number[];
  metadata?: Record<string, unknown>;
}
export function exportRecord(rules: Rules, moves: number[]): string {
  replay(rules, moves);
  return JSON.stringify({ schemaVersion: 1, rules, moves }, null, 2);
}
export function importRecord(text: string): RecordFile {
  if (new TextEncoder().encode(text).length > MAX_RECORD_BYTES)
    throw Error("棋谱超过 1 MB 限制");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw Error("棋谱不是有效的 JSON");
  }
  if (!raw || typeof raw !== "object") throw Error("棋谱必须是对象");
  const f = raw as RecordFile;
  if (f.schemaVersion !== 1) throw Error("不支持的棋谱版本");
  const rules = validateRules(f.rules);
  if (
    !Array.isArray(f.moves) ||
    f.moves.length > MAX_RECORD_MOVES ||
    !f.moves.every(Number.isInteger)
  )
    throw Error("落子序列须为整数数组，且不超过 10000 手");
  replay(rules, f.moves);
  return { schemaVersion: 1, rules, moves: [...f.moves] };
}
export function undoTarget(states: State[], human: Player | null): number {
  if (human === null) return Math.max(0, states.length - 2);
  for (let i = states.length - 2; i >= 0; i--)
    if (states[i].turn === human && !states[i].result) return i;
  return states.length - 1;
}
