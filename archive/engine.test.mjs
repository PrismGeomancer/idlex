import test from "node:test";
import assert from "node:assert/strict";
import {
  createSimulation,
  CATEGORIES,
  CAPABILITIES,
  STORAGE_KEY,
  TERMINAL,
} from "./engine.js";
const memory = () => {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
};
function quick(extra = {}) {
  let at = Date.parse("2026-10-05T10:00:00Z");
  return createSimulation({
    now: () => at,
    wait: async (ms, signal) => {
      if (signal.aborted) throw Error("Cancelled");
      at += ms;
      await Promise.resolve();
    },
    registrationDelay: 0,
    ...extra,
  });
}
const request = {
  prompt: "Inspect capacity",
  category: "Research",
  priority: "Normal",
  auto: true,
  outcome: "Successful run",
};
function invariant(s) {
  const all = s.agents(),
    m = s.metrics();
  assert.equal(
    m.completed,
    all.reduce((n, a) => n + a.completed, 0),
  );
  assert.equal(
    m.failed,
    all.reduce((n, a) => n + a.failed, 0),
  );
  assert.equal(m.free, m.slots - m.used);
  assert.equal(
    m.idleScore,
    m.slots ? 100 - Math.round((m.used / m.slots) * 100) : 0,
  );
  for (const a of all) {
    assert(a.occupied <= a.concurrent);
    assert(a.free >= 0);
    assert.equal(
      a.status,
      !a.online
        ? "Offline"
        : a.occupied === 0
          ? "Idle"
          : a.occupied === a.concurrent
            ? "Busy"
            : "Available",
    );
    if (!a.online) assert.equal(a.free, 0);
  }
}
function timing(t) {
  const d = t.durations;
  assert.equal(
    d.total,
    (d.routing || 0) +
      (d.queue || 0) +
      (d.execution || 0) +
      (d.verification || 0),
  );
}
test("all baseline metrics reconcile; no fabricated local timing average", () => {
  const s = quick();
  invariant(s);
  assert.equal(s.agents().length, 20);
  assert.equal(s.metrics().avgRouting, null);
  assert.equal(s.metrics().avgExecution, null);
  assert.equal(s.metrics().routed, s.metrics().completed + s.metrics().failed);
});
test("all six categories choose the documented best eligible agent and save valid output", async () => {
  for (const category of CATEGORIES) {
    const s = quick(),
      before = s.metrics(),
      expected = s.rank(category)[0].id;
    const t = await s.submit({ ...request, category });
    assert.equal(t.agentId, expected);
    assert.equal(t.status, "Complete");
    assert.equal(t.output.category, category);
    assert.equal(t.output.prompt, request.prompt);
    assert.equal(s.metrics().completed, before.completed + 1);
    assert.equal(s.metrics().routed, before.routed + 1);
    timing(t);
    invariant(s);
  }
});
test("manual routing honors choice; reserves and releases a real slot", async () => {
  const s = quick(),
    a = s.compatible("Research").at(-1),
    original = a.occupied;
  const unsubscribe = s.subscribe(() => {
    if (s.running) {
      const current = s.state.tasks.at(-1);
      if (current.reserved)
        assert.equal(
          s.agents().find((b) => b.id === a.id).occupied,
          original + 1,
        );
    }
  });
  const t = await s.submit({ ...request, auto: false, agent: a.id });
  unsubscribe();
  assert.equal(t.agentId, a.id);
  assert.equal(s.agents().find((b) => b.id === a.id).occupied, original);
  assert.equal(t.selection.reason, "Selected by you; eligibility validated");
  invariant(s);
});
test("concurrency=1 becomes Busy while reserved; new agents have unknown success", async () => {
  const s = quick(),
    a = await s.register({
      name: "Single",
      endpoint: "single.local",
      model: "Custom adapter",
      caps: ["Research"],
      concurrent: 1,
      availability: "Online",
    });
  assert.equal(a.success, null);
  s.subscribe(() => {
    const t = s.state.tasks.at(-1);
    if (t?.reserved)
      assert.equal(s.agents().find((b) => b.id === a.id).status, "Busy");
  });
  await s.submit({ ...request, auto: false, agent: a.id });
  const after = s.agents().find((b) => b.id === a.id);
  assert.equal(after.status, "Idle");
  assert.equal(after.success, 100);
  invariant(s);
});
test("priority affects queue latency without changing routing score", async () => {
  const queues = [];
  for (const priority of ["High", "Normal", "Low"]) {
    const s = quick();
    const t = await s.submit({ ...request, priority });
    queues.push(t.durations.queue);
    timing(t);
  }
  assert(queues[0] < queues[1] && queues[1] < queues[2]);
});
test("timeout and invalid envelopes fail and release capacity without verified output", async () => {
  for (const outcome of ["Agent timeout", "Invalid response"]) {
    const s = quick(),
      before = s.metrics();
    const t = await s.submit({ ...request, outcome });
    assert.equal(t.status, "Failed");
    assert.equal(t.output, null);
    assert.equal(t.reserved, false);
    assert.equal(s.metrics().failed, before.failed + 1);
    assert.equal(s.metrics().completed, before.completed);
    assert.equal(s.metrics().used, before.used);
    timing(t);
    invariant(s);
  }
});
test("cancellation works before selection and during execution; excludes success denominator", async () => {
  for (const cancelAt of ["Routing", "Executing"]) {
    const s = quick(),
      before = s.metrics();
    const unsubscribe = s.subscribe(() => {
      if (s.running && s.state.tasks.at(-1)?.status === cancelAt) s.cancel();
    });
    const t = await s.submit(request);
    unsubscribe();
    assert.equal(t.status, "Cancelled");
    assert.equal(t.reserved, false);
    assert.equal(s.metrics().used, before.used);
    assert.equal(s.metrics().success, before.success);
    timing(t);
    invariant(s);
  }
});
test("double submission is rejected without creating a duplicate trace", async () => {
  const s = quick();
  const first = s.submit(request);
  await assert.rejects(s.submit(request), /current task/);
  await first;
  assert.equal(s.state.tasks.length, 1);
});
test("all-offline capacity is zero and rejects routing", async () => {
  const s = quick();
  for (const a of s.agents()) s.setOnline(a.id, false);
  assert.equal(s.metrics().idleScore, 0);
  assert.equal(s.metrics().available, 0);
  assert.equal(s.metrics().slots, 0);
  await assert.rejects(s.submit(request), /No compatible agent/);
  assert.equal(s.state.tasks.length, 0);
  invariant(s);
});
test("manual selection rejects incompatible, offline, and full agents", async () => {
  const s = quick();
  for (const id of [
    s.agents().find((a) => a.name === "Cipher-12").id,
    s.agents().find((a) => a.name === "Prism-18").id,
    s.agents().find((a) => a.name === "Relay-8").id,
  ])
    await assert.rejects(
      s.submit({ ...request, auto: false, agent: id }),
      /online, compatible agent/,
    );
  assert.equal(s.state.tasks.length, 0);
});
test("availability cannot change on a reserved agent", async () => {
  const s = quick();
  let checked = false;
  s.subscribe(() => {
    const t = s.state.tasks.at(-1);
    if (t?.reserved) {
      assert.throws(() => s.setOnline(t.agentId, false), /reserved task/);
      checked = true;
    }
  });
  await s.submit(request);
  assert(checked);
});
test("eligibility rechecked at selection if capacity changed during scan", async () => {
  const s = quick();
  let changed = false;
  s.subscribe(() => {
    const t = s.state.tasks.at(-1);
    if (t?.stage === 3 && !changed) {
      changed = true;
      for (const a of s.compatible("Research")) s.setOnline(a.id, false);
    }
  });
  const t = await s.submit(request);
  assert.equal(t.status, "Failed");
  assert.equal(t.agentId, null);
  assert.equal(t.dispatchedAt, undefined);
  assert.equal(t.reserved, false);
  invariant(s);
});
test("stored in-flight tasks become interrupted and release reservations", async () => {
  const storage = memory(),
    s = quick({ storage });
  let snapshot;
  const unsub = s.subscribe(() => {
    const t = s.state.tasks.at(-1);
    if (t?.status === "Executing" && !snapshot)
      snapshot = storage.getItem(STORAGE_KEY);
  });
  await s.submit(request);
  unsub();
  storage.setItem(STORAGE_KEY, snapshot);
  const recovered = quick({ storage });
  assert.equal(recovered.state.tasks[0].status, "Interrupted");
  assert.equal(recovered.state.tasks[0].reserved, false);
  assert.equal(recovered.metrics().used, quick().metrics().used);
  assert(recovered.state.events.some((e) => e.text.includes("recovered")));
  invariant(recovered);
});
test("result snapshots stay unchanged after registry changes and reload", async () => {
  const storage = memory(),
    s = quick({ storage });
  const t = await s.submit({ ...request, category: "Analysis" }),
    snapshot = JSON.stringify(t.output);
  s.setOnline(s.agents()[0].id, false);
  assert.equal(JSON.stringify(t.output), snapshot);
  const again = quick({ storage });
  assert.equal(JSON.stringify(again.state.tasks[0].output), snapshot);
  assert.equal(again.metrics().completed, s.metrics().completed);
});
test("invalid inputs and corrupt storage fail safely", async () => {
  const storage = memory();
  storage.setItem(STORAGE_KEY, "{invalid");
  const s = quick({ storage });
  assert.equal(s.agents().length, 20);
  assert(s.persistenceWarning);
  for (const data of [
    { ...request, prompt: " " },
    { ...request, prompt: "x".repeat(3001) },
    { ...request, category: "Unknown" },
    { ...request, priority: "Urgent" },
    { ...request, outcome: "Fake" },
  ])
    await assert.rejects(s.submit(data));
  assert.equal(s.state.tasks.length, 0);
  const bad = createSimulation({
    storage: {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
    },
  });
  assert(bad.persistenceWarning);
});
test("registration enforces unique names/endpoints and declared capability/concurrency schema", async () => {
  const s = quick();
  const data = {
    name: "New",
    endpoint: "new.local",
    model: "Runtime",
    caps: ["Research"],
    concurrent: 4,
    availability: "Offline",
  };
  await s.register(data);
  assert.equal(s.agents().at(-1).free, 0);
  assert.equal(s.agents().at(-1).success, null);
  for (const input of [
    { ...data, name: "Other" },
    { ...data, name: " New ", endpoint: "other.local" },
    { ...data, name: "Bad", endpoint: "bad alias" },
    { ...data, name: "Bad", endpoint: "other", caps: [] },
    { ...data, name: "Bad", endpoint: "other", caps: ["Unknown"] },
    { ...data, name: "Bad", endpoint: "other", concurrent: 1.5 },
    { ...data, name: "Bad", endpoint: "other", concurrent: 65 },
  ])
    await assert.rejects(s.register(input));
  invariant(s);
});
test("reset restores baseline agents/counters and removes tasks", async () => {
  const s = quick();
  await s.submit(request);
  s.setOnline(s.agents()[0].id, false);
  s.reset();
  assert.equal(s.state.tasks.length, 0);
  assert.equal(s.agents().length, 20);
  assert.equal(s.metrics().completed, quick().metrics().completed);
  assert.equal(s.metrics().avgRouting, null);
  invariant(s);
});

