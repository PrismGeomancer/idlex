// Browser-only control-plane simulation. All runtime transitions share this model.
export const CAPABILITIES = [
  "Research",
  "Market Intelligence",
  "Code Generation",
  "Data Analysis",
  "Summarization",
  "Classification",
  "Web Intelligence",
  "Document Processing",
  "Image Analysis",
  "Monitoring",
  "Translation",
  "Reasoning",
];
export const CATEGORIES = [
  "Research",
  "Code",
  "Analysis",
  "Market Intelligence",
  "Summarization",
  "Classification",
];
export const CAPABILITY = {
  Research: "Research",
  Code: "Code Generation",
  Analysis: "Data Analysis",
  "Market Intelligence": "Market Intelligence",
  Summarization: "Summarization",
  Classification: "Classification",
};
export const TERMINAL = ["Complete", "Failed", "Cancelled", "Interrupted"];
export const STAGES = [
  "Analyzing task",
  "Scanning available agents",
  "Matching capabilities",
  "Evaluating latency",
  "Agent selected",
  "Dispatching",
  "Executing",
  "Verifying output",
  "Complete",
];
export const STORAGE_KEY = "idle-devnet-v2";
const SEEDS = [
  ["Atlas-R2", "Research", "Reasoning", 1, 8, "Claude Sonnet 4.5", 42],
  ["Vector-03", "Data Analysis", "Classification", 2, 8, "GPT-4.1", 68],
  ["Relay-8", "Code Generation", "Reasoning", 4, 4, "Qwen3-Coder", 38],
  [
    "IDLE-R17",
    "Summarization",
    "Document Processing",
    0,
    4,
    "Llama 3.3 70B",
    51,
  ],
  ["Scout-7", "Web Intelligence", "Research", 1, 8, "Gemini 2.5 Pro", 57],
  ["Cipher-12", "Classification", "Reasoning", 0, 4, "Mistral Medium", 31],
  ["Node-41", "Monitoring", "Data Analysis", 3, 8, "Python / FastAPI", 23],
  [
    "Helix-09",
    "Market Intelligence",
    "Research",
    1,
    8,
    "Claude Sonnet 4.5",
    46,
  ],
  ["Tensor-6", "Image Analysis", "Classification", 4, 4, "Qwen2.5-VL", 74],
  ["Parse-14", "Document Processing", "Summarization", 1, 8, "GPT-4.1", 62],
  ["Nexus-R4", "Research", "Web Intelligence", 0, 4, "Gemini 2.5 Pro", 49],
  ["Delta-22", "Code Generation", "Data Analysis", 1, 8, "DeepSeek V3", 53],
  ["Lexicon-5", "Translation", "Summarization", 0, 4, "Mistral Medium", 41],
  ["Watch-11", "Monitoring", "Web Intelligence", 4, 4, "Python / FastAPI", 29],
  ["Logic-R8", "Reasoning", "Code Generation", 2, 8, "Qwen3 235B", 65],
  ["Flux-16", "Market Intelligence", "Monitoring", 0, 4, "GPT-4.1", 39],
  [
    "Index-02",
    "Classification",
    "Document Processing",
    0,
    4,
    "Llama 3.3 70B",
    35,
  ],
  ["Prism-18", "Image Analysis", "Data Analysis", 0, 4, "Qwen2.5-VL", 91],
  ["Orbit-31", "Translation", "Research", 2, 8, "Gemini 2.5 Flash", 44],
  ["Kernel-7", "Code Generation", "Reasoning", 4, 4, "DeepSeek V3", 58],
];
export function seedAgents(now) {
  return SEEDS.map((s, i) => {
    const completed = 1842 + i * 437;
    return {
      id: `agt_${(817 + i * 137).toString(16).padStart(6, "0")}`,
      name: s[0],
      caps: [s[1], s[2]],
      backgroundSlots: s[3],
      concurrent: s[4],
      online: i !== 17,
      model: s[5],
      latency: s[6],
      baseCompleted: completed,
      baseFailed: Math.round(completed * (1 / (0.998 - (i % 4) * 0.001) - 1)),
      endpoint: `${s[0].toLowerCase()}.devnet.idle`,
      registered: false,
      lastSeen: now,
      registeredAt: now,
    };
  });
}
const finite = (n) => typeof n === "number" && Number.isFinite(n);
function validAgent(a) {
  return (
    a &&
    typeof a.id === "string" &&
    typeof a.name === "string" &&
    a.name.trim().length > 0 &&
    a.name.length <= 40 &&
    typeof a.endpoint === "string" &&
    typeof a.model === "string" &&
    Array.isArray(a.caps) &&
    a.caps.length &&
    a.caps.every((c) => CAPABILITIES.includes(c)) &&
    Number.isInteger(a.concurrent) &&
    a.concurrent >= 1 &&
    a.concurrent <= 64 &&
    Number.isInteger(a.backgroundSlots) &&
    a.backgroundSlots >= 0 &&
    a.backgroundSlots <= a.concurrent &&
    typeof a.online === "boolean" &&
    finite(a.latency) &&
    a.latency > 0 &&
    Number.isInteger(a.baseCompleted) &&
    a.baseCompleted >= 0 &&
    Number.isInteger(a.baseFailed) &&
    a.baseFailed >= 0 &&
    finite(a.lastSeen) &&
    finite(a.registeredAt)
  );
}
function validTask(t, agents) {
  return (
    t &&
    typeof t.id === "string" &&
    typeof t.prompt === "string" &&
    t.prompt.length <= 3000 &&
    CATEGORIES.includes(t.category) &&
    ["Normal", "High", "Low"].includes(t.priority) &&
    [
      "Routing",
      "Selected",
      "Queued",
      "Executing",
      "Verifying",
      ...TERMINAL,
    ].includes(t.status) &&
    finite(t.createdAt) &&
    (!t.agentId || agents.some((a) => a.id === t.agentId)) &&
    Array.isArray(t.logs) &&
    t.logs.every((l) => l && finite(l.at) && typeof l.text === "string") &&
    (!t.durations ||
      Object.values(t.durations).every((n) => finite(n) && n >= 0)) &&
    (!t.selection ||
      (finite(t.selection.score) &&
        finite(t.selection.free) &&
        finite(t.selection.concurrent) &&
        finite(t.selection.latency) &&
        (t.selection.success == null || finite(t.selection.success)))) &&
    (!t.output || validOutput(t.output, t))
  );
}
function validOutput(o, t) {
  return (
    o &&
    o.kind === "fixture" &&
    o.category === t.category &&
    o.prompt === t.prompt &&
    typeof o.title === "string" &&
    o.title.length > 0 &&
    finite(o.createdAt) &&
    ((Array.isArray(o.paragraphs) &&
      o.paragraphs.every((p) => typeof p === "string")) ||
      typeof o.code === "string")
  );
}
const waitDefault = (ms, signal) =>
  new Promise((resolve, reject) => {
    const handle = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(handle);
      reject(new Error("Cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
export function createSimulation(options = {}) {
  const now = options.now || Date.now,
    wait = options.wait || waitDefault,
    storage = options.storage;
  const listeners = new Set();
  let telemetryTick = 0;
  let running = null,
    registrationBusy = false,
    persistenceWarning = storage
      ? ""
      : "Browser storage is unavailable. Changes last for this tab only.",
    recovered = 0;
  let state = {
    version: 2,
    agents: seedAgents(now()),
    tasks: [],
    events: [],
    samples: [],
  };
  const fresh = () => ({
    version: 2,
    agents: seedAgents(now()),
    tasks: [],
    events: [],
    samples: [],
  });
  function readSaved() {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (
          saved.version !== 2 ||
          !Array.isArray(saved.agents) ||
          !saved.agents.length ||
          !saved.agents.every(validAgent) ||
          new Set(saved.agents.map((a) => a.id)).size !== saved.agents.length ||
          !Array.isArray(saved.tasks) ||
          !saved.tasks.every((t) => validTask(t, saved.agents))
        )
          throw Error("Invalid snapshot");
        state = {
          ...saved,
          events: Array.isArray(saved.events)
            ? saved.events
                .filter((e) => typeof e.text === "string" && finite(e.at))
                .slice(0, 100)
            : [],
          samples: Array.isArray(saved.samples)
            ? saved.samples
                .filter(
                  (s) =>
                    finite(s.at) &&
                    finite(s.util) &&
                    s.util >= 0 &&
                    s.util <= 100,
                )
                .slice(-720)
            : [],
        };
        return;
      }
      const old = JSON.parse(storage?.getItem("idle-devnet-v1") || "null");
      if (!old) return;
      if (!Array.isArray(old.agents) || !Array.isArray(old.tasks))
        throw Error("Invalid legacy snapshot");
      state.agents = old.agents.map((a) => {
        const seeded = state.agents.find((b) => b.id === a.id);
        if (seeded) return { ...seeded };
        return {
          id: a.id,
          name: a.name,
          caps: a.caps,
          endpoint: a.endpoint,
          model: a.model,
          concurrent: a.concurrent,
          backgroundSlots: 0,
          online: a.status !== "Offline",
          baseCompleted: 0,
          baseFailed: 0,
          latency: a.latency || 37,
          registered: true,
          registeredAt: now(),
          lastSeen: now(),
        };
      });
      if (!state.agents.length || !state.agents.every(validAgent))
        throw Error("Invalid legacy agents");
      state.tasks = old.tasks
        .map((t) => ({
          ...t,
          createdAt: Date.parse(t.timestamp),
          endedAt:
            t.status === "Complete"
              ? Date.parse(t.timestamp) +
                Math.round(parseFloat(t.totalTime || 0) * 1000)
              : now(),
          dispatchedAt: ["Complete", "Executing"].includes(t.status)
            ? Date.parse(t.timestamp)
            : null,
          status: t.status === "Complete" ? "Complete" : "Interrupted",
          stage: t.status === "Complete" ? 8 : 0,
          logs: [],
          legacy: true,
          output: null,
          error:
            t.status === "Complete"
              ? null
              : "The previous tab closed before execution finished.",
        }))
        .filter((t) => validTask(t, state.agents));
    } catch {
      state = fresh();
      persistenceWarning =
        "Saved demo data was unreadable. A fresh fixture was loaded.";
    }
  }
  readSaved();
  for (const t of state.tasks) {
    if (!TERMINAL.includes(t.status)) {
      t.status = "Interrupted";
      t.endedAt = t.updatedAt || now();
      t.reserved = false;
      delete t.pendingOutput;
      t.error =
        "The tab closed before execution finished. The reserved slot was released; retry to start a new trace.";
      t.logs = t.logs || [];
      t.logs.push({ at: now(), text: t.error });
      t.durations = timings(t);
      recovered++;
    }
  }
  function persist() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      persistenceWarning =
        "Browser storage is unavailable. Changes last for this tab only.";
    }
  }
  function emit(kind = "state") {
    persist();
    for (const callback of listeners) callback(kind);
  }
  function occupied(a) {
    return (
      a.backgroundSlots +
      state.tasks.filter(
        (t) => t.agentId === a.id && t.reserved && !TERMINAL.includes(t.status),
      ).length
    );
  }
  function status(a) {
    if (!a.online) return "Offline";
    const n = occupied(a);
    return n === 0 ? "Idle" : n >= a.concurrent ? "Busy" : "Available";
  }
  function stats(a) {
    const local = state.tasks.filter((t) => t.agentId === a.id);
    const completed =
      a.baseCompleted + local.filter((t) => t.status === "Complete").length;
    const failed =
      a.baseFailed +
      local.filter((t) => t.status === "Failed" && t.dispatchedAt != null)
        .length;
    const n = occupied(a);
    return {
      ...a,
      status: status(a),
      occupied: n,
      free: a.online ? Math.max(0, a.concurrent - n) : 0,
      util: a.online ? Math.round((n / a.concurrent) * 100) : null,
      completed,
      failed,
      success:
        completed + failed ? (completed / (completed + failed)) * 100 : null,
    };
  }
  function agents() {
    return state.agents.map(stats);
  }
  function compatible(category) {
    return agents().filter(
      (a) => a.free > 0 && a.caps.includes(CAPABILITY[category]),
    );
  }
  function routingScore(a) {
    return Math.round(
      100 *
        ((0.6 * a.free) / a.concurrent +
          0.25 * Math.max(0, 1 - a.latency / 200) +
          0.15 * (a.success == null ? 0.5 : a.success / 100)),
    );
  }
  function rank(category) {
    return compatible(category)
      .map((a) => ({ ...a, routingScore: routingScore(a) }))
      .sort(
        (a, b) =>
          b.routingScore - a.routingScore ||
          a.latency - b.latency ||
          a.id.localeCompare(b.id),
      );
  }
  function metrics() {
    const all = agents(),
      online = all.filter((a) => a.online),
      slots = online.reduce((s, a) => s + a.concurrent, 0),
      used = online.reduce((s, a) => s + a.occupied, 0),
      completed = all.reduce((s, a) => s + a.completed, 0),
      failed = all.reduce((s, a) => s + a.failed, 0);
    const routed =
      all.reduce((s, a) => s + a.baseCompleted + a.baseFailed, 0) +
      state.tasks.filter((t) => t.dispatchedAt != null).length;
    const local = state.tasks.filter(
      (t) => !t.legacy && t.selectedAt != null && t.durations?.routing != null,
    );
    const executions = state.tasks.filter(
      (t) =>
        t.status === "Complete" && !t.legacy && t.durations?.execution != null,
    );
    return {
      available: all.filter((a) => a.free > 0).length,
      total: all.length,
      online: online.length,
      active: online.filter((a) => a.occupied > 0).length,
      idle: online.filter((a) => a.occupied === 0).length,
      slots,
      used,
      free: slots - used,
      utilization: slots ? Math.round((100 * used) / slots) : 0,
      idleScore: slots ? 100 - Math.round((100 * used) / slots) : 0,
      completed,
      failed,
      routed,
      success:
        completed + failed ? (100 * completed) / (completed + failed) : null,
      avgRouting: local.length
        ? local.reduce((s, t) => s + t.durations.routing, 0) / local.length
        : null,
      avgExecution: executions.length
        ? executions.reduce((s, t) => s + t.durations.execution, 0) /
          executions.length
        : null,
      localRuns: local.length,
    };
  }
  function sample() {
    const m = metrics();
    state.samples.push({ at: now(), util: m.utilization });
    state.samples = state.samples.slice(-720);
  }
  function event(text, type = "network", taskId = null) {
    state.events.unshift({
      id: crypto.randomUUID(),
      at: now(),
      text,
      type,
      taskId,
    });
    state.events = state.events.slice(0, 100);
  }
  function log(t, text) {
    t.logs.push({ at: now(), text });
    t.logs = t.logs.slice(-50);
  }
  if (!state.events.length) {
    event(
      `Registry loaded · ${metrics().online}/${metrics().total} agents online`,
    );
    for (const a of agents().slice(0, 4))
      event(
        `${a.name} · ${a.occupied}/${a.concurrent} slots occupied · ${a.latency}ms fixture RTT`,
      );
  }
  if (recovered)
    event(
      `${recovered} unfinished execution${recovered === 1 ? "" : "s"} recovered as interrupted`,
      "error",
    );
  sample();
  persist();
  function makeOutput(t) {
    const m = metrics();
    const shared = {
      kind: "fixture",
      category: t.category,
      prompt: t.prompt,
      agent: t.agentName,
      createdAt: now(),
    };
    const bodies = {
      Research: {
        title: "Orchestration research brief",
        paragraphs: [
          "A shared control plane separates task intake and agent discovery from execution. Agents remain independently deployed; the router selects an eligible execution endpoint.",
          "This fixture illustrates a research response. No sources were fetched or model inference performed.",
        ],
        bullets: [
          "Register declared capabilities and concurrency limits.",
          "Filter unhealthy or full agents before comparing routing scores.",
          "Retain dispatch acknowledgments, results, and failure traces.",
        ],
      },
      Code: {
        title: "Capability-aware routing · Python",
        code: 'def select_agent(agents, capability):\n    eligible = [a for a in agents\n                if a["online"]\n                and capability in a["capabilities"]\n                and a["free_slots"] > 0]\n    if not eligible:\n        raise ValueError("No eligible capacity")\n\n    def score(a):\n        capacity = a["free_slots"] / a["max_concurrency"]\n        latency = max(0, 1 - a["rtt_ms"] / 200)\n        reliability = a.get("success_rate", 0.5)\n        return round(100 * (0.6 * capacity +\n                            0.25 * latency +\n                            0.15 * reliability))\n\n    return sorted(eligible, key=lambda a:\n        (-score(a), a["rtt_ms"], a["id"]))[0]',
        paragraphs: [
          "This fixture matches the demo ranking policy. It omits the atomic slot reservation and dispatch acknowledgment that a production implementation requires.",
        ],
      },
      Analysis: {
        title: "Capacity snapshot",
        paragraphs: [
          `At output receipt, ${m.online} online agents exposed ${m.slots} concurrency slots. ${m.used} were occupied and ${m.free} were free (${m.idleScore}% available capacity).`,
          "This saved snapshot uses the local simulation registry, rather than external data or a model analysis.",
        ],
        bullets: [
          `${m.available} agents had free slots; ${m.idle} had no occupied slots.`,
          "Capacity is weighted by concurrency limit, so larger agents contribute proportionally.",
          "Offline agents contribute no available capacity.",
        ],
      },
      "Market Intelligence": {
        title: "Market intelligence framework",
        paragraphs: [
          "This sample frames infrastructure demand around orchestration, observability, and interoperability. It contains no live market data or investment conclusions.",
        ],
        bullets: [
          "Evaluate demand using repeated task submission and agent retention.",
          "Compare coordination costs with dispatch success and saved operator time.",
          "Validate payment preferences before introducing token settlement.",
        ],
      },
      Summarization: {
        title: "Summarization response fixture",
        paragraphs: [
          `The submitted instruction contains ${t.prompt.trim().split(/\s+/).length} words. No document or attachment was retrieved. A real summarization adapter would require the source text or an accessible document reference.`,
        ],
        bullets: [
          "Extract the central claim and supporting context.",
          "Preserve decisions and action items.",
          "Return the condensed text alongside the source reference.",
        ],
      },
      Classification: {
        title: "Classification response fixture",
        code: JSON.stringify(
          {
            label: "task_request",
            basis: "illustrative_fixture",
            confidence: null,
            language: null,
            review_required: true,
          },
          null,
          2,
        ),
        paragraphs: [
          "The label is a response-shape example, not an inferred classification of your input. No classifier ran; confidence and language are therefore unknown.",
        ],
      },
    };
    return { ...shared, ...bodies[t.category], snapshot: m };
  }
  function timings(t) {
    const terminal = TERMINAL.includes(t.status),
      end = terminal ? t.endedAt : now(),
      origin = t.createdAt;
    const phases = [
      ["routing", origin, t.selectedAt],
      ["queue", t.selectedAt, t.executionStartedAt],
      ["execution", t.executionStartedAt, t.outputAt],
      ["verification", t.outputAt, t.endedAt],
    ];
    const d = {};
    for (const [key, start, finish] of phases) {
      if (start != null) d[key] = Math.max(0, (finish ?? end) - start);
    }
    d.total = Math.max(0, end - origin);
    return d;
  }
  function refresh(t, kind = "state") {
    t.updatedAt = now();
    t.durations = timings(t);
    sample();
    emit(kind);
  }
  function release(t) {
    t.reserved = false;
  }
  async function submit(input) {
    if (running)
      throw Error(
        "Finish or cancel the current task before submitting another.",
      );
    if (
      typeof input?.prompt !== "string" ||
      !input.prompt.trim() ||
      input.prompt.length > 3000
    )
      throw Error("Enter a task of 1–3,000 characters.");
    if (!CATEGORIES.includes(input.category))
      throw Error("Choose a supported task category.");
    if (!["Normal", "High", "Low"].includes(input.priority))
      throw Error("Choose a supported priority.");
    if (typeof input.auto !== "boolean")
      throw Error("Choose automatic or manual routing.");
    const outcome = input.outcome || "Successful run";
    if (
      !["Successful run", "Agent timeout", "Invalid response"].includes(outcome)
    )
      throw Error("Choose a supported demo outcome.");
    if (!compatible(input.category).length)
      throw Error(
        "No compatible agent has a free slot. Bring an agent online or connect one with the required capability.",
      );
    if (
      !input.auto &&
      !compatible(input.category).some((a) => a.id === input.agent)
    )
      throw Error("Choose an online, compatible agent with a free slot.");
    const controller = new AbortController();
    running = { controller, taskId: null };
    const t = {
      id: "TASK-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      prompt: input.prompt.trim(),
      category: input.category,
      priority: input.priority,
      auto: input.auto,
      outcome,
      parentId: input.parentId || null,
      status: "Routing",
      createdAt: now(),
      stage: -1,
      logs: [],
      reserved: false,
      agentId: null,
      output: null,
    };
    running.taskId = t.id;
    state.tasks.push(t);
    event(
      `${t.id} accepted · ${t.category} · ${t.priority.toLowerCase()} priority`,
      "route",
      t.id,
    );
    refresh(t);
    try {
      const delays = [250, 400, 350, 350, 300, 0, 0, 550, 250];
      for (let i = 0; i < STAGES.length; i++) {
        if (i === 5) delays[i] = 150;
        if (i === 6)
          delays[i] = { High: 250, Normal: 650, Low: 1150 }[t.priority];
        await wait(delays[i], controller.signal);
        if (controller.signal.aborted) throw Error("Cancelled");
        t.stage = i;
        if (i === 0)
          log(
            t,
            `task accepted · required capability: ${CAPABILITY[t.category]}`,
          );
        if (i === 1)
          log(t, `registry scan · ${metrics().online} online agents`);
        if (i === 2) {
          t.candidates = rank(t.category).map((a) => ({
            id: a.id,
            name: a.name,
            score: a.routingScore,
            free: a.free,
            concurrent: a.concurrent,
            latency: a.latency,
            success: a.success,
          }));
          log(
            t,
            `${t.candidates.length} eligible agents with free concurrency slots`,
          );
        }
        if (i === 3)
          log(
            t,
            "ranking policy: free capacity 60% · RTT 25% · historical success 15%",
          );
        if (i === 4) {
          const ranked = rank(t.category),
            a = t.auto ? ranked[0] : ranked.find((a) => a.id === input.agent);
          if (!a)
            throw Error(
              "Compatible capacity changed before selection. No slot was reserved; retry.",
            );
          t.agentId = a.id;
          t.agentName = a.name;
          t.selection = {
            score: a.routingScore,
            free: a.free,
            concurrent: a.concurrent,
            latency: a.latency,
            success: a.success,
            policy: t.auto ? "capacity-rtt-reliability/v1" : "manual",
            reason: t.auto
              ? "Highest eligible routing score"
              : "Selected by you; eligibility validated",
          };
          t.candidates = ranked.map((a) => ({
            id: a.id,
            name: a.name,
            score: a.routingScore,
            free: a.free,
            concurrent: a.concurrent,
            latency: a.latency,
            success: a.success,
          }));
          t.selectedAt = now();
          t.reserved = true;
          t.status = "Selected";
          log(
            t,
            `${a.name} selected · ${a.routingScore}/100 routing score · one slot reserved`,
          );
          event(`${t.id} selected ${a.name} · slot reserved`, "route", t.id);
        }
        if (i === 5) {
          t.status = "Queued";
          t.dispatchedAt = now();
          log(
            t,
            `dispatch acknowledged · ${t.priority.toLowerCase()} priority admission delay`,
          );
          event(`${t.id} dispatched to ${t.agentName}`, "route", t.id);
        }
        if (i === 6) {
          t.status = "Executing";
          t.executionStartedAt = now();
          log(t, "execution started · fixture adapter");
          refresh(t);
          await wait(1200 + (t.prompt.length % 5) * 75, controller.signal);
          if (t.outcome === "Agent timeout")
            throw Error(
              "Agent response deadline exceeded in the timeout scenario. Slot released; no output received.",
            );
          t.outputAt = now();
          t.status = "Verifying";
          t.pendingOutput = makeOutput(t);
          if (t.outcome === "Invalid response") delete t.pendingOutput.title;
          log(t, "fixture output received · validating response envelope");
        }
        if (i === 7) {
          if (!validOutput(t.pendingOutput, t))
            throw Error(
              "Output envelope failed schema validation: missing or invalid required fields. No verified result was accepted.",
            );
          log(
            t,
            "schema validation passed · task ID, category, and output fields present",
          );
        }
        if (i === 8) {
          t.status = "Complete";
          t.endedAt = now();
          release(t);
          t.output = t.pendingOutput;
          delete t.pendingOutput;
          log(
            t,
            "complete · fixture envelope validated; content quality not evaluated",
          );
          const a = state.agents.find((a) => a.id === t.agentId);
          a.lastSeen = now();
          event(`${t.id} completed by ${t.agentName}`, "complete", t.id);
        }
        refresh(t);
      }
    } catch (error) {
      t.status = controller.signal.aborted ? "Cancelled" : "Failed";
      t.error = controller.signal.aborted
        ? "Cancelled by you. Any reserved slot was released."
        : error.message;
      t.endedAt = now();
      release(t);
      delete t.pendingOutput;
      log(t, t.error);
      event(`${t.id} ${t.status.toLowerCase()} · ${t.error}`, "error", t.id);
      refresh(t);
    } finally {
      running = null;
      emit("settled");
    }
    return t;
  }
  function cancel() {
    if (running) running.controller.abort();
  }
  function setOnline(id, online) {
    const a = state.agents.find((a) => a.id === id);
    if (!a) throw Error("Agent not found.");
    if (
      state.tasks.some(
        (t) => t.agentId === id && t.reserved && !TERMINAL.includes(t.status),
      )
    )
      throw Error(
        "This agent has a reserved task. Cancel or finish that task before changing availability.",
      );
    a.online = online;
    a.availabilityPinned = true;
    delete a.temporaryOfflineUntil;
    a.lastSeen = now();
    event(
      `${a.name} ${online ? "brought online" : "set offline"} · ${online ? "declared capacity restored" : "excluded from routing"}`,
    );
    sample();
    emit();
  }
  function validateRegistration(data) {
    if (
      !data ||
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 40
    )
      throw Error("Enter an agent name of 1–40 characters.");
    if (
      state.agents.some(
        (a) => a.name.toLowerCase() === data.name.trim().toLowerCase(),
      )
    )
      throw Error("This agent name is already registered.");
    if (
      typeof data.endpoint !== "string" ||
      data.endpoint.length > 120 ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(data.endpoint)
    )
      throw Error(
        "Use an endpoint alias containing letters, numbers, dots, or hyphens.",
      );
    if (
      state.agents.some(
        (a) => a.endpoint.toLowerCase() === data.endpoint.toLowerCase(),
      )
    )
      throw Error("This endpoint alias is already registered.");
    if (
      !Array.isArray(data.caps) ||
      !data.caps.length ||
      data.caps.some((c) => !CAPABILITIES.includes(c))
    )
      throw Error("Select at least one supported capability.");
    if (
      !Number.isInteger(data.concurrent) ||
      data.concurrent < 1 ||
      data.concurrent > 64
    )
      throw Error("Concurrency must be a whole number from 1 to 64.");
    if (
      typeof data.model !== "string" ||
      !data.model.trim() ||
      data.model.length > 80
    )
      throw Error("Enter a runtime name of 1–80 characters.");
    if (!["Online", "Offline"].includes(data.availability))
      throw Error("Choose online or offline availability.");
  }
  async function register(data, onStep = () => {}) {
    if (registrationBusy)
      throw Error("An agent registration is already in progress.");
    validateRegistration(data);
    registrationBusy = true;
    emit("registration");
    try {
      for (let i = 0; i < 4; i++) {
        onStep(i);
        await new Promise((r) =>
          setTimeout(r, options.registrationDelay ?? 400),
        );
      }
      validateRegistration(data);
      const a = {
        id: "agt_" + crypto.randomUUID().slice(0, 8),
        name: data.name.trim(),
        caps: [...new Set(data.caps)],
        endpoint: data.endpoint,
        model: data.model.trim(),
        concurrent: data.concurrent,
        backgroundSlots: 0,
        online: data.availability === "Online",
        baseCompleted: 0,
        baseFailed: 0,
        latency: 37,
        registered: true,
        registeredAt: now(),
        lastSeen: now(),
      };
      state.agents.push(a);
      event(
        `${a.name} registered · ${a.online ? "online, idle" : "offline, not eligible"} · ${a.concurrent} declared slots`,
      );
      sample();
      emit();
      return stats(a);
    } finally {
      registrationBusy = false;
      emit("registration");
    }
  }
  function reset() {
    if (running || registrationBusy)
      throw Error("Finish the active task or registration before resetting.");
    state = fresh();
    event("Demo reset · baseline registry restored");
    sample();
    try {
      storage?.removeItem("idle-devnet-v1");
    } catch {}
    emit();
  }
  function heartbeat() {
    const tick = telemetryTick++;
    const reserved = (a) =>
      state.tasks.some(
        (t) => t.agentId === a.id && t.reserved && !TERMINAL.includes(t.status),
      );
    for (const a of state.agents) {
      if (
        a.temporaryOfflineUntil &&
        now() >= a.temporaryOfflineUntil &&
        !a.availabilityPinned
      ) {
        a.online = true;
        delete a.temporaryOfflineUntil;
        a.lastSeen = now();
        event(`${a.name} returned online · simulated heartbeat restored`);
      }
    }
    // Only fixture workers drift. User registrations, operator overrides, and
    // foreground tasks retain their explicitly controlled availability.
    if (!running) {
      const workers = state.agents.filter(
        (a) =>
          a.online && !a.registered && !a.availabilityPinned && !reserved(a),
      );
      const chosen = [
        ...new Set(
          [0, 6, 12]
            .map((offset) => workers[(tick + offset) % workers.length])
            .filter(Boolean),
        ),
      ];
      for (const [index, a] of chosen.entries()) {
        const before = stats(a);
        let next =
          tick % 4 === 0 && index === 0
            ? a.backgroundSlots === a.concurrent
              ? Math.max(1, Math.floor(a.concurrent / 4))
              : a.concurrent
            : a.backgroundSlots === 0
              ? 1
              : a.backgroundSlots === a.concurrent
                ? a.concurrent - 1
                : a.backgroundSlots + ((tick + index) % 2 ? -1 : 1);
        // Keep at least one fixture worker eligible for every advertised skill.
        if (
          next === a.concurrent &&
          a.caps.some((cap) =>
            agents()
              .filter((b) => b.free > 0 && b.caps.includes(cap))
              .every((b) => b.id === a.id),
          )
        )
          next = a.concurrent - 1;
        a.backgroundSlots = Math.max(0, Math.min(a.concurrent, next));
        a.lastSeen = now();
        const after = stats(a);
        if (before.occupied !== after.occupied)
          event(
            `${a.name} ${before.status !== after.status ? `became ${after.status.toLowerCase()} · ` : ""}${after.occupied}/${a.concurrent} slots occupied · simulated load`,
          );
      }
      if (tick > 0 && tick % 6 === 0) {
        const a = workers.find(
          (a) =>
            a.backgroundSlots === 0 &&
            a.caps.every((cap) =>
              agents().some(
                (b) => b.id !== a.id && b.free > 0 && b.caps.includes(cap),
              ),
            ),
        );
        if (a) {
          a.online = false;
          a.temporaryOfflineUntil = now() + 15000;
          event(`${a.name} temporarily offline · simulated heartbeat gap`);
        }
      }
    }
    const online = state.agents.filter((a) => a.online);
    const a = online[tick % online.length];
    if (a) a.lastSeen = now();
    sample();
    emit("telemetry");
  }
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get state() {
      return state;
    },
    get running() {
      return running;
    },
    get registrationBusy() {
      return registrationBusy;
    },
    get persistenceWarning() {
      return persistenceWarning;
    },
    agents,
    stats,
    metrics,
    compatible,
    rank,
    routingScore,
    status,
    submit,
    cancel,
    setOnline,
    register,
    reset,
    heartbeat,
    timings,
  };
}
