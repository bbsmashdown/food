// build.js, Food planner
// Reads recipes/*.md and settings.txt, writes dist/data.json,
// and copies the app (public/) and your photos/PDFs (attachments/) into dist/.
// Run: node build.js   (Cloudflare runs this for you on every GitHub change)

const fs = require('fs');
const path = require('path');

// dinner, breakfast, lunch and side can be planned. The rest only appear in the Recipes tab and can be added as Extras.
const MEALS = ['dinner', 'breakfast', 'lunch', 'side', 'dessert', 'drink', 'sauce'];
// Old values that were removed. They still build (mapped to the new value) and are listed as notes.
const LEGACY_MEALS = { baking: 'dessert', other: 'dessert' };
const notes = [];
const AISLES = ['produce', 'meat', 'dairy', 'dry', 'bread'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const problems = [];

function fail(file, line, msg) { problems.push(`  ${file}${line ? ' (line ' + line + ')' : ''}: ${msg}`); }

// One-line "key: value" frontmatter, same style as your main site.
function parseFrontmatter(raw) {
  const data = {};
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let i = 0, body = lines.join('\n'), bodyStart = 0;
  if (lines[0].trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      const at = lines[i].indexOf(':');
      if (at > 0) data[lines[i].slice(0, at).trim()] = lines[i].slice(at + 1).trim();
      i++;
    }
    bodyStart = i + 1;
    body = lines.slice(bodyStart).join('\n');
  }
  return { data, body, bodyStart };
}

function parseQty(txt) {
  const t = txt.trim();
  if (!t) return NaN;
  // "1 1/2", "1/2", "0.5", "2"
  const parts = t.split(/\s+/);
  let total = 0;
  for (const p of parts) {
    if (/^\d+\/\d+$/.test(p)) { const [n, d] = p.split('/').map(Number); total += n / d; }
    else if (/^\d*\.?\d+$/.test(p)) total += Number(p);
    else return NaN;
  }
  return total;
}

function parseRecipe(file) {
  const id = path.basename(file, '.md');
  const raw = fs.readFileSync(path.join('recipes', file), 'utf8');
  const { data, body, bodyStart } = parseFrontmatter(raw);
  const need = ['title', 'meal', 'prep', 'total', 'serves'];
  for (const k of need) if (!data[k]) fail(file, 0, `missing "${k}:" at the top of the file`);
  let meal = (data.meal || '').toLowerCase();
  if (LEGACY_MEALS[meal]) { notes.push(`${file}: "meal: ${meal}" is no longer used, treated as "${LEGACY_MEALS[meal]}". Please change it.`); meal = LEGACY_MEALS[meal]; }
  else if (data.meal && !MEALS.includes(meal)) fail(file, 0, `"meal:" must be one of ${MEALS.join(', ')} (found "${data.meal}")`);
  for (const k of ['prep', 'total', 'serves']) if (data[k] && !(Number(data[k]) > 0)) fail(file, 0, `"${k}:" must be a number (found "${data[k]}")`);

  const ing = [], steps = [];
  let section = '';
  body.split('\n').forEach((line, idx) => {
    const lineNo = bodyStart + idx + 1;
    const h = line.match(/^##\s+(.+)/);
    if (h) { section = h[1].trim().toLowerCase(); return; }
    const t = line.trim();
    if (!t) return;
    if (section === 'ingredients' && t.startsWith('-')) {
      const parts = t.slice(1).split('|').map(s => s.trim());
      if (parts.length !== 4) { fail(file, lineNo, `ingredient needs 4 parts separated by | (amount | unit | name | aisle). Found: "${t}"`); return; }
      const q = parseQty(parts[0]);
      if (isNaN(q)) { fail(file, lineNo, `amount "${parts[0]}" is not a number`); return; }
      const aisle = parts[3].toLowerCase();
      if (!AISLES.includes(aisle)) { fail(file, lineNo, `aisle "${parts[3]}" must be one of ${AISLES.join(', ')}`); return; }
      if (!parts[2]) { fail(file, lineNo, 'ingredient name is empty'); return; }
      ing.push([q, parts[1], parts[2], aisle]);
    } else if (section === 'steps') {
      const s = t.replace(/^(\d+[.)]|-)\s*/, '');
      if (s) steps.push(s);
    }
  });
  if (!ing.length) fail(file, 0, 'no ingredients found under "## Ingredients"');
  if (!steps.length) fail(file, 0, 'no steps found under "## Steps"');

  // Tags keep the capitalization you typed; two spellings that differ only by case count as one (first one wins).
  const tags = [], seenTag = {};
  const addTag = t => { t = t.trim(); const k = t.toLowerCase(); if (t && !seenTag[k]) { seenTag[k] = 1; tags.push(t); } };
  (data.tags || '').split(',').forEach(addTag);
  // An old "cuisine:" line is no longer a field. If a file still has one, it becomes a tag so nothing is lost.
  if (data.cuisine && !seenTag[data.cuisine.trim().toLowerCase()]) { addTag(data.cuisine); notes.push(`${file}: "cuisine: ${data.cuisine}" is no longer used, converted to the tag "${data.cuisine.trim()}". You can move it to the tags line.`); }

  const srcType = (data.source_type || 'none').toLowerCase();
  return {
    id, meal, t: data.title,
    prep: Number(data.prep), total: Number(data.total), serves: Number(data.serves),
    lastMade: /^\d{4}-\d{2}-\d{2}$/.test(data.last_made || '') ? data.last_made : null,
    tags,
    src: { type: srcType, label: data.source_label || '', url: data.source_url || '' },
    ing, steps
  };
}

