import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../assets/js/store.js';
import { dateKey, addDays, markdown, safeUrl } from '../assets/js/util.js';

const template = {
  id: 't',
  name: 'Teste',
  phases: [{
    name: 'F1',
    topics: [
      { name: 'Docker', area: 'tech', tags: ['docker'] },
      { name: 'Listening', area: 'english', tags: ['listening'] },
    ],
  }],
};

beforeEach(() => {
  store.resetState();
  store.catalog.resources = [
    { id: 'a', title: 'A', url: 'https://a', cost: 'paid', kind: 'docs', area: 'tech', language: 'en', tags: ['docker'] },
    { id: 'b', title: 'B', url: 'https://b', cost: 'free', kind: 'docs', area: 'tech', language: 'en', tags: ['docker'] },
    { id: 'c', title: 'C', url: 'https://c', cost: 'free', kind: 'video', area: 'english', language: 'en', tags: ['listening'] },
  ];
  store.applyTemplate(template);
});

function completeDay(key, ratio = 1) {
  const day = store.getDay(key);
  for (const task of day.tasks) task.done = Math.round(task.target * ratio);
}

test('daily plan fills {topic} with the current topic of each area', () => {
  const monday = new Date(2026, 9, 26);
  const day = store.getDay(dateKey(monday));
  assert.equal(day.tasks[0].title, 'Estudo: Docker');
  assert.ok(day.tasks[0].topicId);
  assert.equal(day.tasks.filter((t) => t.area === 'english').length, 3);
});

test('day counts at 80% of each area, not at 70%', () => {
  const key = dateKey(new Date(2026, 9, 26));
  completeDay(key, 0.8);
  assert.equal(store.dayMet(store.state.days[key]), true);
  completeDay(key, 0.7);
  assert.equal(store.dayMet(store.state.days[key]), false);
});

test('skipped tasks do not count toward the target', () => {
  const key = dateKey(new Date(2026, 9, 26));
  const day = store.getDay(key);
  for (const task of day.tasks) {
    if (task.title.startsWith('Prática')) task.skipped = true;
    else task.done = task.target;
  }
  assert.equal(store.dayMet(day), true);
});

test('streak ignores an unfinished today and stops at a gap', () => {
  const today = new Date(2026, 9, 29);
  completeDay(dateKey(addDays(today, -1)));
  completeDay(dateKey(addDays(today, -2)));
  completeDay(dateKey(addDays(today, -4)));
  store.getDay(dateKey(today));
  assert.equal(store.streak(today), 2);
  completeDay(dateKey(today));
  assert.equal(store.streak(today), 3);
});

test('best streak finds the longest run', () => {
  const base = new Date(2026, 9, 1);
  for (const n of [0, 1, 2, 5, 6]) completeDay(dateKey(addDays(base, n)));
  assert.equal(store.bestStreak(), 3);
});

test('suggestions match tags and area, free first', () => {
  const docker = store.state.track.phases[0].topics[0];
  assert.deepEqual(store.suggestResources(docker).map((r) => r.id), ['b', 'a']);
  docker.resourceIds = ['a'];
  assert.deepEqual(store.suggestResources(docker).map((r) => r.id), ['a', 'b']);
});

test('public snapshot drops notes and day notes unless asked', () => {
  store.state.notes.push({ id: 'n', title: 'segredo' });
  store.getDay('2026-10-26').note = 'privado';
  const snap = store.publicSnapshot({ includeNotes: false, includeDays: false });
  assert.equal(snap.notes.length, 0);
  assert.equal(snap.days['2026-10-26'].note, '');
  assert.equal(store.state.notes.length, 1);
});

test('markdown escapes HTML and blocks javascript: links', () => {
  const html = markdown('<script>x</script> [a](javascript:alert(1)) [b](https://ok.dev)');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(html.includes('href="https://ok.dev"'));
  assert.equal(safeUrl('javascript:alert(1)'), '#');
});
