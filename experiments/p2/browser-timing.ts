import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import { scenarios } from "./suite";
import { replay } from "../../src/core";
import { DIFFICULTIES, type Diagnostics } from "../../src/ai";
const port = 5175,
  base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { windowsHide: true, stdio: "pipe" },
);
let serverError = "";
server.stderr.on("data", (d) => {
  serverError += String(d);
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error(`Vite 启动失败 ${serverError}`);
    try {
      ready = (await fetch(base)).ok;
    } catch {
      /* wait for this owned server */
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error("Vite readiness timeout");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(base);
    const samples: (Diagnostics & {
      scenario: string;
      rules: (typeof scenarios)[number]["rules"];
      opening: number[];
      difficulty: string;
      budget: (typeof DIFFICULTIES)[string];
      repeat: number;
      roundTripMs: number;
    })[] = [];
    const environment = {
      node: process.version,
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      os: `${os.platform()} ${os.release()}`,
      browser: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
    };
    for (const scenario of scenarios)
      for (const difficulty of ["正常", "困难"])
        for (let repeat = 0; repeat < 3; repeat++) {
          const input = {
            state: replay(scenario.rules, scenario.moves).at(-1)!,
            budget: DIFFICULTIES[difficulty],
            gameId: 1,
            requestId: 1,
            algorithm: "search" as const,
          };
          const measured = await page.evaluate(
            (input) =>
              new Promise<{ result: Diagnostics; roundTripMs: number }>(
                (resolve, reject) => {
                  const start = performance.now(),
                    worker = new Worker("/src/workers/search.ts", {
                      type: "module",
                    });
                  const timer = setTimeout(() => {
                    worker.terminate();
                    reject(Error("Worker timeout"));
                  }, 30000);
                  worker.onerror = (e) => {
                    clearTimeout(timer);
                    worker.terminate();
                    reject(Error(e.message));
                  };
                  worker.onmessage = (e) => {
                    clearTimeout(timer);
                    worker.terminate();
                    if (e.data.error) reject(Error(e.data.error));
                    else
                      resolve({
                        result: e.data.result,
                        roundTripMs: performance.now() - start,
                      });
                  };
                  worker.postMessage(input);
                },
              ),
            input,
          );
          samples.push({
            scenario: scenario.id,
            rules: scenario.rules,
            opening: scenario.moves,
            difficulty,
            budget: input.budget,
            repeat,
            ...measured.result,
            roundTripMs: measured.roundTripMs,
          });
          writeFileSync(
            "experiments/results/timing-browser.json",
            JSON.stringify({ complete: false, environment, samples }, null, 2),
          );
          console.log(
            `${scenario.id}/${difficulty} ${repeat + 1}/3 total=${measured.result.elapsedMs.toFixed(1)}ms roundtrip=${measured.roundTripMs.toFixed(1)}ms`,
          );
        }
    const stats = (a: number[]) => {
      a.sort((x, y) => x - y);
      return {
        samples: a.length,
        median: a[Math.floor(a.length / 2)],
        p95: a[Math.ceil(a.length * 0.95) - 1],
        max: a.at(-1),
      };
    };
    const groups = scenarios.flatMap((s) =>
      ["正常", "困难"].map((d) => {
        const rows = samples.filter(
          (r) => r.scenario === s.id && r.difficulty === d,
        );
        return {
          scenario: s.id,
          difficulty: d,
          tactical: stats(rows.map((r) => r.tacticalMs)),
          search: stats(rows.map((r) => r.searchMs)),
          total: stats(rows.map((r) => r.elapsedMs)),
          roundTrip: stats(rows.map((r) => r.roundTripMs)),
        };
      }),
    );
    writeFileSync(
      "experiments/results/timing-browser.json",
      JSON.stringify(
        {
          complete: true,
          generatedAt: new Date().toISOString(),
          environment,
          method:
            "Chromium headless, fresh real Worker each observation, production difficulty wall-clock budgets, Vite development server, no warmup, three observations per cell. Round-trip includes worker startup/message cloning/dev-module loading. P95 nearest rank; n=3 gives max. No claim of stable performance.",
          sampleCount: samples.length,
          groups,
          samples,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
