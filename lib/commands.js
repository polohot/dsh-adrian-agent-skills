/**
 * The nine human entry points of the pack.
 *
 * Each row names the skills the command activates. The mapping comes from the
 * upstream `.claude/commands/*.md` files, which state their primary skill in
 * the first instruction. Conditional skills stay out of the list, because the
 * primary skill body already names them and the model loads them on demand.
 * @module dsh-adrian-agent-skills/commands
 */

/** Prefix on every skill name this package registers. */
export const SKILL_PREFIX = 'ags-';

/** Prefix on every slash command this package registers. */
export const COMMAND_PREFIX = 'ags-';

/** Upstream persona files, used as subagent instructions. */
export const PERSONAS = {
  'code-reviewer': 'code-reviewer.md',
  'test-engineer': 'test-engineer.md',
  'security-auditor': 'security-auditor.md',
  'web-performance-auditor': 'web-performance-auditor.md'
};

/**
 * One command row.
 * @typedef {object} CommandRow
 * @property {string} name - full command name, prefix included.
 * @property {string} description - the discovery summary shown in the UI.
 * @property {string} hint - the input hint advertised to capable clients.
 * @property {readonly string[]} skills - full skill names to inject, in order.
 * @property {readonly string[]} personas - persona files to inject, in order.
 * @property {string} [merge] - what the main agent's merge must produce, when the row fans out.
 */

/** @type {readonly CommandRow[]} */
export const COMMANDS = [
  {
    name: 'ags-spec',
    description: 'Define what to build: write the spec before any code',
    hint: '[what you want to build]',
    skills: ['ags-spec-driven-development'],
    personas: []
  },
  {
    name: 'ags-plan',
    description: 'Plan the build as small, atomic tasks',
    hint: '[the spec, or the goal to break down]',
    skills: ['ags-planning-and-task-breakdown'],
    personas: []
  },
  {
    name: 'ags-build',
    description: 'Build one verifiable slice at a time',
    hint: '[the task, or the plan to work through]',
    skills: ['ags-incremental-implementation', 'ags-test-driven-development'],
    personas: []
  },
  {
    name: 'ags-test',
    description: 'Prove it works: tests are the proof',
    hint: '[the behaviour to prove, or the failing case]',
    skills: ['ags-test-driven-development'],
    personas: []
  },
  {
    name: 'ags-constraints',
    description: 'Set the quality bar once and enforce it everywhere',
    hint: '[the project, or the constraint to add]',
    skills: ['ags-constraint-driven-development'],
    personas: []
  },
  {
    name: 'ags-review',
    description: 'Review before merge and improve code health',
    hint: '[the diff, branch, or files to review]',
    skills: ['ags-code-review-and-quality'],
    personas: []
  },
  {
    name: 'ags-webperf',
    description: 'Audit web performance: measure before you optimize',
    hint: '[the URL, page, or build to audit]',
    skills: [],
    personas: ['web-performance-auditor']
  },
  {
    name: 'ags-code-simplify',
    description: 'Simplify the code: clarity over cleverness',
    hint: '[the file or area to simplify]',
    skills: ['ags-code-simplification'],
    personas: []
  },
  {
    name: 'ags-ship',
    description: 'Ship to production with a pre-launch gate',
    hint: '[the release, or the change to ship]',
    skills: ['ags-shipping-and-launch'],
    personas: ['code-reviewer', 'security-auditor', 'test-engineer'],
    merge: 'The merged answer must be one go/no-go decision. Give the blockers, the risks you accept, and a rollback plan with trigger conditions and steps. If a child reports a critical finding, the default verdict is no-go unless the user accepts the risk.'
  }
];
