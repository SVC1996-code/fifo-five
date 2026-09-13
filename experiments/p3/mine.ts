import { readFileSync, writeFileSync } from "node:fs";
import { JOBS, RULES, AGENTS } from "./config";
import { hash, type Batch } from "./runner";
import { applyMove, replay, other, type RecordFile } from "../../src/core";
import { chooseMove, evaluate } from "../../src/ai";
import { proveMate } from "../../src/research/mate";
import {
  completions,
  expiringThreats,
  expiryLock,
  expirySwing,
  uniqueDefense,
} from "../../src/research/mining";
import fixtures from "../../fixtures/rule-cases.json";
interface Entry {
  id: string;
  source: { kind: string; gameId: string; ply: number };
  record: RecordFile;
  details: unknown;
}
const libraries: Record<string, Entry[]> = {
  "expiry-lock": [],
  "expiring-threat": [],
  "unique-defense": [],
  "search-disagreement": [],
  "expiry-swing": [],
};
const definitions = {
  "expiry-lock":
    "Defender-to-move full FIFO queue; oldest blocks a geometric enemy win line. Full 2-total-ply proof certifies enemy win against every legal defender action. Candidates not proved are stored separately.",
  "expiring-threat":
    "Current side has a single-empty geometric winning line containing its oldest stone. Real placement removes it, invalidating that particular line; alternate wins are recorded, not excluded.",
  "unique-defense":
    "All legal replies individually verified: exactly one avoids opponent forced win within1 further ply. A not-found result only means safe for this bounded horizon. Unknown cannot certify uniqueness.",
  "search-disagreement":
    "Sampled every8th ply, up to8 distinct prefixes per batch; compare actual tactical/normal/hard research choices, diagnostics, heuristic-after-move and opponent mate-in3 checks (2000 nodes each).",
  "expiry-swing":
    "Post-placement/pre-removal vs stable successor has a changed geometric one-empty completion set for either side. No score threshold. Counterfactual is diagnostic only, never authority for replay/proof.",
};
let scanned = 0;
const seen = new Set<string>(),
  bySource: Record<string, Record<string, number>> = {},
  counts: Record<string, number> = Object.fromEntries(
    Object.keys(libraries).map((k) => [k, 0]),
  ),
  unprovedLocks: Entry[] = [];
function add(kind: string, entry: Entry) {
  counts[kind]++;
  bySource[kind] ??= {};
  bySource[kind][entry.source.kind] =
    (bySource[kind][entry.source.kind] ?? 0) + 1;
  libraries[kind].push(entry);
}
const candidates: {
  record: RecordFile;
  source: Entry["source"];
  nextMove?: number;
  disagreement: boolean;
}[] = [];
for (const job of JOBS) {
  const b: Batch = JSON.parse(
    readFileSync(`experiments/results/p3/${job.id}.json`, "utf8"),
  );
  if (!b.complete) throw Error(`Incomplete ${job.id}`);
  const late: Batch = JSON.parse(
    readFileSync(`experiments/results/p3/${job.id}-late.json`, "utf8"),
  );
  if (!late.complete) throw Error("Incomplete late batch");
  const games = [
    ...new Map(
      [...b.games, ...late.games].map((g) => [g.trajectoryHash, g]),
    ).values(),
  ];
  let disagreementSamples = 0;
  for (const game of games) {
    for (let ply = 0; ply < game.record.moves.length; ply++) {
      const record: RecordFile = {
          schemaVersion: 1,
          rules: game.record.rules,
          moves: game.record.moves.slice(0, ply),
        },
        id = hash(record);
      if (seen.has(id)) continue;
      seen.add(id);
      const disagreement = ply % 8 === 0 && disagreementSamples < 8;
      if (disagreement) disagreementSamples++;
      candidates.push({
        record,
        source: { kind: "experiment", gameId: game.id, ply },
        nextMove: game.record.moves[ply],
        disagreement,
      });
    }
  }
}
for (const [i, c] of fixtures.cases.entries())
  candidates.push({
    record: {
      schemaVersion: 1,
      rules: RULES.C,
      moves: c.prefixMoves.map(([r, c]) => r * 6 + c),
    },
    source: { kind: "reference-fixture", gameId: c.id, ply: 12 },
    nextMove: i === 0 ? 16 : 1,
    disagreement: true,
  });
for (const candidate of candidates) {
  scanned++;
  const { record, source } = candidate,
    state = replay(record.rules, record.moves).at(-1)!;
  if (state.result) continue;
  const entry = (details: unknown): Entry => ({
    id: hash(record),
    source,
    record,
    details,
  });
  const threats = expiringThreats(state);
  if (threats.length) add("expiring-threat", entry(threats));
  const lock = expiryLock(state);
  if (lock) {
    if (lock.proof.result === "forced-win") add("expiry-lock", entry(lock));
    else unprovedLocks.push(entry(lock));
  }
  if (completions(state, other(state.turn)).length) {
    const defense = uniqueDefense(state);
    if (defense?.unique) add("unique-defense", entry(defense));
  }
  if (candidate.nextMove !== undefined) {
    const swing = expirySwing(state, candidate.nextMove);
    if (swing) add("expiry-swing", entry(swing));
  }
  if (candidate.disagreement) {
    const choices = Object.fromEntries(
      ["tactical", "normal", "hard"].map((name) => {
        const agent = AGENTS[name],
          d = chooseMove(state, agent.budget, agent.algorithm);
        return [
          name,
          {
            ...d,
            heuristicAfter:
              d.move === null
                ? null
                : evaluate(applyMove(state, d.move).state, state.turn),
          },
        ];
      }),
    );
    const comparisons = [
      ["tactical", "normal"],
      ["normal", "hard"],
    ].filter(([a, b]) => choices[a].move !== choices[b].move);
    if (comparisons.length) {
      const verification = Object.fromEntries(
        Object.entries(choices).map(([name, d]) => [
          name,
          d.move === null
            ? null
            : proveMate(applyMove(state, d.move).state, {
                maxPly: 3,
                maxNodes: 2000,
                timeMs: null,
              }),
        ]),
      );
      add(
        "search-disagreement",
        entry({
          budgets: AGENTS,
          comparisons,
          choices,
          opponentMateAfterChoice: verification,
        }),
      );
    }
  }
  if (scanned % 500 === 0)
    console.log(`mining ${scanned}/${candidates.length}`);
}
for (const [kind, entries] of Object.entries(libraries))
  writeFileSync(
    `positions/${kind}.json`,
    JSON.stringify(
      {
        schemaVersion: 1,
        definition: definitions[kind as keyof typeof definitions],
        scannedPrefixes: scanned,
        detected: counts[kind],
        bySource: bySource[kind] ?? {},
        saved: entries.length,
        storagePolicy: "all-detected",
        entries,
      },
      null,
      2,
    ),
  );
writeFileSync(
  "positions/unproved-expiry-locks.json",
  JSON.stringify({ entries: unprovedLocks }, null, 2),
);
console.log({
  scanned,
  counts,
  saved: Object.fromEntries(
    Object.entries(libraries).map(([k, v]) => [k, v.length]),
  ),
});
