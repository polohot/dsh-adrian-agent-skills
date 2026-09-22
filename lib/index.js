/**
 * dsh-adrian-agent-skills — the addyosmani/agent-skills engineering lifecycle
 * pack for DeepSeek Harness.
 *
 * The plugin registers 25 lifecycle skills as `ags-*` skills and 9 `ags-*`
 * slash commands. Every skill keeps `modelInvocable: true` and
 * `userInvocable: false`, so the model discovers and loads them while the
 * human-facing command list shows only the 9 entry points.
 *
 * A command handler injects the mapped skill bodies into the session and wakes
 * the agent, which mirrors the host's own user-explicit skill invocation.
 *
 * The catalog loads synchronously inside `apply`. Registration order is
 * therefore deterministic, and no session can observe a half-built catalog.
 * Named exports preserve loader injection metadata.
 * @module dsh-adrian-agent-skills
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { renderSkillContent } from '@deepseek-ai/dsh-skill';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { parseSkillDocument } from './frontmatter.js';
import { COMMANDS, PERSONAS, SKILL_PREFIX } from './commands.js';

export const name = 'dsh-adrian-agent-skills';
export const inject = ['skills', 'commands'];

/** Absolute package root. Every relative resource in a skill resolves here. */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS_ROOT = join(PACKAGE_ROOT, 'skills');
const AGENTS_ROOT = join(PACKAGE_ROOT, 'agents');
/** Tells the model how to resolve a cited `references/...` path. */
const RESOURCE_BASE = { kind: 'directory', path: PACKAGE_ROOT };
/** The declared message source for an injection that carries no skill body. */
const PLUGIN_SOURCE = { kind: 'plugin', plugin: name, form: 'instructions' };

/** Schemastery schema for the user-writable slice. */
export const Config = z.object({
  registerCommands: z.boolean().default(true),
  disabledSkills: z.array(z.string()).default([])
});

/**
 * Read every vendored skill directory and parse its SKILL.md.
 *
 * A directory without a readable SKILL.md is reported and skipped, so one
 * broken file cannot stop the other 24 from loading. The mount fails only when
 * nothing at all loads.
 * @param {(message: string) => void} warn - sink for a skipped file.
 * @returns {Array<{ folder: string, description: string, body: string, path: string }>} the parsed skills.
 */
