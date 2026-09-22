# dsh-adrian-agent-skills

The [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) pack
for DeepSeek Harness. It brings 25 engineering lifecycle skills and exposes them
through 9 `/ags-*` slash commands.

The pack covers the whole lifecycle: define, plan, build, verify, review, ship.

## Install

```sh
dsh plugin --profile web add -w /path/to/dsh-adrian-agent-skills
```

Restart DSH after the install, so the loader composes the new bundle.

## Commands

Nine commands are visible to you. Each one loads the skills it needs and starts a
turn.

| Command | What it does | Loads |
|---|---|---|
| `/ags-spec` | Write the spec before any code | `ags-spec-driven-development` |
| `/ags-plan` | Break the work into small, atomic tasks | `ags-planning-and-task-breakdown` |
| `/ags-build` | Build one verifiable slice at a time | `ags-incremental-implementation`, `ags-test-driven-development` |
| `/ags-test` | Prove the behaviour with tests | `ags-test-driven-development` |
| `/ags-constraints` | Set the quality bar and enforce it | `ags-constraint-driven-development` |
| `/ags-review` | Review before merge | `ags-code-review-and-quality` |
| `/ags-webperf` | Audit web performance | `web-performance-auditor` persona |
| `/ags-code-simplify` | Simplify without changing behaviour | `ags-code-simplification` |
| `/ags-ship` | Run the pre-launch gate | `ags-shipping-and-launch`, then 3 personas |

Type the command alone, or add a request after it:

```
/ags-test cover store.js, including the empty-title case
```

## Skills

All 25 skills are registered with the `ags-` prefix. They stay
`modelInvocable: true` and `userInvocable: false`. The model finds and loads them
on its own. They do not appear in your slash list, and they cannot collide with a
skill from another pack.

| Phase | Skills |
|---|---|
| Meta | `ags-using-agent-skills` |
| Define | `ags-interview-me`, `ags-idea-refine`, `ags-spec-driven-development`, `ags-constraint-driven-development` |
| Plan | `ags-planning-and-task-breakdown` |
| Build | `ags-context-engineering`, `ags-source-driven-development`, `ags-doubt-driven-development`, `ags-incremental-implementation`, `ags-test-driven-development`, `ags-frontend-ui-engineering`, `ags-api-and-interface-design` |
| Verify | `ags-browser-testing-with-devtools`, `ags-debugging-and-error-recovery` |
| Review | `ags-code-review-and-quality`, `ags-code-simplification`, `ags-security-and-hardening`, `ags-performance-optimization` |
| Ship | `ags-git-workflow-and-versioning`, `ags-ci-cd-and-automation`, `ags-deprecation-and-migration`, `ags-documentation-and-adrs`, `ags-observability-and-instrumentation`, `ags-shipping-and-launch` |

## Config

The bundle patch accepts two options:

```yaml
- insert:
    - id: dsh-adrian-agent-skills
      name: dsh-adrian-agent-skills
      config:
        registerCommands: true
        disabledSkills: []
```

- `registerCommands` — set false to load the skills without the 9 commands.
- `disabledSkills` — upstream folder names to skip, for example
  `[frontend-ui-engineering]`.

## Layout

| Path | Content |
|---|---|
| `lib/index.js` | Plugin entry. Loads the catalog, registers skills and commands |
| `lib/commands.js` | The 9 command rows and their skill mapping |
| `lib/frontmatter.js` | Reads `name` and `description` from a SKILL.md |
| `skills/` | The 25 skills, with the `idea-refine` support files |
| `references/` | 9 checklists that the skills cite |
| `agents/` | 4 personas, used as subagent instructions |

A skill body cites a checklist as `references/security-checklist.md`. The plugin
sets the skill resource base to the package root, so every cited path resolves
from one base.

Upstream keeps two of the nine checklists inside their own skill folder. This
port moves them to the shared `references/` folder, because
`security-and-hardening` cites both a local file and a shared file. One base
directory cannot resolve both, and this is the portability gap that upstream
tracks in issue #361.

## Uninstall

```sh
dsh plugin --profile web remove dsh-adrian-agent-skills
```

Restart DSH after the removal. The plugin writes no files, so nothing is left
behind.

## Credits and license

The skills, checklists, personas, and command intent come from
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) by Addy
Osmani and contributors, under the MIT license.

- Upstream commit: `dc27a9c2e13721158157632de61b4106c6c2a2a1`
- Upstream date: 2026-09-20

This package is a port. It changes the packaging only:

1. Skill names gain the `ags-` prefix.
2. Skills register as model-invocable and not user-invocable.
3. The 9 commands become DSH commands, and their names gain the `ags-` prefix.
4. The 4 personas ride subagent instructions instead of Claude Code subagents.
5. Two checklists move from a skill folder to the shared `references/` folder.

The skill bodies, the checklists, and the persona documents are unchanged.

License: MIT. See `LICENSE`.
