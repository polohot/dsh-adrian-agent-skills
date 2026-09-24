# Delegation spec

## Goal

Keep the main agent's context small. A `/ags-*` command must not put a skill
body into the main agent. The main agent packs context and delegates the work to
one or more children.

## Why

A skill body is 12 KB to 21 KB. The main agent does not need it. A child needs
it, and a child starts with an empty conversation, so the child loads the skill
itself with the `skill` tool.

## Semantics

A command handler injects a **delegation brief**. It does not inject skill
bodies.

The brief holds:

1. The user's request, verbatim.
2. The rule that the main agent must delegate and must not do the work.
3. The child list. Each child names the skills and personas it must load.
4. The context rule. Each child starts with an empty conversation, so the main
   agent writes the workspace path, the relevant files, the decisions, and the
   constraints into the child prompt.
5. The merge rule. The main agent waits for every child, then gives one answer.

## Child map

| Command | Children | Each child loads |
|---|---|---|
| `/ags-spec` | 1 | `ags-spec-driven-development` |
| `/ags-plan` | 1 | `ags-planning-and-task-breakdown` |
| `/ags-build` | 1 | `ags-incremental-implementation`, `ags-test-driven-development` |
| `/ags-test` | 1 | `ags-test-driven-development` |
| `/ags-constraints` | 1 | `ags-constraint-driven-development` |
| `/ags-review` | 1 | `ags-code-review-and-quality` |
| `/ags-code-simplify` | 1 | `ags-code-simplification` |
| `/ags-webperf` | 1 | persona `ags-persona-web-performance-auditor` |
| `/ags-ship` | 3 | `ags-shipping-and-launch` plus one persona each |

`/ags-ship` is the pack's parallel fan-out pattern. The three roles report
apart. The main agent merges. See `references/orchestration-patterns.md`.

## Personas as skills

A child can load only a registered skill. Personas are not registered today, so
this change registers each persona file as a hidden skill named
`ags-persona-<name>`.

The persona skill body is the persona file with the framing line removed. A
child is the persona, so the child must not delegate again.

## Edge cases

- **No request text.** The main agent asks the user one question with the
  `ask_user_question` tool, then delegates with the answer. The turn continues,
  because that tool returns the answer.
- **A skill that does not resolve.** The handler returns an error and injects
  nothing. It never delegates a missing skill.
- **A child that fails.** The main agent reports the failure. It must not
  present a failed child as a finished review.
- **The main agent ignores the brief.** The brief cannot force a tool call. The
  main agent keeps the `subagent` tool and may do the work itself. The wording
  is firm, and the pack's own anti-rationalization tables reinforce it.

## Acceptance criteria

1. The injected message holds no skill body. No `#` heading from a `SKILL.md`
   appears in it.
2. The injected message is under 2500 characters for every command.
3. Every `ags-persona-*` name in a brief resolves as a registered skill.
4. `/ags-ship` names exactly 3 children. `/ags-webperf` names exactly 1.
5. The offline self-test passes with no host.
