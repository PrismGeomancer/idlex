const { chromium } = require(process.env.IDLE_PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    ...(process.env.IDLE_CHROME_PATH
      ? { executablePath: process.env.IDLE_CHROME_PATH }
      : {}),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://localhost:4173");
  await p
    .getByRole("heading", { name: "Put idle intelligence to work." })
    .waitFor();
  await p.screenshot({
    path: (process.env.IDLE_QA_OUTPUT || "/tmp") + "/idle-audit-overview.png",
    fullPage: true,
  });
  const state = () =>
    p.evaluate(() => JSON.parse(localStorage.getItem("idle-devnet-v2")));
  const routeNav = () =>
    p
      .locator("#nav")
      .getByRole("button", { name: "Route a task", exact: true })
      .click();
  const networkNav = () =>
    p
      .locator("#nav")
      .getByRole("button", { name: "Agent network", exact: true })
      .click();
  for (const range of ["1h", "7d", "24h"]) {
    await p.getByRole("button", { name: range, exact: true }).click();
    assert.equal(
      await p
        .getByRole("button", { name: range, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.match(
      await p.locator(".chart").getAttribute("aria-label"),
      new RegExp(range),
    );
  }
  await networkNav();
  assert.equal(await p.locator("tbody tr").count(), 20);
  await p.getByLabel("Search agents", { exact: true }).fill("not-an-agent");
  assert.match(await p.locator("tbody").textContent(), /No agents match/);
  await p.getByRole("button", { name: "Reset", exact: true }).click();
  for (const capability of [
    "Code Generation",
    "Research",
    "Translation",
    "Monitoring",
  ]) {
    await p.getByLabel("Filter by capability").selectOption(capability);
    const expected = (await state()).agents.filter((a) =>
      a.caps.includes(capability),
    );
    assert.equal(await p.locator("tbody tr").count(), expected.length);
  }
  await p.getByRole("button", { name: "Reset", exact: true }).click();
  for (const status of ["Available", "Idle", "Busy", "Offline"]) {
    await p.getByLabel("Filter by status").selectOption(status);
    const labels = await p.locator("tbody .status").allTextContents();
    assert(labels.every((s) => s === status));
    assert(labels.length > 0);
  }
  await p.getByRole("button", { name: "Reset", exact: true }).click();
  for (const sort of [
    "Lowest RTT",
    "Most free slots",
    "Most tasks completed",
    "Name A–Z",
    "Recommended",
  ]) {
    await p.getByLabel("Sort agents").selectOption(sort);
    assert.equal(await p.getByLabel("Sort agents").inputValue(), sort);
  }
  await p.getByLabel("Search agents", { exact: true }).fill("Atlas-R2");
  await p
    .locator("tbody")
    .getByRole("button", { name: "Atlas-R2", exact: false })
    .click();
  assert.match(
    await p.locator("dialog").textContent(),
    /Archived fixture counters have no individual traces/,
  );
  await p.getByRole("button", { name: "Set offline", exact: true }).click();
  assert.match(await p.locator("dialog .status").textContent(), /Offline/);
  await p.getByRole("button", { name: "Bring online", exact: true }).click();
  await p.getByRole("button", { name: "Close dialog" }).click();
  await p.locator("#connect-top").click();
  await p.getByLabel("Agent name", { exact: true }).fill("Custom-01");
  await p
    .getByLabel("Runtime / model", { exact: true })
    .selectOption("Custom runtime");
  await p.getByLabel("Custom runtime name").fill("Research adapter");
  await p.getByLabel("Research", { exact: true }).check();
  await p.getByLabel("Endpoint alias", { exact: true }).fill("custom-01.local");
  await p.getByLabel("Maximum concurrent tasks").fill("1");
  await p.getByRole("button", { name: "Register agent", exact: true }).click();
  await p
    .locator("tbody")
    .getByRole("button", { name: "Custom-01", exact: false })
    .waitFor();
  assert.match(await p.locator("tbody").textContent(), /Idle/);
  assert.match(await p.locator("tbody").textContent(), /0\/1 slots/);
  await p
    .locator("tbody")
    .getByRole("button", { name: "Custom-01", exact: false })
    .click();
  assert.match(
    await p.locator("dialog").textContent(),
    /No completed attempts/,
  );
  await p.getByRole("button", { name: "Close dialog" }).click();
  await routeNav();
  await p
    .getByLabel("Task instruction", { exact: true })
    .fill("Inspect my custom research agent.");
  await p.getByLabel("Auto route", { exact: true }).uncheck();
  const custom = (await state()).agents.find((a) => a.name === "Custom-01");
  await p.getByLabel("Select an agent").selectOption(custom.id);
  await p.getByLabel("Priority", { exact: true }).selectOption("High");
  await p.getByRole("button", { name: "Route task", exact: true }).click();
  assert.equal(await p.getByLabel("Task category").isDisabled(), true);
  await p.getByText("Custom-01 selected", { exact: true }).waitFor();
  await p.locator("#agent-selection summary").click();
  assert.match(
    await p.locator("#agent-selection").textContent(),
    /Selected by you/,
  );
  await networkNav();
  await p.getByLabel("Search agents", { exact: true }).fill("Custom-01");
  await p
    .locator("tbody")
    .getByRole("button", { name: "Custom-01", exact: false })
    .click();
  assert.match(await p.locator("dialog").textContent(), /Busy/);
  assert.equal(
    await p
      .getByRole("button", { name: "Set offline", exact: true })
      .isDisabled(),
    true,
  );
  await p
    .locator("dialog .status")
    .getByText("Idle", { exact: true })
    .waitFor({ timeout: 10000 });
  await p.getByRole("button", { name: "Close dialog" }).click();
  await routeNav();
  await p
    .getByRole("heading", { name: "Task completed", exact: true })
    .waitFor();
  const completed = (await state()).tasks.at(-1);
  assert.equal(completed.agentId, custom.id);
  assert.equal(completed.status, "Complete");
  const d = completed.durations;
  assert.equal(d.total, d.routing + d.queue + d.execution + d.verification);
  await p.getByRole("button", { name: "Copy result", exact: true }).click();
  assert.match(
    await p.evaluate(() => navigator.clipboard.readText()),
    /Inspect my custom research agent/,
  );
  await p.screenshot({
    path: (process.env.IDLE_QA_OUTPUT || "/tmp") + "/idle-audit-route.png",
    fullPage: true,
  });
  for (const category of [
    "Code",
    "Analysis",
    "Market Intelligence",
    "Summarization",
    "Classification",
  ]) {
    await p.getByLabel("Task category").selectOption(category);
    await p.getByLabel("Auto route", { exact: true }).check();
    await p
      .getByLabel("Task instruction", { exact: true })
      .fill("Verify " + category + " fixture.");
    await p.getByRole("button", { name: "Route task", exact: true }).click();
    await p
      .getByRole("heading", { name: "Task completed", exact: true })
      .waitFor({ timeout: 12000 });
    assert.equal((await state()).tasks.at(-1).output.category, category);
    console.log("PASS visible category", category);
  }
  await p.getByLabel("Demo outcome").selectOption("Agent timeout");
  await p.getByRole("button", { name: "Route task", exact: true }).click();
  await p
    .getByRole("heading", { name: "Task failed", exact: true })
    .waitFor({ timeout: 12000 });
  assert.match(
    await p.locator("#task-result").textContent(),
    /deadline exceeded/,
  );
  const failedId = (await state()).tasks.at(-1).id;
  await p
    .locator("#task-result")
    .getByRole("button", { name: "Retry with a new task ID", exact: true })
    .click();
  assert.equal(
    await p.getByLabel("Demo outcome").inputValue(),
    "Successful run",
  );
  await p.getByRole("button", { name: "Route task", exact: true }).click();
  await p
    .getByRole("heading", { name: "Task completed", exact: true })
    .waitFor({ timeout: 12000 });
  const retry = (await state()).tasks.at(-1);
  assert.notEqual(retry.id, failedId);
  assert.equal(retry.parentId, failedId);
  await p.getByLabel("Demo outcome").selectOption("Invalid response");
  await p.getByRole("button", { name: "Route task", exact: true }).click();
  await p
    .getByRole("heading", { name: "Task failed", exact: true })
    .waitFor({ timeout: 12000 });
  assert.match(
    await p.locator("#task-result").textContent(),
    /schema validation/,
  );
  await p.getByLabel("Demo outcome").selectOption("Successful run");
  await p.getByRole("button", { name: "Route task", exact: true }).click();
  await p.getByRole("button", { name: "Cancel task", exact: true }).click();
  await p
    .getByRole("heading", { name: "Task cancelled", exact: true })
    .waitFor();
  await p.getByRole("button", { name: "Route task", exact: true }).click();
  await p.getByText("Agent selected", { exact: true }).count();
  await p.locator("#agent-selection .selection").waitFor();
  await p.reload();
  await p
    .getByRole("heading", { name: "Task interrupted", exact: true })
    .waitFor();
  assert.equal((await state()).tasks.at(-1).reserved, false);
  await p
    .locator("#nav")
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await p.getByRole("button", { name: "Pause feed", exact: true }).click();
  const frozen = await p.locator("#activity-feed").textContent();
  await p.waitForTimeout(12500);
  assert.equal(await p.locator("#activity-feed").textContent(), frozen);
  await p.getByRole("button", { name: "Resume feed", exact: true }).click();
  assert.notEqual(await p.locator("#activity-feed").textContent(), frozen);
  await p
    .locator("#nav")
    .getByRole("button", { name: "Documentation", exact: true })
    .click();
  for (const doc of [
    "What is IDLE?",
    "How routing works",
    "Connecting an agent",
    "Task API",
    "Agent capabilities",
    "Devnet",
    "$IDLE asset",
  ]) {
    await p
      .locator(".docs-nav")
      .getByRole("button", { name: doc, exact: true })
      .click();
    assert.equal(await p.locator(".doc-article h2").count(), 1);
  }
  await p.getByRole("button", { name: "Task API", exact: true }).click();
  await p
    .getByRole("button", { name: "Copy API example", exact: true })
    .click();
  assert.match(
    await p.evaluate(() => navigator.clipboard.readText()),
    /Idempotency-Key/,
  );
  await p.getByRole("button", { name: "Devnet", exact: true }).click();
  await p
    .getByRole("button", { name: "Reset local demo data", exact: true })
    .click();
  await p.getByRole("button", { name: "Cancel", exact: true }).click();
  assert((await state()).tasks.length > 0);
  await p
    .getByRole("button", { name: "Reset local demo data", exact: true })
    .click();
  await p.getByRole("button", { name: "Reset demo", exact: true }).click();
  assert.equal((await state()).tasks.length, 0);
  assert.equal((await state()).agents.length, 20);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await p.setViewportSize({ width, height: 900 });
    for (const section of [
      "Overview",
      "Agent network",
      "Route a task",
      "Activity",
      "Documentation",
    ]) {
      await p
        .locator("#nav")
        .getByRole("button", { name: section, exact: true })
        .click();
      const dimensions = await p.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
      }));
      assert(
        dimensions.scroll <= dimensions.width,
        JSON.stringify({ width, section, ...dimensions }),
      );
    }
    if (width === 390) {
      await p
        .locator("#nav")
        .getByRole("button", { name: "Overview", exact: true })
        .click();
      await p.screenshot({
        path: (process.env.IDLE_QA_OUTPUT || "/tmp") + "/idle-audit-mobile.png",
        fullPage: true,
      });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS all navigation, chart ranges, network search/filters/sorts, agent availability, custom registration, locked controls, live details, six categories, copying, retry, timeout, invalid response, cancellation, refresh recovery, paused telemetry, all docs, reset confirmation, 25 responsive view checks, no runtime errors",
  );
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
