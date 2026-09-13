import { test, expect } from "@playwright/test";
import fixtures from "../../fixtures/rule-cases.json" with { type: "json" };
import { DEFAULT_RULES } from "../../src/core";
const upload = (moves: number[]) => ({
  name: "fifo.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({ schemaVersion: 1, rules: DEFAULT_RULES, moves }),
  ),
});
test("FIFO 满额只标双方最老棋，永久棋隐藏棋龄", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("对战方式").selectOption("同机双人");
  await page
    .getByLabel("导入棋谱", { exact: true })
    .setInputFiles(
      upload(fixtures.cases[0].prefixMoves.map(([r, c]) => r * 6 + c)),
    );
  await expect(
    page.getByRole("button", { name: /本方下次落子后消失/ }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "3行1列 X 本方下次落子后消失" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "6行1列 O 本方下次落子后消失" }),
  ).toBeVisible();
  await page.getByLabel("显示棋龄").uncheck();
  await expect(page.locator(".cell small")).toHaveCount(0);
  await page.getByText("自定义 / 实验模式", { exact: true }).click();
  await page.getByLabel("规则预设").selectOption("7");
  await page.getByRole("button", { name: "新游戏", exact: true }).click();
  await page.getByRole("button", { name: "1行1列 空格" }).click();
  await expect(
    page.getByRole("button", { name: /本方下次落子后消失/ }),
  ).toHaveCount(0);
  await expect(page.locator(".cell small")).toHaveCount(0);
});
test("人为迟到 Worker 响应不能修改重开/悔棋/换规则/导入后的对局", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class DelayedWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      postMessage(data: {
        gameId: number;
        requestId: number;
        state: {
          queues: { X: number[]; O: number[] };
          rules: { boardSize: number };
        };
      }) {
        const occupied = [...data.state.queues.X, ...data.state.queues.O];
        let move = 0;
        while (occupied.includes(move)) move++;
        setTimeout(
          () =>
            this.onmessage?.({
              data: {
                gameId: data.gameId,
                requestId: data.requestId,
                result: {
                  move,
                  depth: 1,
                  nodes: 1,
                  tacticalNodes: 0,
                  elapsedMs: 1,
                  exhausted: false,
                  pv: [move],
                  score: 0,
                  safeMoves: 1,
                  algorithmVersion: "test-delayed",
                },
              },
            }),
          700,
        );
      }
      terminate() {} // Deliberately deliver after termination to exercise ID guards.
    }
    Object.defineProperty(window, "Worker", { value: DelayedWorker });
  });
  await page.goto("/");
  for (const action of ["新游戏", "悔棋"]) {
    await page.getByRole("button", { name: "1行1列 空格" }).click();
    await expect(page.getByText("电脑思考中…")).toBeVisible();
    await page.getByRole("button", { name: action, exact: true }).click();
    await page.waitForTimeout(850);
    await expect(page.getByText("第 0 手")).toBeVisible();
  }
  await page.getByRole("button", { name: "1行1列 空格" }).click();
  await page.getByText("自定义 / 实验模式", { exact: true }).click();
  await page.getByLabel("规则预设").selectOption("7");
  await page.getByRole("button", { name: "新游戏", exact: true }).click();
  await page.waitForTimeout(850);
  await expect(page.getByText("第 0 手")).toBeVisible();
  await page.getByRole("button", { name: "1行1列 空格" }).click();
  await page.getByLabel("导入棋谱", { exact: true }).setInputFiles(upload([]));
  await page.waitForTimeout(850);
  await expect(page.getByText("第 0 手")).toBeVisible();
  await expect(page.getByRole("button", { name: /行\d列/ })).toHaveCount(36);
});
test("人机 AI 已落子与玩家刚获胜时悔棋", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("电脑难度").selectOption("简单");
  await page.getByRole("button", { name: "1行1列 空格" }).click();
  await expect(page.getByText("第 2 手")).toBeVisible();
  await page.getByRole("button", { name: "悔棋", exact: true }).click();
  await expect(page.getByText("第 0 手")).toBeVisible();
  await page
    .getByLabel("导入棋谱", { exact: true })
    .setInputFiles(upload([0, 30, 1, 32, 2, 34, 3, 6, 4]));
  await expect(page.getByRole("heading", { name: "黑棋 获胜" })).toBeVisible();
  await page.getByRole("button", { name: "悔棋", exact: true }).click();
  await expect(page.getByText("第 8 手")).toBeVisible();
  await expect(page.getByRole("heading", { name: "轮到 黑棋" })).toBeVisible();
});
