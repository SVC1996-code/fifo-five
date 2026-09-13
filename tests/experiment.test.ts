import { describe, expect, it } from "vitest";
import output from "../experiments/smoke-results.json";
import { applyMove, importRecord, initialState } from "../src/core";
describe("真实实验结果可重放", () => {
  it("每局棋谱、终局与删除统计一致", () => {
    for (const batch of output.batches)
      for (const game of batch.games) {
        const record = importRecord(JSON.stringify(game.record));
        let s = initialState(record.rules),
          deletions = 0,
          first: number | null = null;
        for (const m of record.moves) {
          const next = applyMove(s, m);
          s = next.state;
          if (next.event.removed !== null) {
            deletions++;
            first ??= s.ply;
          }
        }
        expect(s.result ?? { kind: "cutoff" }).toEqual(game.result);
        expect(s.ply).toBe(game.plies);
        expect(deletions).toBe(game.deletions);
        expect(first).toBe(game.firstDeletionPly);
        if (game.result.kind === "cutoff")
          expect(s.ply).toBe(batch.config.cutoff);
      }
  });
});
