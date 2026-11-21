#!/usr/bin/env node
// docs-find - localizador de documentação e contratos (skill project-docs, esquema 1).
// Sem dependências. Requer Node >= 18 e Git.
// Ajuda: node docs/tools/docs-find.mjs help

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOOL_VERSION = '1';
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'];
const MAX_SCHEMAS = 25;
const MAX_ALL_OPS_LINES = 150;

// ---------- argumentos ----------
const argv = process.argv.slice(2);
function takeOpt(name) {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const v = argv[i + 1] ?? null;
  argv.splice(i, 2);
  return v;
}
const repoOpt = takeOpt('--repo');
const baseOpt = takeOpt('--base');
const cmd = (argv.shift() || 'help').toLowerCase();
const rest = argv;
const external = Boolean(repoOpt); // a consultar OUTRO repositório: só docs/public

// ---------- utilitários ----------
const toPosix = (p) => p.split(path.sep).join('/');
const unq = (s) => String(s).trim().replace(/^['"]|['"]$/g, '');
const esc = (s) => s.replace(/[.+^${}()|[\]\\*?]/g, '\\$&');
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function die(msg, code = 2) {
  console.log(msg);
  process.exit(code);
}
function git(root, a) {
  try {
    return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
const lines = (out) => (out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : []);

const START = path.resolve(repoOpt || '.');
if (!fs.existsSync(START)) die(`[em falta] repositório não encontrado: ${toPosix(START)}`);
const TOP = git(START, ['rev-parse', '--show-toplevel']);
const ROOT = TOP ? path.resolve(TOP.trim()) : START;
const DOCS = path.join(ROOT, 'docs');
const rel = (f) => toPosix(path.relative(ROOT, f));

// ---------- frontmatter e globs ----------
function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return {};
  const end = text.indexOf('\n---', 4);
  if (end < 0) return {};
  const fm = {};
  let last = null;
  for (const line of text.slice(4, end).split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && last) {
      if (!Array.isArray(fm[last])) fm[last] = fm[last] ? [fm[last]] : [];
      fm[last].push(unq(item[1]));
      continue;
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    last = kv[1];
    const v = kv[2].replace(/\s+#.*$/, '').trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      fm[last] = v.slice(1, -1).split(',').map(unq).filter(Boolean);
    } else {
      fm[last] = v === '' ? [] : unq(v);
    }
  }
  return fm;
}

function globToRegex(glob) {
  let g = toPosix(String(glob).trim()).replace(/^\.\//, '');
  if (g.endsWith('/')) g += '**';
  const hasWild = /[*?{]/.test(g);
  let r = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') {
          i++;
          r += '(?:.*/)?';
        } else r += '.*';
      } else r += '[^/]*';
    } else if (c === '?') r += '[^/]';
    else if (c === '{') {
      const j = g.indexOf('}', i);
      if (j > i) {
        r += '(?:' + g.slice(i + 1, j).split(',').map(esc).join('|') + ')';
        i = j;
      } else r += '\\{';
    } else r += esc(c);
  }
  // padrão sem wildcards: aceita o ficheiro exato ou tudo dentro da pasta
  return new RegExp('^' + r + (hasWild ? '' : '(?:/.*)?') + '$');
}

// ---------- documentos ----------
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith('.') && !(dir === DOCS && e.name === 'tools')) walk(p, out);
    } else if (e.name.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out;
}
let _docs = null;
function docs() {
  if (_docs) return _docs;
  const base = external ? path.join(DOCS, 'public') : DOCS;
  _docs = walk(base).map((file) => {
    const text = read(file);
    const fm = parseFrontmatter(text);
    const cobre = [].concat(fm.cobre || []).filter(Boolean);
    return { file, rel: rel(file), text, fm, cobre, rx: cobre.map(globToRegex) };
  });
  return _docs;
}
const label = (d) => d.fm.descricao || d.fm.titulo || '';
let _tracked = null;
const trackedFiles = () =>
  (_tracked ??= lines(git(ROOT, ['ls-files', '--cached', '--others', '--exclude-standard'])));

