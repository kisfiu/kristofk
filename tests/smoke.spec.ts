import { expect, type Page, test } from "@playwright/test";

const errors: string[] = [];
const WEATHER = "**/api.open-meteo.com/**";
const weather = (weather_code: number, is_day: 0 | 1, temperature_2m: number) => ({
  json: { current: { weather_code, is_day, temperature_2m } },
});
/** Wait for open/close animations; endless ones (Racka bobbing, rain falling) never finish, so skip them. */
const settled = (page: Page) =>
  page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  // Racka the helper pops up a few seconds after logging on; only the Racka test (URL with ?racka) wants him
  await page.addInitScript(() => {
    if (!location.search.includes("racka")) sessionStorage.setItem("kk-helper", "off");
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // never depend on the real weather service in tests: a clear day unless a test says otherwise
  await page.route(WEATHER, (r) => r.fulfill(weather(0, 1, 18)));
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

test("a broken link hash still loads the whole desktop", async ({ page }) => {
  await page.goto("./#%");
  await expect(page.locator("#weather")).toBeVisible(); // the weather script ran (afterEach: no "URI malformed")
});

test("deep link opens the resume without the boot screen", async ({ page }) => {
  await page.goto("./#resume");
  await expect(page.locator("#boot")).toBeHidden();
  await expect(page.getByRole("dialog", { name: /My Resume/ })).toBeVisible();
  // the PDF opens in a viewer window instead of downloading; a small 💾 link still downloads directly
  const resume = page.getByRole("dialog", { name: /My Resume/ });
  const download = resume.getByRole("link", { name: "Download CV (PDF)" });
  await expect(download).toHaveAttribute("href", "Kristof-Kovacs-CV.pdf");
  await expect(download).toHaveAttribute("download", "");
  const pdf = page.locator("#win-cv object");
  expect(await pdf.getAttribute("data")).toBeNull(); // not loaded until someone opens it
  await resume.getByRole("button", { name: /Open CV/ }).click();
  await expect(page.getByRole("dialog", { name: /Kristof-Kovacs-CV\.pdf/ })).toBeVisible();
  await expect(pdf).toHaveAttribute("data", /Kristof-Kovacs-CV\.pdf/);
  // LinkedIn is pinned at the bottom of the long resume, visible without scrolling
  await expect(
    page.getByRole("dialog", { name: /My Resume/ }).getByRole("link", { name: /LinkedIn/ }),
  ).toBeInViewport();
});

test("every desktop icon and folder item opens its window", async ({ page, isMobile }) => {
  await skipBoot(page);
  const desktop = ["My Resume", "Hobbies", "NGOs", "Other Stuff", "Internet", "Weather", "Recycle Bin", "Games"];
  const folders: Record<string, string[]> = {
    Hobbies: ["Books", "Marketplace", "Travel", "Renovation", "Baseball"],
    NGOs: ["Invisible School", "Rotary Club"],
    "Other Stuff": ["Address Book", "Side Projects", "readme.txt"],
    Games: ["Wall Sweeper", "Solitaire", "FreeCell", "Spider Solitaire", "Hearts", "Pipeline Green"],
  };
  for (const name of desktop) {
    await openIcon(page, name, isMobile);
    const win = page.locator(".window.active");
    await expect(win).toBeVisible();
    for (const child of folders[name] ?? []) {
      await openIcon(page, child, isMobile);
      // Hearts asks your name first, like XP's
      if (child === "Hearts") {
        await page.getByLabel("What is your name?").fill("Tester");
        await page.getByRole("button", { name: "OK" }).click();
      }
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
  await expect(page.locator(".window.active .folder-note")).toContainText("looking for volunteers");
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
  await page.locator("#start-menu").getByRole("button", { name: /My CV/ }).click();
  await expect(page.getByRole("dialog", { name: /Kristof-Kovacs-CV\.pdf/ })).toBeVisible();
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
  await expect(win.getByRole("link", { name: /LinkedIn/ })).toBeVisible();
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
  // drags start at x 97: between the first icon column (ends at 92) and the second (from 102)
  await page.mouse.move(97, 20);
  await page.mouse.down();
  await page.mouse.move(20, 170, { steps: 6 });
  await expect(page.locator(".marquee")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".marquee")).toBeHidden();
  await expect(selected).toHaveCount(2);
  await page.mouse.click(700, 400); // empty desktop clears the selection
  await expect(selected).toHaveCount(0);
  // a rectangle beside the icons (here just right of the pictures and labels) selects nothing
  await page.mouse.move(97, 20);
  await page.mouse.down();
  await page.mouse.move(93, 170, { steps: 6 });
  await expect(selected).toHaveCount(0);
  await page.mouse.up();
  await page.mouse.move(97, 20);
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
  await settled(page); // let the open animation finish
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

test("windows resize from the corner; maximize fills the whole desktop, also after resizing", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "phones show every window full screen");
  await page.goto("./#resume");
  await settled(page);
  const win = page.locator("#win-resume");
  const before = (await win.boundingBox())!;
  await page.mouse.move(before.x + before.width - 3, before.y + before.height - 3);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width - 103, before.y + before.height - 63, { steps: 5 });
  await page.mouse.up();
  const after = (await win.boundingBox())!;
  expect(after.width).toBeLessThan(before.width - 80);
  expect(after.height).toBeLessThan(before.height - 40);
  // the full-screen size must match the desktop above the taskbar
  const { width, height } = page.viewportSize()!;
  const taskbar = (await page.locator(".taskbar").boundingBox())!.height;
  await win.getByRole("button", { name: "Maximize" }).click();
  await expect.poll(async () => (await win.boundingBox())?.height).toBe(height - taskbar);
  expect((await win.boundingBox())?.width).toBe(width);
  // the CV viewer has its own height rule; maximized must still win
  await win.getByRole("button", { name: /Open CV/ }).click();
  const cv = page.locator("#win-cv");
  await cv.getByRole("button", { name: "Maximize" }).click();
  await expect.poll(async () => (await cv.boundingBox())?.height).toBe(height - taskbar);
});

test("the first line of Rotary and My Resume fits on one line", async ({ page, isMobile }) => {
  test.skip(isMobile, "phone windows are full screen and may wrap");
  for (const [id, sel] of [
    ["rotary", ".doc > p:first-of-type"],
    ["resume", ".doc h1 + p"],
  ]) {
    await page.goto(`./?open=${id}#${id}`); // a new query string forces a fresh load; the hash alone would not reopen
    const line = page.locator(`#win-${id} ${sel}`);
    const lineHeight = await line.evaluate((p) => Number.parseFloat(getComputedStyle(p).lineHeight));
    expect((await line.boundingBox())?.height).toBeLessThan(lineHeight * 1.5);
  }
});

test("the desktop follows the live Hortobágy weather", async ({ page }) => {
  await page.route(WEATHER, (r) => r.fulfill(weather(63, 0, 6.6))); // moderate rain, night
  await page.addInitScript(() => sessionStorage.setItem("kk-booted", "1")); // straight to the desktop
  await page.goto("./");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-weather", "rain");
  await expect(html).toHaveAttribute("data-daylight", "night");
  // the wallpaper photo follows it too: a cloudy night, and storks don't fly at night
  const photo = () => page.locator(".wallpaper svg").evaluate((s) => getComputedStyle(s).backgroundImage);
  await expect.poll(photo).toContain("night-cloudy");
  await expect(page.locator(".wallpaper .storks")).toBeHidden();
  const tray = page.locator("#weather");
  await expect(tray).toHaveText("🌧️ 7°C");
  await expect(tray).toHaveAttribute("aria-label", "Hortobágy now: rain, 7°C");
  // the overlay never blocks clicks on the desktop
  expect(await page.locator(".weather").evaluate((w) => getComputedStyle(w).pointerEvents)).toBe("none");
  // clicking the tray reading opens the Weather app, which shows the same live reading and explains the effect
  await tray.click();
  const app = page.getByRole("dialog", { name: "Hortobágy Weather" });
  await expect(app).toBeVisible();
  await expect(app.locator("[data-wx-text]")).toHaveText("Hortobágy now: rain, 7°C (night)");
  await expect(app.getByRole("heading", { name: "How the desktop background works" })).toBeVisible();

  await page.unroute(WEATHER);
  await page.route(WEATHER, (r) => r.fulfill(weather(73, 1, -2))); // snow, day
  await page.reload();
  await expect(html).toHaveAttribute("data-weather", "snow");
  await expect(tray).toHaveText("❄️ -2°C");
  await expect.poll(photo).toContain("snow");

  await page.unroute(WEATHER);
  await page.route(WEATHER, (r) => r.fulfill(weather(2, 1, 14))); // partly cloudy, day
  await page.reload();
  await expect(tray).toHaveText("⛅ 14°C");
  await expect.poll(photo).toContain("partly");
});

test("in a thunderstorm a lightning bolt strikes with each flash, somewhere new each time", async ({ page }) => {
  await page.route(WEATHER, (r) => r.fulfill(weather(95, 1, 21)));
  await page.addInitScript(() => sessionStorage.setItem("kk-booted", "1"));
  await page.goto("./");
  const bolt = page.locator(".bolt");
  await expect(bolt).toHaveCSS("animation-name", "weather-bolt");
  // jump to the flash's peak (91% of the 9 s cycle) and hold it there: the opacity drops fast right after it
  await page.evaluate(() => {
    for (const a of document.getAnimations())
      if (/weather-(bolt|lightning)/.test(String((a as CSSAnimation).animationName))) {
        a.pause();
        a.currentTime = 8_190;
      }
  });
  expect(Number(await bolt.evaluate((b) => getComputedStyle(b).opacity))).toBeGreaterThan(0.5);
  const before = await bolt.evaluate((b) => (b as SVGElement).style.left);
  for (let i = 0; i < 5 && (await bolt.evaluate((b) => (b as SVGElement).style.left)) === before; i++) {
    await bolt.dispatchEvent("animationiteration");
  }
  expect(await bolt.evaluate((b) => (b as SVGElement).style.left)).not.toBe(before);
});

test("if the weather service is down, the desktop simply stays sunny", async ({ page }) => {
  await page.unroute(WEATHER);
  await page.route(WEATHER, (r) => r.fulfill({ status: 503, body: "down" }));
  await page.goto("./#");
  await page.waitForTimeout(500);
  await expect(page.locator("html")).not.toHaveAttribute("data-weather", /.+/);
  await expect(page.locator("#weather")).toBeHidden();
  await expect(page.locator("[data-wx-text]")).toContainText("Couldn't reach the weather service");
  expect(await page.locator(".wallpaper svg").evaluate((s) => getComputedStyle(s).backgroundImage)).toContain("sun");
  errors.length = 0; // the browser logs the failed request itself; the page must not break
});

test("clicking the wallpaper animals tells facts about Kristóf", async ({ page, isMobile }) => {
  await page.addInitScript(() => sessionStorage.setItem("kk-booted", "1"));
  await page.goto("./");
  await settled(page);
  const size = page.viewportSize()!;
  // a point on the animal that no desktop icon covers (on phones the Recycle Bin overlaps the black sheep)
  const centreOf = async (selector: string) => {
    for (const el of await page.locator(selector).all()) {
      const b = await el.boundingBox();
      if (!b || b.x < 0 || b.x + b.width > size.width || b.y + b.height > size.height - 50) continue;
      for (const fx of [0.5, 0.3, 0.7, 0.15]) {
        const p = { x: Math.round(b.x + b.width * fx), y: Math.round(b.y + b.height / 2) };
        if (await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest(".icon"), p)) return p;
      }
    }
    throw new Error(`no ${selector} free to click`);
  };
  const talk = page.locator(".animal-talk");
  const cow = await centreOf(".wallpaper .cow");
  const click = (p: { x: number; y: number }) =>
    isMobile ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y);
  await click(cow);
  await expect(talk).toBeVisible();
  await expect(talk).toContainText("Mooo!");
  const first = await talk.textContent();
  await page.getByRole("button", { name: "start" }).click(); // clicking anything else hides the bubble
  await expect(talk).toBeHidden();
  await page.keyboard.press("Escape");
  await click(cow);
  await expect(talk).toBeVisible();
  await expect(talk).not.toHaveText(first ?? ""); // a new fact each click
  await page.keyboard.press("Escape");
  await expect(talk).toBeHidden();
  await click(cow);
  if (isMobile) {
    // phones snap taps near the Recycle Bin onto it, and the black sheep sits right beside it: use a white one
    await click(await centreOf(".wallpaper .sheep:not(.black)"));
    await expect(talk).toContainText("Baa!");
  } else {
    await click(await centreOf(".wallpaper .sheep.black"));
    await expect(talk).toContainText("black sheep");
  }
  await click(await centreOf(".wallpaper .stork"));
  await expect(talk).toContainText("Klepp-klepp!");
  if (!isMobile) {
    // a selection drag that ends on an animal is not a click on it
    await page.reload();
    await settled(page);
    await page.mouse.move(cow.x + 150, cow.y - 120);
    await page.mouse.down();
    await page.mouse.move(cow.x, cow.y, { steps: 5 });
    await page.mouse.up();
    await expect(talk).toBeHidden();
  }
});