function parseSettings() {
  const out = { themes: {}, genres: {}, pantry: [] };
  if (!fs.existsSync('settings.txt')) return out;
  fs.readFileSync('settings.txt', 'utf8').replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const m = t.match(/^(theme|genre|pantry)\s*:\s*(.*)$/i);
    if (!m) { fail('settings.txt', i + 1, `line not understood: "${t}"`); return; }
    const kind = m[1].toLowerCase(), rest = m[2];
    if (kind === 'pantry') { out.pantry.push(...rest.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)); return; }
    const eq = rest.indexOf('=');
    if (eq < 0) { fail('settings.txt', i + 1, 'expected "name = value"'); return; }
    const key = rest.slice(0, eq).trim(), val = rest.slice(eq + 1).trim();
    if (kind === 'theme') {
      const d = DAY_KEYS.indexOf(key.toLowerCase().slice(0, 3));
      if (d < 0) { fail('settings.txt', i + 1, `"${key}" is not a day (use mon, tue, wed, thu, fri, sat, sun)`); return; }
      out.themes[d] = val;
    } else out.genres[key] = val.split(',').map(s => s.trim()).filter(Boolean);
  });
  return out;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

const files = fs.existsSync('recipes') ? fs.readdirSync('recipes').filter(f => f.endsWith('.md')) : [];
const recipes = files.map(parseRecipe);
const settings = parseSettings();

if (problems.length) {
  console.error('\nThe build stopped because of problems in your files:\n' + problems.join('\n') + '\n');
  process.exit(1);
}

if (notes.length) console.log('\nNotes (the build still worked, nothing to do right away):\n' + notes.slice(0, 5).map(n => '  ' + n).join('\n') + (notes.length > 5 ? `\n  ...and ${notes.length - 5} more like these.` : '') + '\n');
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist', { recursive: true });
copyDir('public', 'dist');
copyDir('attachments', path.join('dist', 'attachments'));
const builtAt = new Date().toISOString();
fs.writeFileSync(path.join('dist', 'data.json'), JSON.stringify({ builtAt, recipes, settings }));
console.log(`built ${recipes.length} recipes (${MEALS.map(m => recipes.filter(r => r.meal === m).length + ' ' + m).join(', ')})`);
