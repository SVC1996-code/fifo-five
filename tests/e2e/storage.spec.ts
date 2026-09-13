import { test, expect } from "@playwright/test";
const key = "fifo-five.autosave.v1";
test("刷新直接恢复棋盘与设置，仍可手动新游戏", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("对战方式").selectOption("同机双人");
  await page.getByLabel("电脑难度").selectOption("困难");
  await page.getByLabel("显示棋龄").uncheck();
  await page.getByRole("button", { name: "1行1列 空格" }).click();
  await page.getByRole("button", { name: "2行2列 空格" }).click();
  await page.reload();
  await expect(page.getByRole("group", { name: "棋盘" })).toBeVisible();
  await expect(page.getByText("电脑思考中…")).toHaveCount(0);
  await expect(page.getByText("第 2 手")).toBeVisible();
  await expect(page.getByLabel("对战方式")).toHaveValue("同机双人");
  await expect(page.getByLabel("电脑难度")).toHaveValue("困难");
  await expect(page.getByLabel("显示棋龄")).not.toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "新游戏", exact: true }).click();
  await expect(page.getByText("第 0 手")).toBeVisible();
});
test("回放不覆盖存档，刷新回到完整对局", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("对战方式").selectOption("同机双人");
  for (const [r, c] of [
    [1, 1],
    [2, 1],
    [1, 2],
  ])
    await page.getByRole("button", { name: `${r}行${c}列 空格` }).click();
  const original = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.getByRole("button", { name: "进入回放" }).click();
  await page.getByLabel("回放手数").fill("1");
  await page.getByLabel("显示棋龄").uncheck();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    original,
  );
  await page.reload();
  await expect(page.getByText("第 3 手")).toBeVisible();
  await expect(page.getByLabel("显示棋龄")).toBeChecked();
});
for (const corrupt of ["bad", JSON.stringify({ saveVersion: 999 })])
  test(`坏存档可开始新局 ${corrupt}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, corrupt]);
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("无法恢复");
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
      corrupt,
    );
    await expect(
      page.getByRole("button", { name: "继续上次对局" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "新游戏", exact: true }).click();
    await expect(page.getByText("第 0 手")).toBeVisible();
  });
test("配额不足不阻止下棋，明确提示导出备份", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await expect(page.getByText(/自动存档失败/)).toBeVisible();
  await page.getByLabel("对战方式").selectOption("同机双人");
  await page.getByRole("button", { name: "1行1列 空格" }).click();
  await expect(page.getByText("第 1 手")).toBeVisible();
});
test("禁止读取存储时直接显示棋盘，仍可新游戏", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("无法恢复");
  await page.getByRole("button", { name: "新游戏", exact: true }).click();
  await expect(page.getByText(/自动存档失败/)).toBeVisible();
});
test("电脑思考中刷新保存玩家行动，恢复后由真实 Worker 接着行动", async ({
  page,
}) => {
  // Delay the first Worker response to make reload timing deterministic. Navigation
  // removes this in-page shim, so restoration exercises the real Worker.
  await page.goto("/");
  await page.evaluate(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      postMessage() {}
    };
  });
  await page.getByRole("button", { name: "1行1列 空格" }).click();
  await expect(page.getByText("电脑思考中…")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("group", { name: "棋盘" })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByText("电脑思考中…")).toHaveCount(0);
  await expect(page.getByText("第 2 手")).toBeVisible();
  await expect(page.getByRole("heading", { name: "轮到 黑棋" })).toBeVisible();
});
test("AI 执先零手存档恢复后自动开局；终局恢复不再行动", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("对战方式").selectOption("同机双人");
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k)!);
    s.settings.mode = "人机";
    s.settings.human = "O";
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload();
  await expect(page.getByText("第 1 手")).toBeVisible();
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k)!);
    s.record.rules = {
      ...s.record.rules,
      boardSize: 3,
      winLength: 3,
      retention: { kind: "permanent" },
    };
    s.record.moves = [0, 3, 1, 4, 2];
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload();
  await expect(page.getByRole("heading", { name: "黑棋 获胜" })).toBeVisible();
  await expect(page.getByText("电脑思考中…")).toHaveCount(0);
});

