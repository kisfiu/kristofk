import { expect, type Page, test } from "@playwright/test";

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
});
test.afterEach(() => expect(errors).toEqual([]));

const skipBoot = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.locator("#boot")).toBeHidden();
  await page.getByRole("button", { name: /Other, guest/ }).click();
  await expect(page.locator("#welcome")).toBeHidden();
};
const openIcon = async (page: Page, name: string, isMobile: boolean) => {
  const icon = page
    .locator(".window:not([hidden]) .icon, .desktop > .icons .icon")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .first();
  await (isMobile ? icon.tap() : icon.dblclick());
};

test("boot, then choosing IT recruiter opens the resume; reload skips both", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#boot")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("To begin, click your user name")).toBeVisible();
  await page.getByRole("button", { name: /IT recruiter/ }).click();
  await expect(page.getByRole("dialog", { name: /My Resume/ })).toBeVisible();
  await expect(page.locator("#balloon")).toContainText("Welcome, recruiter!", { timeout: 5000 });
  await page.reload();
  await expect(page.locator("#boot")).toBeHidden();
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator(".desktop > .icons").getByRole("button", { name: "My Resume" })).toBeVisible();
});

test("nonprofit opens NGOs; log off closes windows and shows the users again", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: /Nonprofit cooperation/ }).click();
  await expect(page.getByRole("dialog", { name: "NGOs" })).toBeVisible();
  await page.getByRole("button", { name: "start" }).click();
  await page.getByRole("button", { name: /Log off/ }).click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator(".window:not([hidden])")).toHaveCount(0);
  await page.getByRole("button", { name: /Other, guest/ }).click();
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.locator(".window:not([hidden])")).toHaveCount(0);
});

test("reduced motion skips the boot animation but still asks who you are", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#boot")).toBeHidden();
  await expect(page.getByRole("button", { name: /IT recruiter/ })).toBeFocused();
});

test("deep link opens the resume without the boot screen", async ({ page }) => {
  await page.goto("/#resume");
  await expect(page.locator("#boot")).toBeHidden();
  await expect(page.getByRole("dialog", { name: /My Resume/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Download CV/ })).toHaveAttribute("href", "Kristof-Kovacs-CV.pdf");
});

test("every desktop icon and folder item opens its window", async ({ page, isMobile }) => {
  await skipBoot(page);
  const desktop = ["My Resume", "Hobbies", "NGOs", "Other Stuff", "Internet", "Recycle Bin", "Pipeline Green"];
  const folders: Record<string, string[]> = {
    Hobbies: ["Books", "Marketplace", "Travel", "Renovation", "Baseball"],
    NGOs: ["Invisible School", "Rotary Club", "TOPdesk CSR"],
    "Other Stuff": ["Address Book", "Side Projects", "My Pictures", "readme.txt"],
  };
  for (const name of desktop) {
    await openIcon(page, name, isMobile);
    const win = page.locator(".window.active");
    await expect(win).toBeVisible();
    for (const child of folders[name] ?? []) {
      await openIcon(page, child, isMobile);
      await expect(page.locator(".window.active .title-bar-text")).toContainText(
        child === "Rotary Club" ? "Rotary" : child.replace("readme.txt", "readme"),
      );
      await page.locator(".window.active").getByRole("button", { name: "Close" }).click();
    }
    await page.locator(".window.active").getByRole("button", { name: "Close" }).click();
  }
  await expect(page.locator(".window:not([hidden])")).toHaveCount(0);
  await expect(page.locator("#tasks button")).toHaveCount(0);
});

test("shortcut in Hobbies opens the NGOs folder", async ({ page, isMobile }) => {
  await skipBoot(page);
  await openIcon(page, "Hobbies", isMobile);
  await openIcon(page, "My NGOs", isMobile);
  await expect(page.locator(".window.active .title-bar-text")).toHaveText("NGOs");
});

test("taskbar minimizes and restores, Esc closes", async ({ page, isMobile }) => {
  await skipBoot(page);
  await openIcon(page, "Internet", isMobile);
  const win = page.getByRole("dialog", { name: /Internet/ });
  await win.getByRole("button", { name: "Minimize" }).click();
  await expect(win).toBeHidden();
  await page.locator("#tasks button").click();
  await expect(win).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
});

