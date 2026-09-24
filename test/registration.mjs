/**
 * Registration check for dsh-adrian-agent-skills.
 *
 * Mounts the plugin against a fake host and asserts exactly what it registers.
 * This is the only offline test that can see the invocation policy, because the
 * policy is fixed at registration time and the model-facing skill tool refuses
 * anything the policy hides.
 *
 * `lib/index.js` imports two host packages, so this file needs a `node_modules`
 * that resolves them. From a checkout beside a DSH profile:
 *
 *   mkdir -p node_modules/@deepseek-ai
 *   P=<profile>/node_modules/@deepseek-ai     # or $DSH_HOME/profiles/node_modules
 *   ln -sfn "$P/schemastery" node_modules/@deepseek-ai/schemastery
 *   ln -sfn "$P/dsh-llm"     node_modules/@deepseek-ai/dsh-llm
 *
 * Run it with `node test/registration.mjs`. Exit code 0 means every check passed.
 *
 * The split it proves:
 *   - 25 workflow skills and 4 personas are model-only, so the human slash list
 *     stays clean.
 *   - the 9 entry skills are BOTH, because the two usage shapes are both real:
 *     the human picks one from the menu, and the model runs the lifecycle when
 *     the user asks it to manage the work.
 * @module dsh-adrian-agent-skills/test/registration
 */

import { apply } from '../lib/index.js';
import { COMMANDS } from '../lib/commands.js';

/** The largest entry body the design allows. */
const BRIEF_LIMIT = 2500;

const failures = [];
/** Record one check result. */
const check = (ok, label) => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

/**
 * Mount the plugin on a fake host that records every registration.
 *
 * A warning or an error from the plugin is a failure here: the real host logs
 * both, and a silently skipped file is exactly what this test must catch.
 * @param {object} config - the plugin config slice.
 * @returns {{ skills: object[], commands: object[] }} everything it registered.
 */
function mount(config) {
  const skills = [];
  const commands = [];
  const ctx = {
    logger: {
      info: () => {},
      warn: (message) => failures.push(`logger.warn: ${message}`),
      error: (message) => failures.push(`logger.error: ${message}`)
    },
    skills: { register: (definition) => skills.push(definition) },
    commands: { register: (definition) => commands.push(definition) }
  };
  apply(ctx, config);
  return { skills, commands };
}

/** Policy label, for readable output. */
const policyOf = (skill) => `${skill.invocation.modelInvocable ? 'model' : '-'}/${skill.invocation.userInvocable ? 'user' : '-'}`;

const entryNames = new Set(COMMANDS.map((row) => row.name));
const { skills, commands } = mount({});

check(skills.length === 38, `38 skills registered (got ${skills.length})`);
check(commands.length === 0, `0 commands by default (got ${commands.length})`);

const workflow = skills.filter((skill) => !skill.name.startsWith('ags-persona-') && !entryNames.has(skill.name));
const personas = skills.filter((skill) => skill.name.startsWith('ags-persona-'));
const entries = skills.filter((skill) => entryNames.has(skill.name));

check(workflow.length === 25, `25 workflow skills (got ${workflow.length})`);
check(personas.length === 4, `4 persona skills (got ${personas.length})`);
check(entries.length === 9, `9 entry skills (got ${entries.length})`);

check(workflow.every((skill) => policyOf(skill) === 'model/-'), 'every workflow skill is model-only');
check(personas.every((skill) => policyOf(skill) === 'model/-'), 'every persona skill is model-only');
check(entries.every((skill) => policyOf(skill) === 'model/user'), 'every entry skill is model AND user invocable');

check(entries.every((skill) => skill.description.length > 0), 'every entry skill has a description');
check(entries.every((skill) => skill.content.length < BRIEF_LIMIT), `every entry body is under ${BRIEF_LIMIT} chars`);
check(entries.every((skill) => skill.content.includes('subagent')), 'every entry body names the subagent tool');
check(entries.every((skill) => skill.content.includes('already a subagent')), 'every entry body guards against a delegation loop');

const names = skills.map((skill) => skill.name);
check(new Set(names).size === names.length, 'no duplicate skill names');

const enabled = mount({ registerCommands: true });
check(enabled.commands.length === 9, `registerCommands: true yields 9 commands (got ${enabled.commands.length})`);
check(
  enabled.commands.every((command) => entryNames.has(command.name)),
  'every command name matches an entry skill name'
);

const trimmed = mount({ disabledSkills: ['frontend-ui-engineering'] });
check(trimmed.skills.length === 37, `disabledSkills drops one skill (got ${trimmed.skills.length})`);
check(!trimmed.skills.some((skill) => skill.name === 'ags-frontend-ui-engineering'), 'the disabled skill is absent');

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURES`}`);
process.exit(failures.length === 0 ? 0 : 1);
