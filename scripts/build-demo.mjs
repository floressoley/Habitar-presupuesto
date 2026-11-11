#!/usr/bin/env node
/*
 * Genera demo/index.html a partir de index.html (sin dependencias).
 *
 *   node scripts/build-demo.mjs
 *
 * La demo se genera QUITANDO todo lo que habla con Supabase, no apagándolo con un if:
 * el archivo resultante no contiene la URL, la clave ni el script de la conexión.
 * Si alguna pieza a quitar no está (porque index.html cambió), el script falla con error
 * en vez de generar una demo a medias. Al final verifica el resultado.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'index.html');
const OUT = resolve(root, 'demo', 'index.html');

const fail = (m) => { console.error(`\n✖ build-demo: ${m}\n`); process.exit(1); };
const count = (s, needle) => s.split(needle).length - 1;

let html = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

// Valores reales que NO pueden quedar en la demo (se leen del original, no están escritos acá).
const realUrl = (html.match(/const SUPABASE_URL='([^']+)'/) || [])[1];
const realKey = (html.match(/const SUPABASE_ANON_KEY='([^']+)'/) || [])[1];
if (!realUrl || !realKey) fail('no encontré SUPABASE_URL / SUPABASE_ANON_KEY en index.html; revisá el generador.');

/* ---------- helpers que exigen exactamente una coincidencia ---------- */
function replaceOnce(label, from, to) {
  const n = count(html, from);
  if (n !== 1) fail(`"${label}": esperaba 1 coincidencia y encontré ${n}.`);
  html = html.replace(from, () => to);
}
function cutBetween(label, startMark, endMark, { keepEnd = true, replacement = '' } = {}) {
  const a = html.indexOf(startMark);
  if (a < 0 || count(html, startMark) !== 1) fail(`"${label}": marcador de inicio no encontrado exactamente una vez.`);
  const b = html.indexOf(endMark, a + startMark.length);
  if (b < 0) fail(`"${label}": marcador de fin no encontrado después del inicio.`);
  const end = keepEnd ? b : b + endMark.length;
  html = html.slice(0, a) + replacement + html.slice(end);
}
function replaceRegexOnce(label, re, to) {
  const m = html.match(new RegExp(re.source, re.flags.replace('g', '') + 'g'));
  if (!m || m.length !== 1) fail(`"${label}": esperaba 1 coincidencia y encontré ${m ? m.length : 0}.`);
  html = html.replace(re, () => to);
}