test("weighted capacity is coherent at rounding boundaries and with large idle agents", async () => {
  const s = quick();
  for (const a of s.agents()) s.setOnline(a.id, false);
  s.setOnline(s.agents().find((a) => a.name === "Atlas-R2").id, true);
  assert.equal(s.metrics().utilization, 13);
  assert.equal(s.metrics().idleScore, 87);
  const before = s.metrics();
  await s.register({
    name: "Large",
    endpoint: "large.local",
    model: "Adapter",
    caps: ["Research"],
    concurrent: 64,
    availability: "Online",
  });
  assert.equal(s.metrics().free, before.free + 64);
  assert.equal(s.metrics().utilization + s.metrics().idleScore, 100);
  invariant(s);
});
test("local timing averages exclude unselected and failed-before-selection traces", async () => {
  const s = quick();
  let average;
  s.subscribe(() => {
    const t = s.state.tasks.at(-1);
    if (t?.stage === 2) average = s.metrics().avgRouting;
  });
  await s.submit(request);
  assert.equal(average, null);
  assert.equal(s.metrics().localRuns, 1);
});
test("legacy v1 data migrates without losing a custom agent or double counting completions", () => {
  const storage = memory(),
    baseline = quick();
  const agents = baseline.agents().map((a) => ({
    id: a.id,
    name: a.name,
    caps: a.caps,
    model: a.model,
    endpoint: a.endpoint,
    concurrent: a.concurrent,
    status: a.status,
    latency: a.latency,
    completed: a.completed,
  }));
  agents.push({
    id: "agt_custom",
    name: "Legacy Custom",
    caps: ["Research"],
    model: "Legacy runtime",
    endpoint: "legacy.local",
    concurrent: 4,
    status: "Available",
    latency: 37,
    registered: true,
    completed: 1,
  });
  const task = {
    id: "TASK-LEGACY",
    prompt: "Old instruction",
    category: "Research",
    priority: "Normal",
    auto: true,
    agentId: "agt_custom",
    agentName: "Legacy Custom",
    timestamp: "2026-10-05T09:00:00Z",
    status: "Complete",
    totalTime: "6.80s",
  };
  storage.setItem("idle-devnet-v1", JSON.stringify({ agents, tasks: [task] }));
  const s = quick({ storage });
  assert.equal(s.agents().length, 21);
  assert.equal(s.state.tasks.length, 1);
  assert.equal(s.state.tasks[0].legacy, true);
  assert.equal(s.agents().at(-1).completed, 1);
  assert.equal(s.metrics().completed, baseline.metrics().completed + 1);
  assert.equal(s.metrics().avgRouting, null);
  invariant(s);
});
test("structurally corrupted traces recover to a safe fixture", () => {
  const storage = memory(),
    s = quick({ storage });
  const snapshot = JSON.parse(storage.getItem(STORAGE_KEY));
  snapshot.tasks = [
    {
      id: "broken",
      prompt: "test",
      category: "Research",
      priority: "Normal",
      status: "Executing",
      createdAt: 100,
      logs: "not an array",
    },
  ];
  storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  const recovered = quick({ storage });
  assert(recovered.persistenceWarning);
  assert.equal(recovered.state.tasks.length, 0);
  assert.equal(recovered.agents().length, 20);
});
test("more than 100 stored traces retain lifetime totals across reload", async () => {
  const storage = memory(),
    s = quick({ storage });
  for (let i = 0; i < 105; i++)
    await s.submit({ ...request, prompt: "Trace " + i });
  const again = quick({ storage });
  assert.equal(again.state.tasks.length, 105);
  assert.equal(again.metrics().completed, s.metrics().completed);
  assert.equal(again.metrics().routed, s.metrics().routed);
  invariant(again);
});

