import { test, expect } from "@playwright/test";
import fixtures from "../../fixtures/rule-cases.json" with { type: "json" };
import { DEFAULT_RULES } from "../../src/core";

async function agePosition(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("对战方式").selectOption("同机双人");
  await page.getByLabel("导入棋谱", { exact: true }).setInputFiles({
    name: "age.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        rules: DEFAULT_RULES,
        moves: fixtures.cases[0].prefixMoves.map(([r, c]) => r * 6 + c),
      }),
    ),
  });
}
test("两个推荐入口保留旧默认与全部自定义配置，刷新可恢复Classic", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".summary")).toContainText("每人保留 6 枚");
  await expect(
    page.getByRole("navigation", { name: "推荐模式" }).getByRole("button"),
  ).toHaveCount(2);
  await expect(page.getByLabel("规则预设")).not.toBeVisible();
  await page.getByRole("button", { name: /^Mini/ }).click();
  await expect(page.locator(".cell")).toHaveCount(9);
  await expect(page.locator(".summary")).toContainText("每人保留 3 枚");
  await page.getByRole("button", { name: /^Classic/ }).click();
  await expect(page.locator(".cell")).toHaveCount(36);
  await expect(page.locator(".summary")).toContainText("每人保留 7 枚");
  await page.reload();
  await expect(page.locator(".summary")).toContainText("每人保留 7 枚");
  await page.getByText("自定义 / 实验模式", { exact: true }).click();
  await expect(page.getByLabel("规则预设").locator("option")).toHaveCount(9);
  await page.getByLabel("规则预设").selectOption("0");
  await page.getByRole("button", { name: "新游戏", exact: true }).click();
  await expect(page.locator(".summary")).toContainText("每人保留 6 枚");
});
test("黑白棋寿命预览、碎裂与回放不阻塞真实规则，重开清除特效", async ({
  page,
}) => {
  await agePosition(page);
  await expect(page.locator(".cell .stone-X")).toHaveCount(6);
  await expect(page.locator(".cell .stone-O")).toHaveCount(6);
  const oldest = page.getByRole("button", {
    name: "3行1列 X 本方下次落子后消失",
  });
  const move = page.getByRole("button", { name: "3行5列 空格" });
  await move.hover();
  await expect(oldest).toHaveClass(/will-remove/);
  await expect(page.locator(".ghost")).toHaveCount(1);
  await expect(page.locator(".expiry-notice")).toContainText("3行1列");
  await page.screenshot({
    path: "test-results/visual-age-desktop.png",
    fullPage: true,
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await move.click();
  await expect(page.getByRole("button", { name: "3行1列 空格" })).toBeVisible();
  await expect(page.getByTestId("shatter").locator(".shard")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: /获胜/ })).toHaveCount(0);
  await page.clock.runFor(450);
  await expect(page.getByTestId("shatter")).toHaveCount(0);
  await page.getByRole("button", { name: "进入回放" }).click();
  await page.getByLabel("回放手数").fill("13");
  await expect(page.getByTestId("shatter")).toHaveCount(1);
  await expect(page.locator(".expiry-notice")).toContainText("再移除 3行1列");
  await page.getByRole("button", { name: /^Mini/ }).click();
  await expect(page.getByTestId("shatter")).toHaveCount(0);
  await expect(page.getByText("第 0 手")).toBeVisible();
});
test("移动端键盘预览与减少动态效果仍保留寿命信息", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await agePosition(page);
  await page.getByRole("button", { name: "3行5列 空格" }).focus();
  await expect(page.locator(".will-remove")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/visual-age-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "3行1列 空格" })).toBeVisible();
  await expect(page.getByTestId("shatter")).not.toBeVisible();
  await expect(page.getByLabel("黑棋寿命队列")).toBeVisible();
});
