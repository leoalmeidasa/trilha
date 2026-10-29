// Small helpers shared by every view.

export const AREAS = { tech: 'Técnico', english: 'Inglês' };
export const LEVELS = { essential: 'Essencial', optional: 'Opcional' };
export const STATUSES = { todo: 'A fazer', studying: 'Estudando', mastered: 'Dominado' };
export const COSTS = { free: 'Grátis', freemium: 'Freemium', paid: 'Pago' };
export const KINDS = {
  course: 'Curso', lab: 'Lab', book: 'Livro', repo: 'Repositório', docs: 'Documentação',
  video: 'Vídeo', podcast: 'Podcast', practice: 'Prática', cert: 'Certificação', tool: 'Ferramenta',
};
export const LAB_STATUSES = { draft: 'Rascunho', ready: 'Pronto', published: 'Publicado' };
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Only http(s) links are rendered as clickable, so a crafted JSON cannot inject javascript: URLs.
export function safeUrl(url) {
  return /^https?:\/\//i.test(url ?? '') ? url : '#';
}

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function formatDate(key) {
  return parseKey(key).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

export function parseTags(text) {
  return [...new Set(String(text ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

export function options(map, selected) {
  return Object.entries(map)
    .map(([value, label]) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');
}

// Minimal Markdown: escapes first, then applies a safe subset (headings, lists, code, bold, italic, links).
export function markdown(src) {
  const lines = esc(src).split('\n');
  const out = [];
  let inList = false;
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(line); continue; }
    const item = line.match(/^\s*[-*] (.*)/);
    if (item && !inList) { out.push('<ul>'); inList = true; }
    if (!item && inList) { out.push('</ul>'); inList = false; }
    const heading = line.match(/^(#{1,3}) (.*)/);
    if (heading) out.push(`<h${heading[1].length + 2}>${inline(heading[2])}</h${heading[1].length + 2}>`);
    else if (item) out.push(`<li>${inline(item[1])}</li>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
