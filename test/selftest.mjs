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

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURES`}`);
process.exit(failures.length === 0 ? 0 : 1);