function loadVendoredSkills(warn) {
  const loaded = [];
  for (const entry of readdirSync(SKILLS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(SKILLS_ROOT, entry.name, 'SKILL.md');
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch (error) {
      warn(`cannot read ${path}: ${String(error)}`);
      continue;
    }
    const { keys, body } = parseSkillDocument(text);
    const description = keys.description ?? '';
    if (description === '') {
      warn(`${path} has no description, skipped`);
      continue;
    }
    loaded.push({ folder: entry.name, description, body, path });
  }
  return loaded;
}

/**
 * Read every upstream persona file once at boot.
 * @param {(message: string) => void} warn - sink for a missing file.
 * @returns {Map<string, string>} persona name to persona text.
 */
function loadPersonas(warn) {
  const loaded = new Map();
  for (const [persona, file] of Object.entries(PERSONAS)) {
    try {
      loaded.set(persona, readFileSync(join(AGENTS_ROOT, file), 'utf8'));
    } catch (error) {
      warn(`cannot read persona ${file}: ${String(error)}`);
    }
  }
  return loaded;
}

/**
 * Wrap one persona as model-facing instructions.
 * @param {string} persona - the persona name.
 * @param {string} text - the persona document.
 * @returns {string} the framed persona block.
 */
function renderPersona(persona, text) {
  return [
    `<agent_persona name="${persona}">`,
    text,
    '</agent_persona>',
    '',
    'Run this persona in a subagent through the `subagent` tool. Give the subagent every input it needs.',
    'Do not let one persona delegate to another.'
  ].join('\n');
}

/**
 * Register every vendored skill, prefixed and hidden from the human surfaces.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {Array<{ folder: string, description: string, body: string, path: string }>} skills - parsed skills.
 * @param {ReadonlySet<string>} disabled - upstream folder names to skip.
 * @returns {string[]} the registered skill names.
 */
function registerSkills(ctx, skills, disabled) {
  const registered = [];
  for (const skill of skills) {
    if (disabled.has(skill.folder)) continue;
    const skillName = `${SKILL_PREFIX}${skill.folder}`;
    ctx.skills.register({
      name: skillName,
      description: skill.description,
      content: skill.body,
      path: skill.path,
      source: 'bundled',
      resourceBase: RESOURCE_BASE,
      invocation: { modelInvocable: true, userInvocable: false }
    });
    registered.push(skillName);
  }
  return registered;
}

/**
 * Build the model-facing text for one command invocation.
 *
 * The user's own words come first, then the instructions. An empty request
 * still injects the instructions, so the skill decides what to ask for.
 * @param {string} request - the text the user typed after the command.
 * @param {readonly string[]} blocks - rendered skill and persona blocks.
 * @returns {string} the message body.
 */
function composeMessage(request, blocks) {
  const body = blocks.join('\n\n');
  return request === '' ? body : `${request}\n\n${body}`;
}

/**
 * Resolve the instructions of one command.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {import('./commands.js').CommandRow} row - the command row.
 * @param {object} invocation - the command invocation from the registry.
 * @param {Map<string, string>} personas - persona name to persona text.
 * @returns {Promise<{ text: string, loaded: string[] }>} the rendered blocks and their names.
 */
async function resolveInstructions(ctx, row, invocation, personas) {
  const { agent, signal } = invocation;
  const lookup = { cwd: agent.session.header.cwd, signal, scope: agent };
  const blocks = [];
  const loaded = [];
  for (const skillName of row.skills) {
    const skill = await ctx.skills.get(skillName, lookup);
    signal.throwIfAborted();
    if (skill === undefined) continue;
    blocks.push(renderSkillContent(skill));
    loaded.push(skillName);
  }
  for (const persona of row.personas) {
    const text = personas.get(persona);
    if (text === undefined) continue;
    blocks.push(renderPersona(persona, text));
    loaded.push(`persona:${persona}`);
  }
  return { text: composeMessage(invocation.rawInput.trim(), blocks), loaded };
}

/**
 * Run one slash command: resolve its instructions, inject them, and wake the agent.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {import('./commands.js').CommandRow} row - the command row.
 * @param {Map<string, string>} personas - persona name to persona text.
 * @param {object} invocation - the command invocation from the registry.
 * @returns {Promise<{ kind: 'success', text: string } | { kind: 'error', text: string }>} the rendered outcome.
 */
async function runCommand(ctx, row, personas, invocation) {
  const { text, loaded } = await resolveInstructions(ctx, row, invocation, personas);
  if (loaded.length === 0) {
    return { kind: 'error', text: `${row.name} loaded no instructions. Reinstall the package.` };
  }
  const carriesSkill = row.skills.length > 0 && loaded[0] === row.skills[0];
  invocation.agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: carriesSkill
      ? { kind: 'skill-invocation', name: row.skills[0], form: 'instructions' }
      : PLUGIN_SOURCE
  }));
  return { kind: 'success', text: `${row.name} loaded ${loaded.join(', ')}` };
}

/**
 * Register the 9 human entry points.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {readonly import('./commands.js').CommandRow[]} rows - the command table.
 * @param {Map<string, string>} personas - persona name to persona text.
 * @returns {string[]} the registered command names.
 */
function registerCommands(ctx, rows, personas) {
  const registered = [];
  for (const row of rows) {
    ctx.commands.register({
      name: row.name,
      description: row.description,
      input: { hint: row.hint, attachments: true },
      handler: (invocation) => runCommand(ctx, row, personas, invocation)
    });
    registered.push(row.name);
  }
  return registered;
}

/**
 * Mount the pack: load the catalog, register the skills, then the commands.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {object} [config] - the row config from the bundle patch.
 */
export function apply(ctx, config = {}) {
  const settings = Config(config);
  const warn = (message) => ctx.logger?.warn?.(`${name}: ${message}`);
  const vendored = loadVendoredSkills(warn);
  if (vendored.length === 0) {
    ctx.logger?.error?.(`${name}: no skills found under ${SKILLS_ROOT}. The package is incomplete.`);
    return;
  }
  const personas = loadPersonas(warn);
  const skills = registerSkills(ctx, vendored, new Set(settings.disabledSkills));
  const commands = settings.registerCommands ? registerCommands(ctx, COMMANDS, personas) : [];
  ctx.logger?.info?.(`${name}: registered ${skills.length} skills and ${commands.length} commands`);
}
