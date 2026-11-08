// Sound-level check: compares the phonemes the learner produced (wav2vec2 phoneme
// model) with the reference phonemes of each word (espeak, data/pronuncia-ipa.json).
// It is strict on the sounds Brazilian learners usually get wrong (TH, R/H, final
// consonants, -s, long/short i, extra "i" at the end) and lenient on vowel quality
// and normal accent variation, so a good attempt is not marked wrong.

// Split r-colored vowels into vowel + ɹ so "ɔːɹ" matches "ɔ ɹ".
const EXPAND = {
  'ɚ': ['ə', 'ɹ'], 'ɝ': ['ə', 'ɹ'], 'ɔːɹ': ['ɔ', 'ɹ'], 'ɑːɹ': ['ɑ', 'ɹ'], 'oːɹ': ['o', 'ɹ'],
  'ɛɹ': ['ɛ', 'ɹ'], 'ɪɹ': ['ɪ', 'ɹ'], 'ʊɹ': ['ʊ', 'ɹ'], 'aɪɚ': ['aɪ', 'ə', 'ɹ'], 'aɪə': ['aɪ', 'ə'],
  // Vocabulary tokens that are really two sounds.
  'ju': ['j', 'u'], 'juː': ['j', 'u'], 'jʊ': ['j', 'u'], 'əl': ['ə', 'l'], 'iə': ['iː', 'ə'], 'ts': ['t', 's'],
};

// Sounds treated as the same (accent variation, not an error for A1).
const CANON = {
  'ɐ': 'ə', 'ᵻ': 'ə', 'ʌ': 'ə', 'ɜ': 'ə', 'ɜː': 'ə', 'ɪ': 'ɪ',
  'i': 'iː', 'iː': 'iː',
  'ɑ': 'ɑ', 'ɑː': 'ɑ', 'ɔ': 'ɑ', 'ɔː': 'ɑ', 'a': 'ɑ', 'ɒ': 'ɑ',
  'æ': 'ɛ', 'ɛ': 'ɛ', 'e': 'ɛ', 'eː': 'ɛ',
  'oʊ': 'o', 'o': 'o', 'oː': 'o', 'əʊ': 'o',
  'u': 'u', 'uː': 'u', 'ʊ': 'u',
  'r': 'ɹ', 'ʁ': 'ɹ', 'ɻ': 'ɹ', 'g': 'ɡ', 'ɫ': 'l',
};

// Voicing pairs (t/d, s/z...) blur in connected speech ("hot today" -> "hod today").
const VOICING = new Set(['t|d', 'd|t', 's|z', 'z|s', 'k|ɡ', 'ɡ|k', 'p|b', 'b|p', 'f|v', 'v|f', 'θ|ð', 'ð|θ']);

const VOWELS = new Set(['ə', 'ɪ', 'iː', 'ɑ', 'ɛ', 'o', 'u', 'aɪ', 'aʊ', 'eɪ', 'ɔɪ', 'y', 'ø']);
const DROP = new Set(['ʔ', 'ʲ', 'ː']);

export function canon(p) {
  return CANON[p] ?? p;
}

function expand(list) {
  return list.flatMap((p) => EXPAND[p] ?? [p]).filter((p) => !DROP.has(p)).map(canon);
}

export const isVowel = (p) => VOWELS.has(p);

function same(a, b) {
  if (a === b) return true;
  // Flap: "water", "at a" -> ɾ matches t or d.
  if ((a === 'ɾ' && (b === 't' || b === 'd')) || (b === 'ɾ' && (a === 't' || a === 'd'))) return true;
  // Reduced vowels: ə ~ ɪ in unstressed syllables.
  if ((a === 'ə' && b === 'ɪ') || (a === 'ɪ' && b === 'ə')) return true;
  return false;
}

function subCost(a, b) {
  if (same(a, b)) return 0;
  if (isVowel(a) && isVowel(b)) return 0.5;
  if (isVowel(a) !== isVowel(b)) return 1.3;
  return 1;
}
const indelCost = (p) => (isVowel(p) ? 0.7 : 1);

