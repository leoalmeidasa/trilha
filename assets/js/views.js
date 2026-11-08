// Each view exports render() -> HTML and an actions map. app.js dispatches
// clicks on [data-action] and changes on [data-change] to the active view.
import * as store from './store.js';
import {
  AREAS, LEVELS, STATUSES, COSTS, KINDS, LAB_STATUSES, WEEKDAYS,
  esc, safeUrl, uid, dateKey, addDays, parseKey, formatDate, parseTags, options, markdown,
} from './util.js';
import * as speech from './speech.js';
import * as voice from './voice.js';
import * as chat from './chat.js';
import * as phonemes from './phonemes.js';

const ui = {
  dayKey: dateKey(),
  resourceFilter: { q: '', cost: '', area: '', language: '', kind: '' },
  editingNoteId: null,
  openTopicId: null,
};

const s = () => store.state;

function bar(done, target) {
  const pct = target ? Math.min(100, Math.round((done / target) * 100)) : 0;
  return `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
}

function resourceCard(r, extra = '') {
  return `<li class="res">
    <a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">${esc(r.title)}</a>
    <span class="chip cost-${esc(r.cost)}">${esc(COSTS[r.cost] ?? r.cost)}</span>
    <span class="chip">${esc(KINDS[r.kind] ?? r.kind)}</span>
    <span class="chip">${esc((r.language ?? '').toUpperCase())}</span>
    ${r.custom ? '<span class="chip">meu</span>' : ''}
    ${r.description ? `<p class="muted">${esc(r.description)}</p>` : ''}
    ${extra}
  </li>`;
}

function emptyTrackHint() {
  return `<div class="card hint">
    <p>Você ainda não tem trilha. Comece por um modelo ou monte do zero.</p>
    <a class="btn primary" href="#/trilha">Criar minha trilha</a>
  </div>`;
}

// ---------------------------------------------------------------- Hoje

export const today = {
  title: 'Hoje',
  render() {
    const key = ui.dayKey;
    const day = store.getDay(key);
    const totals = store.dayTotals(day);
    const phase = store.currentPhase();
    const isToday = key === dateKey();
    const pending = isToday ? store.pendingFrom(key).filter((p) => !day.tasks.some((t) => t.title === p.title)) : [];

    const section = (area) => {
      const tasks = day.tasks.filter((t) => t.area === area);
      const t = totals[area];
      return `<section class="card">
        <header class="row">
          <h2>${AREAS[area]}</h2>
          <span class="muted">${t.done}/${t.target} min</span>
        </header>
        ${bar(t.done, t.target)}
        <ul class="tasks">${tasks.map(taskRow).join('') || '<li class="muted">Nenhuma meta para hoje.</li>'}</ul>
        <form class="row add" data-submit="addTask" data-area="${area}">
          <input name="title" placeholder="Nova tarefa" required>
          <input name="target" type="number" min="5" step="5" value="15" aria-label="Minutos">
          <button class="btn">Adicionar</button>
        </form>
      </section>`;
    };

    return `
      <div class="daynav">
        <div class="daynav-title">
          <h1 class="date">${esc(formatDate(key))}</h1>
          <p class="muted">${phase ? esc(phase.name) : 'Sem trilha'} · 🔥 ${store.streak()} dias seguidos · recorde ${store.bestStreak()}</p>
        </div>
        <div class="seg" role="group" aria-label="Navegar entre dias">
          <button class="seg-btn" data-action="shiftDay" data-n="-7" aria-label="Semana anterior" title="Semana anterior">«</button>
          <button class="seg-btn" data-action="shiftDay" data-n="-1" aria-label="Dia anterior" title="Dia anterior">‹</button>
          <button class="seg-btn today" data-action="goToday"${isToday ? ' disabled' : ''}>Hoje</button>
          <button class="seg-btn" data-action="shiftDay" data-n="1" aria-label="Próximo dia" title="Próximo dia">›</button>
          <button class="seg-btn" data-action="shiftDay" data-n="7" aria-label="Próxima semana" title="Próxima semana">»</button>
        </div>
      </div>
      ${weekStrip(key)}
      ${s().track.phases.length ? '' : emptyTrackHint()}
      ${store.dayMet(day) ? '<p class="card ok">Meta do dia batida. 👏</p>' : ''}
      ${section('tech')}
      ${section('english')}
      ${pending.length ? `<section class="card">
        <h2>Pendentes de ontem</h2>
        <ul class="tasks">${pending.map((p) => `<li class="row"><span>${esc(p.title)}</span>
          <button class="btn" data-action="carryOver" data-id="${p.id}">Trazer para hoje</button></li>`).join('')}</ul>
      </section>` : ''}
      <section class="card">
        <h2>Nota do dia</h2>
        <textarea data-change="dayNote" rows="4" placeholder="O que aprendi hoje...">${esc(day.note)}</textarea>
      </section>`;
  },
  actions: {
    shiftDay(el) { ui.dayKey = dateKey(addDays(parseKey(ui.dayKey), Number(el.dataset.n))); },
    goToday() { ui.dayKey = dateKey(); },
    pickDay(el) { ui.dayKey = el.dataset.key; },
    addMinutes(el) {
      const task = findTask(el.dataset.id);
      task.done = Math.max(0, task.done + Number(el.dataset.n));
      store.save();
    },
    finishTask(el) {
      const task = findTask(el.dataset.id);
      task.done = task.done >= task.target ? 0 : task.target;
      task.skipped = false;
      store.save();
    },
    skipTask(el) {
      const task = findTask(el.dataset.id);
      task.skipped = !task.skipped;
      store.save();
    },
    removeTask(el) {
      const day = store.getDay(ui.dayKey);
      day.tasks = day.tasks.filter((t) => t.id !== el.dataset.id);
      store.save();
    },
    carryOver(el) {
      const prev = store.pendingFrom(ui.dayKey).find((t) => t.id === el.dataset.id);
      if (!prev) return;
      store.getDay(ui.dayKey).tasks.push({ ...prev, id: uid(), done: 0, skipped: false });
      store.save();
    },
  },
  changes: {
    dayNote(el) { store.getDay(ui.dayKey).note = el.value; store.save(); return false; },
    taskDone(el) { findTask(el.dataset.id).done = Math.max(0, Number(el.value) || 0); store.save(); },
  },
  submits: {
    addTask(form) {
      const data = new FormData(form);
      store.getDay(ui.dayKey).tasks.push({
        id: uid(), area: form.dataset.area, title: data.get('title'),
        target: Number(data.get('target')) || 15, done: 0, skipped: false, topicId: null,
      });
      store.save();
    },
  },
};

// Sunday-to-Saturday strip around the selected day; each day shows whether its goal was met.
function weekStrip(selected) {
  const sel = parseKey(selected);
  const todayKey = dateKey();
  const days = [...Array(7)].map((_, i) => addDays(sel, i - sel.getDay()));
  return `<nav class="weekstrip" aria-label="Dias da semana">${days.map((date) => {
    const key = dateKey(date);
    const day = s().days[key];
    const t = store.dayTotals(day);
    const done = t.tech.done + t.english.done;
    const state = key > todayKey ? 'future' : store.dayMet(day) ? 'met' : done > 0 ? 'partial' : 'none';
    const labels = { met: 'meta batida', partial: `${done} min`, none: 'sem estudo', future: 'futuro' };
    return `<button class="wday ${state}${key === selected ? ' selected' : ''}${key === todayKey ? ' is-today' : ''}"
      data-action="pickDay" data-key="${key}" aria-current="${key === selected ? 'date' : 'false'}"
      title="${esc(formatDate(key))}: ${labels[state]}">
      <span class="wd">${WEEKDAYS[date.getDay()].slice(0, 3)}</span>
      <span class="dn">${date.getDate()}</span>
      <span class="dot-state" aria-hidden="true"></span>
    </button>`;
  }).join('')}</nav>`;
}

function findTask(id) {
  return store.getDay(ui.dayKey).tasks.find((t) => t.id === id);
}

function taskRow(task) {
  const complete = task.done >= task.target;
  const found = task.topicId ? store.findTopic(task.topicId) : null;
  const suggestion = found ? store.suggestResources(found.topic, 2) : [];
  return `<li class="task${complete ? ' done' : ''}${task.skipped ? ' skipped' : ''}">
    <div class="row">
      <button class="check" data-action="finishTask" data-id="${task.id}" aria-label="Concluir">${complete ? '✓' : ''}</button>
      <span class="title">${esc(task.title)}</span>
      <label class="mins"><input type="number" min="0" step="5" value="${task.done}" data-change="taskDone" data-id="${task.id}" aria-label="Minutos feitos"> / ${task.target} min</label>
    </div>
    <div class="row small">
      <button class="btn ghost" data-action="addMinutes" data-id="${task.id}" data-n="5">+5</button>
      <button class="btn ghost" data-action="addMinutes" data-id="${task.id}" data-n="15">+15</button>
      <button class="btn ghost" data-action="addMinutes" data-id="${task.id}" data-n="30">+30</button>
      <button class="btn ghost" data-action="skipTask" data-id="${task.id}">${task.skipped ? 'Retomar' : 'Pular'}</button>
      <button class="btn ghost danger" data-action="removeTask" data-id="${task.id}" aria-label="Remover">✕</button>
      ${suggestion.length ? `<span class="muted">Sugestão: ${suggestion.map((r) => `<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">${esc(r.title)}</a>`).join(' · ')}</span>` : ''}
    </div>
  </li>`;
}

// ---------------------------------------------------------------- Trilha

export const track = {
  title: 'Trilha',
  render() {
    const t = s().track;
    if (!t.phases.length) return trackStart();
    return `
      <div class="row head">
        <input class="h1-input" value="${esc(t.name)}" data-change="trackName" placeholder="Nome da trilha" aria-label="Nome da trilha">
      </div>
      <p class="muted">Edite à vontade: o modelo é só ponto de partida. Clique num tópico para ver onde estudar.</p>
      ${t.phases.map(phaseCard).join('')}
      <button class="btn" data-action="addPhase">+ Nova fase</button>`;
  },
  actions: {
    async useTemplate(el) {
      const template = await store.loadTemplate(el.dataset.id);
      store.applyTemplate(template);
      store.save();
    },
    blankTrack() {
      s().track = { name: 'Minha trilha', templateId: null, phases: [] };
      addPhase();
      store.save();
    },
    addPhase() { addPhase(); store.save(); },
    removePhase(el) {
      const phase = s().track.phases.find((p) => p.id === el.dataset.id);
      if (phase.topics.length && !window.confirm(`Remover a fase "${phase.name}" e ${phase.topics.length} tópicos?`)) return false;
      s().track.phases = s().track.phases.filter((p) => p.id !== el.dataset.id);
      store.save();
    },
    movePhase(el) { move(s().track.phases, el.dataset.id, Number(el.dataset.n)); store.save(); },
    setCurrentPhase(el) { s().settings.currentPhaseId = el.dataset.id; store.save(); },
    addTopic(el) {
      const phase = s().track.phases.find((p) => p.id === el.dataset.phase);
      const topic = { id: uid(), name: 'Novo tópico', area: 'tech', level: 'essential', status: 'todo', tags: [], resourceIds: [] };
      phase.topics.push(topic);
      ui.openTopicId = topic.id;
      store.save();
    },
    toggleTopic(el) { ui.openTopicId = ui.openTopicId === el.dataset.id ? null : el.dataset.id; },
    cycleStatus(el) {
      const { topic } = store.findTopic(el.dataset.id);
      const order = Object.keys(STATUSES);
      topic.status = order[(order.indexOf(topic.status) + 1) % order.length];
      store.save();
    },
    moveTopic(el) {
      const { phase } = store.findTopic(el.dataset.id);
      move(phase.topics, el.dataset.id, Number(el.dataset.n));
      store.save();
    },
    removeTopic(el) {
      const { phase } = store.findTopic(el.dataset.id);
      phase.topics = phase.topics.filter((t) => t.id !== el.dataset.id);
      store.save();
    },
    linkResource(el) {
      const { topic } = store.findTopic(el.dataset.topic);
      if (!topic.resourceIds.includes(el.dataset.id)) topic.resourceIds.push(el.dataset.id);
      store.save();
    },
    unlinkResource(el) {
      const { topic } = store.findTopic(el.dataset.topic);
      topic.resourceIds = topic.resourceIds.filter((id) => id !== el.dataset.id);
      store.save();
    },
  },
  changes: {
    trackName(el) { s().track.name = el.value; store.save(); return false; },
    phaseField(el) {
      const phase = s().track.phases.find((p) => p.id === el.dataset.id);
      phase[el.dataset.field] = el.value;
      store.save();
      return false;
    },
    topicField(el) {
      const { topic } = store.findTopic(el.dataset.id);
      const field = el.dataset.field;
      topic[field] = field === 'tags' ? parseTags(el.value) : el.value;
      store.save();
      return field !== 'name';
    },
  },
};

function trackStart() {
  return `<h1>Monte sua trilha</h1>
    <p class="muted">Escolha um modelo para começar. Depois você muda fases, tópicos e metas como quiser.</p>
    <div class="grid">
      ${store.catalog.templates.map((t) => `<div class="card">
        <h2>${esc(t.name)}</h2>
        <p class="muted">${esc(t.description)}</p>
        ${t.source ? `<p class="small">Base: <a href="${esc(safeUrl(t.source))}" target="_blank" rel="noopener">${esc(t.source)}</a></p>` : ''}
        <button class="btn primary" data-action="useTemplate" data-id="${esc(t.id)}">Usar este modelo</button>
      </div>`).join('')}
      <div class="card">
        <h2>Do zero</h2>
        <p class="muted">Uma fase vazia. Você cria tudo e o catálogo sugere recursos pelas tags.</p>
        <button class="btn" data-action="blankTrack">Começar vazio</button>
      </div>
    </div>`;
}

function addPhase() {
  const phase = { id: uid(), name: `Fase ${s().track.phases.length + 1}`, goal: '', targetDate: '', topics: [] };
  s().track.phases.push(phase);
  s().settings.currentPhaseId ??= phase.id;
}

function move(list, id, delta) {
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

function phaseCard(phase) {
  const progress = store.phaseProgress(phase);
  const isCurrent = store.currentPhase()?.id === phase.id;
  return `<section class="card phase${isCurrent ? ' current' : ''}">
    <header class="row">
      <input class="h2-input" value="${esc(phase.name)}" data-change="phaseField" data-field="name" data-id="${phase.id}" aria-label="Nome da fase">
      ${isCurrent ? '<span class="chip accent">fase atual</span>' : `<button class="btn ghost" data-action="setCurrentPhase" data-id="${phase.id}">Tornar atual</button>`}
      <button class="btn ghost" data-action="movePhase" data-id="${phase.id}" data-n="-1" aria-label="Subir">↑</button>
      <button class="btn ghost" data-action="movePhase" data-id="${phase.id}" data-n="1" aria-label="Descer">↓</button>
      <button class="btn ghost danger" data-action="removePhase" data-id="${phase.id}" aria-label="Remover fase">✕</button>
    </header>
    <div class="row small">
      <input value="${esc(phase.goal)}" data-change="phaseField" data-field="goal" data-id="${phase.id}" placeholder="Objetivo da fase" aria-label="Objetivo">
      <label>Data-alvo <input type="date" value="${esc(phase.targetDate)}" data-change="phaseField" data-field="targetDate" data-id="${phase.id}"></label>
      <span class="muted">${progress.mastered}/${progress.total} dominados</span>
    </div>
    ${bar(progress.mastered, progress.total)}
    <ul class="topics">${phase.topics.map(topicRow).join('')}</ul>
    <button class="btn ghost" data-action="addTopic" data-phase="${phase.id}">+ Tópico</button>
  </section>`;
}

function topicRow(topic) {
  const open = ui.openTopicId === topic.id;
  return `<li class="topic status-${topic.status} level-${topic.level}">
    <div class="row">
      <button class="chip status" data-action="cycleStatus" data-id="${topic.id}" title="Mudar status">${STATUSES[topic.status]}</button>
      <button class="link" data-action="toggleTopic" data-id="${topic.id}">${esc(topic.name)}</button>
      <span class="chip">${AREAS[topic.area]}</span>
      ${topic.level === 'optional' ? '<span class="chip">opcional</span>' : ''}
    </div>
    ${open ? topicEditor(topic) : ''}
  </li>`;
}

function topicEditor(topic) {
  const suggested = store.suggestResources(topic, 12);
  const linked = new Set(topic.resourceIds);
  return `<div class="editor">
    <div class="row small">
      <input value="${esc(topic.name)}" data-change="topicField" data-field="name" data-id="${topic.id}" aria-label="Nome do tópico">
      <select data-change="topicField" data-field="area" data-id="${topic.id}" aria-label="Área">${options(AREAS, topic.area)}</select>
      <select data-change="topicField" data-field="level" data-id="${topic.id}" aria-label="Nível">${options(LEVELS, topic.level)}</select>
    </div>
    <label class="small">Tags (separadas por vírgula, usadas para sugerir recursos)
      <input value="${esc(topic.tags.join(', '))}" data-change="topicField" data-field="tags" data-id="${topic.id}">
    </label>
    <h3>Onde estudar</h3>
    <ul class="resources">${suggested.map((r) => resourceCard(r, linked.has(r.id)
      ? `<button class="btn ghost" data-action="unlinkResource" data-topic="${topic.id}" data-id="${esc(r.id)}">Desfixar</button>`
      : `<button class="btn ghost" data-action="linkResource" data-topic="${topic.id}" data-id="${esc(r.id)}">Fixar</button>`)).join('')
      || '<li class="muted">Sem sugestões. Adicione tags ou veja o <a href="#/recursos">catálogo</a>.</li>'}</ul>
    <div class="row small">
      <button class="btn ghost" data-action="moveTopic" data-id="${topic.id}" data-n="-1">↑</button>
      <button class="btn ghost" data-action="moveTopic" data-id="${topic.id}" data-n="1">↓</button>
      <button class="btn ghost danger" data-action="removeTopic" data-id="${topic.id}">Remover tópico</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Recursos

export const resources = {
  title: 'Recursos',
  render() {
    const f = ui.resourceFilter;
    const q = f.q.toLowerCase();
    const list = store.allResources().filter((r) =>
      (!f.cost || r.cost === f.cost)
      && (!f.area || r.area === f.area)
      && (!f.language || r.language === f.language)
      && (!f.kind || r.kind === f.kind)
      && (!q || [r.title, r.description, ...(r.tags ?? [])].join(' ').toLowerCase().includes(q)));
    const any = (map, sel) => `<option value="">Todos</option>${options(map, sel)}`;
    return `<h1>Onde buscar conhecimento</h1>
      <p class="muted">Catálogo comunitário (grátis e pagos). Sugira novos por PR em <code>data/resources.json</code>. Preços mudam: confira no site.</p>
      <div class="card filters row small">
        <input type="search" placeholder="Buscar (ex.: kubernetes, listening)" value="${esc(f.q)}" data-change="filter" data-field="q" aria-label="Buscar">
        <select data-change="filter" data-field="cost" aria-label="Custo">${any(COSTS, f.cost)}</select>
        <select data-change="filter" data-field="area" aria-label="Área">${any(AREAS, f.area)}</select>
        <select data-change="filter" data-field="language" aria-label="Idioma">${any({ pt: 'PT', en: 'EN' }, f.language)}</select>
        <select data-change="filter" data-field="kind" aria-label="Tipo">${any(KINDS, f.kind)}</select>
      </div>
      <p class="muted">${list.length} recursos</p>
      <ul class="resources">${list.map((r) => resourceCard(r, r.custom
        ? `<button class="btn ghost danger" data-action="removeResource" data-id="${esc(r.id)}">Remover</button>` : '')).join('')}</ul>
      <section class="card">
        <h2>Adicionar recurso meu</h2>
        <form class="stack" data-submit="addResource">
          <input name="title" placeholder="Título" required>
          <input name="url" type="url" placeholder="https://..." required>
          <div class="row small">
            <select name="cost">${options(COSTS, 'free')}</select>
            <select name="kind">${options(KINDS, 'course')}</select>
            <select name="area">${options(AREAS, 'tech')}</select>
            <select name="language">${options({ pt: 'PT', en: 'EN' }, 'pt')}</select>
          </div>
          <input name="tags" placeholder="Tags: kubernetes, cka">
          <input name="description" placeholder="Descrição curta">
          <button class="btn primary">Salvar</button>
        </form>
      </section>`;
  },
  actions: {
    removeResource(el) {
      s().customResources = s().customResources.filter((r) => r.id !== el.dataset.id);
      store.save();
    },
  },
  changes: {
    filter(el) { ui.resourceFilter[el.dataset.field] = el.value; },
  },
  submits: {
    addResource(form) {
      const d = Object.fromEntries(new FormData(form));
      s().customResources.push({ ...d, id: `meu-${uid()}`, tags: parseTags(d.tags) });
      store.save();
    },
  },
};

// ---------------------------------------------------------------- Notas

function topicOptions(selected) {
  const opts = s().track.phases.flatMap((p) => p.topics.map((t) =>
    `<option value="${t.id}"${t.id === selected ? ' selected' : ''}>${esc(p.name)} › ${esc(t.name)}</option>`));
  return `<option value="">Sem tópico</option>${opts.join('')}`;
}

export const notes = {
  title: 'Notas',
  render() {
    const editing = s().notes.find((n) => n.id === ui.editingNoteId);
    if (editing) {
      return `<div class="row head"><button class="btn ghost" data-action="closeNote">‹ Notas</button></div>
        <section class="card stack">
          <input class="h2-input" value="${esc(editing.title)}" data-change="noteField" data-field="title" placeholder="Título">
          <div class="row small">
            <select data-change="noteField" data-field="topicId">${topicOptions(editing.topicId)}</select>
            <input value="${esc(editing.tags.join(', '))}" data-change="noteField" data-field="tags" placeholder="Tags">
          </div>
          <div class="split">
            <textarea rows="18" data-change="noteField" data-field="body" placeholder="Markdown: # título, - lista, \`código\`, **negrito**">${esc(editing.body)}</textarea>
            <article class="preview">${markdown(editing.body)}</article>
          </div>
          <button class="btn ghost danger" data-action="removeNote" data-id="${editing.id}">Apagar nota</button>
        </section>`;
    }
    const list = [...s().notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return `<div class="row head"><h1>Notas</h1><button class="btn primary" data-action="newNote">+ Nota</button></div>
      <p class="muted">Sua base de conhecimento. Uma boa nota vira o README de um lab.</p>
      <ul class="list">${list.map((n) => {
        const topic = n.topicId ? store.findTopic(n.topicId)?.topic : null;
        return `<li class="card"><button class="link" data-action="openNote" data-id="${n.id}">${esc(n.title || 'Sem título')}</button>
          <span class="muted small">${esc(n.updatedAt.slice(0, 10))}${topic ? ` · ${esc(topic.name)}` : ''} ${n.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</span></li>`;
      }).join('') || '<li class="muted">Nenhuma nota ainda.</li>'}</ul>`;
  },
  actions: {
    newNote() {
      const note = { id: uid(), title: '', body: '', tags: [], topicId: null, updatedAt: new Date().toISOString() };
      s().notes.push(note);
      ui.editingNoteId = note.id;
      store.save();
    },
    openNote(el) { ui.editingNoteId = el.dataset.id; },
    closeNote() { ui.editingNoteId = null; },
    removeNote(el) {
      if (!window.confirm('Apagar esta nota?')) return false;
      s().notes = s().notes.filter((n) => n.id !== el.dataset.id);
      ui.editingNoteId = null;
      store.save();
    },
  },
  changes: {
    noteField(el) {
      const note = s().notes.find((n) => n.id === ui.editingNoteId);
      const field = el.dataset.field;
      note[field] = field === 'tags' ? parseTags(el.value) : el.value || (field === 'topicId' ? null : '');
      note.updatedAt = new Date().toISOString();
      store.save();
      if (field === 'body') {
        document.querySelector('.preview').innerHTML = markdown(note.body);
        return false;
      }
      return field !== 'title';
    },
  },
};

// ---------------------------------------------------------------- Labs

export const labs = {
  title: 'Labs',
  render() {
    return `<div class="row head"><h1>Labs</h1></div>
      <p class="muted">Cada lab é uma pasta no seu repositório <code>devops-labs</code> no GitHub. Aqui você acompanha o status.</p>
      <ul class="list">${s().labs.map((lab) => `<li class="card stack">
        <div class="row">
          <input class="h2-input" value="${esc(lab.title)}" data-change="labField" data-field="title" data-id="${lab.id}" aria-label="Título">
          <select data-change="labField" data-field="status" data-id="${lab.id}" aria-label="Status">${options(LAB_STATUSES, lab.status)}</select>
          <button class="btn ghost danger" data-action="removeLab" data-id="${lab.id}" aria-label="Remover">✕</button>
        </div>
        <div class="row small">
          <input type="url" value="${esc(lab.repoUrl)}" data-change="labField" data-field="repoUrl" data-id="${lab.id}" placeholder="https://github.com/voce/devops-labs/tree/main/01-..." aria-label="URL">
          <select data-change="labField" data-field="topicId" data-id="${lab.id}" aria-label="Tópico">${topicOptions(lab.topicId)}</select>
          ${lab.repoUrl ? `<a href="${esc(safeUrl(lab.repoUrl))}" target="_blank" rel="noopener">abrir</a>` : ''}
        </div>
      </li>`).join('') || '<li class="muted">Nenhum lab ainda.</li>'}</ul>
      <form class="row add" data-submit="addLab">
        <input name="title" placeholder="Ex.: 01 - MTU e MSS clamp em VPN" required>
        <button class="btn primary">+ Lab</button>
      </form>
      <p class="muted small">Antes de publicar: nada de IP, hostname, nome de cliente, kubeconfig, token ou .env. Ative secret scanning e push protection no repositório.</p>`;
  },
  actions: {
    removeLab(el) {
      s().labs = s().labs.filter((l) => l.id !== el.dataset.id);
      store.save();
    },
  },
  changes: {
    labField(el) {
      const lab = s().labs.find((l) => l.id === el.dataset.id);
      lab[el.dataset.field] = el.value || (el.dataset.field === 'topicId' ? null : '');
      store.save();
      return el.dataset.field !== 'title' && el.dataset.field !== 'repoUrl';
    },
  },
  submits: {
    addLab(form) {
      s().labs.push({ id: uid(), title: new FormData(form).get('title'), status: 'draft', repoUrl: '', topicId: null });
      store.save();
    },
  },
};

// ---------------------------------------------------------------- Painel

export const dashboard = {
  title: 'Painel',
  render() {
    const today = new Date();
    const last7 = [...Array(7)].map((_, i) => dateKey(addDays(today, i - 6)));
    const week = last7.map((key) => ({ key, totals: store.dayTotals(s().days[key]) }));
    const max = Math.max(60, ...week.map((d) => d.totals.tech.done + d.totals.english.done));
    const sum = (area) => week.reduce((acc, d) => acc + d.totals[area].done, 0);
    const allDone = Object.values(s().days).reduce((acc, d) => {
      const t = store.dayTotals(d);
      return acc + t.tech.done + t.english.done;
    }, 0);

    // 16-week heatmap, columns are weeks starting on Sunday.
    const start = addDays(today, -today.getDay() - 7 * 15);
    const cells = [...Array(16 * 7)].map((_, i) => {
      const date = addDays(start, i);
      const key = dateKey(date);
      const day = s().days[key];
      const t = store.dayTotals(day);
      const ratio = t.tech.target + t.english.target ? (t.tech.done + t.english.done) / (t.tech.target + t.english.target) : 0;
      const level = date > today ? 'future' : store.dayMet(day) ? 'l4' : ratio >= 0.5 ? 'l3' : ratio > 0 ? 'l2' : 'l0';
      return `<span class="cell ${level}" title="${key}: ${t.tech.done + t.english.done} min"></span>`;
    }).join('');

    return `<h1>Painel</h1>
      <div class="grid stats">
        <div class="card"><span class="big">🔥 ${store.streak()}</span><span class="muted">dias seguidos</span></div>
        <div class="card"><span class="big">${store.bestStreak()}</span><span class="muted">recorde</span></div>
        <div class="card"><span class="big">${Math.round(sum('tech') / 6) / 10} h</span><span class="muted">técnico (7 dias)</span></div>
        <div class="card"><span class="big">${Math.round(sum('english') / 6) / 10} h</span><span class="muted">inglês (7 dias)</span></div>
        <div class="card"><span class="big">${Math.round(allDone / 6) / 10} h</span><span class="muted">total estudado</span></div>
      </div>
      <section class="card">
        <h2>Últimos 7 dias</h2>
        <div class="week">${week.map((d) => `<div class="day">
          <div class="stack-bar" title="${d.totals.tech.done} min técnico, ${d.totals.english.done} min inglês">
            <span class="english" style="height:${(d.totals.english.done / max) * 100}%"></span>
            <span class="tech" style="height:${(d.totals.tech.done / max) * 100}%"></span>
          </div>
          <span class="small muted">${WEEKDAYS[parseKey(d.key).getDay()].slice(0, 3)}</span>
        </div>`).join('')}</div>
        <p class="small"><span class="dot tech"></span> Técnico <span class="dot english"></span> Inglês</p>
      </section>
      <section class="card">
        <h2>Constância (16 semanas)</h2>
        <div class="heatmap">${cells}</div>
        <p class="small muted">Escuro: sem estudo · claro: meta do dia batida</p>
      </section>
      <section class="card">
        <h2>Fases</h2>
        ${s().track.phases.map((p) => {
          const pr = store.phaseProgress(p);
          return `<div class="stack"><div class="row"><span>${esc(p.name)}</span><span class="muted">${pr.pct}%</span></div>${bar(pr.mastered, pr.total)}</div>`;
        }).join('') || emptyTrackHint()}
      </section>`;
  },
  actions: {},
};

// ---------------------------------------------------------------- Config

export const settings = {
  title: 'Config',
  render() {
    const st = s();
    return `<h1>Configurações</h1>
      <section class="card stack">
        <label>Seu nome <input value="${esc(st.profile.name)}" data-change="profileName"></label>
        <label>Dia conta na sequência ao atingir
          <select data-change="threshold">${[0.5, 0.8, 1].map((v) => `<option value="${v}"${v === st.settings.streakThreshold ? ' selected' : ''}>${v * 100}%</option>`).join('')}</select>
          dos minutos de cada área
        </label>
      </section>
      <section class="card">
        <h2>Metas semanais</h2>
        <p class="muted small">Gera as tarefas de cada dia. Use <code>{topic}</code> para puxar o tópico atual da trilha. Só afeta dias ainda não abertos.</p>
        ${WEEKDAYS.map((name, wd) => `<details${wd === new Date().getDay() ? ' open' : ''}>
          <summary>${name} · ${(st.weeklyGoals[wd] ?? []).reduce((a, g) => a + g.minutes, 0)} min</summary>
          <ul class="tasks">${(st.weeklyGoals[wd] ?? []).map((g, i) => `<li class="row small">
            <select data-change="goalField" data-wd="${wd}" data-i="${i}" data-field="area">${options(AREAS, g.area)}</select>
            <input value="${esc(g.title)}" data-change="goalField" data-wd="${wd}" data-i="${i}" data-field="title">
            <input type="number" min="5" step="5" value="${g.minutes}" data-change="goalField" data-wd="${wd}" data-i="${i}" data-field="minutes" aria-label="Minutos">
            <button class="btn ghost danger" data-action="removeGoal" data-wd="${wd}" data-i="${i}" aria-label="Remover">✕</button>
          </li>`).join('')}</ul>
          <button class="btn ghost" data-action="addGoal" data-wd="${wd}">+ Meta</button>
          <button class="btn ghost" data-action="copyGoals" data-wd="${wd}">Copiar para seg–sex</button>
        </details>`).join('')}
        <button class="btn ghost" data-action="resetGoals">Restaurar metas padrão</button>
      </section>
      <section class="card stack">
        <h2>Backup e publicação</h2>
        <p class="muted small">Os dados ficam só neste navegador. Exporte com frequência. Para publicar no GitHub Pages, salve o arquivo como <code>data/minha-trilha.json</code> no seu fork e faça commit.</p>
        <div class="row">
          <button class="btn primary" data-action="exportFull">Exportar backup completo</button>
          <label class="btn">Importar JSON <input type="file" accept="application/json" data-change="importFile" hidden></label>
        </div>
        <div class="row small">
          <label><input type="checkbox" id="pubNotes"> incluir notas</label>
          <label><input type="checkbox" id="pubDays"> incluir notas do dia</label>
          <button class="btn" data-action="exportPublic">Exportar para publicar</button>
        </div>
        <button class="btn ghost danger" data-action="reset">Apagar todos os dados deste navegador</button>
      </section>`;
  },
  actions: {
    addGoal(el) {
      const wd = el.dataset.wd;
      (s().weeklyGoals[wd] ??= []).push({ area: 'tech', title: 'Nova meta', minutes: 15 });
      store.save();
    },
    removeGoal(el) {
      s().weeklyGoals[el.dataset.wd].splice(Number(el.dataset.i), 1);
      store.save();
    },
    copyGoals(el) {
      const source = s().weeklyGoals[el.dataset.wd] ?? [];
      for (const wd of [1, 2, 3, 4, 5]) s().weeklyGoals[wd] = structuredClone(source);
      store.save();
    },
    resetGoals() { s().weeklyGoals = store.defaultWeeklyGoals(); store.save(); },
    exportFull() { download(s(), `trilha-backup-${dateKey()}.json`); return false; },
    exportPublic() {
      const snapshot = store.publicSnapshot({
        includeNotes: document.getElementById('pubNotes').checked,
        includeDays: document.getElementById('pubDays').checked,
      });
      download(snapshot, 'minha-trilha.json');
      return false;
    },
    reset() {
      if (!window.confirm('Apagar todos os dados deste navegador? Exporte um backup antes.')) return false;
      store.resetState();
    },
  },
  changes: {
    profileName(el) { s().profile.name = el.value; store.save(); return false; },
    threshold(el) { s().settings.streakThreshold = Number(el.value); store.save(); },
    goalField(el) {
      const goal = s().weeklyGoals[el.dataset.wd][Number(el.dataset.i)];
      goal[el.dataset.field] = el.dataset.field === 'minutes' ? Number(el.value) || 0 : el.value;
      store.save();
      return el.dataset.field !== 'title';
    },
    async importFile(el) {
      const file = el.files[0];
      if (!file) return false;
      try {
        const data = JSON.parse(await file.text());
        if (!data.track || !data.weeklyGoals) throw new Error('arquivo sem track/weeklyGoals');
        store.replaceState(data);
      } catch (err) {
        window.alert(`Importação falhou: ${err.message}`);
        return false;
      }
    },
  },
};

// ---------------------------------------------------------------- Pronúncia

const pron = { deckId: null, index: 0, result: null, busy: false };

function currentDeck() {
  const decks = store.catalog.pronunciation;
  return decks.find((d) => d.id === pron.deckId) ?? decks[0] ?? null;
}

function resetResult() {
  if (pron.result?.audioUrl) URL.revokeObjectURL(pron.result.audioUrl);
  pron.result = null;
}

function scoreClass(score) {
  if (score == null) return '';
  return score >= 90 ? 'good' : score >= 70 ? 'close' : 'bad';
}

function coloredSentence(ops) {
  return ops.map((op) => {
    if (op.type === 'ok') return `<span class="w ok">${esc(op.word)}</span>`;
    if (op.type === 'sub') return `<span class="w bad" title="ouvi: ${esc(op.heard)}">${esc(op.word)}</span>`;
    if (op.type === 'miss') return `<span class="w miss" title="não ouvi">${esc(op.word)}</span>`;
    if (op.type === 'sound') return `<span class="w bad" title="som errado">${esc(op.word)}</span>`;
    return `<span class="w extra" title="palavra a mais">+${esc(op.heard)}</span>`;
  }).join(' ');
}

function resultBlock(result) {
  if (result.error) {
    return `<div class="card warn-box"><p>${esc(result.error)}</p>
      ${result.audioUrl ? `<p class="row small"><span class="muted">O que foi gravado:</span><audio controls src="${esc(result.audioUrl)}"></audio></p>` : ''}</div>`;
  }
  const mistakes = result.ops.filter((o) => o.type !== 'ok' && o.type !== 'extra');
  const verdict = result.score >= 90 ? 'Excelente! 🎉' : result.score >= 70 ? 'Quase lá. Corrija as palavras marcadas.' : 'Vamos de novo, mais devagar.';
  return `<div class="pron-result">
    <p class="row"><span class="score ${scoreClass(result.score)}">${result.score}%</span><strong>${verdict}</strong></p>
    <p class="muted">Ouvi: <em lang="en">“${esc(result.heard || '(nada)')}”</em></p>
    ${result.phones ? `<details class="small"><summary>Ver os sons (fonemas)</summary>
      <p>Esperado: <code>${esc(result.expectedPhones)}</code></p><p>Você: <code>${esc(result.phones.join(' '))}</code></p></details>`
      : result.soundCheck === false ? '<p class="muted small">Análise de sons indisponível nesta tentativa; avaliei só as palavras.</p>' : ''}
    ${result.audioUrl ? `<p class="row small"><span class="muted">Sua voz:</span><audio controls src="${esc(result.audioUrl)}"></audio></p>` : ''}
    ${mistakes.length ? `<h3>O que treinar</h3><ul class="list mistakes">${mistakes.map((o) => `<li class="row">
        <button class="btn ghost" data-action="sayWord" data-text="${esc(o.word)}" title="Ouvir a palavra devagar">🐢</button>
        <strong lang="en">${esc(o.word)}</strong>
        <span class="muted">${o.type === 'sub' ? `ouvi “${esc(o.heard)}”` : o.type === 'miss' ? 'não ouvi' : 'som errado'}</span>
        ${o.sounds?.length
          ? o.sounds.map((e) => `<span class="small hint-text">🔈 ${esc(phonemes.describe(e, o.word))}</span>`).join('')
          : `<span class="small hint-text">${esc(speech.hintFor(o.word))}</span>`}
      </li>`).join('')}</ul>` : ''}
  </div>`;
}

export const pronunciation = {
  title: 'Pronúncia',
  render() {
    const deck = currentDeck();
    if (!deck) return '<p class="card">Nenhuma frase em <code>data/pronuncia.json</code>.</p>';
    const item = deck.items[Math.min(pron.index, deck.items.length - 1)];
    const results = s().pronunciation.results;
    const best = results[item.id]?.best;
    const r = pron.result;

    return `
      <div class="daynav"><div class="daynav-title">
        <h1>Pronúncia</h1>
        <p class="muted">Ouça a frase, fale e veja quais palavras saíram erradas.</p>
      </div></div>
      <div class="row decks" role="group" aria-label="Blocos de frases">
        ${store.catalog.pronunciation.map((d) => {
          const p = store.deckProgress(d);
          return `<button class="chip${d.id === deck.id ? ' accent' : ''}" data-action="pickDeck" data-id="${esc(d.id)}">${esc(d.title)} · ${p.good}/${p.total}</button>`;
        }).join('')}
      </div>
      <section class="card pron">
        <header class="row"><h2>${esc(deck.title)}</h2><span class="muted">${pron.index + 1}/${deck.items.length}${best != null ? ` · melhor ${best}%` : ''}</span></header>
        <p class="muted small">💡 ${esc(deck.tip)}</p>
        <p class="sentence" lang="en">${r?.ops ? coloredSentence(r.ops) : esc(item.en)}</p>
        <p class="muted">${esc(item.pt)}</p>
        <div class="row">
          <button class="btn" data-action="say" data-rate="1">🔊 Ouvir</button>
          <button class="btn" data-action="say" data-rate="0.7">🐢 Devagar</button>
          <button class="btn primary mic" data-action="talk">🎙 Falar</button>
          <span class="spacer"></span>
          <button class="btn ghost" data-action="step" data-n="-1" aria-label="Frase anterior">‹</button>
          <button class="btn ghost" data-action="step" data-n="1" aria-label="Próxima frase">›</button>
        </div>
        <p id="pron-status" class="muted small" aria-live="polite"></p>
        ${r ? resultBlock(r) : ''}
      </section>
      <section class="card">
        <h2>Frases do bloco</h2>
        <ul class="list">${deck.items.map((it, i) => {
          const b = results[it.id]?.best;
          return `<li class="row pron-item${i === pron.index ? ' current' : ''}">
            <button class="link" data-action="pickItem" data-i="${i}" lang="en">${esc(it.en)}</button>
            <span class="score small ${scoreClass(b)}">${b != null ? `${b}%` : '—'}</span>
          </li>`;
        }).join('')}</ul>
      </section>
      <p class="muted small">Verde = certo · vermelho = trocado · cinza riscado = não ouvi. 90% ou mais conta como dominada.
      Duas IAs rodam neste navegador (o áudio não sai do computador): o Whisper confere as palavras e um modelo de fonemas confere os sons (TH, R/H, i longo/curto, -s, "i" no fim).
      Na 1ª vez elas baixam ~400 MB no total e depois ficam em cache.</p>`;
  },
  actions: {
    pickDeck(el) { pron.deckId = el.dataset.id; pron.index = 0; resetResult(); },
    pickItem(el) { pron.index = Number(el.dataset.i); resetResult(); },
    step(el) {
      const deck = currentDeck();
      pron.index = (pron.index + Number(el.dataset.n) + deck.items.length) % deck.items.length;
      resetResult();
    },
    async say(el) {
      const item = currentDeck().items[pron.index];
      await speech.play({ src: `data/audio/${item.id}.mp3`, text: item.en, rate: Number(el.dataset.rate) });
      return false;
    },
    async sayWord(el) {
      const word = el.dataset.text;
      await speech.play({ src: `data/audio/w/${speech.wordKey(word)}.mp3`, text: word, rate: 0.75 });
      return false;
    },
    async talk(el) {
      if (voice.isRecording()) { voice.stopRecording(); return false; }
      if (pron.busy) return false;
      const item = currentDeck().items[pron.index];
      pron.busy = true;
      speech.stop();
      resetResult();
      try {
        const heard = await listenOnce(el, document.getElementById('pron-status'), { sounds: true });
        if (heard.error) { pron.result = heard; return; }
        const ipa = store.catalog.pronunciationIpa[item.id];
        const { ops, score } = mergeSounds(speech.align(item.en, heard.text), ipa, heard.phones);
        pron.result = {
          heard: heard.text, ops, score, audioUrl: heard.audioUrl, phones: heard.phones, soundCheck: Boolean(heard.phones && ipa),
          expectedPhones: ipa?.map(([, ph]) => ph.join('')).join(' '),
        };
        store.recordAttempt(item.id, score);
        store.save();
      } catch (err) {
        pron.result = { error: err.message };
      } finally {
        pron.busy = false;
      }
    },
  },
};

// Combines the word check (Whisper) with the sound check (phonemes): a word Whisper
// heard right still counts as wrong when one of its key sounds was off.
function mergeSounds({ ops }, ipa, phones) {
  if (ipa && phones?.length) {
    const sounds = phonemes.comparePhonemes(ipa, phones);
    let w = 0;
    for (const op of ops) {
      if (op.type === 'extra') continue;
      const errs = sounds[w]?.errors ?? [];
      w += 1;
      if (!errs.length) {
        // Whisper heard another word but the sounds match the target: trust the sounds.
        if (op.type === 'sub') op.type = 'ok';
        continue;
      }
      op.sounds = errs;
      if (op.type === 'ok') op.type = 'sound';
    }
  }
  const total = ops.filter((o) => o.type !== 'extra').length;
  const good = ops.filter((o) => o.type === 'ok').length;
  const extras = ops.filter((o) => o.type === 'extra').length;
  return { ops, score: total ? Math.max(0, Math.round(((good - extras * 0.5) / total) * 100)) : 0 };
}

// Records one utterance and transcribes it with Whisper, driving the button and the
// status line (mic meter, model download, "transcrevendo"). Shared by Pronúncia and Conversa.
// Resolves with { text, audioUrl } or { error, audioUrl }.
async function listenOnce(button, status, { sounds = false } = {}) {
  const setStatus = (html) => { if (status) status.innerHTML = html; };
  button.textContent = '⏹ Parar';
  button.classList.add('recording');
  setStatus('<span class="meter" aria-hidden="true"><span></span></span> <span class="mic-name">abrindo microfone…</span>');
  voice.warm({ stt: true, phonemes: sounds }).catch(() => {}); // Load the models while the user speaks.
  const rec = await voice.record({
    onLevel(level, mic) {
      status?.querySelector('.meter span')?.style.setProperty('width', `${Math.round(level * 100)}%`);
      const name = status?.querySelector('.mic-name');
      if (name && name.dataset.mic !== mic) { name.dataset.mic = mic; name.textContent = `🎙 ${mic} · fale agora (para sozinho no silêncio)`; }
    },
  });
  button.textContent = '⏳ Transcrevendo…';
  button.classList.remove('recording');
  button.disabled = true;
  if (!rec.spoke) {
    return {
      error: rec.peak < 0.05
        ? `O microfone "${rec.mic}" quase não captou som. Confira em chrome://settings/content/microphone se é o fifine e se o volume de entrada está alto.`
        : 'Não detectei fala. Fale logo depois de clicar, um pouco mais alto.',
      audioUrl: rec.url,
    };
  }
  const off = voice.onProgress(({ kind, loaded, total }) => {
    const what = { stt: 'a IA que ouve as palavras (~80 MB)', phonemes: 'a IA que ouve os sons (~320 MB)' }[kind];
    if (what) setStatus(`⬇ Baixando ${what}, só na 1ª vez: ${Math.round((loaded / total) * 100)}%`);
  });
  try {
    setStatus(sounds ? '⏳ Analisando palavras e sons…' : '⏳ Transcrevendo…');
    const { text, phones } = sounds ? await voice.analyze(rec.blob) : { text: await voice.transcribe(rec.blob), phones: null };
    if (!text || /^\[.*\]$|^\(.*\)$/.test(text)) {
      return { error: 'Captei som, mas não entendi palavras em inglês. Tente de novo, mais perto do microfone.', audioUrl: rec.url };
    }
    return { text, phones, audioUrl: rec.url };
  } finally {
    off();
  }
}

// ---------------------------------------------------------------- Conversa

const conv = {
  settings: chat.loadSettings(),
  session: chat.newConversation('free'),
  setup: false,
  busy: false,
  autoSpeak: true,
  error: '',
};

function samSays(text, speed = 1) {
  const status = document.getElementById('conv-status');
  const off = voice.onProgress(({ kind, loaded, total }) => {
    if (kind === 'tts' && status) status.textContent = `⬇ Baixando a voz do Sam (só na 1ª vez): ${Math.round((loaded / total) * 100)}%`;
  });
  if (status) status.textContent = '🔊 Sam está falando…';
  return voice.speak(text, { voice: conv.settings.voice, speed })
    .catch((err) => { if (status) status.textContent = `Não consegui gerar a voz: ${err.message}`; })
    .finally(() => { off(); if (status?.textContent.startsWith('🔊')) status.textContent = ''; });
}

async function converse(text, display) {
  conv.busy = true;
  conv.error = '';
  if (display) conv.session.log.push({ who: 'me', text: display });
  try {
    const out = await chat.send(conv.session, text, { settings: conv.settings, learnerName: s().profile.name });
    const mine = conv.session.log.at(-1);
    if (display && mine?.who === 'me' && out.better?.trim()) {
      mine.better = out.better.trim();
      mine.tip = out.tip_pt?.trim() ?? '';
    }
    conv.session.log.push({ who: 'sam', text: out.reply, pt: out.reply_pt });
    if (conv.autoSpeak) setTimeout(() => samSays(out.reply), 0);
  } catch (err) {
    conv.error = err.message;
    if (display) conv.session.log.at(-1).failed = true;
  } finally {
    conv.busy = false;
  }
}

function convSetup() {
  const st = conv.settings;
  return `<section class="card stack">
    <h2>Configurar conversa</h2>
    <p class="muted small">O Sam é o Claude, a IA da Anthropic. Para conversar você precisa de uma <strong>chave da API</strong>:
      crie em <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com → API keys</a>,
      adicione alguns dólares de crédito e, de preferência, defina um limite de gasto.</p>
    <form class="stack" data-submit="convSettings">
      <label class="small">Chave da API
        <input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." value="${esc(st.apiKey)}" required></label>
      <label class="small">Modelo <select name="model">${options(chat.MODELS, st.model)}</select></label>
      <label class="small">Voz do Sam <select name="voice">${options(voice.VOICES, st.voice)}</select></label>
      <label><input type="checkbox" name="remember"${st.remember ? ' checked' : ''}> Lembrar a chave neste navegador (desmarcado: some ao fechar a aba)</label>
      <div class="row">
        <button class="btn primary">Salvar</button>
        ${st.apiKey ? '<button type="button" class="btn ghost" data-action="convCloseSetup">Cancelar</button><button type="button" class="btn ghost danger" data-action="convForgetKey">Apagar chave</button>' : ''}
      </div>
    </form>
    <p class="muted small">🔒 A chave fica só neste navegador e vai direto para api.anthropic.com. Ela não entra no backup, na exportação nem no repositório. Não use em computador compartilhado.
      Na versão do GitHub Pages, prefira não lembrar a chave: o endereço <code>github.io</code> é compartilhado com seus outros sites.
      O que você fala vira texto <strong>no seu computador</strong> (Whisper) e só o texto vai para a API do Claude.</p>
  </section>`;
}

function convMessage(m, i) {
  if (m.who === 'sam') {
    return `<li class="msg sam">
      <span class="who">Sam</span>
      <p lang="en">${esc(m.text)}</p>
      <div class="row small">
        <button class="btn ghost" data-action="convSay" data-i="${i}" title="Ouvir de novo">🔊</button>
        <button class="btn ghost" data-action="convSay" data-i="${i}" data-speed="0.75" title="Ouvir devagar">🐢</button>
        ${m.pt ? `<details><summary>Tradução</summary><p>${esc(m.pt)}</p></details>` : ''}
      </div>
    </li>`;
  }
  return `<li class="msg me${m.failed ? ' failed' : ''}">
    <span class="who">Você</span>
    <p lang="en">${esc(m.text)}</p>
    ${m.better ? `<div class="fix">
      <p>✏️ Melhor: <strong lang="en">${esc(m.better)}</strong>
        <button class="btn ghost" data-action="convSayBetter" data-i="${i}" title="Ouvir a frase correta">🔊</button></p>
      ${m.tip ? `<p class="small">${esc(m.tip)}</p>` : ''}
    </div>` : ''}
    ${m.failed ? '<p class="small warn-box">Não enviada. Tente de novo.</p>' : ''}
  </li>`;
}

export const conversation = {
  title: 'Conversa',
  render() {
    const st = conv.settings;
    const head = `<div class="daynav"><div class="daynav-title">
        <h1>Conversa</h1>
        <p class="muted">Converse por voz com o Sam, um nativo dos EUA. Ele fala simples (nível A1) e corrige seus erros.</p>
      </div>
      ${st.apiKey && !conv.setup ? '<button class="btn ghost" data-action="convOpenSetup">⚙ Configurar</button>' : ''}</div>`;
    if (!st.apiKey || conv.setup) return head + convSetup();
    if (!conv.warmed) {
      conv.warmed = true;
      setTimeout(() => voice.warm({ tts: true }).catch(() => {}), 0); // Sam's voice ready before he speaks.
    }

    const log = conv.session.log;
    const cost = chat.estimateCost(conv.session, st.model);
    return `${head}
      <div class="row decks" role="group" aria-label="Cenário">
        ${Object.entries(chat.SCENARIOS).map(([id, sc]) => `<button class="chip${id === conv.session.scenario ? ' accent' : ''}" data-action="convScenario" data-id="${id}">${esc(sc.title)}</button>`).join('')}
      </div>
      <section class="card conv">
        ${log.length ? `<ol class="chatlog" aria-live="polite">${log.map(convMessage).reverse().join('')}</ol>`
          : `<div class="stack conv-empty"><p class="muted">Cenário: <strong>${esc(chat.SCENARIOS[conv.session.scenario].title)}</strong>. O Sam começa a conversa.</p>
             <button class="btn primary" data-action="convStart"${conv.busy ? ' disabled' : ''}>▶ Começar conversa</button></div>`}
        ${conv.busy ? '<p class="muted">💭 Sam está pensando…</p>' : ''}
        ${conv.error ? `<p class="warn-box">${esc(conv.error)}</p>` : ''}
        ${log.length ? `<div class="row conv-controls">
          <button class="btn primary mic" data-action="convTalk"${conv.busy ? ' disabled' : ''}>🎙 Falar</button>
          <form class="row add grow" data-submit="convType">
            <input name="text" placeholder="…ou digite em inglês" autocomplete="off"${conv.busy ? ' disabled' : ''}>
            <button class="btn"${conv.busy ? ' disabled' : ''}>Enviar</button>
          </form>
        </div>` : ''}
        <p id="conv-status" class="muted small" aria-live="polite"></p>
      </section>
      <div class="row small muted">
        <label><input type="checkbox" data-change="convAutoSpeak"${conv.autoSpeak ? ' checked' : ''}> Sam fala as respostas em voz alta</label>
        <span class="spacer"></span>
        <span>${esc(chat.MODELS[st.model] ?? st.model)} · sessão ≈ US$ ${cost.toFixed(4)}</span>
        <button class="btn ghost" data-action="convReset">Nova conversa</button>
      </div>`;
  },
  actions: {
    convOpenSetup() { conv.setup = true; },
    convCloseSetup() { conv.setup = false; },
    convForgetKey() {
      if (!window.confirm('Apagar a chave da API deste navegador?')) return false;
      conv.settings.apiKey = '';
      chat.saveSettings(conv.settings);
    },
    convScenario(el) {
      if (el.dataset.id === conv.session.scenario) return false;
      if (conv.session.log.length && !window.confirm('Trocar de cenário começa uma conversa nova. Continuar?')) return false;
      conv.session = chat.newConversation(el.dataset.id);
      conv.error = '';
    },
    convReset() {
      if (conv.session.log.length && !window.confirm('Começar uma conversa nova?')) return false;
      conv.session = chat.newConversation(conv.session.scenario);
      conv.error = '';
    },
    async convStart(el) {
      if (conv.busy) return false;
      el.disabled = true;
      el.textContent = '💭 Sam está pensando…';
      voice.warm({ tts: true }).catch(() => {}); // Fetch the voice while Claude answers.
      await converse(chat.OPENING, null);
    },
    async convTalk(el) {
      if (voice.isRecording()) { voice.stopRecording(); return false; }
      if (conv.busy) return false;
      voice.stopSpeaking();
      conv.busy = true;
      let heard;
      try {
        heard = await listenOnce(el, document.getElementById('conv-status'));
      } catch (err) {
        heard = { error: err.message };
      } finally {
        conv.busy = false;
      }
      if (heard.audioUrl) URL.revokeObjectURL(heard.audioUrl);
      if (heard.error) { conv.error = heard.error; return; }
      el.textContent = '💭 Sam está pensando…';
      await converse(heard.text, heard.text);
    },
    convSay(el) {
      const m = conv.session.log[Number(el.dataset.i)];
      samSays(m.text, Number(el.dataset.speed ?? 1));
      return false;
    },
    convSayBetter(el) {
      samSays(conv.session.log[Number(el.dataset.i)].better, 0.9);
      return false;
    },
  },
  changes: {
    convAutoSpeak(el) { conv.autoSpeak = el.checked; return false; },
  },
  submits: {
    convSettings(form) {
      const data = new FormData(form);
      conv.settings = {
        apiKey: String(data.get('apiKey')).trim(),
        model: String(data.get('model')),
        voice: String(data.get('voice')),
        remember: data.get('remember') === 'on',
      };
      if (!chat.saveSettings(conv.settings)) window.alert('O navegador bloqueou o armazenamento local; a chave vale só até fechar a aba.');
      conv.setup = false;
    },
    async convType(form) {
      const text = String(new FormData(form).get('text') ?? '').trim();
      if (!text || conv.busy) return false;
      voice.stopSpeaking();
      await converse(text, text);
    },
  },
};

function download(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
