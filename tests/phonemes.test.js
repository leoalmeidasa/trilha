import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparePhonemes, describe } from '../assets/js/phonemes.js';

const IPA = JSON.parse(readFileSync(new URL('../data/pronuncia-ipa.json', import.meta.url)));
const p = (s) => s.split(' ');
const wrongWords = (id, heard) => comparePhonemes(IPA[id], p(heard)).filter((w) => w.errors.length).map((w) => w.word.replace(/\W+$/, ''));

// Phonemes below are real outputs of wav2vec2-lv-60-espeak-cv-ft (q8) for test recordings.
test('correct recordings have no sound errors', () => {
  assert.deepEqual(wrongWords('th-02', 'aɪ θ ɪ ŋ k ð ɪ s ɪ z ð ə ɹ aɪ t w ʌ n'), []);
  assert.deepEqual(wrongWords('th-01', 'θ ɛ ŋ k j uː v ɛ ɹ i m ʌ tʃ'), []);
  assert.deepEqual(wrongWords('vi-02', 'aɪ l iː v æ t s ɪ k s'), []);
  assert.deepEqual(wrongWords('cf-01', 'aɪ l aɪ k b ɪ ɡ d ɔ ɡ z'), []);
});

test('TH said as t/d is caught on the right words', () => {
  assert.deepEqual(wrongWords('th-02', 'aɪ t ɪ ŋ k d ɪ s ɪ z d ə ɹ aɪ t w ʌ n'), ['think', 'this', 'the']);
  const [thank] = comparePhonemes(IPA['th-01'], p('t æ ŋ k uː v ɛ ɹ i m ʌ tʃ'));
  assert.deepEqual(thank.errors[0], { kind: 'sub', exp: 'θ', got: 't' });
  assert.match(describe(thank.errors[0], 'Thank'), /língua entre os dentes/);
});

test('long i said short is caught (leave -> live)', () => {
  const res = comparePhonemes(IPA['vi-02'], p('aɪ l ɪ v æ t s ɪ k s'));
  assert.deepEqual(res[1].errors, [{ kind: 'sub', exp: 'iː', got: 'ɪ' }]);
});

test('extra vowel at the end of words is caught (bigi, dogi)', () => {
  const words = wrongWords('cf-01', 'a l ɛ k iː b i ɡ d ɑ v iː z');
  assert.ok(words.includes('like'), words.join());
});

test('dropped h and R said as H are caught', () => {
  assert.deepEqual(wrongWords('rh-03', 'ɪ t ɪ z ɑ t t ə d eɪ'), ['hot']);
  assert.deepEqual(wrongWords('rh-01', 'aɪ h æ v ə h ɛ d k ɑ ɹ'), ['red']);
});

test('accent variation is not an error', () => {
  // "hot today": final t voiced before the next word.
  assert.deepEqual(wrongWords('rh-03', 'ɪ t ɪ z h ɑ d t ə d eɪ'), []);
  // Long/short i is only judged in one-vowel words ("movies" ends in an unstressed i).
  assert.deepEqual(wrongWords('s-03', 'h iː w ɑ tʃ ᵻ z m uː v iː z ɑ n f ɹ aɪ d eɪ z'), []);
});