test("Racka slides in, introduces itself, gives a tour and can be sent away", async ({ page }) => {
  await page.goto("./?racka=1"); // the only test that keeps Racka on
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: /IT recruiter/ }).click();
  const head = page.getByRole("button", { name: "Racka, your guide: click to talk" });
  const racka = page.getByRole("dialog", { name: "Racka the guide" });
  await expect(head).toBeVisible();
  await expect(racka).toContainText("Hey, I'm Racka, Kristóf's helper and the guide to this website.");

  // the tour highlights each part of the screen it talks about
  await racka.getByRole("button", { name: "Show me around" }).click();
  await expect(racka).toContainText("(1/5)");
  await expect(page.locator(".desktop > .icons")).toHaveClass(/tour-spot/);
  for (const target of [".start", "#weather", "#clock"]) {
    await racka.getByRole("button", { name: "Next ›" }).click();
    await expect(page.locator(target)).toHaveClass(/tour-spot/);
  }
  await racka.getByRole("button", { name: "Next ›" }).click();
  await expect(racka).toContainText("(5/5)");
  await expect(page.locator(".tour-spot")).toHaveCount(0);
  await racka.getByRole("button", { name: "Done" }).click();
  await expect(racka).toBeHidden();

  // menu: who is Kristóf, and the recruiter shortcut
  await head.click();
  await racka.getByRole("button", { name: "Who is Kristóf?" }).click();
  await expect(racka).toContainText("Developer Experience Engineer");
  await racka.getByRole("button", { name: "Back" }).click();
  await expect(racka.getByRole("button", { name: "Open his resume" })).toBeVisible();
  await page.keyboard.press("Escape"); // closes Racka's bubble, not the resume window under it
  await expect(racka).toBeHidden();
  await expect(page.getByRole("dialog", { name: /My Resume/ })).toBeVisible();

  await head.click();
  await racka.getByRole("button", { name: "Bye, Racka" }).click();
  await expect(head).toBeHidden();
  await page.reload(); // stays away for the rest of the visit
  await expect(head).toBeHidden();
  // ...until the little Racka head in the tray calls him back
  await page.getByRole("button", { name: /call him or open his menu/ }).click();
  await expect(head).toBeVisible();
  await expect(racka).toContainText("Welcome back!");
  // the R key does the same: closes the bubble, then opens Racka's menu again
  await page.keyboard.press("r");
  await expect(racka).toBeHidden();
  await page.keyboard.press("r");
  await expect(racka).toContainText("What would you like to do?");
});

