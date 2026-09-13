import { describe, expect, it } from "vitest";
import before from "../experiments/results/timing-baseline.json";
import after from "../experiments/results/timing-current.json";
import { chooseMove } from "../src/ai";
import { chooseMove as baseline } from "../experiments/p2/baseline-ai";
import { scenarios } from "../experiments/p2/suite";
import { replay, applyMove, legalMoves } from "../src/core";
describe("P2 排序评价缓存保持行为", () => {
  it("已测量的18个同输入样本：着法、PV、分数、节点、完成深度一致", () => {
    expect(before.complete).toBe(true);
    expect(after.complete).toBe(true);
    expect(before.samples).toHaveLength(18);
    const project = (r: (typeof before.samples)[number]) => ({
      scenario: r.scenario,
      rules: r.rules,
      opening: r.opening,
      agent: r.agent,
      move: r.move,
      pv: r.pv,
      score: r.score,
      nodes: r.nodes,
      tacticalNodes: r.tacticalNodes,
      depth: r.depth,
      exhausted: r.exhausted,
    });
    expect(after.samples.map(project)).toEqual(before.samples.map(project));
    for (const r of after.samples) {
      expect(r.tacticalMs).toBeGreaterThanOrEqual(0);
      expect(r.searchMs).toBeGreaterThanOrEqual(0);
      expect(r.tacticalMs + r.searchMs).toBeCloseTo(r.elapsedMs, 6);
    }
  });
  it.each(scenarios)(
    "$id 实时基线对照及一步战术审计",
    (scenario) => {
      const s = replay(scenario.rules, scenario.moves).at(-1)!,
        budget = { maxNodes: 50, timeMs: null, seed: 20260913, maxDepth: 3 };
      const a = baseline(s, budget),
        b = chooseMove(s, budget);
      expect({
        move: b.move,
        score: b.score,
        pv: b.pv,
        depth: b.depth,
        nodes: b.nodes,
      }).toEqual({
        move: a.move,
        score: a.score,
        pv: a.pv,
        depth: a.depth,
        nodes: a.nodes,
      });
      const candidates = legalMoves(s).map((m) => ({
        move: m,
        state: applyMove(s, m).state,
      }));
      const wins = candidates.filter((c) => c.state.result?.kind === "win");
      if (wins.length) expect(wins.map((c) => c.move)).toContain(b.move);
      else {
        const safe = candidates.filter(
          (c) =>
            !legalMoves(c.state).some(
              (m) => applyMove(c.state, m).state.result?.kind === "win",
            ),
        );
        if (safe.length) expect(safe.map((c) => c.move)).toContain(b.move);
      }
    },
    15000,
  );
});
