import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, align, hintFor, wordKey } from '../assets/js/speech.js';

test('normalize drops punctuation, case and maps number words to digits', () => {
  assert.deepEqual(normalize('I wake up at Seven, every day!'), ['i', 'wake', 'up', 'at', '7', 'every', 'day']);
  assert.deepEqual(normalize('He doesn’t like Mondays.'), ['he', "doesn't", 'like', 'mondays']);
});

test('perfect attempt scores 100 regardless of case and digits', () => {
  const { ops, score } = align('I wake up at seven every day.', 'i wake up at 7 every day');
  assert.equal(score, 100);
  assert.ok(ops.every((o) => o.type === 'ok'));
});

test('substituted and missing words are reported against the expected word', () => {
  const { ops, score } = align('She watches TV every night.', 'she watch TV night');
  assert.deepEqual(ops.map((o) => o.type), ['ok', 'sub', 'ok', 'miss', 'ok']);
  assert.equal(ops[1].word, 'watches');
  assert.equal(ops[1].heard, 'watch');
  assert.equal(score, 60);
});

test('extra words lower the score', () => {
  const { ops, score } = align('I like music.', 'um I like music');
  assert.equal(ops[0].type, 'extra');
  assert.equal(score, 83);
});

test('empty transcript scores zero', () => {
  assert.equal(align('Thank you.', '').score, 0);
});

test('hints target common Brazilian mistakes', () => {
  assert.match(hintFor('think'), /TH/);
  assert.match(hintFor('watches'), /ɪz/);
  assert.match(hintFor('wanted'), /ɪd/);
  assert.match(hintFor('worked'), /não ganha sílaba/);
  assert.match(hintFor('red'), /R inglês/);
  assert.match(hintFor('house'), /H inglês/);
  assert.match(hintFor('good'), /não adicione "i"/i);
});

test('wordKey matches the audio file names made by gen-audio.py', () => {
  assert.equal(wordKey("Doesn't"), 'doesnt');
  assert.equal(wordKey('TV.'), 'tv');
});