test("start menu, e-mail and shut down", async ({ page }) => {
  await skipBoot(page);
  await page.getByRole("button", { name: "start" }).click();
  await expect(page.locator("#start-menu")).toBeVisible();
  await page.locator("#start-menu").getByRole("button", { name: "Other Stuff" }).click();
  await expect(page.locator("#start-menu")).toBeHidden();
  await page.locator(".window.active").getByRole("button", { name: "Address Book" }).dblclick();
  await expect(page.locator("a[data-email]")).toHaveAttribute("href", /^mailto:.+@gmail\.com$/);
  await page.getByRole("button", { name: "start" }).click();
  await page.getByRole("button", { name: /Shut down/ }).click();
  await expect(page.getByText("It is now safe to turn off your computer.")).toBeVisible();
});

test("internet: dial-up, surf away, favorites, home", async ({ page, isMobile }) => {
  await skipBoot(page);
  await openIcon(page, "Internet", isMobile);
  const win = page.getByRole("dialog", { name: /Internet/ });
  await expect(win.getByText("Connected at 56,000 bps")).toBeVisible({ timeout: 6000 });
  const surfer = win.getByRole("button", { name: /Surf with me/ });
  await expect(surfer).toBeVisible();
  await expect.poll(() => surfer.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(192);
  await surfer.click();
  await expect(win.locator(".ie-away")).toBeVisible();
  await expect(win.getByRole("link", { name: /LinkedIn/ })).toBeVisible({ timeout: 4000 });
  await expect(win.locator("[data-ie-address]")).toHaveValue("kk://favorites");
  await win.getByRole("button", { name: /side projects/ }).click();
  await expect(page.locator(".window.active .title-bar-text")).toHaveText("Side Projects");
  await page.locator(".window.active").getByRole("button", { name: "Close" }).click();
  await win.getByRole("button", { name: /Home/ }).click();
  await expect(win.locator("[data-ie-log]")).toBeVisible();
});

test("internet respects reduced motion", async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#internet");
  const win = page.getByRole("dialog", { name: /Internet/ });
  const surfer = win.getByRole("button", { name: /Surf with me/ });
  await expect(surfer).toBeVisible();
  await expect.poll(() => surfer.locator("img").evaluate((i: HTMLImageElement) => i.currentSrc)).toContain("still.png");
  await (isMobile ? surfer.tap() : surfer.click());
  await expect(win.getByRole("link", { name: /GitHub/ })).toBeVisible();
});

test("pipeline game starts its timer on the first click", async ({ page, isMobile }) => {
  await skipBoot(page);
  await openIcon(page, "Pipeline Green", isMobile);
  const time = page.locator("[data-time]");
  await expect(time).toHaveText("Time: 60s");
  await page.locator(".pipe").first().click();
  await expect(time).not.toHaveText("Time: 60s", { timeout: 3000 });
});

test("no sideways scroll and windows fit the screen", async ({ page, isMobile }) => {
  await page.goto("/#resume");
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
  const box = (await page.getByRole("dialog", { name: /My Resume/ }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(client + 1);
  if (isMobile) expect(box.width).toBeGreaterThanOrEqual(client - 1);
});

test("screenshots for review", async ({ page, isMobile }, info) => {
  test.skip(!process.env.SHOTS, "set SHOTS=<dir> to save screenshots");
  const dir = `${process.env.SHOTS}/${info.project.name}`;
  const settled = () =>
    page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
    );
  await page.goto("/");
  await page.screenshot({ path: `${dir}-1-boot.png` });
  await page.getByRole("button", { name: "Skip" }).click();
  await settled();
  await page.screenshot({ path: `${dir}-1b-welcome.png` });
  await page.getByRole("button", { name: /Other, guest/ }).click();
  await openIcon(page, "My Resume", isMobile);
  await settled();
  await page.screenshot({ path: `${dir}-2-resume.png` });
  // phone windows are full-screen, so minimize before using the desktop again
  if (isMobile) await page.locator(".window.active").getByRole("button", { name: "Minimize" }).click();
  await openIcon(page, "NGOs", isMobile);
  await settled();
  await page.screenshot({ path: `${dir}-3-ngos.png` });
  if (isMobile) await page.locator(".window.active").getByRole("button", { name: "Minimize" }).click();
  await openIcon(page, "Pipeline Green", isMobile);
  await settled();
  await page.screenshot({ path: `${dir}-4-game.png` });
  await page.getByRole("button", { name: "start" }).click();
  await settled();
  await page.screenshot({ path: `${dir}-5-start.png` });
});
