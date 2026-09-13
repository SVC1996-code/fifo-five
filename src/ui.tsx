import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_RULES,
  PRESETS,
  applyMove,
  exportRecord,
  importRecord,
  MAX_RECORD_BYTES,
  replay,
  undoTarget,
  validateRules,
  type Player,
  type Rules,
} from "./core";
import { DIFFICULTIES, type Diagnostics } from "./ai";
import type { SearchRequest, SearchResponse } from "./workers/search";
import { readSave, writeSave, type Settings } from "./storage";
const reasons = {
  repetition: "完整局面第三次出现",
  "no-moves": "无合法落点",
  "ply-limit": "达到公开规则手数上限",
};
const stoneName = (p: Player) => (p === "X" ? "黑棋" : "白棋");
const RECOMMENDED = [
  {
    name: "Mini",
    caption: "小棋盘，步步紧凑",
    rules: {
      ...DEFAULT_RULES,
      boardSize: 3,
      winLength: 3,
      retention: { kind: "fifo", maxStones: 3 },
    },
  },
  {
    name: "Classic",
    caption: "留住连线，把握棋龄",
    rules: { ...DEFAULT_RULES, retention: { kind: "fifo", maxStones: 7 } },
  },
] satisfies { name: string; caption: string; rules: Rules }[];
function Stone({
  player,
  cracked = false,
}: {
  player: Player;
  cracked?: boolean;
}) {
  return (
    <span aria-hidden="true" className={`stone stone-${player}`}>
      {cracked && (
        <svg className="crack" viewBox="0 0 100 100">
          <path d="M40 2 48 28 35 45 54 59 46 80 58 98 M35 45 12 52 M54 59 78 47 94 53" />
        </svg>
      )}
    </span>
  );
}
export function App() {
  const [startup] = useState(() => readSave(() => window.localStorage));
  const [pendingRestore, setPendingRestore] = useState(!!startup.error);
  const [saveError, setSaveError] = useState("");
  const [rules, setRules] = useState(
      startup.saved?.record.rules ?? DEFAULT_RULES,
    ),
    [draft, setDraft] = useState(startup.saved?.record.rules ?? DEFAULT_RULES);
  const [moves, setMoves] = useState<number[]>(
      startup.saved?.record.moves ?? [],
    ),
    [state, setState] = useState(() =>
      replay(
        startup.saved?.record.rules ?? DEFAULT_RULES,
        startup.saved?.record.moves ?? [],
      ).at(-1)!,
    );
  const [mode, setMode] = useState<Settings["mode"]>(
      startup.saved?.settings.mode ?? "人机",
    ),
    [human, setHuman] = useState<Player>(startup.saved?.settings.human ?? "X"),
    [difficulty, setDifficulty] = useState(
      startup.saved?.settings.difficulty ?? "正常",
    );
  const [age, setAge] = useState(startup.saved?.settings.age ?? true),
    [error, setError] = useState(""),
    [thinking, setThinking] = useState(false),
    [diag, setDiag] = useState<Diagnostics | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [burst, setBurst] = useState<{
    cell: number;
    player: Player;
    id: number;
  } | null>(null);
  const burstId = useRef(0);
  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(null), 400);
    return () => window.clearTimeout(timer);
  }, [burst]);
  const worker = useRef<Worker | null>(null),
    gameId = useRef(0),
    requestId = useRef(0);
  const states = useMemo(() => replay(rules, moves), [rules, moves]);
  const visible = cursor === null ? state : states[cursor];
  const target = undoTarget(states, mode === "人机" ? human : null);
  function cancel() {
    gameId.current++;
    worker.current?.terminate();
    worker.current = null;
    setThinking(false);
  }
  function replace(nextRules: Rules, nextMoves: number[]) {
    cancel();
    setPendingRestore(false);
    setResultOpen(false);
    setBurst(null);
    setPreview(null);
    setRules(nextRules);
    setMoves(nextMoves);
    setState(replay(nextRules, nextMoves).at(-1)!);
    setCursor(null);
    setDiag(null);
    setError("");
  }
  function restart() {
    try {
      const r = validateRules(draft);
      replace(r, []);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function play(move: number) {
    if (
      cursor !== null ||
      thinking ||
      state.result ||
      (mode === "人机" && state.turn !== human)
    )
      return;
    try {
      const next = applyMove(state, move);
      setPendingRestore(false);
      setResultOpen(!!next.state.result);
      showRemoval(next.event.removed, state.turn);
      setState(next.state);
      setMoves([...moves, move]);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function showRemoval(cell: number | null, player: Player) {
    setPreview(null);
    setBurst(cell === null ? null : { cell, player, id: ++burstId.current });
  }
  function seek(next: number) {
    setCursor(next);
    setBurst(null);
    setPreview(null);
    if (next > 0) {
      const before = states[next - 1];
      showRemoval(
        applyMove(before, moves[next - 1]).event.removed,
        before.turn,
      );
    }
  }
  useEffect(() => {
    if (pendingRestore || cursor !== null) return;
    setSaveError(
      writeSave(() => window.localStorage, {
        saveVersion: 1,
        record: { schemaVersion: 1, rules, moves },
        settings: { mode, human, difficulty, age },
      }),
    );
  }, [rules, moves, mode, human, difficulty, age, pendingRestore, cursor]);
  useEffect(() => {
    if (
      pendingRestore ||
      cursor !== null ||
      mode !== "人机" ||
      state.result ||
      state.turn === human
    )
      return;
    const w = new Worker(new URL("./workers/search.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    const g = gameId.current,
      id = ++requestId.current;
    setThinking(true);
    w.onmessage = (e: MessageEvent<SearchResponse>) => {
      if (
        gameId.current !== g ||
        requestId.current !== id ||
        e.data.gameId !== g ||
        e.data.requestId !== id
      )
        return;
      setThinking(false);
      w.terminate();
      worker.current = null;
      if (e.data.error) {
        setError(`AI 搜索失败：${e.data.error}`);
        return;
      }
      const d = e.data.result!;
      setDiag(d);
      if (d.move !== null) {
        const next = applyMove(state, d.move);
        setResultOpen(!!next.state.result);
        showRemoval(next.event.removed, state.turn);
        setState(next.state);
        setMoves((m) => [...m, d.move!]);
      }
    };
    w.onerror = () => {
      if (gameId.current === g && requestId.current === id) {
        setThinking(false);
        setError("AI Worker 加载失败，请重新开始");
      }
      w.terminate();
    };
    w.postMessage({
      gameId: g,
      requestId: id,
      state,
      budget: DIFFICULTIES[difficulty],
      algorithm: difficulty === "简单" ? "tactical" : "search",
    } satisfies SearchRequest);
    return () => {
      w.terminate();
      requestId.current++;
    };
  }, [state, mode, human, difficulty, cursor, pendingRestore]);
  async function load(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_RECORD_BYTES) throw Error("棋谱超过 1 MB 限制");
      const record = importRecord(await file.text());
      setDraft(record.rules);
      replace(record.rules, record.moves);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([exportRecord(rules, moves)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "fifo-five.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const status = visible.result
    ? visible.result.kind === "win"
      ? `${stoneName(visible.result.winner)} 获胜`
      : `和棋：${reasons[visible.result.reason]}`
    : `轮到 ${stoneName(visible.turn)}`;
  const canPlay =
    cursor === null &&
    !thinking &&
    !visible.result &&
    (mode !== "人机" || visible.turn === human);
  const leaving =
    rules.retention.kind === "fifo" &&
    visible.queues[visible.turn].length === rules.retention.maxStones
      ? visible.queues[visible.turn][0]
      : null;
  const coord = (cell: number) =>
    `${Math.floor(cell / rules.boardSize) + 1}行${(cell % rules.boardSize) + 1}列`;
  const lastRemoval =
    visible.ply > 0
      ? applyMove(states[visible.ply - 1], moves[visible.ply - 1]).event.removed
      : null;
  return (
    <main>
      <header>
        <span className="eyebrow">落子 · 流转 · 连线</span>
        <h1>
          FIFO <em>Five</em>
        </h1>
        <p>每一步向前，最老的棋子终将离场。</p>
      </header>
      <div className="layout">
        <section className="play-panel">
          <div className="status" aria-live="polite">
            <h2>{status}</h2>
            <span>
              第 {visible.ply} 手 {cursor !== null && "· 只读回放"}
            </span>
          </div>
          <p className="summary">
            {rules.boardSize}×{rules.boardSize} · 连续至少 {rules.winLength} 枚
            ·{" "}
            {rules.retention.kind === "fifo"
              ? `每人保留 ${rules.retention.maxStones} 枚`
              : "永久棋"}{" "}
            ·{" "}
            {rules.matchPlyLimit
              ? `规则上限 ${rules.matchPlyLimit} 手`
              : "无手数上限"}
          </p>
          <div
            className="board"
            role="group"
            aria-label="棋盘"
            style={{ gridTemplateColumns: `repeat(${rules.boardSize},1fr)` }}
          >
            {Array.from({ length: rules.boardSize ** 2 }, (_, cell) => {
              const p = visible.queues.X.includes(cell)
                ? "X"
                : visible.queues.O.includes(cell)
                  ? "O"
                  : null;
              const index = p ? visible.queues[p].indexOf(cell) : -1;
              const expires =
                p &&
                rules.retention.kind === "fifo" &&
                visible.queues[p].length === rules.retention.maxStones &&
                index === 0;
              const win =
                visible.result?.kind === "win" &&
                visible.result.line.includes(cell);
              return (
                <button
                  key={cell}
                  className={`cell ${p ?? ""} ${expires ? "expires" : ""} ${win ? "win" : ""} ${visible.lastMove === cell ? "last" : ""} ${canPlay && preview !== null && cell === leaving ? "will-remove" : ""}`}
                  aria-label={`${Math.floor(cell / rules.boardSize) + 1}行${(cell % rules.boardSize) + 1}列 ${p ?? "空格"}${expires ? " 本方下次落子后消失" : ""}`}
                  aria-disabled={
                    !!p || !!visible.result || thinking || cursor !== null
                  }
                  onClick={() => play(cell)}
                  onPointerEnter={() => setPreview(!p && canPlay ? cell : null)}
                  onPointerLeave={() => setPreview(null)}
                  onFocus={() => setPreview(!p && canPlay ? cell : null)}
                  onBlur={() => setPreview(null)}
                  onKeyDown={(e) => {
                    const delta: Record<string, number> = {
                      ArrowRight: 1,
                      ArrowLeft: -1,
                      ArrowDown: rules.boardSize,
                      ArrowUp: -rules.boardSize,
                    };
                    if (e.key in delta) {
                      e.preventDefault();
                      const next = cell + delta[e.key];
                      if (next >= 0 && next < rules.boardSize ** 2)
                        (
                          e.currentTarget.parentElement?.children[
                            next
                          ] as HTMLButtonElement
                        ).focus();
                    }
                  }}
                >
                  {p && <Stone player={p} cracked={!!expires} />}
                  {!p && canPlay && preview === cell && (
                    <span className="ghost">
                      <Stone player={visible.turn} />
                    </span>
                  )}
                  {burst?.cell === cell && (
                    <span
                      key={burst.id}
                      className={`shatter stone-${burst.player}`}
                      data-testid="shatter"
                      aria-hidden="true"
                    >
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={`shard shard-${i}`} />
                      ))}
                    </span>
                  )}
                  {p && age && rules.retention.kind === "fifo" && (
                    <small>{index + 1}</small>
                  )}
                  {expires && <i aria-hidden="true">⌛</i>}
                </button>
              );
            })}
          </div>
          {resultOpen && cursor === null && state.result && (
            <div className="result-layer">
              <section
                className={`result-card ${state.result.kind === "draw" ? "draw" : mode === "人机" && state.result.winner !== human ? "defeat" : "victory"}`}
                role="dialog"
                aria-label="对局结束"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setResultOpen(false);
                }}
              >
                {state.result.kind === "win" &&
                  (mode !== "人机" || state.result.winner === human) && (
                    <div className="fireworks" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <span className={`firework firework-${i}`} key={i}>
                          {Array.from({ length: 12 }, (_, j) => (
                            <i
                              key={j}
                              style={{ transform: `rotate(${j * 30}deg)` }}
                            >
                              <b />
                            </i>
                          ))}
                        </span>
                      ))}
                    </div>
                  )}
                <span className="result-emblem" aria-hidden="true">
                  {state.result.kind === "draw"
                    ? "◇"
                    : mode === "人机" && state.result.winner !== human
                      ? "☾"
                      : "✦"}
                </span>
                <h2>
                  {state.result.kind === "draw"
                    ? "握手言和"
                    : mode === "人机"
                      ? state.result.winner === human
                        ? "漂亮，你赢了！"
                        : "这次惜败"
                      : "精彩的一局"}
                </h2>
                <p>
                  {state.result.kind === "win"
                    ? `${stoneName(state.result.winner)}连线成功`
                    : reasons[state.result.reason]}
                </p>
                <p className="result-steps">
                  共走了 <strong>{state.ply}</strong> 步
                </p>
                <div className="actions">
                  <button
                    className="primary"
                    onClick={() => {
                      setDraft(rules);
                      replace(rules, []);
                    }}
                  >
                    再来一局
                  </button>
                  <button onClick={() => setResultOpen(false)}>取消</button>
                </div>
                <small>取消后保留棋盘，可悔棋或查看回放</small>
              </section>
            </div>
          )}
        </section>
        <aside className="control-panel">
          {pendingRestore && (
            <p role="alert" className="error">
              {startup.error}。已打开空棋盘，落子或新游戏后重新存档。
            </p>
          )}
          <nav className="mode-cards" aria-label="推荐模式">
            {RECOMMENDED.map((item) => (
              <button
                key={item.name}
                className="mode-card"
                aria-pressed={
                  JSON.stringify(rules) === JSON.stringify(item.rules)
                }
                onClick={() => {
                  setDraft(item.rules);
                  replace(item.rules, []);
                }}
              >
                <strong>{item.name}</strong>
                <span>
                  {item.rules.boardSize}×{item.rules.boardSize} · 连
                  {item.rules.winLength} · K
                  {item.rules.retention.kind === "fifo"
                    ? item.rules.retention.maxStones
                    : "∞"}
                </span>
                <small>{item.caption} · 点击开始新局</small>
              </button>
            ))}
          </nav>
          <p
            className={`expiry-notice ${canPlay && leaving !== null ? "active" : ""}`}
            aria-live="polite"
          >
            {cursor !== null
              ? lastRemoval !== null
                ? `回放：本步先落子，再移除 ${coord(lastRemoval)} 的最老棋。`
                : "只读回放 · 拖动进度查看每一步"
              : !visible.result && leaving !== null
                ? `${stoneName(visible.turn)}落子后，${coord(leaving)} 的最老棋将碎裂离场。不能在原格续命。`
                : "先落新棋，再移除最老棋，最后判胜。"}
          </p>
          <div className="queue-info">
            {(["X", "O"] as const).map((p) => (
              <div
                className="queue-row"
                key={p}
                aria-label={`${stoneName(p)}寿命队列`}
              >
                <b>
                  {stoneName(p)}
                  {mode === "人机"
                    ? p === human
                      ? " · 你"
                      : " · 电脑"
                    : p === "X"
                      ? " · 先手"
                      : " · 后手"}
                </b>
                <span className="queue-direction">
                  最老 → 最新 · {visible.queues[p].length} 枚
                </span>
                <div className="queue-stones">
                  {visible.queues[p].map((cell, index) => (
                    <span
                      key={cell}
                      title={`${coord(cell)} · 棋龄 ${index + 1}`}
                      className={`queue-item ${index === 0 ? "queue-oldest" : ""}`}
                    >
                      <Stone
                        player={p}
                        cracked={
                          index === 0 &&
                          rules.retention.kind === "fifo" &&
                          visible.queues[p].length === rules.retention.maxStones
                        }
                      />
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <label>
              <input
                type="checkbox"
                checked={age}
                onChange={(e) => setAge(e.target.checked)}
              />{" "}
              显示棋龄
            </label>
          </div>
          <p className="search" aria-live="polite">
            {thinking
              ? "电脑思考中…"
              : diag
                ? `搜索完成深度 ${diag.depth} · ${diag.nodes} 搜索节点 · ${diag.tacticalNodes} 战术节点${diag.exhausted ? " · 已达预算" : ""}`
                : rules.retention.kind === "fifo"
                  ? "裂纹与沙漏标出即将到期的棋；指向空格，可预览本步移除位置。"
                  : "永久棋模式：棋子不会到期删除。"}
          </p>
          <div className="actions">
            <button className="primary" onClick={restart}>
              新游戏
            </button>
            <button
              disabled={cursor !== null || target === moves.length}
              onClick={() => replace(rules, moves.slice(0, target))}
            >
              悔棋
            </button>
            <button onClick={download}>导出棋谱</button>
            <label className="file-button">
              导入棋谱
              <input
                aria-label="导入棋谱"
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  void load(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="replay">
            <button
              disabled={!moves.length}
              onClick={() => {
                cancel();
                setBurst(null);
                setPreview(null);
                setCursor(cursor === null ? 0 : null);
              }}
            >
              {" "}
              {cursor === null ? "进入回放" : "返回对局"}
            </button>
            {cursor !== null && (
              <>
                <input
                  aria-label="回放手数"
                  type="range"
                  min="0"
                  max={moves.length}
                  value={cursor}
                  onChange={(e) => seek(+e.target.value)}
                />
                <span>
                  {cursor}/{moves.length}
                </span>
              </>
            )}
          </div>
          <p className="hint" role="status">
            {saveError || "已自动保存到此浏览器；回放不会覆盖对局存档。"}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}

          <section className="card">
            <h2>对局设置</h2>
            <label>
              对战方式
              <select
                value={mode}
                onChange={(e) => {
                  cancel();
                  setMode(e.target.value as Settings["mode"]);
                  replace(rules, []);
                }}
              >
                <option>人机</option>
                <option>同机双人</option>
              </select>
            </label>
            <label>
              玩家执子
              <select
                value={human}
                onChange={(e) => {
                  setHuman(e.target.value as Player);
                  replace(rules, []);
                }}
              >
                <option value="X">黑棋 · 先手</option>
                <option value="O">白棋 · 后手</option>
              </select>
            </label>
            <label>
              电脑难度
              <select
                value={difficulty}
                onChange={(e) => {
                  cancel();
                  setDifficulty(e.target.value);
                }}
              >
                {Object.keys(DIFFICULTIES).map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <p className="hint">切换对战方式或执子会重新开局。</p>
          </section>
          <details className="card experimental">
            <summary>自定义 / 实验模式</summary>
            <p className="hint">
              保留原默认 6×6 / 连5 /
              K6、全部预设和规则参数。编辑后点击“新游戏”应用。
            </p>
            <label>
              预设
              <select
                aria-label="规则预设"
                value={PRESETS.findIndex(
                  (p) => JSON.stringify(p.rules) === JSON.stringify(draft),
                )}
                onChange={(e) => {
                  if (+e.target.value >= 0)
                    setDraft(PRESETS[+e.target.value].rules);
                }}
              >
                <option value={-1}>自定义</option>
                {PRESETS.map((p, i) => (
                  <option key={p.name} value={i}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="fields">
              <label>
                棋盘边长
                <input
                  type="number"
                  value={draft.boardSize}
                  min="3"
                  max="9"
                  onChange={(e) =>
                    setDraft({ ...draft, boardSize: +e.target.value })
                  }
                />
              </label>
              <label>
                连线长度
                <input
                  type="number"
                  value={draft.winLength}
                  min="3"
                  max="9"
                  onChange={(e) =>
                    setDraft({ ...draft, winLength: +e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              保留策略
              <select
                value={draft.retention.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    retention:
                      e.target.value === "fifo"
                        ? { kind: "fifo", maxStones: draft.winLength }
                        : { kind: "permanent" },
                  })
                }
              >
                <option value="fifo">FIFO · 先入先出</option>
                <option value="permanent">永久棋</option>
              </select>
            </label>
            {draft.retention.kind === "fifo" && (
              <label>
                每人棋子上限
                <input
                  type="number"
                  value={draft.retention.maxStones}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      retention: { kind: "fifo", maxStones: +e.target.value },
                    })
                  }
                />
              </label>
            )}
            <label>
              规则手数上限（留空不限）
              <input
                type="number"
                min="1"
                value={draft.matchPlyLimit ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    matchPlyLimit:
                      e.target.value === "" ? null : +e.target.value,
                  })
                }
              />
            </label>
            <p className="hint">
              规则编辑只在点击“新游戏”后生效，当前对局将重置。不同参数不保证平衡。
            </p>
          </details>
          <details className="card">
            <summary>如何下棋</summary>
            <p>
              在当前空格落子 → 删除本方超额的最老棋 →
              检查连线。不能在即将消失的原格续命，暂时连线不算赢。
            </p>
            <p>
              横、竖、两条斜线连续至少达到目标即获胜。完整局面（包括行动方和棋龄顺序）第三次出现，或无合法落点时和棋。
            </p>
            <p>
              简单难度使用精确一手战术；正常与困难使用同一 Alpha-Beta
              搜索器。搜索分数不是胜率，限预算搜索不代表数学证明。
            </p>
            <p>键盘 Tab 选择控件，方向键移动棋盘焦点，Enter 或空格落子。</p>
          </details>
        </aside>
      </div>
      <footer>FIFO Five · 本地对局，无需账号</footer>
    </main>
  );
}