/* ---------- 1. fuera la conexión ---------- */
replaceRegexOnce('script del CDN de Supabase',
  /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/[^"]*"><\/script>\n/, '');
replaceOnce('LS_KEY', "const LS_KEY='habitar-presupuestador-v1';", "const LS_KEY='habitar-demo-v1';");
cutBetween('bloque de credenciales y CLOUD',
  '/* ---- Conexión compartida (Supabase)',
  "if(CLOUD)document.body.classList.add('cloudwait');\n", { keepEnd: false });

// toda la base compartida (adaptadores, guardado, sync en vivo, login, importMerge)
cutBetween('bloque base compartida + ingreso',
  '/* ====================== base compartida (Supabase) ====================== */',
  '/* ====================== eventos ====================== */');

/* ---------- 2. quitar las ramas CLOUD que quedan ---------- */
replaceOnce('estado inicial', "let S=CLOUD?{v:1,meta:{exampleData:false},counter:0,cfg:defaultCfg(),ambientes:[],catalog:[],budgets:[]}:load();", 'let S=load();');
replaceOnce('save()', 'function save(){if(CLOUD){cloudDirty();return}', 'function save(){');
replaceOnce('editedBy en lista', '${CLOUD?editedBy(b):\'\'}', '');
replaceOnce('texto de la lista',
  "${CLOUD?'Todo se guarda y lo ven los dos al mismo tiempo.':'Todo se guarda en este navegador.'}",
  'Todo se guarda en este navegador.');
replaceRegexOnce('texto de copia de seguridad',
  /\$\{CLOUD\?'Los datos viven en la base compartida\.[^']*':'Los datos viven en este navegador\.[^']*'\}/,
  'Los datos viven en este navegador. Exportá una copia cada tanto, y para pasar todo a otra computadora importala ahí.');
replaceRegexOnce('nextNum',
  /async function nextNum\(\)\{[\s\S]*?\n\}\n/,
  "async function nextNum(){\n  const y=new Date().getFullYear();\n  S.counter++;return `HAB-${y}-${pad(S.counter,3)}`;\n}\n");
replaceOnce('importar copia', '    if(CLOUD){importMerge(o);return}\n', '');
replaceOnce('arranque',
  "$('#logoTop').src=LOGO_CACAO;$('#loginLogo').src=LOGO_CACAO;\nif(CLOUD)cloudBoot();\nelse{setPill('local');render()}",
  `$('#logoTop').src=LOGO_CACAO;
/* ---- demo: banner fijo y reinicio ---- */
const demoBar=$('#demoBar');
function demoSize(){document.documentElement.style.setProperty('--demo-h',demoBar.offsetHeight+'px')}
demoSize();addEventListener('resize',demoSize);
if(window.ResizeObserver)new ResizeObserver(demoSize).observe(demoBar);
$('#demoReset').addEventListener('click',()=>{
  try{localStorage.removeItem(LS_KEY)}catch(e){}
  S=seed();UI.view='list';UI.id=null;render();window.scrollTo(0,0);toast('Demo reset');
});
render();`);

/* ---------- 3. HTML: cabecera sin sesión, sin login, con banner ---------- */
replaceRegexOnce('bloque #who (estado de guardado, usuario, salir)', /      <div id="who">.*<\/div>\n/, '');
replaceRegexOnce('pantalla de ingreso #login', /<div id="login" hidden>[\s\S]*?<\/form><\/div>\n/, '');
replaceOnce('imagen del banner', 'url(assets/textura-hero.jpg)', 'url(../assets/textura-hero.jpg)');

replaceOnce('meta viewport',
  '<meta name="viewport" content="width=device-width,initial-scale=1">\n',
  `<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="Content-Security-Policy" content="connect-src 'none'">
`);

replaceOnce('cierre de estilos', '</style>\n</head>', `
/* ---- demo ---- */
:root{--demo-h:0px}
#demoBar{position:sticky;top:0;z-index:70;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:8px 16px;background:var(--cacao);color:var(--fondo);font-size:13px;line-height:1.35;text-align:center}
#demoBar p{margin:0}
#demoBar .btn{background:var(--fondo);color:var(--cacao);border-color:transparent}
@media(min-width:900px){.ed,.ed[data-pane]{height:calc(100vh - 112px - var(--demo-h));height:calc(100dvh - 112px - var(--demo-h))}}
@media print{#demoBar{display:none!important}}
</style>
</head>`);

replaceOnce('inicio del body', '<body>\n<div class="app" id="app">',
  `<body>
<div id="demoBar" role="note"><p>Demo with sample data. Nothing you type is saved to a server.</p><button class="btn sm" id="demoReset" type="button">Reset demo</button></div>
<div class="app" id="app">`);

/* ---------- 4. verificación del resultado ---------- */
const problems = [];
const forbidden = [
  [/supabase/i, 'menciona "supabase"'],
  [new RegExp(realUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'contiene la URL real de la base'],
  [new RegExp(realKey.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'contiene la clave real'],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'contiene algo con forma de JWT'],
  [/<script[^>]*\ssrc=/i, 'carga un script externo (CDN)'],
  [/habitar-presupuestador-v1/, 'usa la clave de localStorage de la app real'],
  [/avisale a Soley/i, 'conserva el mensaje de login con el nombre'],
  [/signInWith|auth\.signOut|\.rpc\(|\.channel\(|createClient|\bsb\.(from|auth|rpc|channel)\b/, 'conserva llamadas a la nube'],
  [/\bCLOUD\b|cloudBoot|cloudDirty|PREVIEW_LOCAL/, 'conserva lógica de modo nube'],
  [/id="login"|id="logout"/, 'conserva el login o el botón de salir'],
];
for (const [re, why] of forbidden) if (re.test(html)) problems.push(why);
const required = [
  ["const LS_KEY='habitar-demo-v1'", 'clave habitar-demo-v1'],
  ['<meta name="robots" content="noindex, nofollow">', 'meta noindex'],
  ["connect-src 'none'", 'CSP connect-src none'],
  ['Demo with sample data. Nothing you type is saved to a server.', 'texto del banner'],
  ['Reset demo', 'botón Reset demo'],
  ['function seed()', 'datos de ejemplo (seed)'],
];
for (const [s, why] of required) if (!html.includes(s)) problems.push(`falta: ${why}`);

// El JS en línea tiene que compilar.
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) problems.push(`esperaba 1 <script> en línea y hay ${scripts.length}`);
else { try { new vm.Script(scripts[0], { filename: 'demo/index.html' }); } catch (e) { problems.push('el JS generado no compila: ' + e.message); } }

// Sin referencias colgadas a identificadores que se quitaron.
const stripped = ['setPill', 'editedBy', 'nameOf', 'importMerge', 'AD.', 'SNAP', 'flush(', 'id="whoName"', 'id="syncPill"', 'lgEmail', 'loginMsg'];
for (const s of stripped) if (html.includes(s)) problems.push(`quedó una referencia a "${s}"`);

if (problems.length) fail('la verificación del resultado falló:\n  - ' + problems.join('\n  - '));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`✔ demo/index.html generado (${(html.length / 1024).toFixed(0)} KB). Verificación OK: sin URL, clave ni CDN de Supabase; JS compila.`);
