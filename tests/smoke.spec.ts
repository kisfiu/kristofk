import { expect, type Page, test } from "@playwright/test";

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
});
test.afterEach(() => expect(errors).toEqual([]));

const skipBoot = async (page: Page) => {
  await page.goto("./");
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
  await page.goto("./");
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
  await page.goto("./");
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
  await page.goto("./");
  await expect(page.locator("#boot")).toBeHidden();
  await expect(page.getByRole("button", { name: /IT recruiter/ })).toBeFocused();
});

test("deep link opens the resume without the boot screen", async ({ page }) => {
  await page.goto("./#resume");
  await expect(page.locator("#boot")).toBeHidden();
  await expect(page.getByRole("dialog", { name: /My Resume/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Download CV/ })).toHaveAttribute("href", "Kristof-Kovacs-CV.pdf");
  // LinkedIn is pinned at the bottom of the long resume, visible without scrolling
  await expect(
    page.getByRole("dialog", { name: /My Resume/ }).getByRole("link", { name: /LinkedIn/ }),
  ).toBeInViewport();
});

test("every desktop icon and folder item opens its window", async ({ page, isMobile }) => {
  await skipBoot(page);
  const desktop = ["My Resume", "Hobbies", "NGOs", "Other Stuff", "Internet", "Recycle Bin", "Pipeline Green"];
  const folders: Record<string, string[]> = {
    Hobbies: ["Books", "Marketplace", "Travel", "Renovation", "Baseball"],
    NGOs: ["Invisible School", "Rotary Club"],
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
  await expect(page.getByRole("link", { name: /@gmail\.com/ })).toHaveAttribute("href", /^mailto:.+@gmail\.com$/);
  await page.getByRole("button", { name: "start" }).click();
  await page.getByRole("button", { name: /Shut down/ }).click();
  await expect(page.getByText("It is now safe to turn off your computer.")).toBeVisible();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.locator("#boot")).toBeVisible(); // restart plays the boot screen again
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
  await page.goto("./#internet");
  const win = page.getByRole("dialog", { name: /Internet/ });
  const surfer = win.getByRole("button", { name: /Surf with me/ });
  await expect(surfer).toBeVisible();
  await expect.poll(() => surfer.locator("img").evaluate((i: HTMLImageElement) => i.currentSrc)).toContain("still.png");
  await (isMobile ? surfer.tap() : surfer.click());
  await expect(win.getByRole("link", { name: /GitHub/ })).toBeVisible();
});

test("windows move with the arrow keys from their title-bar icon (desktop only)", async ({ page, isMobile }) => {
  await page.goto("./#resume");
  const win = page.getByRole("dialog", { name: /My Resume/ });
  const handle = win.getByRole("button", { name: /Move My Resume/ });
  if (isMobile) {
    await expect(handle).toBeDisabled(); // full-screen windows on phones don't move
    return;
  }
  const before = await win.evaluate((w: HTMLElement) => w.offsetLeft);
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await win.evaluate((w: HTMLElement) => w.offsetLeft)).toBe(before + 30);
});

test("balloons sit in a Notifications region, are announced and close with ×", async ({ page }) => {
  await page.addInitScript(() => {
    const notes: string[] = [];
    Object.assign(window, { notes });
    // record announcements; ariaNotify isn't in TypeScript's DOM types yet
    Object.defineProperty(Document.prototype, "ariaNotify", {
      configurable: true,
      value: (message: string) => notes.push(message),
    });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: /IT recruiter/ }).click();
  const region = page.getByRole("region", { name: "Notifications" });
  await expect(region.getByText("Welcome, recruiter!")).toBeVisible({ timeout: 5000 });
  expect(await page.evaluate(() => (window as unknown as { notes: string[] }).notes.join())).toContain(
    "Welcome, recruiter!",
  );
  await region.getByRole("button", { name: "Close notification" }).click();
  await expect(page.locator("#balloon")).toBeHidden();
});

test("Esc closes the top window even while a balloon is showing", async ({ page }) => {
  await page.goto("./#resume");
  await page.evaluate(() => document.getElementById("balloon")?.showPopover());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /My Resume/ })).toBeHidden();
});

test("Internet closed during dial-up reopens at the wave with the wave's address", async ({ page, isMobile }) => {
  await page.goto("./#internet");
  const win = page.getByRole("dialog", { name: /Internet/ });
  await expect(win.locator("[data-ie-log] li").first()).toBeVisible();
  await win.getByRole("button", { name: "Close" }).click();
  await openIcon(page, "Internet", isMobile);
  await expect(win.getByRole("button", { name: /Surf with me/ })).toBeVisible();
  await expect(win.locator("[data-ie-address]")).toHaveValue("kk://surf-with-me");
});

