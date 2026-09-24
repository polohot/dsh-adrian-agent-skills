/**
 * Offline self-test for dsh-adrian-agent-skills.
 *
 * Checks the vendored catalog, the command table, and the cross-references
 * without a DSH host. Run it with `node test/selftest.mjs`.
 *
 * Exit code 0 means every check passed.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const { parseSkillDocument } = await import(`${PKG}/lib/frontmatter.js`);
const { COMMANDS, PERSONAS, SKILL_PREFIX } = await import(`${PKG}/lib/commands.js`);
const { PERSONA_SKILL_PREFIX, childSkillNames, planChildren, renderBrief } = await import(`${PKG}/lib/brief.js`);

/** The public skill-name grammar from @deepseek-ai/dsh-skill. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The public command-name grammar from @deepseek-ai/dsh-commands. */
const COMMAND_NAME = /^[a-z][a-z0-9_-]*$/;
/** Command names the harness already owns. A new command must not reuse one. */
const BUILTIN_COMMANDS = ['compact', 'export', 'feedback', 'goal', 'permission', 'plan'];

const failures = [];
/** Record one check result. */
const check = (ok, label) => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

const folders = readdirSync(join(PKG, 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
check(folders.length === 25, `25 skill folders (found ${folders.length})`);

const registered = new Set();
for (const folder of folders) {
  const file = join(PKG, 'skills', folder, 'SKILL.md');
  const { keys, body } = parseSkillDocument(readFileSync(file, 'utf8'));
  const full = SKILL_PREFIX + folder;
  const ok = keys.name === folder
    && typeof keys.description === 'string' && keys.description.length > 0
    && body.length > 0
    && SKILL_NAME.test(full);
  check(ok, `skill ${full}`);
  registered.add(full);
}

check(COMMANDS.length === 9, `9 commands (found ${COMMANDS.length})`);
const commandNames = new Set();
for (const row of COMMANDS) {
  const shape = COMMAND_NAME.test(row.name)
    && row.name.startsWith('ags-')
    && row.description.length > 0
    && row.hint.length > 0;
  check(shape && !commandNames.has(row.name), `command ${row.name}`);
  commandNames.add(row.name);
  check(!BUILTIN_COMMANDS.includes(row.name), `  no built-in clash: ${row.name}`);
  check(row.skills.length + row.personas.length > 0, `  ${row.name} loads something`);
  for (const skill of row.skills) check(registered.has(skill), `  ${row.name} -> ${skill}`);
  for (const persona of row.personas) check(PERSONAS[persona] !== undefined, `  ${row.name} -> persona ${persona}`);
}

for (const [persona, file] of Object.entries(PERSONAS)) {
  const path = join(PKG, 'agents', file);
  check(existsSync(path) && readFileSync(path, 'utf8').length > 0, `persona ${persona}`);
}

const missing = new Set();
for (const folder of folders) {
  const text = readFileSync(join(PKG, 'skills', folder, 'SKILL.md'), 'utf8');
  for (const match of text.matchAll(/references\/[a-z0-9-]+\.md/g)) {
    if (!existsSync(join(PKG, match[0]))) missing.add(`${folder}: ${match[0]}`);
  }
}
check(missing.size === 0, `cited references resolve${missing.size ? ` -> ${[...missing].join(', ')}` : ''}`);

// --- Delegation: the brief carries names, never bodies. ---
// Acceptance criteria live in docs/delegation-spec.md.

/** The largest brief the design allows. */
const BRIEF_LIMIT = 2500;
/** Commands whose child count is not 1. */
const EXPECTED_CHILDREN = { 'ags-ship': 3 };
/** Every skill body opens with a level-1 heading. A brief must not contain one. */
const HEADINGS = folders
  .map((folder) => parseSkillDocument(readFileSync(join(PKG, 'skills', folder, 'SKILL.md'), 'utf8')).body)
  .map((body) => body.split(/\r?\n/).find((line) => line.startsWith('# ')))
  .filter(Boolean)
  .map((line) => line.trim());
check(HEADINGS.length === folders.length, `${folders.length} skill body headings collected (found ${HEADINGS.length})`);

for (const [persona] of Object.entries(PERSONAS)) {
  const skillName = `${PERSONA_SKILL_PREFIX}${persona}`;
  check(SKILL_NAME.test(skillName), `persona skill name ${skillName}`);
}

/** Largest injected brief, for the size report. */
let largest = { name: '', length: 0 };
for (const row of COMMANDS) {
  const children = planChildren(row);
  const want = EXPECTED_CHILDREN[row.name] ?? 1;
  check(children.length === want, `${row.name} plans ${want} ${want === 1 ? 'child' : 'children'} (got ${children.length})`);
  check(children.every((child) => childSkillNames(child).length > 0), `  ${row.name} every child loads something`);

  const names = children.flatMap((child) => childSkillNames(child));
  for (const [label, request] of [['request', 'do the thing'], ['empty', '']]) {
    const brief = renderBrief(row, request, children);
    if (brief.length > largest.length) largest = { name: `${row.name} (${label})`, length: brief.length };
    const ok = brief.length < BRIEF_LIMIT
      && names.every((skillName) => brief.includes(skillName))
      && !HEADINGS.some((heading) => brief.includes(heading))
      && (request !== '' || brief.includes('ask_user_question'))
      && (request === '' || brief.includes(request));
    check(ok, `  ${row.name} brief (${label}) ${brief.length} chars, no body, names resolve`);
  }
}

console.log(`\nlargest brief: ${largest.name} at ${largest.length} chars (limit ${BRIEF_LIMIT})`);
console.log(`largest skill body: ${Math.max(...folders.map((f) => readFileSync(join(PKG, 'skills', f, 'SKILL.md'), 'utf8').length))} chars`);
console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURES`}`);
process.exit(failures.length === 0 ? 0 : 1);