test("desktop icons drag onto the grid, never onto each other, alone or as a group, remembered", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "phones drag after a long press, tested below");
  await page.addInitScript(() => sessionStorage.setItem("kk-booted", "1"));
  await page.goto("./");
  await settled(page);
  const icons = page.locator(".desktop > .icons");
  const box = async (name: string) => (await icons.getByRole("button", { name, exact: true }).boundingBox())!;
  const onGrid = (b: { x: number; y: number }) => (b.x - 8) % 94 === 0 && (b.y - 8) % 94 === 0;
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  };
  const ngos = await box("NGOs");
  await drag({ x: ngos.x + 40, y: ngos.y + 30 }, { x: 640, y: 300 });
  const dropped = await box("NGOs");
  expect(onGrid(dropped)).toBe(true); // snapped to the grid cell nearest the drop
  expect(Math.abs(dropped.x + 40 - 640)).toBeLessThan(94);
  expect((await box("My Resume")).x).toBe(8); // the others stay put
  await expect(page.locator(".window:not([hidden])")).toHaveCount(0); // dragging doesn't open it

  // dropping onto another icon lands in the nearest free cell instead
  const hobbies = await box("Hobbies");
  await drag({ x: hobbies.x + 40, y: hobbies.y + 30 }, { x: dropped.x + 40, y: dropped.y + 30 });
  const next = await box("Hobbies");
  expect(onGrid(next)).toBe(true);
  expect(next.x === dropped.x && next.y === dropped.y).toBe(false);
  expect(Math.hypot(next.x - dropped.x, next.y - dropped.y)).toBeLessThanOrEqual(94 * 1.5);

  // group drag: select two with the rectangle, drag one, both move by the same whole number of cells
  await drag({ x: 400, y: 20 }, { x: 20, y: 380 });
  const group = [await box("My Resume"), await box("Other Stuff")];
  await drag({ x: group[0].x + 40, y: group[0].y + 30 }, { x: group[0].x + 340, y: group[0].y + 30 });
  const after = [await box("My Resume"), await box("Other Stuff")];
  const moved = after.map((a, k) => a.x - group[k].x);
  expect(moved[0]).toBe(moved[1]);
  expect(moved[0] % 94).toBe(0);

  await page.reload(); // remembered in this browser
  await settled(page);
  expect(await box("NGOs")).toEqual(dropped);
  await page.mouse.click(700, 160, { button: "right" }); // right-click the empty desktop
  await page.getByRole("menuitem", { name: "Arrange icons" }).click();
  expect((await box("NGOs")).x).toBe(8);
});