test("dragging on the desktop draws a selection rectangle; Enter opens the selected icons", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "mouse drag");
  await skipBoot(page);
  // during the ~250 ms login View Transition the browser hit-tests the page root; wait until the desktop takes input
  await page.waitForFunction(() => document.elementFromPoint(400, 20)?.matches(".icons"));
  const selected = page.locator(".desktop > .icons .icon.selected");
  await page.mouse.move(400, 20);
  await page.mouse.down();
  await page.mouse.move(20, 170, { steps: 6 });
  await expect(page.locator(".marquee")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".marquee")).toBeHidden();
  await expect(selected).toHaveCount(2);
  await page.mouse.click(700, 400); // empty desktop clears the selection
  await expect(selected).toHaveCount(0);
  // a rectangle beside the icons (here just right of the pictures and labels) selects nothing
  await page.mouse.move(400, 20);
  await page.mouse.down();
  await page.mouse.move(93, 170, { steps: 6 });
  await expect(selected).toHaveCount(0);
  await page.mouse.up();
  await page.mouse.move(400, 20);
  await page.mouse.down();
  await page.mouse.move(20, 170, { steps: 6 });
  await page.mouse.up();
  // dragging must not leave a browser text selection behind (it painted labels blue and broke the next drag)
  expect(await page.evaluate(() => String(getSelection()))).toBe("");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /My Resume/ })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "NGOs" })).toBeVisible();
});

test("drag-select works inside folder windows and Enter works after a window had focus", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse drag");
  await page.goto("./");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: /IT recruiter/ }).click(); // opens and focuses My Resume
  await page.waitForFunction(() => document.elementFromPoint(1000, 100)?.matches(".icons"));
  // desktop: select Hobbies + Other Stuff while the resume window has focus, then Enter opens both
  await page.mouse.move(100, 300);
  await page.mouse.down();
  await page.mouse.move(20, 200, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Hobbies" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Other Stuff" })).toBeVisible();
  // folder window: drag across the Hobbies icons
  const folder = (await page.locator("#win-hobbies .folder-view").boundingBox())!;
  await page.locator("#win-hobbies .title-bar").click();
  await page.mouse.move(folder.x + folder.width - 5, folder.y + 5);
  await page.mouse.down();
  await page.mouse.move(folder.x + 5, folder.y + 60, { steps: 6 });
  await expect(page.locator(".marquee")).toBeVisible();
  await page.mouse.up();
  expect(await page.locator("#win-hobbies .icon.selected").count()).toBeGreaterThan(1);
});

test("clicking the empty desktop unselects a clicked icon", async ({ page, isMobile }) => {
  test.skip(isMobile, "single click on phones opens the icon");
  await skipBoot(page);
  const ngos = page.locator(".desktop > .icons").getByRole("button", { name: "NGOs" });
  await ngos.click();
  await expect(ngos).toHaveClass(/selected/);
  await page.mouse.click(700, 400);
  await expect(ngos).not.toHaveClass(/selected/);
  await expect(ngos).not.toBeFocused();
});

test("the taskbar clock opens a calendar with today marked", async ({ page }) => {
  await skipBoot(page);
  const cal = page.getByRole("dialog", { name: "Date and Time" });
  await page.locator("#clock").click();
  await expect(cal).toBeVisible();
  const now = new Date();
  const title = cal.locator("[data-cal-title]");
  await expect(title).toHaveText(new RegExp(String(now.getFullYear())));
  await expect(cal.locator('td[aria-current="date"]')).toHaveText(String(now.getDate()));
  // same size for every month: always six week rows; flip a year forward to hit 4-, 5- and 6-row months
  await page.waitForFunction(() => document.getAnimations().length === 0); // let the open animation finish
  const box = await cal.boundingBox();
  for (let i = 0; i < 12; i++) {
    await expect(cal.locator("[data-cal-days] tr")).toHaveCount(6);
    expect((await cal.boundingBox())?.height).toBe(box?.height);
    await cal.getByRole("button", { name: "Next month" }).click();
  }
  await cal.getByRole("button", { name: "Previous month" }).click();
  for (let i = 0; i < 11; i++) await cal.getByRole("button", { name: "Previous month" }).click();
  const before = await title.textContent();
  await cal.getByRole("button", { name: "Next month" }).click();
  await expect(title).not.toHaveText(before ?? "");
  await expect(cal.locator('td[aria-current="date"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(cal).toBeHidden();
});

test("NGOs is the second desktop icon and the Recycle Bin sits bottom right", async ({ page }) => {
  await skipBoot(page);
  const icons = page.locator(".desktop > .icons .icon span");
  await expect(icons.nth(1)).toHaveText("NGOs");
  const bin = (await page.locator(".desktop > .icons").getByRole("button", { name: "Recycle Bin" }).boundingBox())!;
  const size = page.viewportSize()!;
  expect(bin.x + bin.width).toBeGreaterThan(size.width - 100);
  expect(bin.y + bin.height).toBeGreaterThan(size.height - 140);
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
  await page.goto("./#resume");
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
  await page.goto("./");
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