test("legacy in-flight dispatches migrate to a terminal interruption with a finished timestamp", () => {
  const storage = memory(),
    s = quick();
  const agents = s.agents().map((a) => ({
    id: a.id,
    name: a.name,
    caps: a.caps,
    model: a.model,
    endpoint: a.endpoint,
    concurrent: a.concurrent,
    status: a.status,
    latency: a.latency,
  }));
  storage.setItem(
    "idle-devnet-v1",
    JSON.stringify({
      agents,
      tasks: [
        {
          id: "TASK-OLD",
          prompt: "Old task",
          category: "Research",
          priority: "Normal",
          auto: true,
          agentId: agents[0].id,
          agentName: agents[0].name,
          timestamp: "2026-10-05T09:00:00Z",
          status: "Executing",
        },
      ],
    }),
  );
  const recovered = quick({ storage });
  const t = recovered.state.tasks[0];
  assert.equal(t.status, "Interrupted");
  assert(t.endedAt);
  assert(t.dispatchedAt);
  assert.equal(recovered.metrics().routed, s.metrics().routed + 1);
  assert.equal(recovered.metrics().completed, s.metrics().completed);
});
test("missing browser storage is reported as session-only", () => {
  const s = quick();
  assert.match(s.persistenceWarning, /last for this tab only/);
});