test("on phones a long press picks an icon up to drag it; a quick swipe doesn't, a tap still opens", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "desktop drags at once, tested above");
  await page.addInitScript(() => sessionStorage.setItem("kk-booted", "1"));
  await page.goto("./");
  await settled(page);
  const icons = page.locator(".desktop > .icons");
  const box = async (name: string) => (await icons.getByRole("button", { name, exact: true }).boundingBox())!;
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, holdMs: number) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(holdMs);
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  };
  const ngos = await box("NGOs");
  await drag({ x: ngos.x + 40, y: ngos.y + 30 }, { x: ngos.x + 240, y: ngos.y + 30 }, 0);
  expect(await box("NGOs")).toEqual(ngos); // a swipe without holding leaves it

  await drag({ x: ngos.x + 40, y: ngos.y + 30 }, { x: ngos.x + 240, y: ngos.y + 30 }, 600);
  const dropped = await box("NGOs");
  expect(dropped.x).toBeGreaterThan(ngos.x + 94); // moved right, onto the grid
  expect((dropped.x - 8) % 94).toBe(0);
  await expect(page.locator(".window:not([hidden])")).toHaveCount(0); // the drag didn't open it

  await page.reload(); // remembered on this phone
  await settled(page);
  expect(await box("NGOs")).toEqual(dropped);
  await icons.getByRole("button", { name: "NGOs", exact: true }).click();
  await expect(page.locator(".window:not([hidden])")).toHaveCount(1); // a tap still opens
});

