// Validates the shared data files. Runs in CI and locally: node scripts/validate.mjs
import { readFileSync, existsSync } from 'node:fs';

const errors = [];
const fail = (msg) => errors.push(msg);

function load(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`${path}: JSON inválido (${err.message})`);
    return null;
  }
}

const COSTS = ['free', 'freemium', 'paid'];
const KINDS = ['course', 'lab', 'book', 'repo', 'docs', 'video', 'podcast', 'practice', 'cert', 'tool'];
const AREAS = ['tech', 'english'];
const LANGS = ['pt', 'en'];
const LEVELS = ['essential', 'optional'];

const resources = load('data/resources.json') ?? [];
const ids = new Set();
for (const [i, r] of resources.entries()) {
  const where = `resources[${i}] (${r.id ?? 'sem id'})`;
  if (!r.id || !/^[a-z0-9-]+$/.test(r.id)) fail(`${where}: id deve ser kebab-case`);
  if (ids.has(r.id)) fail(`${where}: id duplicado`);
  ids.add(r.id);
  if (!r.title) fail(`${where}: sem title`);
  if (!/^https:\/\//.test(r.url ?? '')) fail(`${where}: url deve começar com https://`);
  if (!COSTS.includes(r.cost)) fail(`${where}: cost inválido (${r.cost})`);
  if (!KINDS.includes(r.kind)) fail(`${where}: kind inválido (${r.kind})`);
  if (!AREAS.includes(r.area)) fail(`${where}: area inválida (${r.area})`);
  if (!LANGS.includes(r.language)) fail(`${where}: language inválido (${r.language})`);
  if (!Array.isArray(r.tags) || !r.tags.length) fail(`${where}: precisa de tags`);
}

const urls = new Map();
for (const r of resources) {
  if (urls.has(r.url)) fail(`url repetida em ${urls.get(r.url)} e ${r.id}`);
  urls.set(r.url, r.id);
}

const templates = load('data/templates/index.json') ?? [];
for (const meta of templates) {
  if (!existsSync(meta.file)) { fail(`template ${meta.id}: arquivo ${meta.file} não existe`); continue; }
  const t = load(meta.file);
  if (!t) continue;
  if (t.id !== meta.id) fail(`${meta.file}: id "${t.id}" difere do índice "${meta.id}"`);
  for (const phase of t.phases ?? []) {
    if (!phase.name) fail(`${meta.file}: fase sem nome`);
    for (const topic of phase.topics ?? []) {
      const where = `${meta.file} › ${topic.name}`;
      if (!AREAS.includes(topic.area)) fail(`${where}: area inválida`);
      if (topic.level && !LEVELS.includes(topic.level)) fail(`${where}: level inválido`);
      for (const ref of topic.resources ?? []) if (!ids.has(ref)) fail(`${where}: recurso "${ref}" não existe`);
    }
  }
  for (const [wd, goals] of Object.entries(t.weeklyGoals ?? {})) {
    if (!/^[0-6]$/.test(wd)) fail(`${meta.file}: weeklyGoals com dia inválido "${wd}"`);
    for (const g of goals) if (!AREAS.includes(g.area) || !(g.minutes > 0)) fail(`${meta.file}: meta inválida em ${wd}`);
  }
}

if (existsSync('data/minha-trilha.json')) load('data/minha-trilha.json');

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${resources.length} recursos, ${templates.length} modelos válidos`);
