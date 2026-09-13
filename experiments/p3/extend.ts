import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { runGame, summarize, hash, type Batch, type Game } from "./runner";
import { SETTINGS, JOBS } from "./config";
const job = process.argv[2];
if (!JOBS.some((j) => j.id === job)) throw Error("Unknown extension job");
const baseline: Batch = JSON.parse(
  readFileSync(`experiments/results/p3/${job}.json`, "utf8"),
);
if (!baseline.complete) throw Error("60-ply batch incomplete");
const late: Batch = JSON.parse(
  readFileSync(`experiments/results/p3/${job}-late.json`, "utf8"),
);
if (!late.complete) throw Error("Late-opening batch incomplete");
const unique = [
  ...new Map(
    [...baseline.games, ...late.games].map((g) => [g.trajectoryHash, g]),
  ).values(),
];
const cutoffs = unique.filter((g) => g.result.kind === "cutoff");
const selected =
  cutoffs.length / unique.length >= SETTINGS.extensionTrigger
    ? cutoffs.slice(0, SETTINGS.extensionMaxUnique)
    : [];
const path = `experiments/results/p3/${job}-100.json`;
const previous: { games: Game[]; complete: boolean } | null = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : null;
const games = previous?.games ?? [];
if (!previous?.complete) {
  for (const old of selected) {
    if (games.some((g) => g.id === old.id.replace("/60", "/100"))) continue;
    const next = runGame(
      old.rule,
      old.pair,
      old.opening,
      old.seed,
      old.swapped,
      SETTINGS.extensionCutoff,
    );
    if (
      JSON.stringify(next.record.moves.slice(0, old.plies)) !==
      JSON.stringify(old.record.moves)
    )
      throw Error("Deterministic continuation mismatch");
    games.push(next);
    writeFileSync(path, JSON.stringify({ complete: false, games }, null, 2));
    console.log(
      `${job} 100-ply ${games.length}/${selected.length}: ${JSON.stringify(next.result)}`,
    );
  }
}
writeFileSync(
  path,
  JSON.stringify(
    {
      complete: true,
      sourceHash: hash(baseline),
      method:
        "Only the first up-to-four distinct 60-ply cutoffs per batch if cutoff share >=25%; same opening/seed/roles, rerun to100. Conditional follow-up, NOT pooled with the original60 sample.",
      eligibleCutoffs: cutoffs.length,
      selected: selected.map((g) => g.id),
      games,
      summary: summarize(games),
    },
    null,
    2,
  ),
);