test("arrow keys move between desktop icons; Shift extends the selection; Enter opens it", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("kk-booted", "1"));
  await page.goto("./");
  const icons = page.locator(".desktop > .icons");
  const resume = icons.getByRole("button", { name: "My Resume", exact: true });
  await resume.focus();
  await page.keyboard.press("ArrowDown");
  const ngos = icons.getByRole("button", { name: "NGOs", exact: true });
  await expect(ngos).toBeFocused();
  await expect(icons.locator(".icon.selected")).toHaveCount(1);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(icons.getByRole("button", { name: "Hobbies", exact: true })).toBeFocused();
  await expect(icons.locator(".icon.selected")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "NGOs" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Hobbies" })).toBeVisible();
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

test("Wall Sweeper: first knock starts the clock, right-click marks, Expert and F2 from the menu", async ({
  page,
  isMobile,
}) => {
  await skipBoot(page);
  await openIcon(page, "Games", isMobile);
  await openIcon(page, "Wall Sweeper", isMobile);
  const win = page.locator(".window.active");
  const left = win.locator("[data-left]");
  const time = win.locator("[data-time]");
  const cells = win.locator('[role="gridcell"]');
  await expect(cells).toHaveCount(81);
  await expect(left).toHaveAttribute("aria-label", "10 hollow spots left");
  await expect(time).toHaveAttribute("aria-label", "0 seconds");
  await (isMobile ? cells.nth(40).tap() : cells.nth(40).click());
  await expect(cells.nth(40)).not.toHaveAttribute("aria-label", "hidden"); // the first knock is always safe
  await expect(time).not.toHaveAttribute("aria-label", "0 seconds");
  if (!isMobile) {
    await win.locator('[role="gridcell"][aria-label="hidden"]').first().click({ button: "right" });
    await expect(left).toHaveAttribute("aria-label", "9 hollow spots left");
    // both buttons on a number: XP presses its 3×3 block down and Racka looks surprised
    const n = await win.evaluate((w) => {
      const all = [...w.querySelectorAll<HTMLElement>('[role="gridcell"]')];
      return all.findIndex(
        (c, i) =>
          /^[1-8]$/.test(c.textContent!) &&
          [-10, -9, -8, -1, 1, 8, 9, 10].some(
            (d) => all[i + d]?.getAttribute("aria-label") === "hidden" && Math.abs(((i + d) % 9) - (i % 9)) <= 1,
          ),
      );
    });
    if (n >= 0) {
      const box = (await cells.nth(n).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.down({ button: "right" });
      await expect(win.locator("[data-face]")).toHaveAttribute("data-face", "wow");
      await expect(win.locator('[role="gridcell"].o[aria-label="hidden"]').first()).toBeVisible();
      await page.mouse.up({ button: "right" });
      await page.mouse.up();
    }
  }
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitemradio", { name: "Expert" }).click();
  await expect(cells).toHaveCount(480);
  await expect(left).toHaveAttribute("aria-label", "99 hollow spots left");
  await page.keyboard.press("F2");
  await expect(time).toHaveAttribute("aria-label", "0 seconds");
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitemradio", { name: "Beginner" }).click();
  await expect(cells).toHaveCount(81);
});

test("Solitaire: XP deal, Draw Three, Options redeal with Draw One, secret win and Deal again", async ({
  page,
  isMobile,
}) => {
  await skipBoot(page);
  await openIcon(page, "Games", isMobile);
  await openIcon(page, "Solitaire", isMobile);
  const win = page.locator(".window.active");
  const cards = win.locator(".sol-card");
  await expect(cards).toHaveCount(52);
  await expect(win.locator('.sol-card:not([data-look^="back"])')).toHaveCount(7); // one face up per column
  await expect(win.locator("[data-score]")).toHaveText("Score: 0");
  const stock = win.locator(".sol-stock");
  const deck = async () => {
    const box = (await stock.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  await deck();
  await expect(win.locator('.sol-card:not([data-look^="back"])')).toHaveCount(10); // Draw Three
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Options…" }).click();
  await page.locator("label", { hasText: "Draw One" }).click();
  await page.getByRole("button", { name: "OK" }).click();
  await expect(win.locator('.sol-card:not([data-look^="back"])')).toHaveCount(7); // changing the draw deals again
  await deck();
  await expect(win.locator('.sol-card:not([data-look^="back"])')).toHaveCount(8);
  await expect(win.locator("[data-time]")).not.toHaveText("Time: 0", { timeout: 3000 });
  await win.locator(".sol-table").click({ button: "right", position: { x: 5, y: 300 } }); // send up what fits: no error
  await page.keyboard.press("Alt+Shift+2");
  await expect(win.locator(".sol-bounce")).toBeVisible();
  await win.locator(".sol-table").click({ position: { x: 300, y: 300 } });
  await expect(page.getByRole("dialog", { name: "Game Over" })).toBeVisible();
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(win.locator('.sol-card:not([data-look^="back"])')).toHaveCount(7);
  // Deal during the win animation stops it: no "Deal again?" pops up over the new game
  await page.keyboard.press("Alt+Shift+2");
  await expect(win.locator(".sol-bounce")).toBeVisible();
  await page.keyboard.press("F2");
  await expect(win.locator(".sol-bounce")).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(page.getByRole("dialog", { name: "Game Over" })).toBeHidden();
  await expect(win.locator('.sol-card:not([data-look^="back"])')).toHaveCount(7);
  // Esc cancels Options, even after an earlier OK
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Options…" }).click();
  await page.locator("label", { hasText: "Draw Three" }).click();
  await page.keyboard.press("Escape");
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Options…" }).click();
  await expect(page.locator('[data-options] input[name="draw"][value="1"]')).toBeChecked();
  await page.keyboard.press("Escape");
  // put the default back for the next run in this browser profile
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Options…" }).click();
  await page.locator("label", { hasText: "Draw Three" }).click();
  await page.getByRole("button", { name: "OK" }).click();
});

test("FreeCell: numbered deal, click-to-move into a free cell, Select Game, statistics", async ({ page, isMobile }) => {
  await skipBoot(page);
  await openIcon(page, "Games", isMobile);
  await openIcon(page, "FreeCell", isMobile);
  const win = page.locator(".window.active");
  await expect(win.locator(".sol-card")).toHaveCount(52);
  await expect(win.locator("[data-left]")).toHaveText("Cards Left: 52");
  // a column's bottom card, then a free cell: it moves there
  const before = await win.locator(".sol-card").evaluateAll((cs) => cs.map((c) => (c as HTMLElement).style.transform));
  await page.keyboard.press("1");
  await expect(win.locator(".fc-sel")).toHaveCount(1);
  await win.locator(".fc-cell").first().click();
  await expect(win.locator(".fc-sel")).toHaveCount(0);
  const after = await win.locator(".sol-card").evaluateAll((cs) => cs.map((c) => (c as HTMLElement).style.transform));
  expect(after.filter((t, i) => t !== before[i]).length).toBeGreaterThanOrEqual(1);
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Select Game…" }).click();
  await page.getByLabel(/Select a game number/).fill("617");
  await page.getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: "Yes" }).click(); // resign the game in progress
  await expect(win.locator("[data-dealno]")).toHaveText("Game #617");
  await expect(win.locator(".title-bar-text")).toContainText("FreeCell Game #617");
  await page.keyboard.press("F4");
  await expect(page.getByRole("dialog", { name: "FreeCell Statistics" })).toContainText("lost 1");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "FreeCell Statistics" })).toContainText("lost 0");
  await page.getByRole("button", { name: "OK" }).click();
});

