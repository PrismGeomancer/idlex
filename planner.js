export const CAPABILITIES = ['Research', 'Code Generation', 'Data Analysis', 'Market Intelligence', 'Summarization', 'Classification'];
export const STORAGE_KEY = 'idle-workspace-v1';
const AGENT_TEMPLATES = [
  { id: 'template-atlas', name: 'Atlas', endpoint: 'https://atlas.example/tasks', caps: ['Research', 'Summarization'] },
  { id: 'template-relay', name: 'Relay', endpoint: 'https://relay.example/tasks', caps: ['Code Generation', 'Classification'] },
  { id: 'template-vector', name: 'Vector', endpoint: 'https://vector.example/tasks', caps: ['Data Analysis', 'Market Intelligence'] },
];
const TASK_TEMPLATES = [
  { id: 'plan-solana-research', title: 'Solana ecosystem brief', instruction: 'Prepare a research brief on the Solana ecosystem. Cover developer tooling, major application categories, and infrastructure. Include sources and questions for further research.', capability: 'Research', priority: 'Normal', agentId: 'template-atlas' },
  { id: 'plan-wallet-review', title: 'Wallet integration review', instruction: 'Review a Solana wallet integration for connection handling, account changes, rejected requests, and disconnect behavior. Provide a checklist and recommended improvements.', capability: 'Code Generation', priority: 'High', agentId: 'template-relay' },
  { id: 'plan-activity-analysis', title: 'Solana activity analysis', instruction: 'Analyze a supplied Solana activity dataset. Summarize transaction volume, active addresses, and trends. Identify missing data and describe the methodology used.', capability: 'Data Analysis', priority: 'Normal', agentId: 'template-vector' },
];
const validAddress = (s) => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
export const profileKey = (address) => validAddress(address) ? address : 'guest';
export function createWorkspace(storage) {
  let warning = '', state = { profiles: {} };
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.profiles !== 'object' || !parsed.profiles) throw Error();
      for (const [key, p] of Object.entries(parsed.profiles)) {
        if (key !== 'guest' && !validAddress(key)) continue;
        if (!p || !Array.isArray(p.agents) || !Array.isArray(p.tasks) || !Array.isArray(p.events)) continue;
        state.profiles[key] = {
          agentTemplatesVersion: p.agentTemplatesVersion === 1 ? 1 : 0,
          taskTemplatesVersion: p.taskTemplatesVersion === 1 ? 1 : 0,
          agents: p.agents.filter(a => a && typeof a.id === 'string' && typeof a.name === 'string' && Array.isArray(a.caps) && a.caps.every(c => CAPABILITIES.includes(c)) && typeof a.endpoint === 'string'),
          tasks: p.tasks.filter(t => t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.instruction === 'string' && CAPABILITIES.includes(t.capability) && ['High','Normal','Low'].includes(t.priority) && Number.isFinite(t.createdAt)),
          events: p.events.filter(e => e && typeof e.text === 'string' && Number.isFinite(e.at)).slice(0,100),
        };
      }
    }
  } catch { warning = 'Saved workspace could not be read. You can start a new workspace.'; }
  function persist() {
    try { if (!storage) throw Error(); storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { warning = 'Changes are available for this session only. Browser storage is unavailable or full.'; }
  }
  function profile(address) {
    const key = profileKey(address);
    const p = state.profiles[key] ||= { agents: [], tasks: [], events: [] };
    let changed = false;
    if (p.agentTemplatesVersion !== 1) {
      for (const template of AGENT_TEMPLATES) {
        if (!p.agents.some(a => a.id === template.id)) p.agents.push({ ...template, caps: [...template.caps], favorite: false, template: true });
      }
      p.agentTemplatesVersion = 1;
      changed = true;
    }
    if (p.taskTemplatesVersion !== 1) {
      const createdAt = Date.now();
      for (const { agentId, ...template } of TASK_TEMPLATES) {
        if (p.tasks.some(t => t.id === template.id)) continue;
        const agent = AGENT_TEMPLATES.find(a => a.id === agentId);
        p.tasks.push({ ...template, agent: { name: agent.name, endpoint: agent.endpoint }, owner: key, status: 'Planned', createdAt });
      }
      p.events.unshift({ text: 'Starter task plans added to your workspace', at: createdAt });
      p.events = p.events.slice(0,100);
      p.taskTemplatesVersion = 1;
      changed = true;
    }
    if (changed) persist();
    return p;
  }
  function event(address, text) {
    const p = profile(address);
    p.events.unshift({ text, at: Date.now() });
    p.events = p.events.slice(0,100);
  }
  function addAgent(address, input) {
    const name = String(input.name || '').trim(), endpoint = String(input.endpoint || '').trim();
    let url;
    try { url = new URL(endpoint); } catch { throw Error('Enter a valid HTTPS endpoint URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('Use an HTTPS endpoint without credentials in the URL.');
    if (!name || name.length > 60) throw Error('Enter an agent name of up to 60 characters.');
    const caps = [...new Set(input.caps || [])];
    if (!caps.length || !caps.every(c => CAPABILITIES.includes(c))) throw Error('Select at least one supported capability.');
    const p = profile(address);
    if (p.agents.some(a => a.endpoint === url.href)) throw Error('This endpoint is already in your directory.');
    const agent = { id: crypto.randomUUID(), name, endpoint: url.href, caps, favorite: false };
    p.agents.push(agent); event(address, `${name} added to your directory`); persist(); return agent;
  }
  function saveTask(address, input) {
    const title = String(input.title || '').trim(), instruction = String(input.instruction || '').trim();
    if (!title || title.length > 100) throw Error('Enter a title of up to 100 characters.');
    if (!instruction || instruction.length > 5000) throw Error('Enter an instruction of up to 5,000 characters.');
    if (!CAPABILITIES.includes(input.capability) || !['High','Normal','Low'].includes(input.priority)) throw Error('Choose a supported capability and priority.');
    const p = profile(address), agent = p.agents.find(a => a.id === input.agentId);
    if (input.agentId && (!agent || !agent.caps.includes(input.capability))) throw Error('Choose an agent with the selected capability.');
    const task = { id: crypto.randomUUID(), title, instruction, capability: input.capability, priority: input.priority, agent: agent ? { name: agent.name, endpoint: agent.endpoint } : null, owner: profileKey(address), status: 'Planned', createdAt: Date.now() };
    p.tasks.unshift(task); event(address, `${title} saved as a task plan`); persist(); return task;
  }
  function favorite(address, id) {
    const a = profile(address).agents.find(a => a.id === id);
    if (a) { a.favorite = !a.favorite; persist(); }
  }
  function removeAgent(address, id) {
    const p = profile(address), a = p.agents.find(a => a.id === id);
    if (a) { p.agents = p.agents.filter(a => a.id !== id); event(address, `${a.name} removed from your directory`); persist(); }
  }
  return { profile, addAgent, saveTask, favorite, removeAgent, get warning() { return warning; } };
}
export function taskSpec(task) {
  return { version: 1, id: task.id, title: task.title, instruction: task.instruction, required_capability: task.capability, priority: task.priority.toLowerCase(), preferred_endpoint: task.agent?.endpoint || null, owner: task.owner, status: 'planned', created_at: new Date(task.createdAt).toISOString() };
}
