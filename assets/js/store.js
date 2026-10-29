// State lives in the browser (localStorage). The repo only ships shared data:
// the resource catalog, track templates and, optionally, the owner's published track.
import { uid, dateKey, parseKey, addDays } from './util.js';

const STORAGE_KEY = 'trilha:v1';
export const SCHEMA_VERSION = 1;

export const catalog = { resources: [], templates: [] };
export let state = null;
export let source = 'local'; // 'local' | 'published' | 'new'

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    profile: { name: '' },
    settings: { streakThreshold: 0.8, currentPhaseId: null },
    track: { name: '', templateId: null, phases: [] },
    weeklyGoals: defaultWeeklyGoals(),
    days: {},
    notes: [],
    labs: [],
    customResources: [],
  };
}

export function defaultWeeklyGoals() {
  const weekday = [
    { area: 'tech', title: 'Estudo: {topic}', minutes: 30 },
    { area: 'tech', title: 'Prática: {topic}', minutes: 30 },
    { area: 'english', title: 'Escuta ativa: 1 vídeo, 3 passadas', minutes: 20 },
    { area: 'english', title: 'Shadowing de 5 frases', minutes: 10 },
    { area: 'english', title: 'Podcast passivo', minutes: 10 },
  ];
  return {
    0: [
      { area: 'tech', title: 'Escrever README do lab da semana', minutes: 60 },
      { area: 'english', title: 'Podcast passivo', minutes: 20 },
    ],
    1: weekday, 2: weekday, 3: weekday, 4: weekday, 5: weekday,
    6: [
      { area: 'tech', title: 'Lab prático: {topic}', minutes: 150 },
      { area: 'english', title: 'Podcast passivo', minutes: 20 },
    ],
  };
}

export async function init() {
  const [resources, templates] = await Promise.all([
    fetchJson('data/resources.json', []),
    fetchJson('data/templates/index.json', []),
  ]);
  catalog.resources = resources;
  catalog.templates = templates;

  const saved = readLocal();
  if (saved) {
    state = migrate(saved);
    source = 'local';
    return;
  }
  // First visit: show the owner's published track (read from the repo) if there is one.
  const published = await fetchJson('data/minha-trilha.json', null);
  state = published ? migrate(published) : emptyState();
  source = published ? 'published' : 'new';
}

async function fetchJson(path, fallback) {
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    return res.ok ? await res.json() : fallback;
  } catch {
    return fallback;
  }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    source = 'local';
    return true;
  } catch {
    return false;
  }
}

export function replaceState(next) {
  state = migrate(next);
  save();
}

export function resetState() {
  state = emptyState();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
  source = 'new';
}

function migrate(data) {
  const base = emptyState();
  return {
    ...base,
    ...data,
    version: SCHEMA_VERSION,
    profile: { ...base.profile, ...data.profile },
    settings: { ...base.settings, ...data.settings },
    track: { ...base.track, ...data.track },
    weeklyGoals: data.weeklyGoals ?? base.weeklyGoals,
  };
}

// ---------- catalog / track ----------

export async function loadTemplate(id) {
  const meta = catalog.templates.find((t) => t.id === id);
  if (!meta) throw new Error(`Modelo ${id} não encontrado`);
  const res = await fetch(meta.file);
  if (!res.ok) throw new Error(`Falha ao baixar ${meta.file}`);
  return res.json();
}

// Copies a template into the user's state with fresh ids, so edits never touch the template.
export function applyTemplate(template) {
  state.track = {
    name: template.name,
    templateId: template.id,
    phases: template.phases.map((phase) => ({
      id: uid(),
      name: phase.name,
      goal: phase.goal ?? '',
      targetDate: '',
      topics: phase.topics.map((topic) => ({
        id: uid(),
        name: topic.name,
        area: topic.area ?? 'tech',
        level: topic.level ?? 'essential',
        status: 'todo',
        tags: topic.tags ?? [],
        resourceIds: topic.resources ?? [],
      })),
    })),
  };
  if (template.weeklyGoals) state.weeklyGoals = template.weeklyGoals;
  state.settings.currentPhaseId = state.track.phases[0]?.id ?? null;
  // Untouched day plans were generated without topics; let them regenerate.
  for (const [key, day] of Object.entries(state.days)) {
    if (!day.note && day.tasks.every((t) => t.done === 0)) delete state.days[key];
  }
}