test("Spider: one-suit deal, deal a row, hint, difficulty", async ({ page, isMobile }) => {
  await skipBoot(page);
  await openIcon(page, "Games", isMobile);
  await openIcon(page, "Spider Solitaire", isMobile);
  const win = page.locator(".window.active");
  const up = win.locator('.sol-card[data-id]:not([hidden]):not([data-look="back"])');
  await expect(win.locator(".sol-card[data-id]:not([hidden])")).toHaveCount(54);
  await expect(up).toHaveCount(10);
  await expect(win.locator("[data-score]")).toContainText("Score: 500");
  await win.locator("[data-stock]").click();
  await expect(win.locator(".sol-card[data-id]:not([hidden])")).toHaveCount(64);
  await expect(win.locator("[data-stock]")).toHaveAttribute("aria-label", "Deal next row (4 left)");
  await page.keyboard.press("m");
  await expect(win.locator(".sp-hint").first()).toBeVisible();
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Difficulty…" }).click();
  await page.locator("label", { hasText: "Advanced: four suits" }).click();
  await page.getByRole("button", { name: "OK" }).click();
  await expect(win.locator("[data-stock]")).toHaveAttribute("aria-label", "Deal next row (5 left)");
  const suits = await up.evaluateAll((cs) => new Set(cs.map((c) => (c as HTMLElement).dataset.look![0])).size);
  expect(suits).toBeGreaterThan(1);
  // back to Beginner for the next run
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Difficulty…" }).click();
  await page.locator("label", { hasText: "Beginner: one suit" }).click();
  await page.getByRole("button", { name: "OK" }).click();
});

test("Hearts: name, pass three left, accept, the 2 of clubs leads and the bots answer", async ({ page, isMobile }) => {
  await skipBoot(page);
  await openIcon(page, "Games", isMobile);
  await openIcon(page, "Hearts", isMobile);
  const win = page.locator(".window.active");
  await page.getByLabel("What is your name?").fill("Tester");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(win.locator("[data-name='0']")).toContainText("Tester");
  const hand = win.locator("[data-hand] [data-card]");
  await expect(hand).toHaveCount(13);
  const act = win.locator("[data-pass]");
  await expect(act).toHaveText("Pass Left");
  await expect(act).toBeDisabled();
  // cards overlap: click the visible left edge, as a player would
  for (let i = 0; i < 3; i++) await hand.nth(i).click({ position: { x: 6, y: 30 } });
  await act.click();
  await expect(act).toHaveText("OK");
  await expect(win.locator(".hz-card.up")).toHaveCount(3);
  await act.click();
  // either you hold the 2 of clubs and must lead it, or the bots have played up to your turn
  await expect(win.locator("[data-msg]")).toHaveText(/Lead the 2 of clubs|Click the card you want to play/, {
    timeout: 10000,
  });
  const playable = win.locator('[data-hand] [data-card]:not([aria-disabled="true"])').first();
  await playable.click({ position: { x: 6, y: 30 } });
  await expect(hand).toHaveCount(12);
  await expect(win.locator(".hz-played").first()).toBeVisible();
});

