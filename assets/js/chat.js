// Conversation partner: Claude plays a friendly native speaker for an A1 learner.
// The API key lives only in this browser (localStorage, outside the exportable state),
// and requests go straight from the browser to the Anthropic API.
import { Anthropic } from '../vendor/anthropic.js';

const SETTINGS_KEY = 'trilha:conversa';

export const MODELS = {
  'claude-haiku-5-5': 'Claude Haiku 5.5 (rápido e barato)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 (mais natural, custa ~20× mais)',
};

export const SCENARIOS = {
  free: { title: 'Conversa livre', brief: 'Free conversation. Ask about the learner\'s day, hobbies, family, work and plans.' },
  intro: { title: 'Apresentação', brief: 'You just met the learner at a party. Exchange names, where you are from, jobs and hobbies.' },
  cafe: { title: 'Café / restaurante', brief: 'You are a barista at a coffee shop in Chicago. Take the learner\'s order, ask about size, milk, to stay or to go, and say the price.' },
  routine: { title: 'Rotina', brief: 'Talk about daily routines using the Simple Present: what time they wake up, work, eat, study and sleep.' },
  work: { title: 'Trabalho (TI)', brief: 'You are a friendly coworker on an IT/DevOps team. Chat about what the learner does at work, tools they use, and their week. Keep tech words simple.' },
  travel: { title: 'Viagem / aeroporto', brief: 'You are an airport check-in agent. Ask for the passport, destination, bags, seat preference, and give the gate and boarding time.' },
};

const DEFAULTS = { apiKey: '', model: 'claude-haiku-5-5', voice: 'af_heart', remember: true };

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

// The key is kept in localStorage only when "remember" is on; otherwise it lives in
// sessionStorage and disappears when the tab closes. Never part of the exportable state.
export function loadSettings() {
  const saved = readJson(localStorage, SETTINGS_KEY) ?? {};
  const session = readJson(sessionStorage, SETTINGS_KEY) ?? {};
  return { ...DEFAULTS, ...saved, apiKey: saved.apiKey || session.apiKey || '' };
}

export function saveSettings(settings) {
  const { apiKey, ...rest } = settings;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...rest, apiKey: settings.remember ? apiKey : '' }));
    if (settings.remember) sessionStorage.removeItem(SETTINGS_KEY);
    else sessionStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey }));
    return true;
  } catch {
    return false;
  }
}

function systemPrompt(scenario, name) {
  return `You are Sam, a friendly native English speaker from the United States, talking by voice with ${name || 'a Brazilian learner'} who speaks Portuguese and is at CEFR level A1 in English.

Scenario: ${SCENARIOS[scenario]?.brief ?? SCENARIOS.free.brief}

How to talk:
- Speak like a real person in a relaxed spoken conversation, not like a teacher.
- Use A1 English: short sentences (max 12 words), common words, mostly Simple Present. One or two sentences per turn.
- End most turns with one simple question so the learner keeps talking.
- Your reply is read aloud by a speech synthesizer: no emojis, lists, markdown or abbreviations.
- The learner's message is a speech-to-text transcript. Ignore punctuation and capitalization. If it is garbled or makes no sense, kindly ask them to say it again.
- If the learner writes in Portuguese, answer in simple English and help them say it in English.

Corrections:
- Look at the learner's last message only. If it has a clear grammar or word-choice error that matters at A1 (for example "she work", "I have 30 years", "he don't like"), fill "better" with a natural corrected version and "tip_pt" with a short explanation in Brazilian Portuguese (max 25 words).
- Do not correct punctuation, capitalization, or small things a native would also say. If the message is fine, leave "better" and "tip_pt" empty.
- Never correct inside "reply": keep the conversation flowing there.

Always fill "reply_pt" with a natural Brazilian Portuguese translation of your reply.`;
}

const FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'What Sam says next, in simple spoken English.' },
      reply_pt: { type: 'string', description: 'Brazilian Portuguese translation of reply.' },
      better: { type: 'string', description: 'Corrected version of the learner\'s last message, or empty string.' },
      tip_pt: { type: 'string', description: 'Short explanation of the correction in Brazilian Portuguese, or empty string.' },
    },
    required: ['reply', 'reply_pt', 'better', 'tip_pt'],
    additionalProperties: false,
  },
};

// A conversation keeps the raw API history (append-only, assistant turns stored as
// returned) plus a display log for the UI.
export function newConversation(scenario = 'free') {
  return { scenario, history: [], log: [], usage: { input: 0, output: 0 } };
}

export const OPENING = '[The learner just opened the app. Greet them and start the conversation for this scenario.]';

// Sends one learner turn (or the opening) and returns the parsed reply.
export async function send(conversation, text, { settings, learnerName }) {
  if (!settings.apiKey) throw new Error('Configure sua chave da API do Claude primeiro.');
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  conversation.history.push({ role: 'user', content: text });
  let response;
  try {
    response = await client.messages.create({
      model: settings.model,
      max_tokens: 2000,
      system: systemPrompt(conversation.scenario, learnerName),
      messages: conversation.history,
      output_config: { effort: 'low', format: FORMAT },
    });
  } catch (err) {
    conversation.history.pop(); // Keep history valid so the user can retry.
    throw new Error(explainError(err));
  }
  conversation.usage.input += response.usage?.input_tokens ?? 0;
  conversation.usage.output += response.usage?.output_tokens ?? 0;
  if (response.stop_reason === 'refusal') {
    conversation.history.pop();
    throw new Error('O Claude recusou responder a essa mensagem. Tente dizer de outro jeito.');
  }
  conversation.history.push({ role: 'assistant', content: response.content });
  const textBlock = response.content.find((b) => b.type === 'text');
  try {
    return JSON.parse(textBlock?.text ?? '');
  } catch {
    return { reply: textBlock?.text ?? '', reply_pt: '', better: '', tip_pt: '' };
  }
}

function explainError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Chave da API inválida. Confira em Conversa → Configurar.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Esta chave não tem permissão para esse modelo.';
  if (err instanceof Anthropic.RateLimitError) return 'Limite de uso atingido. Espere um pouco e tente de novo.';
  if (err instanceof Anthropic.APIConnectionError) return 'Sem conexão com a API do Claude. Confira a internet.';
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402 || err.type === 'billing_error') return 'Sem créditos na conta da API. Adicione créditos no console da Anthropic.';
    return `Erro da API do Claude (${err.status ?? '?'}): ${err.message}`;
  }
  return String(err?.message ?? err);
}

// Rough cost in US$ for the session (list prices per million tokens).
export function estimateCost(conversation, model) {
  const price = model === 'claude-sonnet-5-5' ? [2, 10] : [0.1, 0.5];
  return (conversation.usage.input * price[0] + conversation.usage.output * price[1]) / 1e6;
}