export function allResources() {
  return [...catalog.resources, ...state.customResources.map((r) => ({ ...r, custom: true }))];
}

export function findTopic(topicId) {
  for (const phase of state.track.phases) {
    const topic = phase.topics.find((t) => t.id === topicId);
    if (topic) return { phase, topic };
  }
  return null;
}

// Explicit links first, then catalog entries sharing a tag with the topic.
export function suggestResources(topic, limit = 6) {
  const all = allResources();
  const explicit = topic.resourceIds.map((id) => all.find((r) => r.id === id)).filter(Boolean);
  const tags = new Set(topic.tags);
  const byTag = all
    .filter((r) => !topic.resourceIds.includes(r.id) && (r.area === topic.area || !r.area))
    .map((r) => ({ r, score: (r.tags ?? []).filter((t) => tags.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || costRank(a.r) - costRank(b.r))
    .map((x) => x.r);
  return [...explicit, ...byTag].slice(0, limit);
}

function costRank(resource) {
  return { free: 0, freemium: 1, paid: 2 }[resource.cost] ?? 3;
}

export function currentPhase() {
  const phases = state.track.phases;
  return phases.find((p) => p.id === state.settings.currentPhaseId) ?? phases[0] ?? null;
}

// The topic a placeholder task points to: first "studying" topic of the area in the
// current phase, else the first "todo" one.
export function currentTopic(area) {
  const phase = currentPhase();
  if (!phase) return null;
  const topics = phase.topics.filter((t) => t.area === area);
  return topics.find((t) => t.status === 'studying') ?? topics.find((t) => t.status === 'todo') ?? null;
}

// ---------- daily plan ----------

export function getDay(key, { create = true } = {}) {
  if (!state.days[key] && create) {
    const goals = state.weeklyGoals[parseKey(key).getDay()] ?? [];
    state.days[key] = {
      note: '',
      tasks: goals.map((goal) => {
        const topic = goal.title.includes('{topic}') ? currentTopic(goal.area) : null;
        return {
          id: uid(),
          area: goal.area,
          title: goal.title.replace('{topic}', topic?.name ?? 'tópico livre'),
          target: goal.minutes,
          done: 0,
          skipped: false,
          topicId: topic?.id ?? null,
        };
      }),
    };
  }
  return state.days[key] ?? null;
}

export function dayTotals(day) {
  const totals = { tech: { target: 0, done: 0 }, english: { target: 0, done: 0 } };
  for (const task of day?.tasks ?? []) {
    const bucket = totals[task.area];
    if (!bucket) continue;
    if (!task.skipped) bucket.target += task.target;
    bucket.done += task.done;
  }
  return totals;
}

// A day counts when every area with a goal reaches the threshold (default 80%).
export function dayMet(day) {
  if (!day) return false;
  const totals = Object.values(dayTotals(day)).filter((t) => t.target > 0);
  if (!totals.length) return false;
  return totals.every((t) => t.done >= t.target * state.settings.streakThreshold);
}

export function streak(today = new Date()) {
  let cursor = today;
  // Today still in progress does not break the streak.
  if (!dayMet(state.days[dateKey(cursor)])) cursor = addDays(cursor, -1);
  let count = 0;
  while (dayMet(state.days[dateKey(cursor)])) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function bestStreak() {
  const keys = Object.keys(state.days).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    const met = dayMet(state.days[key]);
    const consecutive = prev && dateKey(addDays(parseKey(prev), 1)) === key;
    run = met ? (consecutive ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

// Tasks from yesterday that were neither done nor skipped, offered (not forced) today.
export function pendingFrom(key) {
  const prev = state.days[dateKey(addDays(parseKey(key), -1))];
  return (prev?.tasks ?? []).filter((t) => !t.skipped && t.done < t.target);
}

export function phaseProgress(phase) {
  const total = phase.topics.length;
  const mastered = phase.topics.filter((t) => t.status === 'mastered').length;
  return { total, mastered, pct: total ? Math.round((mastered / total) * 100) : 0 };
}

// Export without private parts, for committing to a public fork.
export function publicSnapshot({ includeNotes, includeDays }) {
  const copy = structuredClone(state);
  if (!includeNotes) copy.notes = [];
  if (!includeDays) {
    copy.days = Object.fromEntries(
      Object.entries(copy.days).map(([key, day]) => [key, { note: '', tasks: day.tasks }]),
    );
  }
  return copy;
}