// expectedWords: [[word, [phonemes...]], ...]; heard: [phonemes...]
// Returns [{ word, errors: [{ kind: 'sub'|'del'|'extra-vowel', exp?, got? }] }]
export function comparePhonemes(expectedWords, heard) {
  const exp = [];
  expectedWords.forEach(([, phones], w) => {
    for (const p of expand(phones)) exp.push({ p, w });
  });
  const got = expand(heard);
  const n = exp.length;
  const m = got.length;
  const d = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i += 1) d[i][0] = d[i - 1][0] + indelCost(exp[i - 1].p);
  for (let j = 1; j <= m; j += 1) d[0][j] = d[0][j - 1] + indelCost(got[j - 1]);
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      d[i][j] = Math.min(
        d[i - 1][j - 1] + subCost(exp[i - 1].p, got[j - 1]),
        d[i - 1][j] + indelCost(exp[i - 1].p),
        d[i][j - 1] + indelCost(got[j - 1]),
      );
    }
  }
  // Backtrace into ops tagged with the word they belong to.
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(d[i][j] - (d[i - 1][j - 1] + subCost(exp[i - 1].p, got[j - 1]))) < 1e-9) {
      ops.push({ type: same(exp[i - 1].p, got[j - 1]) ? 'ok' : 'sub', exp: exp[i - 1].p, got: got[j - 1], w: exp[i - 1].w });
      i -= 1; j -= 1;
    } else if (i > 0 && Math.abs(d[i][j] - (d[i - 1][j] + indelCost(exp[i - 1].p))) < 1e-9) {
      ops.push({ type: 'del', exp: exp[i - 1].p, w: exp[i - 1].w });
      i -= 1;
    } else {
      // Inserted sound: belongs to the word before it (or the first word at the start).
      ops.push({ type: 'ins', got: got[j - 1], w: i > 0 ? exp[i - 1].w : 0, atEnd: i > 0 });
      j -= 1;
    }
  }
  ops.reverse();

  const result = expectedWords.map(([word]) => ({ word, errors: [] }));
  ops.forEach((op, k) => {
    const words = expectedWords[op.w][1];
    if (op.type === 'sub') {
      const vowels = isVowel(op.exp) && isVowel(op.got);
      // Vowel quality only matters for the long/short i contrast (sheep/ship, leave/live),
      // and only in one-vowel words, where that vowel is the stressed one.
      const iContrast = (op.exp === 'iː' && op.got === 'ɪ') || (op.exp === 'ɪ' && op.got === 'iː');
      if (vowels && !(iContrast && expand(words).filter(isVowel).length === 1)) return;
      if (VOICING.has(`${op.exp}|${op.got}`)) return;
      result[op.w].errors.push({ kind: 'sub', exp: op.exp, got: op.got });
    } else if (op.type === 'del') {
      if (isVowel(op.exp)) return; // Swallowed vowels are normal in fast speech.
      const phones = expand(words);
      const lastTwo = phones.slice(-2).join(' ');
      if (op.exp === 't' && /n t$|s t$/.test(lastTwo)) return; // "doesn't", "next": final t often dropped.
      result[op.w].errors.push({ kind: 'del', exp: op.exp });
    } else if (op.type === 'ins' && op.atEnd && isVowel(op.got)) {
      // A vowel added right after a word that ends in a consonant: "bigi", "laiki".
      const phones = expand(words);
      const endsInConsonant = phones.length && !isVowel(phones.at(-1));
      const nextOp = ops[k + 1];
      const atWordEnd = !nextOp || nextOp.w !== op.w || nextOp.type === 'ins';
      if (endsInConsonant && atWordEnd && op.got !== 'ə') result[op.w].errors.push({ kind: 'extra-vowel', got: op.got });
    }
  });
  return result;
}

// Friendly names for the sounds a learner sees in the feedback.
export const SOUND_NAMES = {
  'θ': 'th de "think"', 'ð': 'th de "this"', 'iː': 'i longo', 'ɪ': 'i curto', 'ɹ': 'r inglês', 'h': 'h aspirado',
  'ʃ': 'sh', 'tʃ': 'ch', 'dʒ': 'j de "job"', 'ŋ': 'ng', 'z': 'z', 's': 's', 'v': 'v', 'w': 'w', 'b': 'b', 'p': 'p',
  't': 't', 'd': 'd', 'k': 'k', 'ɡ': 'g', 'f': 'f', 'l': 'l', 'm': 'm', 'n': 'n', 'j': 'y de "yes"',
};
const name = (p) => (SOUND_NAMES[p] ? `/${p}/ (${SOUND_NAMES[p]})` : `/${p}/`);

// One feedback line per error, in Portuguese.
export function describe(error, word) {
  const { kind, exp, got } = error;
  if (kind === 'extra-vowel') return `Você pôs um "${got === 'iː' ? 'i' : got}" no fim de "${word}". Termine seco na consoante.`;
  if (kind === 'del') {
    if (exp === 'h') return `O h de "${word}" sumiu. Solte o ar, como o R de "rato".`;
    if ((exp === 's' || exp === 'z') && /s\W*$/i.test(word)) return `Faltou o -s final de "${word}".`;
    if (exp === 'θ' || exp === 'ð') return `Faltou o som ${name(exp)} em "${word}": língua entre os dentes.`;
    return `Faltou o som ${name(exp)} em "${word}".`;
  }
  if (exp === 'θ' || exp === 'ð') return `Em "${word}", o ${name(exp)} saiu como /${got}/. Ponha a língua entre os dentes e sopre${exp === 'ð' ? ' vibrando' : ''}.`;
  if (exp === 'ɹ') return `Em "${word}", o r inglês saiu como /${got}/. Recue a língua sem tocar o céu da boca.`;
  if (exp === 'h') return `Em "${word}", o h saiu como /${got}/. O h inglês é só um sopro.`;
  if (exp === 'iː' && got === 'ɪ') return `Em "${word}", o i saiu curto. Estique: "${word}" tem i longo (como em "sheep").`;
  if (exp === 'ɪ' && got === 'iː') return `Em "${word}", o i saiu longo. Aqui é i curto e relaxado (como em "ship").`;
  return `Em "${word}", o som ${name(exp)} saiu como ${name(got)}.`;
}
