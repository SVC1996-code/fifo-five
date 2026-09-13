import { test, expect } from "@playwright/test";
const cell = (r: number, c: number) => new RegExp(`^${r}行${c}列`);
async function classic(page: import("@playwright/test").Page) {
  await page.getByText("自定义 / 实验模式", { exact: true }).click();
  await page.getByLabel("规则预设").selectOption("7");
  await page.getByRole("button", { name: "新游戏", exact: true }).click();
}
const rules = {
  rulesVersion: "1",
  boardSize: 3,
  winLength: 3,
  retention: { kind: "permanent" },
  repetitionThreshold: 3,
  matchPlyLimit: null,
};
async function importMoves(
  page: import("@playwright/test").Page,
  moves: number[],
) {
  await page.getByLabel("导入棋谱", { exact: true }).setInputFiles({
    name: "game.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, rules, moves })),
  });
}
test("同机完成对局、键盘落子、终局禁止落子、回放与棋谱导出", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("对战方式").selectOption("同机双人");
  await classic(page);
  const first = page.getByRole("button", { name: cell(1, 1) });
  await first.focus();
  await page.keyboard.press("Enter");
  for (const [r, c] of [
    [2, 1],
    [1, 2],
    [2, 2],
    [1, 3],
  ])
    await page.getByRole("button", { name: cell(r, c) }).click();
  await expect(page.getByRole("heading", { name: "黑棋 获胜" })).toBeVisible();
  await expect(page.getByText("第 5 手")).toBeVisible();
  await page.getByRole("button", { name: cell(3, 3) }).click({ force: true });
  await expect(page.getByText("第 5 手")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出棋谱" }).click();
  expect((await download).suggestedFilename()).toBe("fifo-five.json");
  await page.getByRole("button", { name: "进入回放" }).click();
  await expect(page.getByText("第 0 手")).toBeVisible();
  await page.getByLabel("回放手数").fill("5");
  await expect(page.getByRole("heading", { name: "黑棋 获胜" })).toBeVisible();
});
test("真实 Worker 完成人机对局，后手选择触发 AI 开局", async ({ page }) => {
  await page.goto("/");
  await classic(page);
  await page.getByLabel("电脑难度").selectOption("简单");
  for (let i = 0; i < 9; i++) {
    if (await page.getByRole("heading", { name: /获胜|和棋/ }).count()) break;
    await expect(page.getByText("电脑思考中…")).toHaveCount(0);
    if (await page.getByRole("heading", { name: /获胜|和棋/ }).count()) break;
    await page.getByRole("button", { name: /空格/ }).first().click();
    await expect(page.getByText("电脑思考中…")).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: /获胜|和棋/ })).toBeVisible();
  await page.getByLabel("玩家执子").selectOption("O");
  await expect(page.getByText("第 1 手")).toBeVisible();
  await expect(page.getByRole("heading", { name: "轮到 白棋" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "悔棋", exact: true }),
  ).toBeDisabled();
});
test("真实 Worker 重开、悔棋、换规则、导入与回放保持新局面", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("电脑难度").selectOption("困难");
  await page.getByRole("button", { name: cell(1, 1) }).click();
  await page.getByRole("button", { name: "新游戏", exact: true }).click();
  await expect(page.getByText("第 0 手")).toBeVisible();
  await page.getByRole("button", { name: cell(1, 1) }).click();
  await page.getByRole("button", { name: "悔棋", exact: true }).click();
  await expect(page.getByText("第 0 手")).toBeVisible();
  await page.getByRole("button", { name: cell(1, 1) }).click();
  await classic(page);
  await expect(page.getByRole("button", { name: /行\d列/ })).toHaveCount(9);
  await expect(page.getByText("第 0 手")).toBeVisible();
  await page.getByRole("button", { name: cell(1, 1) }).click();
  await importMoves(page, [0, 3, 1, 4, 2]);
  await expect(page.getByRole("heading", { name: "黑棋 获胜" })).toBeVisible();
  await page.getByRole("button", { name: "进入回放" }).click();
  await page.getByLabel("回放手数").fill("1");
  await expect(page.getByText(/第 1 手/)).toBeVisible();
  await page.waitForTimeout(2200);
  await expect(page.getByText(/第 1 手/)).toBeVisible();
});
test("棋龄提示、导入错误与手机布局", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("对战方式").selectOption("同机双人");
  await page.getByRole("button", { name: cell(1, 1) }).click();
  await expect(
    page.getByRole("button", { name: /本方下次落子后消失/ }),
  ).toHaveCount(0);

  await page.getByLabel("导入棋谱", { exact: true }).setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json"),
  });
  await expect(page.getByRole("alert")).toContainText("JSON");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("默认 FIFO 规则真实人机对局到终局", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("电脑难度").selectOption("简单");
  for (let i = 0; i < 40; i++) {
    if (await page.getByRole("heading", { name: /获胜|和棋/ }).count()) break;
    await expect(page.getByText("电脑思考中…")).toHaveCount(0);
    if (await page.getByRole("heading", { name: /获胜|和棋/ }).count()) break;
    await page.getByRole("button", { name: /空格/ }).first().click();
    await expect(page.getByText("电脑思考中…")).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: /获胜|和棋/ })).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});

test("非法自定义规则保留当前对局并给出中文原因", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("对战方式").selectOption("同机双人");
  await page.getByRole("button", { name: cell(1, 1) }).click();
  await page.getByText("自定义 / 实验模式", { exact: true }).click();
  await page.getByLabel("棋盘边长").fill("2");
  await page.getByRole("button", { name: "新游戏", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("棋盘边长必须");
  await expect(page.getByText("第 1 手")).toBeVisible();
  await expect(page.getByRole("button", { name: /行\d列/ })).toHaveCount(36);
});
