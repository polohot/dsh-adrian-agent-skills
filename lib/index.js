/**
 * dsh-adrian-agent-skills — the addyosmani/agent-skills engineering lifecycle
 * pack for DeepSeek Harness.
 *
 * The plugin registers 25 lifecycle skills as `ags-*` skills, 4 personas as
 * `ags-persona-*` skills, and 9 `ags-*` entry skills. The 29 workflow skills
 * stay `modelInvocable: true` and `userInvocable: false`, so the model finds
 * them and the human slash list stays clean. The 9 entry skills are the only
 * names the user sees, and the model may invoke them too, so the user can also
 * ask the main agent to run a whole lifecycle.
 *
 * Invoking an entry skill injects a DELEGATION BRIEF, never a skill body. A
 * skill body is 12 KB to 21 KB, and the main agent does not need it: the child
 * loads the skill itself. The main agent only packs context and merges the
 * results. The host-free half of that logic lives in `lib/brief.js`. See
 * `docs/delegation-spec.md`.
 *
 * The 9 slash commands stay available behind `registerCommands`, which defaults
 * to false, because the entry skills already cover the human surface.
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
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { parseSkillDocument } from './frontmatter.js';
import { COMMANDS, PERSONAS, SKILL_PREFIX } from './commands.js';
import { PERSONA_SKILL_PREFIX, childSkillNames, planChildren, renderBrief, renderEntrySkill } from './brief.js';

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
  registerCommands: z.boolean().default(false),
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
 *
 * A child can load only a registered skill, so each persona becomes one. The
 * body drops the upstream delegation framing: a child IS the persona, and the
 * pack rule says a persona must not invoke another persona.
 * @param {(message: string) => void} warn - sink for a missing file.
 * @returns {Map<string, { description: string, body: string, path: string }>} persona name to its parsed file.
 */
function loadPersonas(warn) {
  const loaded = new Map();
  for (const [persona, file] of Object.entries(PERSONAS)) {
    const path = join(AGENTS_ROOT, file);
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch (error) {
      warn(`cannot read persona ${file}: ${String(error)}`);
      continue;
    }
    const { keys, body } = parseSkillDocument(text);
    const description = keys.description ?? '';
    if (description === '') {
      warn(`${path} has no description, skipped`);
      continue;
    }
    loaded.set(persona, { description, body, path });
  }
  return loaded;
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
 * Register every persona as a hidden skill, so a child can load it by name.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {Map<string, { description: string, body: string, path: string }>} personas - parsed personas.
 * @returns {string[]} the registered persona skill names.
 */
function registerPersonaSkills(ctx, personas) {
  const registered = [];
  for (const [persona, parsed] of personas) {
    const skillName = `${PERSONA_SKILL_PREFIX}${persona}`;
    ctx.skills.register({
      name: skillName,
      description: parsed.description,
      content: parsed.body,
      path: parsed.path,
      source: 'bundled',
      resourceBase: RESOURCE_BASE,
      invocation: { modelInvocable: true, userInvocable: false }
    });
    registered.push(skillName);
  }
  return registered;
}

/**
 * Register the 9 entry skills: the human-facing surface of the pack.
 *
 * Each one is BOTH user-invocable and model-invocable, because the two usage
 * shapes are both real: the human picks an entry point from the menu, and the
 * model runs the lifecycle itself when the user asks it to manage the work.
 *
 * A delegation loop is still impossible in practice. The brief tells the main
 * agent to stop when it is already a child, and the platform caps delegation
 * depth at 3.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {readonly import('./commands.js').CommandRow[]} rows - the entry table.
 * @returns {string[]} the registered entry-skill names.
 */
function registerEntrySkills(ctx, rows) {
  const registered = [];
  for (const row of rows) {
    ctx.skills.register({
      name: row.name,
      description: row.description,
      content: renderEntrySkill(row),
      source: 'bundled',
      resourceBase: RESOURCE_BASE,
      invocation: { modelInvocable: true, userInvocable: true }
    });
    registered.push(row.name);
  }
  return registered;
}

/**
 * Resolve one command into its children and confirm every named skill exists.
 *
 * Verification only: the body of a skill is never read into the brief, so a
 * missing name fails loud instead of reaching a child that cannot load it.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {import('./commands.js').CommandRow} row - the command row.
 * @param {object} invocation - the command invocation from the registry.
 * @returns {Promise<{ children: Array<{ skills: string[], personas: string[] }>, missing: string[] }>} the plan and any unresolvable names.
 */
async function resolveChildren(ctx, row, invocation) {
  const { agent, signal } = invocation;
  const lookup = { cwd: agent.session.header.cwd, signal, scope: agent };
  const children = planChildren(row);
  const missing = [];
  for (const child of children) {
    for (const skillName of childSkillNames(child)) {
      const skill = await ctx.skills.get(skillName, lookup);
      signal.throwIfAborted();
      if (skill === undefined && !missing.includes(skillName)) missing.push(skillName);
    }
  }
  return { children, missing };
}

/**
 * Run one slash command: plan the children, inject the brief, then wake the agent.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {import('./commands.js').CommandRow} row - the command row.
 * @param {object} invocation - the command invocation from the registry.
 * @returns {Promise<{ kind: 'success', text: string } | { kind: 'error', text: string }>} the rendered outcome.
 */
async function runCommand(ctx, row, invocation) {
  const { children, missing } = await resolveChildren(ctx, row, invocation);
  if (missing.length > 0) {
    return { kind: 'error', text: `${row.name} cannot delegate: unresolved ${missing.join(', ')}. Reinstall the package.` };
  }
  const request = invocation.rawInput.trim();
  invocation.agent.followup(createUserMessage({
    content: [{ type: 'text', text: renderBrief(row, request, children) }],
    source: PLUGIN_SOURCE
  }));
  const names = children.map((child) => childSkillNames(child).join('+')).join(', ');
  const plural = children.length === 1 ? 'child' : 'children';
  return { kind: 'success', text: `${row.name} delegated ${children.length} ${plural}: ${names}` };
}

/**
 * Register the 9 human entry points.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {readonly import('./commands.js').CommandRow[]} rows - the command table.
 * @returns {string[]} the registered command names.
 */
function registerCommands(ctx, rows) {
  const registered = [];
  for (const row of rows) {
    ctx.commands.register({
      name: row.name,
      description: row.description,
      input: { hint: row.hint, attachments: true },
      handler: (invocation) => runCommand(ctx, row, invocation)
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
  const personaSkills = registerPersonaSkills(ctx, personas);
  const entries = registerEntrySkills(ctx, COMMANDS);
  const commands = settings.registerCommands ? registerCommands(ctx, COMMANDS) : [];
  ctx.logger?.info?.(`${name}: registered ${skills.length} skills, ${personaSkills.length} personas, ${entries.length} entry skills and ${commands.length} commands`);
}
