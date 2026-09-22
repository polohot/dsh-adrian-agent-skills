/**
 * Frontmatter reader for the vendored skill files.
 *
 * Every vendored SKILL.md carries exactly two single-line keys, `name` and
 * `description`. This reader handles that shape. It does not parse YAML, so it
 * accepts no nested maps, no lists, and no block scalars.
 * @module dsh-adrian-agent-skills/frontmatter
 */

/** Matches one leading `---` block and captures its lines. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Remove one layer of matching quotes from a scalar value.
 * @param {string} value - the raw scalar text.
 * @returns {string} the value without its surrounding quotes.
 */
function unquote(value) {
  const first = value[0];
  const last = value[value.length - 1];
  const quoted = value.length >= 2 && (first === '"' || first === "'") && last === first;
  return quoted ? value.slice(1, -1) : value;
}

/**
 * Split one skill document into its frontmatter keys and its body.
 *
 * A document without a frontmatter block returns no keys and the whole text as
 * the body, so a caller never loses content to a parse miss.
 * @param {string} text - the complete SKILL.md content.
 * @returns {{ keys: Record<string, string>, body: string }} the parsed keys and the body.
 */
export function parseSkillDocument(text) {
  const match = FRONTMATTER.exec(text);
  if (match === null) return { keys: {}, body: text };
  const keys = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.startsWith(' ') || line.startsWith('\t')) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (value !== '') keys[key] = unquote(value);
  }
  return { keys, body: text.slice(match[0].length) };
}
