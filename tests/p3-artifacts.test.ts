import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { JOBS, SETTINGS } from "../experiments/p3/config";
import { type Batch } from "../experiments/p3/runner";
import { metrics } from "../experiments/p3/metrics";
import { applyMove, importRecord, replay, type RecordFile } from "../src/core";
import { proveMate, type MateResult } from "../src/research/mate";
import {
  expiryLock,
  uniqueDefense,
  expiringThreats,
  expirySwing,
} from "../src/research/mining";
const load = (name: string): Batch =>
  JSON.parse(readFileSync(`experiments/results/p3/${name}.json`, "utf8"));
it("P3 每组20开局/双角色/双seed覆盖，所有原始棋谱与删除统计可重放", () => {
  for (const job of JOBS) {
    const a = load(job.id),
      b = load(`${job.id}-late`);
    expect(a.complete && b.complete).toBe(true);
    const games = [...a.games, ...b.games];
    expect(games).toHaveLength(20 * 2 * SETTINGS.seeds.length);
    expect(new Set(games.map((g) => g.opening.id)).size).toBe(20);
    expect(metrics(games).uniqueTrajectories).toBeGreaterThanOrEqual(20);
    for (const g of games) {
      const record = importRecord(JSON.stringify(g.record)),
        states = replay(record.rules, record.moves);
      let deletions = 0,
        first: number | null = null;
      for (let i = 0; i < record.moves.length; i++)
        if (applyMove(states[i], record.moves[i]).event.removed !== null) {
          deletions++;
          first ??= i + 1;
        }
      expect(deletions).toBe(g.deletions);
      expect(first).toBe(g.firstDeletionPly);
      expect(states.at(-1)!.result ?? { kind: "cutoff" }).toEqual(g.result);
      if (g.result.kind === "cutoff") expect(g.plies).toBe(60);
    }
  }
}, 60000);
it("100-ply是原60ply完整前缀的确定性继续，不冒充额外独立样本", () => {
  for (const job of JOBS) {
    const source = [...load(job.id).games, ...load(`${job.id}-late`).games],
      extended = load(`${job.id}-100`);
    expect(extended.complete).toBe(true);
    for (const g of extended.games) {
      const old = source.find((x) => x.id === g.id.replace("/100", "/60"))!;
      expect(old.result.kind).toBe("cutoff");
      expect(g.record.moves.slice(0, 60)).toEqual(old.record.moves);
      const r = importRecord(JSON.stringify(g.record));
      expect(
        replay(r.rules, r.moves).at(-1)!.result ?? { kind: "cutoff" },
      ).toEqual(g.result);
    }
  }
});
it("全部cutoff时Activation分母为0而非伪装0%或和棋", () => {
  const example = load("C-normal-tactical").games.find(
    (g) => g.result.kind === "cutoff",
  )!;
  const m = metrics([example, example]);
  expect(m.executed).toBe(2);
  expect(m.uniqueTrajectories).toBe(1);
  expect(m.fifoActivation.rate).toBeNull();
  expect(m.terminalLengths.n).toBe(0);
  expect(m.counts.repetition).toBe(0);
  expect(m.counts.cutoff).toBe(1);
});
it("参考证明PV逐手合法，最终确实由指定攻击方获胜", () => {
  const corpus: {
    results: {
      record: RecordFile;
      attacker: "X" | "O";
      proofs: MateResult[];
    }[];
  } = JSON.parse(
    readFileSync("experiments/results/p3/mate-corpus.json", "utf8"),
  );
  for (const c of corpus.results) {
    const s = replay(c.record.rules, c.record.moves).at(-1)!;
    for (const p of c.proofs) {
      if (p.result === "forced-win") {
        const end = replay(c.record.rules, [
          ...c.record.moves,
          ...p.principalVariation!,
        ]).at(-1)!;
        expect(end.result).toMatchObject({ kind: "win", winner: c.attacker });
        expect(p.principalVariation!.length).toBe(p.distance);
        expect(p.distance).toBeLessThanOrEqual(p.maxPly);
      }
      if (p.maxPly <= 3)
        expect(
          proveMate(s, {
            attacker: c.attacker,
            maxPly: p.maxPly,
            maxNodes: 50000,
            timeMs: null,
          }).result,
        ).toBe(p.result);
    }
  }
});
it("战术库全部记录可合法重放，已证锁与唯一短期防守没有unknown冒充", () => {
  for (const kind of [
    "expiry-lock",
    "expiring-threat",
    "unique-defense",
    "search-disagreement",
    "expiry-swing",
  ]) {
    const data: {
      detected: number;
      saved: number;
      entries: { record: RecordFile; details: unknown }[];
    } = JSON.parse(readFileSync(`positions/${kind}.json`, "utf8"));
    expect(data.saved).toBe(data.entries.length);
    expect(data.detected).toBe(data.saved);
    for (const e of data.entries) {
      const r = importRecord(JSON.stringify(e.record));
      const state = replay(r.rules, r.moves).at(-1)!;
      expect(state.result).toBeNull();
      if (kind === "expiry-lock") {
        const detail = e.details as { attacker: "X" | "O"; proof: MateResult };
        expect(detail.proof.result).toBe("forced-win");
        expect(expiryLock(state)?.proof.result).toBe("forced-win");
      }
      if (kind === "unique-defense") {
        const detail = e.details as { replies: { proof: MateResult }[] };
        expect(
          detail.replies.filter((r) => r.proof.result === "not-found"),
        ).toHaveLength(1);
        expect(detail.replies.some((r) => r.proof.result === "unknown")).toBe(
          false,
        );
        expect(uniqueDefense(state)?.unique).toBe(true);
      }
      if (kind === "expiring-threat")
        expect(expiringThreats(state).length).toBeGreaterThan(0);
      if (kind === "expiry-swing") {
        const detail = e.details as { move: number };
        expect(expirySwing(state, detail.move)).not.toBeNull();
      }
    }
  }
}, 60000);