test("Game Zone: Internet → Favorites → Zone → Internet Reversi against a bot, then Exit", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(45_000);
  await skipBoot(page);
  await openIcon(page, "Internet", isMobile);
  const win = page.getByRole("dialog", { name: /Internet/ });
  await win.getByRole("button", { name: "Skip" }).click();
  await win.getByRole("button", { name: /Surf with me/ }).click();
  await win.getByRole("button", { name: /KK Game Zone/ }).click();
  await expect(win.locator("[data-ie-address]")).toHaveValue("kk://zone");
  await win.getByRole("button", { name: /Internet Reversi/ }).click();
  await page.getByRole("button", { name: "Play" }).click();
  await expect(win.locator("[data-ie-address]")).toHaveValue("kk://zone/reversi");
  await expect(win.locator("[data-zone-connect] li")).toHaveCount(4, { timeout: 8000 });
  const cells = win.locator(".rv-board [data-i]");
  await expect(cells).toHaveCount(64);
  await expect(win.locator("[data-zone-players] li")).toHaveCount(2);
  await expect(win.locator("[data-ie-status]")).toHaveText(/Your turn/, { timeout: 8000 });
  const stones = () => win.locator(".rv-board svg").count();
  const before = await stones();
  // try squares from the keyboard (an illegal one only beeps) until a stone goes down
  for (let i = 0; i < 64 && (await stones()) === before; i++) {
    await cells.nth(i).focus();
    await page.keyboard.press("Enter");
  }
  expect(await stones()).toBeGreaterThan(before);
  await win.locator("[data-zone-say]").selectOption("Hello!");
  await expect(win.locator("[data-zone-chat]")).toContainText("You: Hello!");
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Exit" }).click();
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(win.locator("[data-ie-address]")).toHaveValue("kk://zone");
});

test("Game Zone: Internet Checkers, pick a piece and step forward, Offer Draw toggles", async ({ page, isMobile }) => {
  test.setTimeout(45_000);
  await skipBoot(page);
  await openIcon(page, "Internet", isMobile);
  const win = page.getByRole("dialog", { name: /Internet/ });
  await win.getByRole("button", { name: "Skip" }).click();
  await win.getByRole("button", { name: /Surf with me/ }).click();
  await win.getByRole("button", { name: /KK Game Zone/ }).click();
  await win.getByRole("button", { name: /Internet Checkers/ }).click();
  await page.getByRole("button", { name: "Play" }).click();
  await expect(win.locator("[data-ie-address]")).toHaveValue("kk://zone/checkers");
  const cells = win.locator(".ck-board [data-v]");
  await expect(cells).toHaveCount(64, { timeout: 8000 });
  await expect(win.locator(".ck-board .ck-piece")).toHaveCount(24);
  await expect(win.locator("[data-ie-status]")).toHaveText(/Your turn/, { timeout: 8000 });
  // a picked piece goes back when clicked again, and another can be picked instead
  await cells.nth(44).click();
  await expect(win.locator(".ck-board .sel")).toHaveCount(1);
  await cells.nth(44).click();
  await expect(win.locator(".ck-board .sel")).toHaveCount(0);
  // your front row is row 5 of the view (cells 40, 42, 44, 46); step one up-left onto the empty row 4
  await cells.nth(46).click();
  await expect(win.locator('.ck-board [data-v="46"].sel')).toHaveCount(1);
  await cells.nth(37).click();
  await expect(win.locator('.ck-board [data-v="37"] .ck-piece')).toHaveCount(1);
  await expect(win.locator('.ck-board [data-v="46"] .ck-piece')).toHaveCount(0);
  await win.getByRole("button", { name: "Offer Draw" }).click();
  await expect(win.getByRole("button", { name: "Offer Draw" })).toHaveAttribute("aria-pressed", "true");
});

test("Game Zone: Internet Backgammon, roll for the start, then move a stone onto a green diamond", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60_000);
  await skipBoot(page);
  await openIcon(page, "Internet", isMobile);
  const win = page.getByRole("dialog", { name: /Internet/ });
  await win.getByRole("button", { name: "Skip" }).click();
  await win.getByRole("button", { name: /Surf with me/ }).click();
  await win.getByRole("button", { name: /KK Game Zone/ }).click();
  await win.getByRole("button", { name: /Internet Backgammon/ }).click();
  await page.getByRole("button", { name: "Play" }).click();
  await expect(win.locator("[data-ie-address]")).toHaveValue("kk://zone/backgammon");
  await expect(win.locator(".bg-board .bg-pt")).toHaveCount(24, { timeout: 8000 });
  await expect(win.locator(".bg-pt .bg-st")).toHaveCount(30);
  const score = win.locator("[data-bg-score]");
  await expect(score).toContainText("Pips: You 167");
  const status = win.locator("[data-ie-status]");
  // the opening roll: one die each, a tie rolls again
  do await win.getByRole("button", { name: "Roll" }).click();
  while (/Tie/.test((await status.textContent()) ?? ""));
  await expect(status).toHaveText(/Your move|Your turn/, { timeout: 20_000 });
  if (/Your turn/.test((await status.textContent()) ?? "")) await win.getByRole("button", { name: "Roll" }).click();
  await expect(status).toHaveText(/Your move/);
  const pips = await score.textContent();
  // pick up the first stone that can move: green diamonds appear, a hollow one on its point
  for (let p = 24; p > 0; p--) {
    await win.locator(`[data-bg="${p}"]`).click();
    if (await win.locator(".bg-dia.from").count()) break;
  }
  const target = win.locator(".bg-board button", { has: page.locator(".bg-dia:not(.from)") }).first();
  await expect(target).toBeVisible();
  await target.click();
  await expect(score).not.toHaveText(pips!);
  await expect(win.locator(".bg-die.used")).not.toHaveCount(0);
});

