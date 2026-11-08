// Pronunciation practice: compares what Whisper heard with the expected sentence.
// The pure functions (normalize, align, hintFor, wordKey) run in Node for tests;
// play/stop need a browser.

const NUMBERS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
};

// Lowercase words without punctuation; number words become digits so "seven" and "7" match.
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
    .map((w) => NUMBERS[w] ?? w);
}

// Word-level edit distance with backtrace. Each op is one of:
//   ok   – expected word was heard
//   sub  – expected word was heard as something else
//   miss – expected word was not heard
//   extra – heard a word that is not in the sentence
export function align(expectedText, heardText) {
  const display = String(expectedText).split(/\s+/).filter((w) => normalize(w).length);
  const exp = display.map((w) => normalize(w).join(' '));
  const got = normalize(heardText);
  const n = exp.length;
  const m = got.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = exp[i - 1] === got[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (exp[i - 1] === got[j - 1] ? 0 : 1)) {
      ops.push(exp[i - 1] === got[j - 1]
        ? { type: 'ok', word: display[i - 1] }
        : { type: 'sub', word: display[i - 1], heard: got[j - 1] });
      i -= 1; j -= 1;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ type: 'miss', word: display[i - 1] });
      i -= 1;
    } else {
      ops.push({ type: 'extra', heard: got[j - 1] });
      j -= 1;
    }
  }
  ops.reverse();
  const ok = ops.filter((o) => o.type === 'ok').length;
  const extras = ops.filter((o) => o.type === 'extra').length;
  // Extra words cost half a point each so "um, I like music" is not a perfect score.
  const score = n ? Math.max(0, Math.round(((ok - extras * 0.5) / n) * 100)) : 0;
  return { ops, score };
}

// Rule-of-thumb tips for errors that Brazilian speakers commonly make.
export function hintFor(word) {
  const w = normalize(word)[0] ?? '';
  if (!w) return null;
  if (/^th/.test(w)) return 'TH: ponha a ponta da língua entre os dentes e solte o ar. Não é "t", "d" nem "f".';
  if (/(s|sh|ch|x|z)es$|[cg]es$/.test(w)) return '-es aqui soa /ɪz/: uma sílaba a mais ("watch-iz").';
  if (w.length > 4 && /[^aeiou]ed$/.test(w)) {
    return /[td]ed$/.test(w)
      ? '-ed depois de t/d soa /ɪd/: uma sílaba a mais ("want-id").'
      : '-ed não ganha sílaba: soa só /t/ ou /d/ ("work-t", "play-d").';
  }
  if (/^r/.test(w)) return 'R inglês: língua recuada, sem tocar o céu da boca. Não é o R de "rato" (que soa como H).';
  if (/^h/.test(w)) return 'H inglês é um sopro, como o R de "rato". Não fique mudo nem troque por R.';
  if (/^wh?/.test(w)) return 'W: lábios em bico, como "u" rápido ("u-ork" em work).';
  if (/(ee|ea)/.test(w)) return 'Vogal longa /iː/: estique o "i" (sheep, eat, read).';
  if (/^[^aeiou]*i[^aeiou]+$/.test(w)) return 'Vogal curta /ɪ/: "i" rápido e relaxado, quase "ê" (ship, live, it).';
  if (/[bdgkpt]$/.test(w)) return 'Termine na consoante. Não adicione "i" no fim ("big", não "bigi").';
  if (/s$/.test(w)) return 'Pronuncie o -s final. Ele marca he/she/it ou o plural.';
  return 'Ouça devagar (🐢) e repita a palavra sozinha, depois a frase.';
}

// File name used for a word's pre-rendered audio. Must match word_key() in scripts/gen-audio.py.
export function wordKey(word) {
  return String(word ?? '').toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------- browser only

let player = null;

// Plays the pre-rendered file (data/audio/...); when there is none, the Kokoro voice
// (voice.js) synthesizes it. Slow playback keeps the pitch.
export async function play({ src, text, rate = 1 }) {
  stop();
  if (src) {
    player = new Audio(src);
    player.playbackRate = rate;
    player.preservesPitch = true;
    try {
      await player.play();
      return;
    } catch {
      player = null;
    }
  }
  const voice = await import('./voice.js');
  await voice.speak(text, { speed: rate });
}

export function stop() {
  player?.pause();
  player = null;
}
