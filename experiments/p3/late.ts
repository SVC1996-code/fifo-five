import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { runGame, summarize, hash, type Batch, type Game } from "./runner";
import { JOBS, SETTINGS, type Opening } from "./config";
const job = JOBS.find((j) => j.id === process.argv[2]);
if (!job) throw Error("Unknown late-opening job");
const base: Batch & { plan: { openings: Opening[] } } = JSON.parse(
  readFileSync(`experiments/results/p3/${job.id}.json`, "utf8"),
);
if (!base.complete) throw Error("Primary batch incomplete");
const path = `experiments/results/p3/${job.id}-late.json`,
  existing: { complete: boolean; games: Game[] } | null = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : null,
  games = existing?.games ?? [];
if (!existing?.complete) {
  for (const opening of base.plan.openings)
    for (const seed of SETTINGS.seeds)
      for (const swapped of [false, true]) {
        const id = `${job.rule}/${job.pair.join("-")}/${opening.id}/${seed}/${swapped}/60`;
        if ([...base.games, ...games].some((g) => g.id === id)) continue;
        games.push(runGame(job.rule, job.pair, opening, seed, swapped, 60));
        writeFileSync(
          path,
          JSON.stringify({ complete: false, games }, null, 2),
        );
        console.log(
          `${job.id} late ${games.length}: ${summarize(games).unique} unique`,
        );
      }
}
writeFileSync(
  path,
  JSON.stringify(
    {
      complete: true,
      sourceHash: hash(base),
      method:
        "Complete every remaining fixed opening/seed/role combination to cover post-deletion midgames, regardless of pilot outcomes. Already executed primary combinations are excluded.",
      games,
      summary: summarize(games),
    },
    null,
    2,
  ),
);
