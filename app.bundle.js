(() => {
  // dist/planner.js
  var CAPABILITIES = ["Research", "Code Generation", "Data Analysis", "Market Intelligence", "Summarization", "Classification"];
  var STORAGE_KEY = "idle-workspace-v1";
  var AGENT_TEMPLATES = [
    { id: "template-atlas", name: "Atlas", endpoint: "https://atlas.example/tasks", caps: ["Research", "Summarization"] },
    { id: "template-relay", name: "Relay", endpoint: "https://relay.example/tasks", caps: ["Code Generation", "Classification"] },
    { id: "template-vector", name: "Vector", endpoint: "https://vector.example/tasks", caps: ["Data Analysis", "Market Intelligence"] }
  ];
  var TASK_TEMPLATES = [
    { id: "plan-solana-research", title: "Solana ecosystem brief", instruction: "Prepare a research brief on the Solana ecosystem. Cover developer tooling, major application categories, and infrastructure. Include sources and questions for further research.", capability: "Research", priority: "Normal", agentId: "template-atlas" },
    { id: "plan-wallet-review", title: "Wallet integration review", instruction: "Review a Solana wallet integration for connection handling, account changes, rejected requests, and disconnect behavior. Provide a checklist and recommended improvements.", capability: "Code Generation", priority: "High", agentId: "template-relay" },
    { id: "plan-activity-analysis", title: "Solana activity analysis", instruction: "Analyze a supplied Solana activity dataset. Summarize transaction volume, active addresses, and trends. Identify missing data and describe the methodology used.", capability: "Data Analysis", priority: "Normal", agentId: "template-vector" }
  ];
  var validAddress = (s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
  var profileKey = (address2) => validAddress(address2) ? address2 : "guest";
  function createWorkspace(storage2) {
    let warning = "", state = { profiles: {} };
    try {
      const raw = storage2?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.profiles !== "object" || !parsed.profiles) throw Error();
        for (const [key, p] of Object.entries(parsed.profiles)) {
          if (key !== "guest" && !validAddress(key)) continue;
          if (!p || !Array.isArray(p.agents) || !Array.isArray(p.tasks) || !Array.isArray(p.events)) continue;
          state.profiles[key] = {
            agentTemplatesVersion: p.agentTemplatesVersion === 1 ? 1 : 0,
            taskTemplatesVersion: p.taskTemplatesVersion === 1 ? 1 : 0,
            agents: p.agents.filter((a) => a && typeof a.id === "string" && typeof a.name === "string" && Array.isArray(a.caps) && a.caps.every((c) => CAPABILITIES.includes(c)) && typeof a.endpoint === "string"),
            tasks: p.tasks.filter((t) => t && typeof t.id === "string" && typeof t.title === "string" && typeof t.instruction === "string" && CAPABILITIES.includes(t.capability) && ["High", "Normal", "Low"].includes(t.priority) && Number.isFinite(t.createdAt)),
            events: p.events.filter((e) => e && typeof e.text === "string" && Number.isFinite(e.at)).slice(0, 100)
          };
        }
      }
    } catch {
      warning = "Saved workspace could not be read. You can start a new workspace.";
    }
    function persist() {
      try {
        if (!storage2) throw Error();
        storage2.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        warning = "Changes are available for this session only. Browser storage is unavailable or full.";
      }
    }
    function profile2(address2) {
      const key = profileKey(address2);
      const p = state.profiles[key] ||= { agents: [], tasks: [], events: [] };
      let changed = false;
      if (p.agentTemplatesVersion !== 1) {
        for (const template of AGENT_TEMPLATES) {
          if (!p.agents.some((a) => a.id === template.id)) p.agents.push({ ...template, caps: [...template.caps], favorite: false, template: true });
        }
        p.agentTemplatesVersion = 1;
        changed = true;
      }
      if (p.taskTemplatesVersion !== 1) {
        const createdAt = Date.now();
        for (const { agentId, ...template } of TASK_TEMPLATES) {
          if (p.tasks.some((t) => t.id === template.id)) continue;
          const agent = AGENT_TEMPLATES.find((a) => a.id === agentId);
          p.tasks.push({ ...template, agent: { name: agent.name, endpoint: agent.endpoint }, owner: key, status: "Planned", createdAt });
        }
        p.events.unshift({ text: "Starter task plans added to your workspace", at: createdAt });
        p.events = p.events.slice(0, 100);
        p.taskTemplatesVersion = 1;
        changed = true;
      }
      if (changed) persist();
      return p;
    }
    function event(address2, text) {
      const p = profile2(address2);
      p.events.unshift({ text, at: Date.now() });
      p.events = p.events.slice(0, 100);
    }
    function addAgent(address2, input) {
      const name = String(input.name || "").trim(), endpoint = String(input.endpoint || "").trim();
      let url;
      try {
        url = new URL(endpoint);
      } catch {
        throw Error("Enter a valid HTTPS endpoint URL.");
      }
      if (url.protocol !== "https:" || url.username || url.password) throw Error("Use an HTTPS endpoint without credentials in the URL.");
      if (!name || name.length > 60) throw Error("Enter an agent name of up to 60 characters.");
      const caps = [...new Set(input.caps || [])];
      if (!caps.length || !caps.every((c) => CAPABILITIES.includes(c))) throw Error("Select at least one supported capability.");
      const p = profile2(address2);
      if (p.agents.some((a) => a.endpoint === url.href)) throw Error("This endpoint is already in your directory.");
      const agent = { id: crypto.randomUUID(), name, endpoint: url.href, caps, favorite: false };
      p.agents.push(agent);
      event(address2, `${name} added to your directory`);
      persist();
      return agent;
    }
    function saveTask(address2, input) {
      const title = String(input.title || "").trim(), instruction = String(input.instruction || "").trim();
      if (!title || title.length > 100) throw Error("Enter a title of up to 100 characters.");
      if (!instruction || instruction.length > 5e3) throw Error("Enter an instruction of up to 5,000 characters.");
      if (!CAPABILITIES.includes(input.capability) || !["High", "Normal", "Low"].includes(input.priority)) throw Error("Choose a supported capability and priority.");
      const p = profile2(address2), agent = p.agents.find((a) => a.id === input.agentId);
      if (input.agentId && (!agent || !agent.caps.includes(input.capability))) throw Error("Choose an agent with the selected capability.");
      const task = { id: crypto.randomUUID(), title, instruction, capability: input.capability, priority: input.priority, agent: agent ? { name: agent.name, endpoint: agent.endpoint } : null, owner: profileKey(address2), status: "Planned", createdAt: Date.now() };
      p.tasks.unshift(task);
      event(address2, `${title} saved as a task plan`);
      persist();
      return task;
    }
    function favorite(address2, id) {
      const a = profile2(address2).agents.find((a2) => a2.id === id);
      if (a) {
        a.favorite = !a.favorite;
        persist();
      }
    }
    function removeAgent(address2, id) {
      const p = profile2(address2), a = p.agents.find((a2) => a2.id === id);
      if (a) {
        p.agents = p.agents.filter((a2) => a2.id !== id);
        event(address2, `${a.name} removed from your directory`);
        persist();
      }
    }
    return { profile: profile2, addAgent, saveTask, favorite, removeAgent, get warning() {
      return warning;
    } };
  }
  function taskSpec(task) {
    return { version: 1, id: task.id, title: task.title, instruction: task.instruction, required_capability: task.capability, priority: task.priority.toLowerCase(), preferred_endpoint: task.agent?.endpoint || null, owner: task.owner, status: "planned", created_at: new Date(task.createdAt).toISOString() };
  }

  // node_modules/@wallet-standard/app/lib/esm/wallets.js
  var __classPrivateFieldGet = function(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  };
  var __classPrivateFieldSet = function(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  };
  var _AppReadyEvent_detail;
  var wallets = void 0;
  var registeredWalletsSet = /* @__PURE__ */ new Set();
  function addRegisteredWallet(wallet) {
    cachedWalletsArray = void 0;
    registeredWalletsSet.add(wallet);
  }
  function removeRegisteredWallet(wallet) {
    cachedWalletsArray = void 0;
    registeredWalletsSet.delete(wallet);
  }
  var listeners = {};
  function getWallets() {
    if (wallets)
      return wallets;
    wallets = Object.freeze({ register, get, on });
    if (typeof window === "undefined")
      return wallets;
    const api = Object.freeze({ register });
    try {
      window.addEventListener("wallet-standard:register-wallet", ({ detail: callback }) => callback(api));
    } catch (error) {
      console.error("wallet-standard:register-wallet event listener could not be added\n", error);
    }
    try {
      window.dispatchEvent(new AppReadyEvent(api));
    } catch (error) {
      console.error("wallet-standard:app-ready event could not be dispatched\n", error);
    }
    return wallets;
  }
  function register(...wallets3) {
    wallets3 = wallets3.filter((wallet) => !registeredWalletsSet.has(wallet));
    if (!wallets3.length)
      return () => {
      };
    wallets3.forEach((wallet) => addRegisteredWallet(wallet));
    listeners["register"]?.forEach((listener) => guard(() => listener(...wallets3)));
    return function unregister() {
      wallets3.forEach((wallet) => removeRegisteredWallet(wallet));
      listeners["unregister"]?.forEach((listener) => guard(() => listener(...wallets3)));
    };
  }
  var cachedWalletsArray;
  function get() {
    if (!cachedWalletsArray) {
      cachedWalletsArray = [...registeredWalletsSet];
    }
    return cachedWalletsArray;
  }
  function on(event, listener) {
    listeners[event]?.push(listener) || (listeners[event] = [listener]);
    return function off() {
      listeners[event] = listeners[event]?.filter((existingListener) => listener !== existingListener);
    };
  }
  function guard(callback) {
    try {
      callback();
    } catch (error) {
      console.error(error);
    }
  }
  var AppReadyEvent = class extends Event {
    get detail() {
      return __classPrivateFieldGet(this, _AppReadyEvent_detail, "f");
    }
    get type() {
      return "wallet-standard:app-ready";
    }
    constructor(api) {
      super("wallet-standard:app-ready", {
        bubbles: false,
        cancelable: false,
        composed: false
      });
      _AppReadyEvent_detail.set(this, void 0);
      __classPrivateFieldSet(this, _AppReadyEvent_detail, api, "f");
    }
    /** @deprecated */
    preventDefault() {
      throw new Error("preventDefault cannot be called");
    }
    /** @deprecated */
    stopImmediatePropagation() {
      throw new Error("stopImmediatePropagation cannot be called");
    }
    /** @deprecated */
    stopPropagation() {
      throw new Error("stopPropagation cannot be called");
    }
  };
  _AppReadyEvent_detail = /* @__PURE__ */ new WeakMap();

  // dist/wallet.js
  function createWalletConnection(onChange, onDiscovery = () => {
  }) {
    const registry = getWallets();
    let active = null, address2 = null, off = null, connecting = false;
    const solanaAccount = (accounts) => accounts?.find((a) => a.chains?.some((c) => c.startsWith("solana:")));
    function changed(value) {
      address2 = value || null;
      onChange({ address: address2, name: active?.name || null });
    }
    function cleanup() {
      off?.();
      off = null;
    }
    function wallets3() {
      const standard = registry.get().filter((w) => w.chains.some((c) => c.startsWith("solana:")) && w.features["standard:connect"]);
      const items = standard.map((wallet) => ({ name: wallet.name, wallet, type: "standard" }));
      const legacy = [
        ["Phantom", window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null)],
        ["Solflare", window.solflare],
        ["Backpack", window.backpack?.solana || (window.backpack?.isBackpack ? window.backpack : null)]
      ];
      for (const [name, wallet] of legacy) if (wallet?.connect && !items.some((w) => w.name.toLowerCase() === name.toLowerCase())) items.push({ name, wallet, type: "injected" });
      return items.sort((a, b) => a.name.localeCompare(b.name));
    }
    registry.on("register", onDiscovery);
    registry.on("unregister", (...removed) => {
      if (removed.some((w) => w === active?.wallet)) {
        cleanup();
        active = null;
        changed(null);
      }
      onDiscovery();
    });
    async function disconnect() {
      if (connecting) throw Error("Wait for the wallet connection request to finish.");
      const previous = active;
      if (previous?.type === "standard") await previous.wallet.features["standard:disconnect"]?.disconnect();
      else await previous?.wallet.disconnect?.();
      cleanup();
      active = null;
      changed(null);
    }
    async function connect(item) {
      if (connecting) throw Error("A wallet connection request is already open.");
      if (active) await disconnect();
      connecting = true;
      let acquired = false;
      try {
        let next;
        if (item.type === "standard") {
          const response = await item.wallet.features["standard:connect"].connect();
          acquired = true;
          next = solanaAccount(response.accounts)?.address;
          if (!next) throw Error("Select a Solana account in your wallet.");
          active = item;
          off = item.wallet.features["standard:events"]?.on("change", ({ accounts }) => {
            if (accounts) changed(solanaAccount(accounts)?.address);
          });
        } else {
          const response = await item.wallet.connect();
          acquired = true;
          next = (response?.publicKey || item.wallet.publicKey)?.toString();
          if (!next) throw Error("The wallet did not return a Solana address.");
          active = item;
          const accountChange = (key) => changed(key?.toString()), disconnected = () => changed(null);
          item.wallet.on?.("accountChanged", accountChange);
          item.wallet.on?.("disconnect", disconnected);
          off = () => {
            item.wallet.removeListener?.("accountChanged", accountChange);
            item.wallet.removeListener?.("disconnect", disconnected);
          };
        }
        changed(next);
      } catch (error) {
        cleanup();
        active = null;
        changed(null);
        if (acquired) {
          try {
            if (item.type === "standard") await item.wallet.features["standard:disconnect"]?.disconnect();
            else await item.wallet.disconnect?.();
          } catch {
          }
        }
        throw error;
      } finally {
        connecting = false;
      }
    }
    return { wallets: wallets3, connect, disconnect, get connecting() {
      return connecting;
    } };
  }

  // dist/app.js
  var $ = (s) => document.querySelector(s);
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var short = (s) => s ? `${s.slice(0, 4)}\u2026${s.slice(-4)}` : "Guest";
  var stamp = (at) => new Date(at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  var symbols = { introduction: "\u25C8", overview: "\u25A6", network: "\u25C7", route: "\u2197", activity: "\u2261", docs: "\u25A4" };
  var entries = [["introduction", "Introduction"], ["overview", "Workspace"], ["network", "Agent directory"], ["activity", "Saved tasks"], ["docs", "Documentation"], ["route", "Task planner"]];
  var storage;
  try {
    storage = localStorage;
  } catch {
  }
  var store = createWorkspace(storage);
  var address = null;
  var walletName = null;
  var page = validPage(location.hash.slice(1));
  var modalType = null;
  var walletOptions = [];
  var query = "";
  var agentQuery = "";
  var capFilter = "All capabilities";
  var favoritesOnly = false;
  var toastTimer;
  var draft = emptyDraft();
  var landingTemplate = 0;
  var landingAgentId = "";
  function emptyDraft() {
    return { title: "", instruction: "", capability: "Research", priority: "Normal", agentId: "" };
  }
  function validPage(value) {
    return entries.some(([key]) => key === value) ? value : "introduction";
  }
  var profile = () => store.profile(address);
  var wallets2 = createWalletConnection((session) => {
    address = session.address;
    walletName = session.name;
    if ($("#modal").open && !wallets2.connecting) closeModal();
    draft = emptyDraft();
    landingAgentId = "";
    query = "";
    agentQuery = "";
    render();
  }, () => {
    if (modalType === "wallet" && !wallets2.connecting) walletModal();
  });
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4e3);
  }
  function options(list, selected) {
    return list.map((v) => `<option ${v === selected ? "selected" : ""}>${esc(v)}</option>`).join("");
  }
  function header(title, subtitle, action = "") {
    return `<div class="page-heading"><div><div class="eyebrow">IDLE / BUILT AROUND SOLANA</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-right">${action}</div></div>`;
  }
  function metric(label, value, note) {
    return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-number">${value}</div><div class="metric-change">${note}</div></div>`;
  }
  function nav() {
    profile();
    $("#nav").innerHTML = entries.map(([key, label]) => `<button class="nav-link ${page === key ? "active" : ""} ${key === "route" ? "route-link" : ""}" data-nav="${key}" ${page === key ? 'aria-current="page"' : ""}><span class="nav-symbol" aria-hidden="true">${symbols[key]}</span><span>${label}</span>${key === "route" ? '<span class="key">R</span>' : ""}</button>`).join("");
    $("#crumb").textContent = entries.find(([key]) => key === page)[1];
    $("#connect-top").textContent = address ? `${walletName} \xB7 ${short(address)}` : page === "introduction" ? "Wallet (optional)" : "Connect wallet";
    $("#connect-top").title = address || "Connect a Solana wallet";
    $(".workspace").innerHTML = `<span class="workspace-icon">I</span><div>${address ? "Wallet workspace" : "Personal workspace"}<small>Solana</small></div>`;
    $(".profile").innerHTML = `<span class="avatar">${address ? esc(walletName?.[0] || "W") : "G"}</span><div>${esc(short(address))}<small>${address ? esc(walletName) : "Connect a Solana wallet"}</small></div>`;
    $(".system-state").innerHTML = `<i class="dot"></i> ${address ? "Wallet connected" : "Ready to plan"}`;
    $("#storage-notice").textContent = store.warning;
    $("#storage-notice").hidden = !store.warning;
  }
  function introduction() {
    return `<div class="landing">
    <section class="landing-hero" aria-labelledby="landing-title">
      <div class="landing-copy">
        <div class="eyebrow landing-kicker"><span class="landing-mark" aria-hidden="true">\u25C8</span> YOUR WORKSPACE FOR AI AGENTS</div>
        <h1 id="landing-title">Plan your tasks.<br> Organize your<br> <em>AI agents.</em></h1>
        <p class="landing-lead">IDLE is one workspace to write task briefs, choose a preferred agent, and save plans you can reuse. Export your plan to the tools you use to run the work.</p>
        <div class="landing-actions"><button class="primary" data-nav="route">Create your first plan <span aria-hidden="true">\u2197</span></button><button class="landing-secondary" data-scroll-workflow>See how it works <span aria-hidden="true">\u2193</span></button></div>
        <p class="landing-note">Start right away. Wallet connection is optional.</p>
      </div>
      <aside class="landing-preview" aria-labelledby="example-title">
        <div class="landing-preview-top"><span class="eyebrow" id="example-title">EXPLORE A TASK PLAN</span><img src="logo.svg" width="32" height="32" alt="IDLE"></div>
        <div class="landing-example-tabs" role="group" aria-label="Choose an example task">${["Research", "Code review", "Report"].map((label, i) => `<button data-landing-example="${i}" aria-pressed="${landingTemplate === i}">${label}</button>`).join("")}</div>
        <div class="landing-product-preview">${preview({ ...emptyDraft(), ...templates[landingTemplate], agentId: landingAgentId })}</div>
        <label class="landing-agent-label" for="landing-agent">Choose a preferred agent <span>(optional)</span></label><select id="landing-agent"><option value="">Choose later</option>${profile().agents.filter((a) => a.caps.includes(templates[landingTemplate].capability)).map((a) => `<option value="${esc(a.id)}" ${landingAgentId === a.id ? "selected" : ""}>${esc(a.name)}${a.template ? " \xB7 template" : ""}</option>`).join("")}</select>
        <button class="primary landing-use-plan" data-use-landing-plan>Use this plan <span aria-hidden="true">\u2197</span></button>
        <p class="landing-preview-note">Example brief \xB7 Opens in the planner for you to edit and save.</p>
      </aside>
    </section>
    <div class="landing-benefits" aria-label="Workspace features"><span><b aria-hidden="true">\u2197</b> Reusable task plans</span><span><b aria-hidden="true">\u25C7</b> Your agent directory</span><span><b aria-hidden="true">\u2193</b> Portable JSON exports</span></div>
    <section id="landing-workflow" class="landing-workflow" aria-labelledby="workflow-title"><div class="landing-section-heading"><div><div class="eyebrow">A SIMPLE WORKFLOW</div><h2 id="workflow-title">From a clear brief to a reusable plan.</h2></div><p>Keep the details in one place, from your first idea to your next task.</p></div><ol><li><span class="landing-step">01 / DEFINE</span><h3>Make the task clear.</h3><p>Describe what you need, add context, and specify the result you expect. Start fresh or use a template.</p></li><li><span class="landing-step">02 / ORGANIZE</span><h3>Choose the right agent.</h3><p>Keep agent names, endpoints, and capabilities in your directory. Assign a preferred agent when you\u2019re ready.</p></li><li><span class="landing-step">03 / REUSE</span><h3>Build on your best work.</h3><p>Save your plan, copy its instructions, or export it as JSON. Reuse the brief whenever a similar task comes up.</p></li></ol></section>
    <section class="landing-execution" aria-labelledby="execution-title">
      <div class="landing-section-heading"><div><div class="eyebrow">SEE THE FULL JOURNEY</div><h2 id="execution-title">From task plan to finished work.</h2></div><span class="execution-example-label">Illustrative example</span></div>
      <p class="execution-intro">A hardcoded walkthrough: prepare a brief in IDLE, run it in an external agent tool, and receive a useful result.</p>
      <ol class="execution-journey">
        <li class="execution-stage"><div class="execution-stage-heading"><span class="landing-step">01 / PLAN IN IDLE</span><span class="execution-state">Prepared</span></div><h3>Summarize a project update</h3><p class="execution-brief">\u201CSummarize the update below. Separate completed work, pending work, and the next step.\u201D</p><div class="execution-source"><span class="eyebrow">EXAMPLE SOURCE TEXT</span><p>Wallet connection is complete. Export review is pending. Next: test the mobile wallet browser.</p></div><div class="execution-handoff"><span>Export task plan</span><span aria-hidden="true">\u2192</span></div></li>
        <li class="execution-stage execution-stage-running"><div class="execution-stage-heading"><span class="landing-step">02 / RUN EXTERNALLY</span><span class="execution-state execution-running"><i aria-hidden="true"></i>Running</span></div><h3>The agent follows your brief.</h3><p>The exported instructions guide a summarization agent in your execution tool.</p><ol class="execution-log" aria-label="Example execution steps"><li><span aria-hidden="true">\u2713</span> Read the supplied update</li><li><span aria-hidden="true">\u2713</span> Identify progress and open work</li><li><span class="execution-log-current" aria-hidden="true">\u21B3</span> Format the requested summary</li></ol><p class="execution-stage-note">Example running state in an external tool</p></li>
        <li class="execution-stage"><div class="execution-stage-heading"><span class="landing-step">03 / RECEIVE A RESULT</span><span class="execution-state">Sample output</span></div><h3>A summary you can use.</h3><dl class="execution-output"><div><dt>Completed</dt><dd>Wallet connection</dd></div><div><dt>Pending</dt><dd>Export review</dd></div><div><dt>Next step</dt><dd>Test the mobile wallet browser</dd></div></dl><p class="execution-stage-note">The result follows the structure defined in the brief.</p></li>
      </ol>
      <div class="execution-caption"><p>This example shows the handoff. IDLE prepares plans; execution and results happen in your own tools.</p><button class="landing-secondary" data-start-example="2">Try the summary brief <span aria-hidden="true">\u2197</span></button></div>
    </section>
    <section class="landing-use-cases" aria-labelledby="use-cases-title"><div class="landing-section-heading"><div><div class="eyebrow">WHAT WILL YOU PLAN?</div><h2 id="use-cases-title">Start with work you recognize.</h2></div><p>Pick a brief and make it your own.</p></div><div class="landing-case-grid"><article><span class="landing-case-icon" aria-hidden="true">\u2315</span><h3>Research a project</h3><p>Turn project documentation into a brief for a sourced overview, architecture review, and open questions.</p><button data-start-example="0">Use research brief <span aria-hidden="true">\u2197</span></button></article><article><span class="landing-case-icon" aria-hidden="true">&lt;/&gt;</span><h3>Review an integration</h3><p>Give an agent your code and a focused checklist for wallet connections, account changes, and error handling.</p><button data-start-example="1">Use code review brief <span aria-hidden="true">\u2197</span></button></article><article><span class="landing-case-icon" aria-hidden="true">\u2261</span><h3>Prepare a report</h3><p>Define a concise summary of a document, with its main claims, decisions, and action items.</p><button data-start-example="2">Use report brief <span aria-hidden="true">\u2197</span></button></article></div></section>
    <section class="landing-details" aria-label="How IDLE works"><div><h3>Planning here. Execution in your tools.</h3><p>IDLE prepares and saves task specifications. Export or copy a plan to your execution tools when you\u2019re ready to run it.</p></div><div><h3>Why connect a Solana wallet?</h3><p>Your public wallet address selects a separate workspace in this browser. Connecting is optional. Plans are stored locally and do not sync across devices.</p></div></section>
    <section class="landing-start" aria-labelledby="start-title"><div><div class="eyebrow">PUT IDLE INTELLIGENCE TO WORK</div><h2 id="start-title">Give your next task a clear starting point.</h2><p>Start with a blank brief or one of the examples above. Save, reuse, and export it whenever you need.</p></div><button class="primary" data-nav="route">Open the task planner <span aria-hidden="true">\u2197</span></button></section>
  </div>`;
  }
  function eventList() {
    return profile().events.slice(0, 5).map((e) => `<div class="event"><span class="event-icon">\u25C7</span><div><p>${esc(e.text)}</p><small>${stamp(e.at)}</small></div></div>`).join("") || '<div class="empty-state"><h3>A fresh start.</h3><p>Your saved plans and directory changes will appear here.</p></div>';
  }
  function overview() {
    const p = profile();
    return `${header("Your workspace.", "Your saved plans, agents, and recent activity.", '<button class="primary" data-nav="route">New task plan \u2197</button>')}
  <div class="stats">${metric("Saved plans", p.tasks.length, "Ready to copy, reuse, or export")}${metric("Agent endpoints", p.agents.length, "Your personal directory")}${metric("Favorite agents", p.agents.filter((a) => a.favorite).length, "Quick access to preferred endpoints")}${metric("Capabilities", new Set(p.agents.flatMap((a) => a.caps)).size, "Across your directory")}</div>
  <div class="lower-grid"><section><div class="section-head"><h2>Recent plans</h2><button class="text-button" data-nav="activity">View all</button></div>${taskCards(p.tasks.slice(0, 3))}</section><section><div class="section-head"><h2>Workspace activity</h2></div><div class="feed">${eventList()}</div></section></div>`;
  }
  function agentCards() {
    const list = profile().agents.filter((a) => (!favoritesOnly || a.favorite) && (capFilter === "All capabilities" || a.caps.includes(capFilter)) && `${a.name} ${a.endpoint} ${a.caps.join(" ")}`.toLowerCase().includes(agentQuery.toLowerCase())).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
    return list.length ? `<div class="agent-grid">${list.map((a) => `<article class="agent-card"><div class="section-head"><h2>${esc(a.name)}</h2><button class="favorite-button ${a.favorite ? "is-favorite" : ""}" data-favorite="${esc(a.id)}" aria-label="${a.favorite ? "Unfavorite" : "Favorite"} ${esc(a.name)}" aria-pressed="${!!a.favorite}">${a.favorite ? "\u2605" : "\u2606"}</button></div><p class="endpoint">${a.template ? '<span class="tag">TEMPLATE</span> ' : ""}${esc(a.endpoint)}</p><div>${a.caps.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div><div class="card-actions"><button class="outline small" data-plan-agent="${esc(a.id)}">Plan a task</button><button class="text-button" data-copy-endpoint="${esc(a.id)}">Copy endpoint</button><button class="text-button" data-remove-agent="${esc(a.id)}">Remove</button></div></article>`).join("")}</div>` : `<div class="empty-state"><span class="empty-symbol">\u25C7</span><h2>${profile().agents.length ? "No matching agents." : "Your directory starts here."}</h2><p>${profile().agents.length ? "Try another search or capability." : "Add an agent endpoint you use and keep its capabilities organized."}</p><button class="primary" data-add-agent>Add an agent</button></div>`;
  }
  function network() {
    return `${header("Your agent directory.", "Manage endpoints, capabilities, and favorites.", '<button class="primary" data-add-agent>\uFF0B Add agent</button>')}<div class="filters"><div class="search"><input id="agent-search" aria-label="Search agents" placeholder="Search names, endpoints, or capabilities\u2026" value="${esc(agentQuery)}"></div><select id="cap-filter" aria-label="Filter by capability">${options(["All capabilities", ...CAPABILITIES], capFilter)}</select><label class="check-label"><input type="checkbox" id="favorites-only" ${favoritesOnly ? "checked" : ""}>Favorites only</label></div><div id="agent-list">${agentCards()}</div>`;
  }
  var templates = [
    { title: "Solana research brief", instruction: "Research the following Solana project: [project]. Summarize its purpose, architecture, current development, and unresolved questions. Include sources and clearly distinguish evidence from assumptions.", capability: "Research" },
    { title: "Review a Solana integration", instruction: "Review the following Solana wallet integration: [paste code]. Check connection handling, account changes, rejected requests, and disconnect behavior. Return concrete improvements.", capability: "Code Generation" },
    { title: "Summarize a document", instruction: "Summarize the following document: [paste source text]. Preserve the main claims, decisions, and action items. Return a concise summary and key takeaways.", capability: "Summarization" }
  ];
  function agentOptions() {
    return '<option value="">Choose later</option>' + profile().agents.filter((a) => a.caps.includes(draft.capability)).map((a) => `<option value="${esc(a.id)}" ${draft.agentId === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("");
  }
  function preview(plan = draft) {
    const a = profile().agents.find((a2) => a2.id === plan.agentId);
    return `<div class="selection"><div class="eyebrow">TASK SPECIFICATION</div><h2>${esc(plan.title || "Your next task")}</h2><p class="preview-instruction">${esc(plan.instruction || "Add clear instructions to prepare a reusable task plan.")}</p><div class="detail-line"><span>Capability</span><b>${esc(plan.capability)}</b></div><div class="detail-line"><span>Priority</span><b>${esc(plan.priority)}</b></div><div class="detail-line"><span>Preferred agent</span><b>${esc(a?.name || "Choose later")}</b></div><div class="detail-line"><span>Workspace</span><b>${esc(short(address))}</b></div></div>`;
  }
  function route() {
    return `${header("Prepare your next task.", "Write instructions, choose a capability, and save your plan.")}<div class="route-layout"><section class="panel route-form"><div class="form-head"><h2>Task planner</h2><p>Start from a template or write your own instructions.</p></div><form id="task-form"><label for="task-title">Task title</label><input id="task-title" maxlength="100" required placeholder="Give the work a name" value="${esc(draft.title)}"><label for="instruction">Instructions</label><textarea id="instruction" maxlength="5000" required placeholder="Describe the work, source material, and expected output\u2026">${esc(draft.instruction)}</textarea><div class="form-row"><div><label for="capability">Required capability</label><select id="capability">${options(CAPABILITIES, draft.capability)}</select></div><div><label for="priority">Priority</label><select id="priority">${options(["Normal", "High", "Low"], draft.priority)}</select></div></div><label for="preferred-agent">Preferred agent</label><select id="preferred-agent">${agentOptions()}</select><div class="error" id="plan-error" role="alert"></div><button type="submit" class="primary">Save task plan \u2197</button></form><div class="example-label">START FROM A TEMPLATE</div><div class="examples">${templates.map((t, i) => `<button class="example" data-template="${i}">${esc(t.title)}</button>`).join("")}</div></section><aside><div id="plan-preview">${preview()}</div><div class="planner-help"><h3>Writing a task</h3><p>Include the source material, requirements, and expected output.</p><button class="text-button" data-nav="network">Manage agent endpoints \u2192</button></div></aside></div>`;
  }
  function taskCards(list) {
    return list.length ? `<div class="task-cards">${list.map((t) => `<article class="task-card"><div class="section-head"><h3>${esc(t.title)}</h3><span class="tag">PLANNED</span></div><p class="task-excerpt">${esc(t.instruction)}</p><small>${esc(t.capability)} \xB7 ${esc(t.priority)} priority \xB7 ${stamp(t.createdAt)}</small><div class="card-actions"><button class="outline small" data-task="${esc(t.id)}">View plan</button><button class="text-button" data-reuse="${esc(t.id)}">Reuse</button><button class="text-button" data-export="${esc(t.id)}">Export JSON</button></div></article>`).join("")}</div>` : '<div class="empty-state"><span class="empty-symbol">\u2197</span><h2>No saved plans yet.</h2><p>Prepare your first task, then return here to reuse or export it.</p><button class="primary" data-nav="route">Create a task plan</button></div>';
  }
  function filteredTasks() {
    return profile().tasks.filter((t) => `${t.title} ${t.instruction} ${t.capability}`.toLowerCase().includes(query.toLowerCase()));
  }
  function activity() {
    return `${header("Saved tasks.", "Find, reuse, and export your task plans.", profile().tasks.length ? '<button class="outline" id="export-all">Export all plans</button>' : "")}<div class="filters"><div class="search"><input id="task-search" aria-label="Search saved tasks" placeholder="Search titles, instructions, or capabilities\u2026" value="${esc(query)}"></div><span class="count-label">${profile().tasks.length} SAVED PLANS</span></div><div id="saved-list">${filteredTasks().length ? taskCards(filteredTasks()) : query ? '<div class="empty-state"><h2>No plans match your search.</h2><p>Try a different title or capability.</p></div>' : taskCards([])}</div>`;
  }
  function docs() {
    return `${header("Documentation.", "Wallets, agents, and task plans.")}<article class="doc-article panel docs-content"><h2>Connect a wallet</h2><p>Choose Connect wallet and select your Solana wallet. Phantom, Solflare, Backpack, and compatible Wallet Standard wallets are supported. On mobile, open IDLE in your wallet\u2019s browser.</p><h3>Add an agent</h3><p>Open Agent directory, select Add agent, and enter its name, HTTPS endpoint, and capabilities. Use favorites and filters to find agents quickly.</p><h3>Create a task plan</h3><p>Enter a title and instructions, select the required capability, and optionally choose a preferred agent. Save the plan to use it again.</p><h3>Copy or export</h3><p>Open a saved plan to copy its specification or download it as JSON. Select Reuse to create another plan from its instructions.</p><h3>Storage</h3><p>Your plans and directory are saved in this browser. Guest and wallet workspaces are separate. Reconnect the same wallet to access its plans, and export a copy before clearing browser data.</p><h3>Task plans</h3><p>The planner prepares instructions for use with your execution tools. Exports include the capability, priority, and preferred endpoint.</p><h3>Solana</h3><p><a class="resource-link" href="https://solana.com/docs" target="_blank" rel="noopener noreferrer">Solana documentation \u2197</a></p></article>`;
  }
  function render() {
    document.body.classList.toggle("landing-mode", page === "introduction");
    nav();
    $("#app").innerHTML = { introduction, overview, network, route, activity, docs }[page]();
    if (page === "introduction") {
      $("#landing-agent").addEventListener("change", (e) => {
        landingAgentId = e.target.value;
        $(".landing-product-preview").innerHTML = preview({ ...emptyDraft(), ...templates[landingTemplate], agentId: landingAgentId });
      });
    }
    if (page === "route") {
      for (const [id, key] of [["task-title", "title"], ["instruction", "instruction"], ["capability", "capability"], ["priority", "priority"], ["preferred-agent", "agentId"]]) {
        $("#" + id).addEventListener(id === "task-title" || id === "instruction" ? "input" : "change", (e) => {
          draft[key] = e.target.value;
          if (key === "capability") {
            draft.agentId = "";
            $("#preferred-agent").innerHTML = agentOptions();
          }
          $("#plan-preview").innerHTML = preview();
        });
      }
      $("#task-form").addEventListener("submit", (e) => {
        e.preventDefault();
        try {
          const t = store.saveTask(address, draft);
          draft = emptyDraft();
          render();
          taskModal(t);
          toast("Task plan saved.");
        } catch (error) {
          $("#plan-error").textContent = error.message;
        }
      });
    }
    if (page === "network") {
      $("#agent-search").addEventListener("input", (e) => {
        agentQuery = e.target.value;
        $("#agent-list").innerHTML = agentCards();
      });
      $("#cap-filter").addEventListener("change", (e) => {
        capFilter = e.target.value;
        $("#agent-list").innerHTML = agentCards();
      });
      $("#favorites-only").addEventListener("change", (e) => {
        favoritesOnly = e.target.checked;
        $("#agent-list").innerHTML = agentCards();
      });
    }
    if (page === "activity") $("#task-search").addEventListener("input", (e) => {
      query = e.target.value;
      $("#saved-list").innerHTML = filteredTasks().length ? taskCards(filteredTasks()) : '<div class="empty-state"><h2>No plans match your search.</h2></div>';
    });
  }
  function navigate(p) {
    page = validPage(p);
    location.hash = page;
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function showModal(title, subtitle, body, type) {
    modalType = type;
    $("#modal-content").innerHTML = `<div class="modal-header"><div><h2 id="modal-title">${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="close-button" id="close-modal" aria-label="Close dialog">\xD7</button></div><div class="modal-body">${body}</div>`;
    $("#modal").setAttribute("aria-labelledby", "modal-title");
    if (!$("#modal").open) $("#modal").showModal();
  }
  function closeModal() {
    if (wallets2.connecting) return;
    $("#modal").close();
    modalType = null;
  }
  function walletModal() {
    if (address) {
      showModal("Your Solana wallet.", walletName, `<p class="wallet-address">${esc(address)}</p><div class="modal-actions"><button class="outline" id="copy-address">Copy address</button><button class="primary" id="disconnect-wallet">Disconnect</button></div><div class="error" id="wallet-error" role="alert"></div>`, "wallet");
      return;
    }
    walletOptions = wallets2.wallets();
    showModal("Connect a Solana wallet.", "Choose a wallet available in this browser.", `<div class="wallet-list">${walletOptions.map((w, i) => `<button class="wallet-option" data-wallet="${i}"><span class="wallet-monogram">${esc(w.name[0])}</span><span>${esc(w.name)}<small>Connect wallet</small></span><span>\u2192</span></button>`).join("") || '<div class="empty-state"><h3>No compatible wallets detected.</h3><p>Install a Solana wallet extension or open this site inside your wallet\u2019s browser.</p></div>'}</div><div class="wallet-links"><a href="https://phantom.com/" target="_blank" rel="noopener noreferrer">Get Phantom \u2197</a><a href="https://solflare.com/" target="_blank" rel="noopener noreferrer">Get Solflare \u2197</a><a href="https://backpack.app/" target="_blank" rel="noopener noreferrer">Get Backpack \u2197</a></div><div class="error" id="wallet-error" role="alert"></div>`, "wallet");
  }
  function addAgentModal() {
    showModal("Add an agent.", "Save an endpoint to your directory.", `<form id="agent-form"><label for="agent-name">Agent name</label><input id="agent-name" maxlength="60" required placeholder="Your research agent"><label for="agent-endpoint">Endpoint URL</label><input id="agent-endpoint" type="url" required placeholder="https://your-agent.example/tasks"><fieldset class="capability-fieldset"><legend>Declared capabilities</legend><div class="cap-checks">${CAPABILITIES.map((c) => `<label><input type="checkbox" name="caps" value="${esc(c)}">${esc(c)}</label>`).join("")}</div></fieldset><div class="error" id="agent-error" role="alert"></div><div class="modal-actions"><button type="submit" class="primary">Save agent</button></div></form>`, "agent");
    $("#agent-form").addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        store.addAgent(address, { name: $("#agent-name").value, endpoint: $("#agent-endpoint").value, caps: [...document.querySelectorAll('[name="caps"]:checked')].map((el) => el.value) });
        closeModal();
        render();
        toast("Agent saved to your directory.");
      } catch (error) {
        $("#agent-error").textContent = error.message;
      }
    });
  }
  function taskModal(t) {
    showModal(t.title, `${t.capability} \xB7 Planned \xB7 ${stamp(t.createdAt)}`, `<pre class="spec-output">${esc(JSON.stringify(taskSpec(t), null, 2))}</pre><div class="card-actions"><button class="primary" data-copy-task="${esc(t.id)}">Copy specification</button><button class="outline" data-export="${esc(t.id)}">Export JSON</button><button class="text-button" data-reuse="${esc(t.id)}">Reuse plan</button></div>`, "task");
  }
  async function copy(text) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        ($("#modal").open ? $("#modal-content") : document.body).append(el);
        el.select();
        const ok = document.execCommand("copy");
        el.remove();
        if (!ok) throw Error();
      }
      toast("Copied to clipboard.");
    } catch {
      toast("Copy unavailable. Export the specification instead.");
    }
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function exportTask(t) {
    download(taskSpec(t), `idle-task-${t.id}.json`);
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.hasAttribute("data-scroll-workflow")) {
        $("#landing-workflow").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        return;
      }
      if (b.dataset.landingExample !== void 0) {
        landingTemplate = Number(b.dataset.landingExample);
        landingAgentId = "";
        render();
        $(`[data-landing-example="${landingTemplate}"]`).focus();
        return;
      }
      if (b.hasAttribute("data-use-landing-plan") || b.dataset.startExample !== void 0) {
        const i = b.dataset.startExample !== void 0 ? Number(b.dataset.startExample) : landingTemplate;
        draft = { ...emptyDraft(), ...templates[i], agentId: b.hasAttribute("data-use-landing-plan") ? landingAgentId : "" };
        navigate("route");
        $("#task-title").focus();
        return;
      }
      if (b.dataset.nav) {
        navigate(b.dataset.nav);
        return;
      }
      if (b.id === "close-modal" || b.hasAttribute("data-close-modal")) {
        closeModal();
        return;
      }
      if (b.id === "connect-top") {
        walletModal();
        return;
      }
      if (b.hasAttribute("data-add-agent")) {
        addAgentModal();
        return;
      }
      if (b.dataset.wallet !== void 0) {
        const item = walletOptions[Number(b.dataset.wallet)];
        if (!item) return;
        document.querySelectorAll(".wallet-option").forEach((el) => el.disabled = true);
        $("#wallet-error").textContent = "Approve the connection in your wallet\u2026";
        $("#close-modal").disabled = true;
        try {
          await wallets2.connect(item);
          closeModal();
          toast(`${item.name} connected.`);
        } catch (error) {
          walletModal();
          $("#wallet-error").textContent = error.code === 4001 ? "Connection declined. You can choose a wallet again." : error.message || "Could not connect. Try again.";
        }
        return;
      }
      if (b.id === "disconnect-wallet") {
        await wallets2.disconnect();
        closeModal();
        toast("Wallet disconnected.");
        return;
      }
      if (b.id === "copy-address") {
        await copy(address);
        return;
      }
      const agent = profile().agents.find((a) => a.id === (b.dataset.favorite || b.dataset.copyEndpoint || b.dataset.planAgent || b.dataset.removeAgent));
      if (agent) {
        if (b.dataset.favorite) {
          store.favorite(address, agent.id);
          render();
        } else if (b.dataset.copyEndpoint) {
          await copy(agent.endpoint);
        } else if (b.dataset.planAgent) {
          draft = { ...emptyDraft(), capability: agent.caps[0], agentId: agent.id };
          navigate("route");
        } else if (b.dataset.removeAgent) {
          showModal("Remove this agent?", agent.name, `<p>Remove this entry from your directory? Saved plans will be kept.</p><div class="modal-actions"><button class="outline" data-close-modal>Keep agent</button><button class="primary" data-confirm-remove="${esc(agent.id)}">Remove agent</button></div>`, "remove");
        }
        return;
      }
      if (b.dataset.confirmRemove) {
        store.removeAgent(address, b.dataset.confirmRemove);
        closeModal();
        render();
        toast("Agent removed.");
        return;
      }
      if (b.dataset.template !== void 0) {
        draft = { ...emptyDraft(), ...templates[Number(b.dataset.template)] };
        render();
        $("#task-title").focus();
        return;
      }
      const t = profile().tasks.find((t2) => t2.id === (b.dataset.task || b.dataset.reuse || b.dataset.export || b.dataset.copyTask));
      if (t) {
        if (b.dataset.task) taskModal(t);
        else if (b.dataset.reuse) {
          draft = { title: t.title, instruction: t.instruction, capability: t.capability, priority: t.priority, agentId: profile().agents.find((a) => a.endpoint === t.agent?.endpoint && a.caps.includes(t.capability))?.id || "" };
          closeModal();
          navigate("route");
        } else if (b.dataset.export) exportTask(t);
        else await copy(JSON.stringify(taskSpec(t), null, 2));
        return;
      }
      if (b.id === "export-all") {
        download(profile().tasks.map(taskSpec), "idle-task-plans.json");
        return;
      }
    } catch (error) {
      const errorEl = $("#wallet-error");
      if (errorEl && $("#modal").open) errorEl.textContent = error.message;
      else toast(error.message || "This action could not be completed.");
    }
  });
  $("#modal").addEventListener("cancel", (e) => {
    if (wallets2.connecting) e.preventDefault();
    else modalType = null;
  });
  $("#modal").addEventListener("close", () => {
    modalType = null;
  });
  window.addEventListener("hashchange", () => {
    page = validPage(location.hash.slice(1));
    render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey && !e.altKey && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName) && !e.target.isContentEditable && !$("#modal").open) navigate("route");
  });
  window.addEventListener("storage", (e) => {
    if (e.key === "idle-workspace-v1") toast("Workspace changed in another tab. Reload to see its latest saved data.");
  });
  if (location.hash !== "#" + page) history.replaceState(null, "", "#" + page);
  render();
})();