test("Game Zone: Internet Hearts, pass, double-click a card, Last Trick, Auto-Play, Show Score", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60_000);
  await skipBoot(page);
  await openIcon(page, "Internet", isMobile);
  const win = page.getByRole("dialog", { name: /Internet/ });
  await win.getByRole("button", { name: "Skip" }).click();
  await win.getByRole("button", { name: /Surf with me/ }).click();
  await win.getByRole("button", { name: /KK Game Zone/ }).click();
  await win.getByRole("button", { name: /Internet Hearts/ }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(win.locator("[data-ie-address]")).toHaveValue("kk://zone/hearts");
  const hand = win.locator("[data-hand] [data-card]");
  await expect(hand).toHaveCount(13, { timeout: 8000 });
  await expect(win.locator("[data-zone-players] li")).toHaveCount(4);
  // the first hand passes left; hand cards overlap, so click their left edge
  const act = win.locator("[data-ih-act]");
  await expect(act).toHaveText("Pass Left");
  for (const i of [0, 1, 2]) await hand.nth(i).click({ position: { x: 6, y: 30 } });
  await act.click();
  await expect(act).toHaveText("OK");
  await act.click();
  await expect(win.locator("[data-ie-status]")).toHaveText(/Your turn/, { timeout: 10000 });
  await win
    .locator('[data-hand] [data-card]:not([aria-disabled="true"])')
    .first()
    .dblclick({ position: { x: 6, y: 30 } });
  await expect(hand).toHaveCount(12);
  await expect(win.locator(".hz-played.hz-at-0")).toBeVisible();
  // once the trick is taken, Last Trick shows its four cards again
  await expect(win.locator("[data-ih-last]")).toBeEnabled({ timeout: 10000 });
  await win.locator("[data-ih-last]").click();
  await expect(win.locator(".ih-last .hz-played")).toHaveCount(4);
  // Auto-Play: the computer plays your next card
  await win.locator("[data-ih-auto]").click();
  await expect(win.locator("[data-ih-auto]")).toHaveText("Stop");
  await expect(hand).toHaveCount(11, { timeout: 10000 });
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Show Score" }).click();
  await expect(page.getByRole("dialog", { name: "Score History" })).toBeVisible();
});

test("Game Zone: Internet Spades, Show Cards, bid, lead a card, Last Trick, Auto-Play, Show Score", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60_000);
  await skipBoot(page);
  await openIcon(page, "Internet", isMobile);
  const win = page.getByRole("dialog", { name: /Internet/ });
  await win.getByRole("button", { name: "Skip" }).click();
  await win.getByRole("button", { name: /Surf with me/ }).click();
  await win.getByRole("button", { name: /KK Game Zone/ }).click();
  await win.getByRole("button", { name: /Internet Spades/ }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(win.locator("[data-ie-address]")).toHaveValue("kk://zone/spades");
  // your cards stay face down until you choose Show Cards (or Double Nil)
  await expect(win.locator("[data-hand] .hz-card")).toHaveCount(13, { timeout: 8000 });
  const hand = win.locator("[data-hand] [data-card]");
  await expect(hand).toHaveCount(0);
  await win.getByRole("button", { name: "Show Cards" }).click();
  await expect(hand).toHaveCount(13);
  // the first dealer sits on your right, so you bid first and lead first
  await win.locator('[data-ask] [data-v="3"]').click();
  await expect(win.locator('[data-name="0"]')).toContainText("0/3");
  await expect(win.locator("[data-ie-status]")).toHaveText(/Your lead/, { timeout: 10000 });
  await win
    .locator('[data-hand] [data-card]:not([aria-disabled="true"])')
    .first()
    .dblclick({ position: { x: 6, y: 30 } });
  await expect(hand).toHaveCount(12);
  await expect(win.locator(".hz-played.hz-at-0")).toBeVisible();
  await expect(win.locator("[data-ih-last]")).toBeEnabled({ timeout: 10000 });
  await win.locator("[data-ih-last]").click();
  await expect(win.locator(".ih-last .hz-played")).toHaveCount(4);
  await win.locator("[data-ih-auto]").click();
  await expect(win.locator("[data-ih-auto]")).toHaveText("Stop");
  await expect(hand).toHaveCount(11, { timeout: 10000 });
  await win.getByRole("menuitem", { name: "Game" }).click();
  await page.getByRole("menuitem", { name: "Show Score" }).click();
  await expect(page.getByRole("dialog", { name: "Score History" })).toBeVisible();
});

test("pipeline game starts its timer on the first click", async ({ page, isMobile }) => {
  await skipBoot(page);
  await openIcon(page, "Games", isMobile);
  await openIcon(page, "Pipeline Green", isMobile);
  const time = page.locator(".window.active [data-time]");
  await expect(time).toHaveText("Time: 60s");
  await page.locator(".pipe").first().click();
  await expect(time).not.toHaveText("Time: 60s", { timeout: 3000 });
});

test("no sideways scroll and windows fit the screen", async ({ page, isMobile }) => {
  await page.goto("./#resume");
  await settled(page);
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
  await openIcon(page, "Games", isMobile);
  await openIcon(page, "Pipeline Green", isMobile);
  await settled();
  await page.screenshot({ path: `${dir}-4-game.png` });
  await page.getByRole("button", { name: "start" }).click();
  await settled();
  await page.screenshot({ path: `${dir}-5-start.png` });
});
