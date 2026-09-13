import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_RULES } from "../../src/core";
async function position(
  page: Page,
  moves: number[],
  limit: number | null = null,
) {
  await page
    .getByLabel("导入棋谱", { exact: true })
    .setInputFiles({
      name: "ending.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          rules: {
            ...DEFAULT_RULES,
            boardSize: 3,
            winLength: 3,
            retention: { kind: "permanent" },
            matchPlyLimit: limit,
          },
          moves,
        }),
      ),
    });
}
test("胜利烟花、步数、取消、重来与右侧布局", async ({ page }) => {
  await page.goto("/");
  await position(page, [0, 3, 1, 4]);
  await page.getByRole("button", { name: "1行3列 空格" }).click();
  const result = page.getByRole("dialog", { name: "对局结束" });
  await expect(result).toContainText("漂亮，你赢了");
  await expect(result).toContainText("共走了 5 步");
  await expect(result.locator(".firework")).toHaveCount(3);
  await page.screenshot({
    path: "test-results/ending-victory.png",
    fullPage: true,
  });
  const board = await page.getByRole("group", { name: "棋盘" }).boundingBox();
  const controls = await page.locator(".control-panel").boundingBox();
  expect(controls!.x).toBeGreaterThan(board!.x + board!.width);
  await result.getByRole("button", { name: "取消" }).click();
  await expect(result).toHaveCount(0);
  await expect(page.getByText("第 5 手")).toBeVisible();
  await page.getByRole("button", { name: "悔棋", exact: true }).click();
  await page.getByRole("button", { name: "1行3列 空格" }).click();
  await result.getByRole("button", { name: "再来一局" }).click();
  await expect(page.getByText("第 0 手")).toBeVisible();
  await expect(page.locator(".cell")).toHaveCount(9);
});
test("真实电脑胜利显示惜败，刷新直接终局棋盘不重复弹窗", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("电脑难度").selectOption("简单");
  await position(page, [0, 3, 1, 4, 8]);
  const result = page.getByRole("dialog", { name: "对局结束" });
  await expect(result).toContainText("这次惜败");
  await expect(result).toContainText("共走了 6 步");
  await expect(result.locator(".fireworks")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/ending-defeat.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole("group", { name: "棋盘" })).toBeVisible();
  await expect(result).toHaveCount(0);
  await expect(page.getByText("第 6 手")).toBeVisible();
});
test("和棋同样显示结束与原因，减少动态效果隐藏烟花", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("对战方式").selectOption("同机双人");
  await position(page, [0], 2);
  await page.getByRole("button", { name: "1行2列 空格" }).click();
  const result = page.getByRole("dialog", { name: "对局结束" });
  await expect(result).toContainText("握手言和");
  await expect(result).toContainText("达到公开规则手数上限");
  await result.getByRole("button", { name: "取消" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await position(page, [0, 3, 1, 4]);
  await page.getByRole("button", { name: "1行3列 空格" }).click();
  await expect(result.locator(".fireworks")).not.toBeVisible();
  await result.getByRole("button", { name: "取消" }).focus();
  await page.keyboard.press("Escape");
  await expect(result).toHaveCount(0);
});