test("ambient load changes occupied slots and statuses without fabricating outcomes", () => {
  const s = quick(),
    before = s.metrics(),
    statuses = s.agents().map((a) => a.status);
  for (let i = 0; i < 12; i++) {
    s.heartbeat();
    invariant(s);
  }
  assert(s.agents().some((a, i) => a.status !== statuses[i]));
  assert(s.state.events.some((e) => e.text.includes("simulated load")));
  assert.equal(s.metrics().completed, before.completed);
  assert.equal(s.metrics().failed, before.failed);
  assert.equal(s.metrics().routed, before.routed);
  assert.equal(s.state.samples.at(-1).util, s.metrics().utilization);
});
test("ambient simulation respects user agents and pinned availability", async () => {
  const s = quick();
  const a = await s.register({
    name: "User",
    endpoint: "user.local",
    model: "Runtime",
    caps: ["Research"],
    concurrent: 4,
    availability: "Online",
  });
  const pinned = s.agents()[0];
  s.setOnline(pinned.id, false);
  for (let i = 0; i < 50; i++) s.heartbeat();
  assert.equal(s.agents().find((b) => b.id === a.id).occupied, 0);
  assert.equal(s.agents().find((b) => b.id === a.id).online, true);
  assert.equal(s.agents().find((b) => b.id === pinned.id).online, false);
  invariant(s);
});
test("temporary fixture outage restores online state after its heartbeat deadline", () => {
  let at = Date.parse("2026-10-05T10:00:00Z");
  const s = createSimulation({ now: () => at });
  let down;
  for (let i = 0; i < 30 && !down; i++) {
    s.heartbeat();
    down = s.state.agents.find((a) => a.temporaryOfflineUntil);
    at += 5000;
  }
  assert(down);
  assert.equal(s.agents().find((a) => a.id === down.id).free, 0);
  at = down.temporaryOfflineUntil + 1;
  s.heartbeat();
  assert.equal(s.agents().find((a) => a.id === down.id).online, true);
  invariant(s);
});
test("heartbeat does not change foreground task capacity or agent eligibility during routing", async () => {
  const s = quick();
  const before = s.agents().map((a) => a.backgroundSlots);
  const unsubscribe = s.subscribe((kind) => {
    if (kind !== "telemetry" && s.running) s.heartbeat();
  });
  await s.submit(request);
  unsubscribe();
  assert.deepEqual(
    s.agents().map((a) => a.backgroundSlots),
    before,
  );
  invariant(s);
});