// ---------- files / changed ----------
function coverage(files) {
  const byDoc = new Map();
  const none = [];
  for (const f of files) {
    const hits = docs().filter((d) => d.rx.some((x) => x.test(f)));
    if (!hits.length) none.push(f);
    for (const d of hits) {
      if (!byDoc.has(d)) byDoc.set(d, []);
      byDoc.get(d).push(f);
    }
  }
  return { byDoc, none };
}
function printCoverage({ byDoc, none }) {
  if (byDoc.size) {
    console.log('Documentos a abrir:');
    const sorted = [...byDoc].sort((a, b) => b[1].length - a[1].length);
    for (const [d, list] of sorted) {
      const sample = list.slice(0, 3).join(', ') + (list.length > 3 ? ', ...' : '');
      console.log(`  ${d.rel} - ${label(d)}`);
      console.log(`      ${list.length} ficheiro(s): ${sample}`);
    }
  } else console.log('Documentos a abrir: nenhum');
  if (none.length) {
    console.log('Sem documento que os cubra (lacunas a reportar):');
    for (const f of none) console.log(`  ${f}`);
  }
}
function cmdFiles(args) {
  if (!args.length) die('Uso: files <caminho> [caminho...]');
  const files = args.map((a) => toPosix(path.relative(ROOT, path.resolve(a))));
  printCoverage(coverage(files));
}

function consumers() {
  const own = path.join(DOCS, 'component.yaml');
  if (!fs.existsSync(own) || !/fornece:\s*\n\s+-/.test(read(own))) return [];
  const parent = path.dirname(ROOT);
  const name = path.basename(ROOT);
  const out = [];
  for (const e of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!e.isDirectory() || path.join(parent, e.name) === ROOT) continue;
    const cy = path.join(parent, e.name, 'docs', 'component.yaml');
    if (fs.existsSync(cy) && read(cy).includes(`/${name}/`)) out.push(`../${e.name}`);
  }
  return out;
}
function cmdChanged() {
  let base = baseOpt;
  if (!base) {
    const head = git(ROOT, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    base = [head && head.trim(), 'main', 'master', 'develop']
      .filter(Boolean)
      .find((b) => git(ROOT, ['rev-parse', '--verify', '--quiet', b]));
  }
  const branch = (git(ROOT, ['branch', '--show-current']) || '').trim();
  const set = new Set();
  if (base && base !== branch) lines(git(ROOT, ['diff', '--name-only', `${base}...HEAD`])).forEach((f) => set.add(f));
  lines(git(ROOT, ['diff', '--name-only', 'HEAD'])).forEach((f) => set.add(f));
  lines(git(ROOT, ['ls-files', '--others', '--exclude-standard'])).forEach((f) => set.add(f));
  const all = [...set].filter((f) => !f.startsWith('.agents/'));
  console.log(`Branch: ${branch || '(destacada)'} | base: ${base || '(nenhuma; só alterações locais)'} | ${all.length} ficheiro(s) alterado(s)`);
  if (!all.length) return;
  const docChanges = all.filter((f) => f.startsWith('docs/'));
  const code = all.filter((f) => !f.startsWith('docs/'));
  if (docChanges.length) {
    console.log('Documentação já alterada:');
    for (const f of docChanges) console.log(`  ${f}`);
  }
  printCoverage(coverage(code));
  const cons = consumers();
  if (cons.length) console.log(`Consumidores conhecidos deste contrato: ${cons.join(', ')}`);
}

// ---------- search ----------
function cmdSearch(args) {
  const toks = args.join(' ').toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) die('Uso: search <termos...>');
  const phrase = toks.join(' ');
  const res = [];
  for (const d of docs()) {
    const meta = `${d.fm.titulo || ''} ${d.fm.descricao || ''}`.toLowerCase();
    const relLow = d.rel.toLowerCase();
    let score = 0;
    for (const t of toks) {
      if (meta.includes(t)) score += 3;
      if (relLow.includes(t)) score += 2;
    }
    const heads = [];
    let body = 0;
    let inFence = false;
    d.text.split('\n').forEach((l, i) => {
      if (l.trim().startsWith('```')) inFence = !inFence;
      const low = l.toLowerCase();
      if (!toks.some((t) => low.includes(t))) return;
      if (!inFence && /^#{1,4}\s/.test(l)) {
        heads.push(`L${i + 1} ${l.trim()}`);
        const hits = toks.filter((t) => low.includes(t)).length;
        score += hits * 2 + (toks.length > 1 && low.includes(phrase) ? 6 : 0);
      } else body++;
    });
    score += Math.min(body, 6) * 0.5;
    if (toks.length > 1 && meta.includes(phrase)) score += 6;
    if (score) res.push({ d, score, heads });
  }
  if (!res.length) die(`Sem resultados para "${toks.join(' ')}". Experimenta outros termos${external ? '' : ' ou o comando routes'}.`, 1);
  res.sort((a, b) => b.score - a.score);
  for (const { d, heads } of res.slice(0, 8)) {
    console.log(`${d.rel} - ${label(d)}`);
    for (const h of heads.slice(0, 5)) console.log(`    ${h}`);
  }
  if (res.length > 8) console.log(`(+${res.length - 8} resultado(s) menos relevantes)`);
}

