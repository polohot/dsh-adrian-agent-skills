/**
 * Delegation planning for the `/ags-*` entry points.
 *
 * This module holds the pure, host-free half of the plugin: the child plan for
 * one entry row, the delegation brief, and the entry-skill body. It imports
 * nothing from DeepSeek Harness, so `test/selftest.mjs` can check it offline.
 *
 * The text carries skill NAMES, never skill bodies. That is the point of the
 * design: a skill body is 12 KB to 21 KB, and the main agent does not need it.
 * See `docs/delegation-spec.md`.
 * @module dsh-adrian-agent-skills/brief
 */

/** Prefix on every persona skill this package registers. */
export const PERSONA_SKILL_PREFIX = 'ags-persona-';

/** Marks a brief whose request text arrives with the turn, not inside the brief. */
export const REQUEST_FROM_TURN = null;

/**
 * Split one entry row into the children it must start.
 *
 * One persona or none: one child holds every skill the row names. Several
 * personas: one child per persona, each holding the row's skills, because the
 * pack's parallel fan-out keeps every perspective in its own context. The pack
 * states that rule in `references/orchestration-patterns.md`.
 * @param {{ skills: string[], personas: string[] }} row - the entry row.
 * @returns {Array<{ skills: string[], personas: string[] }>} the planned children.
 */
export function planChildren(row) {
  const personas = row.personas ?? [];
  if (personas.length <= 1) {
    return [{ skills: [...row.skills], personas: [...personas] }];
  }
  return personas.map((persona) => ({ skills: [...row.skills], personas: [persona] }));
}

/**
 * Name every skill one child must load, personas included.
 * @param {{ skills: string[], personas: string[] }} child - the planned child.
 * @returns {string[]} the full skill names, in load order.
 */
export function childSkillNames(child) {
  return [
    ...child.skills,
    ...child.personas.map((persona) => `${PERSONA_SKILL_PREFIX}${persona}`)
  ];
}

/**
 * Build the delegation brief.
 *
 * The brief states the child count, the exact skill each child loads, the
 * empty-conversation rule, and the merge rule. The ask-first rule is always
 * present, because a bare invocation carries no request text either way.
 * @param {{ name: string, skills: string[], personas: string[] }} row - the entry row.
 * @param {string | null} request - the request text, `''` for none, or {@link REQUEST_FROM_TURN}.
 * @param {Array<{ skills: string[], personas: string[] }>} children - the planned children.
 * @returns {string} the brief.
 */
export function renderBrief(row, request, children) {
  const fromTurn = request === REQUEST_FROM_TURN;
  const lines = [];
  lines.push('<delegation_required>');
  lines.push('You must delegate this work to subagents. Do not do the work yourself.');
  lines.push('If you are already a subagent, do not delegate again: do the work yourself and');
  lines.push('treat the rest of this brief as done.');
  lines.push('');
  lines.push(`The user ran the /${row.name} entry point.`);
  lines.push('');
  lines.push("The user's request:");
  if (fromTurn) {
    lines.push('(in this turn, as the text beside the skill reference — repeat it word for word)');
  } else {
    lines.push(request === '' ? '(the user gave no text)' : request);
  }
  lines.push('');
  lines.push(`Start ${children.length} ${children.length === 1 ? 'child' : 'children'}:`);
  children.forEach((child, index) => {
    const names = childSkillNames(child).map((skillName) => `\`${skillName}\``).join(', ');
    lines.push(`- Child ${index + 1} loads: ${names}`);
  });
  lines.push('');
  lines.push('How to delegate:');
  lines.push('1. Call the `subagent` tool once per child above. Start every child in one message.');
  lines.push('2. Wait for every child to finish before you end your turn.');
  lines.push('3. Merge the child reports into one short answer for the user.');
  lines.push('');
  lines.push('Each child starts with an EMPTY conversation. It cannot see this conversation, your');
  lines.push('messages, or your files. Write everything it needs into its prompt:');
  lines.push('- Tell it to load its skills with the `skill` tool, by the exact names above.');
  lines.push("- Repeat the user's request word for word.");
  lines.push('- Give the context: the workspace path, the files that matter, the decisions already');
  lines.push('  made, and the constraints that bind the work. Do not summarize these away.');
  lines.push('');
  lines.push('If this turn holds no request text from the user, ask the user one question with the');
  lines.push('`ask_user_question` tool first. Then delegate with the answer.');
  if (children.length > 1) {
    lines.push('');
    lines.push('These children are independent reviewers. Keep their work apart, and merge their');
    lines.push("reports yourself, here. Do not let one child do another child's job.");
  }
  if (typeof row.merge === 'string' && row.merge !== '') {
    lines.push('');
    lines.push(row.merge);
  }
  lines.push('</delegation_required>');
  return lines.join('\n');
}

/**
 * Build the body of one user-invocable entry skill.
 *
 * The body is the same brief the command path injects, with the request text
 * left to the turn. A platform skill invocation injects its body verbatim and
 * cannot run a handler, so this text must stand alone.
 * @param {{ name: string, skills: string[], personas: string[] }} row - the entry row.
 * @returns {string} the skill content.
 */
export function renderEntrySkill(row) {
  return renderBrief(row, REQUEST_FROM_TURN, planChildren(row));
}