// ---------- contrato OpenAPI ----------
function contractFile() {
  const cy = path.join(DOCS, 'component.yaml');
  let declared = null;
  if (fs.existsSync(cy)) {
    const m = read(cy).match(/fornece:[\s\S]*?\bcaminho:\s*(\S+)/);
    if (m) declared = unq(m[1]);
  }
  const cands = [declared, 'docs/public/openapi.yaml', 'docs/public/openapi.yml', 'docs/public/openapi.json'].filter(Boolean);
  for (const c of cands) {
    const f = path.join(ROOT, c);
    if (!fs.existsSync(f)) continue;
    if (external && !rel(f).startsWith('docs/public/')) die(`Contrato fora de docs/public (${rel(f)}): acesso recusado.`);
    return f;
  }
  die(`[em falta] contrato não encontrado em ${toPosix(path.join(ROOT, cands[0]))}. Não uses cópias antigas: avisa o utilizador.`);
}

function yamlModel(file, text) {
  const L = text.split('\n');
  const ind = (l) => l.match(/^ */)[0].length;
  const blank = (l) => !l.trim() || l.trim().startsWith('#');
  const keyOf = (l) => {
    const m = l.trim().match(/^(['"]?)(.+?)\1:(?:\s+(.*))?$/);
    return m ? { k: m[2], v: m[3] || '' } : null;
  };
  const blockEnd = (i) => {
    const base = ind(L[i]);
    let j = i + 1;
    while (j < L.length && (blank(L[j]) || ind(L[j]) > base || (ind(L[j]) === base && L[j].trim().startsWith('- ')))) j++;
    while (j > i + 1 && blank(L[j - 1])) j--;
    return j;
  };
  const children = (i, end) => {
    const out = [];
    let ci = null;
    for (let j = i + 1; j < end; j++) {
      if (blank(L[j])) continue;
      const n = ind(L[j]);
      if (ci === null) ci = n;
      if (n === ci && !L[j].trim().startsWith('- ')) {
        const kv = keyOf(L[j]);
        if (kv) out.push({ ...kv, line: j, end: blockEnd(j) });
      }
    }
    return out;
  };
  const top = (name) => {
    const i = L.findIndex((l) => l === `${name}:` || l.startsWith(`${name}: `));
    return i < 0 ? null : { line: i, end: blockEnd(i) };
  };
  const slice = (a, b) => L.slice(a, b).join('\n');
  const loc = (a, b) => `L${a + 1}-${b}`;

  const info = top('info');
  const ver = info && children(info.line, info.end).find((c) => c.k === 'version');
  const pathsTop = top('paths');
  const paths = pathsTop
    ? children(pathsTop.line, pathsTop.end).map((p) => {
        const kids = children(p.line, p.end);
        const ops = kids
          .filter((k) => METHODS.includes(k.k.toLowerCase()))
          .map((k) => {
            const s = children(k.line, k.end).find((c) => c.k === 'summary');
            return { method: k.k.toUpperCase(), summary: s ? unq(s.v) : '', text: slice(k.line, k.end), loc: loc(k.line, k.end) };
          });
        const common = kids.filter((k) => !METHODS.includes(k.k.toLowerCase())).map((k) => slice(k.line, k.end)).join('\n');
        return { path: p.k, ops, common };
      })
    : [];
  const schemas = new Map();
  const comp = top('components');
  const sch = comp && children(comp.line, comp.end).find((c) => c.k === 'schemas');
  if (sch) for (const s of children(sch.line, sch.end)) schemas.set(s.k, { text: slice(s.line, s.end), loc: loc(s.line, s.end) });
  return { file, version: ver ? unq(ver.v) : null, paths, schemas };
}

function jsonModel(file, o) {
  const j = (x) => JSON.stringify(x, null, 2);
  const paths = Object.entries(o.paths || {}).map(([p, v]) => ({
    path: p,
    ops: Object.entries(v)
      .filter(([m]) => METHODS.includes(m.toLowerCase()))
      .map(([m, op]) => ({ method: m.toUpperCase(), summary: op.summary || '', text: `${m}: ${j(op)}`, loc: '' })),
    common: v.parameters ? `parameters: ${j(v.parameters)}` : '',
  }));
  const schemas = new Map(Object.entries(o.components?.schemas || {}).map(([n, s]) => [n, { text: `${n}: ${j(s)}`, loc: '' }]));
  return { file, version: o.info?.version ?? null, paths, schemas };
}

function loadContract() {
  const f = contractFile();
  const text = read(f);
  if (f.toLowerCase().endsWith('.json')) {
    try {
      return jsonModel(f, JSON.parse(text));
    } catch (e) {
      die(`Contrato JSON inválido (${rel(f)}): ${e.message}`);
    }
  }
  return yamlModel(f, text);
}

function provenance(model) {
  const commit = (git(ROOT, ['rev-parse', '--short', 'HEAD']) || '').trim() || '?';
  const dirty = lines(git(ROOT, ['status', '--porcelain', '--', rel(model.file)])).length > 0;
  return `Contrato: ${toPosix(path.relative(process.cwd(), model.file))} | commit ${commit}${dirty ? ' (com alterações NÃO commitadas no contrato)' : ''} | versão ${model.version ?? '?'}`;
}

const segs = (p) =>
  p
    .replace(/^https?:\/\/[^/]+/, '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((s) => (/^\{.+\}$|^:[A-Za-z_]\w*$/.test(s) ? '{}' : s.toLowerCase()));

function scorePath(input, spec) {
  const a = segs(input);
  const b = segs(spec);
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let lit = 0;
  for (let i = 1; i <= n; i++) {
    const x = a[a.length - i];
    const y = b[b.length - i];
    if (x === y) lit++;
    else if (x !== '{}' && y !== '{}') return 0;
  }
  if (a.length !== b.length && lit === 0) return 0;
  return (a.length === b.length ? 1000 : 0) + lit * 10 + n;
}

const refsOf = (text) => [...text.matchAll(/#\/components\/schemas\/([A-Za-z0-9_.\-]+)/g)].map((m) => m[1]);

function cmdRoute(args) {
  if (!args.length) die('Uso: route <path> [método]   ex.: route /users/{id} get');
  // O Git Bash (MSYS) converte "/users/1" em "C:/Program Files/Git/users/1": desfazer.
  const input = args[0].replace(/\\/g, '/').replace(/^[A-Za-z]:\/(?:.*?\/)?Git\//i, '/');
  const method = args[1] ? args[1].toUpperCase() : null;
  const model = loadContract();
  console.log(provenance(model));

  const scored = model.paths.map((p) => ({ p, s: scorePath(input, p.path) })).filter((x) => x.s > 0);
  if (!scored.length) die(`Sem correspondência para "${input}". Usa: routes <filtro>`, 1);
  const best = Math.max(...scored.map((x) => x.s));
  const top = scored.filter((x) => x.s === best);
  if (top.length > 1) {
    console.log(`Várias rotas possíveis para "${input}". Indica o path exato:`);
    for (const { p } of top) for (const o of p.ops) console.log(`  ${o.method} ${p.path} - ${o.summary}`);
    return;
  }
  const p = top[0].p;
  let ops = method ? p.ops.filter((o) => o.method === method) : p.ops;
  if (!ops.length) die(`${p.path} não tem ${method}. Métodos: ${p.ops.map((o) => o.method).join(', ')}`, 1);
  const totalLines = ops.reduce((n, o) => n + o.text.split('\n').length, 0);
  if (!method && ops.length > 1 && totalLines > MAX_ALL_OPS_LINES) {
    console.log(`${p.path} tem ${ops.length} métodos. Indica qual (ex.: route ${p.path} ${ops[0].method.toLowerCase()}):`);
    for (const o of ops) console.log(`  ${o.method} - ${o.summary}`);
    return;
  }
  console.log(`\n${p.path}:`);
  if (p.common) console.log(p.common);
  for (const o of ops) {
    console.log(`\n# ${o.method} ${p.path}${o.loc ? ` (${o.loc})` : ''}`);
    console.log(o.text);
  }
  printSchemas(model, [p.common, ...ops.map((o) => o.text)].flatMap(refsOf));
}

function printSchemas(model, initial) {
  const seen = new Set();
  const queue = [...initial];
  const shown = [];
  const skipped = [];
  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n)) continue;
    seen.add(n);
    const s = model.schemas.get(n);
    if (!s) {
      skipped.push(`${n} (não encontrado)`);
      continue;
    }
    if (shown.length >= MAX_SCHEMAS) {
      skipped.push(n);
      continue;
    }
    shown.push([n, s]);
    queue.push(...refsOf(s.text));
  }
  if (shown.length) console.log('\n## Schemas referidos');
  for (const [n, s] of shown) {
    console.log(`\n# ${n}${s.loc ? ` (${s.loc})` : ''}`);
    console.log(s.text);
  }
  if (skipped.length) console.log(`\n(não mostrados: ${skipped.join(', ')} - usa: schema <Nome>)`);
}

function cmdSchema(args) {
  if (!args.length) die('Uso: schema <Nome>');
  const model = loadContract();
  console.log(provenance(model));
  if (!model.schemas.has(args[0])) die(`Schema "${args[0]}" não existe no contrato.`, 1);
  printSchemas(model, [args[0]]);
}

function cmdRoutes(args) {
  const model = loadContract();
  console.log(provenance(model));
  const f = args.join(' ').toLowerCase();
  let n = 0;
  for (const p of model.paths)
    for (const o of p.ops) {
      const lineTxt = `${o.method} ${p.path} - ${o.summary}`;
      if (!f || lineTxt.toLowerCase().includes(f)) {
        console.log(`  ${lineTxt}`);
        n++;
      }
    }
  console.log(`${n} operação(ões).`);
}

// ---------- check ----------
function cmdCheck() {
  const errs = [];
  const warns = [];
  if (!fs.existsSync(path.join(DOCS, 'component.yaml'))) errs.push('docs/component.yaml em falta');
  if (!fs.existsSync(path.join(DOCS, 'index.md'))) errs.push('docs/index.md em falta');
  const key = (f) => path.resolve(f).toLowerCase();
  const linked = new Set();
  for (const d of docs()) {
    const noCode = d.text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const m of noCode.matchAll(/\]\(\s*([^)\s#]+)(?:#[^)]*)?\s*\)/g)) {
      const target = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, mailto:, etc.
      let clean = target.replace(/:\d+(?:-\d+)?$/, '');
      try {
        clean = decodeURI(clean);
      } catch {}
      const abs = path.resolve(path.dirname(d.file), clean);
      if (!fs.existsSync(abs)) errs.push(`${d.rel}: link partido -> ${target}`);
      else if (path.basename(d.file) === 'index.md') linked.add(key(abs));
    }
  }
  const tracked = trackedFiles();
  for (const d of docs()) {
    const isIndex = path.basename(d.file) === 'index.md';
    if (d.rel !== 'docs/index.md' && !linked.has(key(d.file))) warns.push(`${d.rel}: não aparece em nenhum índice`);
    if (isIndex) continue;
    if (!Object.keys(d.fm).length) warns.push(`${d.rel}: sem frontmatter`);
    else if (!d.cobre.length && d.fm.visibilidade !== 'publica') warns.push(`${d.rel}: sem campo cobre`);
    d.cobre.forEach((g, i) => {
      if (!tracked.some((f) => d.rx[i].test(f))) errs.push(`${d.rel}: padrão cobre sem correspondência -> ${g}`);
    });
  }
  console.log(`${docs().length} documento(s) verificados | ${errs.length} erro(s) | ${warns.length} aviso(s)`);
  for (const e of errs) console.log(`ERRO  ${e}`);
  for (const w of warns) console.log(`AVISO ${w}`);
  process.exit(errs.length ? 1 : 0);
}

// ---------- ajuda e despacho ----------
const HELP = `docs-find v${TOOL_VERSION} - diz onde investigar, em vez de ler os índices todos.

Neste repositório:
  search <termos...>      documentos e secções (com linha) relevantes para um tema
  files <caminho...>      documentos que cobrem esses ficheiros de código
  changed [--base ref]    documentos afetados pelas alterações no Git + lacunas + consumidores
  check                   valida índices, links e padrões "cobre"
  routes [filtro]         lista as operações do contrato (método, path, resumo)
  route <path> [método]   extrai só essa operação e os schemas que usa
  schema <Nome>           extrai um schema do contrato

Noutro repositório (consumidor; só lê docs/public):
  --repo <caminho>        ex.: route /users/{id} get --repo ../backend
                          permitido: search, routes, route, schema`;

const commands = {
  search: cmdSearch,
  files: cmdFiles,
  changed: cmdChanged,
  check: cmdCheck,
  routes: cmdRoutes,
  route: cmdRoute,
  schema: cmdSchema,
};
const externalAllowed = new Set(['search', 'routes', 'route', 'schema']);

if (cmd === 'help' || cmd === '--help' || cmd === '-h') die(HELP, 0);
if (!commands[cmd]) die(`Comando desconhecido: ${cmd}\n\n${HELP}`);
if (external && !externalAllowed.has(cmd)) die(`Com --repo só são permitidos: ${[...externalAllowed].join(', ')} (acesso apenas a docs/public).`);
commands[cmd](rest);
