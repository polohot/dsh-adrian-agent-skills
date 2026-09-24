# dsh-adrian-agent-skills

The [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) pack
for DeepSeek Harness. It brings 25 engineering lifecycle skills and exposes them
through 9 `/ags-*` slash commands.

The pack covers the whole lifecycle: define, plan, build, verify, review, ship.

## Install

```sh
dsh plugin --profile web add github:polohot/dsh-adrian-agent-skills
```

Restart DSH after the install, so the loader composes the new bundle.

Pin a tag for a stable install:

```sh
dsh plugin --profile web add github:polohot/dsh-adrian-agent-skills#v0.1.0
```

The package is not on npm, so a bare `add dsh-adrian-agent-skills` does not
resolve. Use the `github:` form above.

## Entry points

Nine **skills** are the human surface of the pack. They appear in the Skills menu,
and they are the only names you see. Each one **delegates its work to a subagent**:

```
/ags-spec        /ags-plan       /ags-build     /ags-test
/ags-constraints /ags-review     /ags-webperf   /ags-code-simplify
/ags-ship
```

The main agent never loads a skill body. A skill body is 12 KB to 21 KB, and the
main agent does not need it. The entry skill injects a short delegation brief
instead: the child count, the exact skill each child loads, and the rules for
context and merging. The main agent packs the context, starts the children,
waits, and merges their reports. See
[docs/delegation-spec.md](docs/delegation-spec.md).

Each workflow follows the upstream command exactly. The only change is where it
runs: upstream runs it in the main agent, and this port runs it in a child.

The entry skills are `modelInvocable: true` and `userInvocable: true`. Both usage
shapes are real: you pick one from the menu, or you ask the main agent to manage
the lifecycle and it picks one itself.

The 29 workflow skills stay out of your menu, so it holds exactly 9 names.

A delegation loop cannot run away. The brief tells the main agent to stop when it
is already a subagent, and the platform caps delegation depth at 3.

| Entry skill | What it does | Children | Each child loads |
|---|---|---|---|
| `/ags-spec` | Write the spec before any code | 1 | `ags-spec-driven-development` |
| `/ags-plan` | Break the work into small, atomic tasks | 1 | `ags-planning-and-task-breakdown` |
| `/ags-build` | Build one verifiable slice at a time | 1 | `ags-incremental-implementation`, `ags-test-driven-development` |
| `/ags-test` | Prove the behaviour with tests | 1 | `ags-test-driven-development` |
| `/ags-constraints` | Set the quality bar and enforce it | 1 | `ags-constraint-driven-development` |
| `/ags-review` | Review before merge | 1 | `ags-code-review-and-quality` |
| `/ags-webperf` | Audit web performance | 1 | `ags-persona-web-performance-auditor` |
| `/ags-code-simplify` | Simplify without changing behaviour | 1 | `ags-code-simplification` |
| `/ags-ship` | Run the pre-launch gate | 3 | `ags-shipping-and-launch` plus one persona each |

`/ags-ship` is upstream's parallel fan-out. The three roles report apart, and the
main agent merges them into one go/no-go decision with a rollback plan. See
`references/orchestration-patterns.md`.

Pick the entry skill, then add your request beside it:

```
/ags-test cover store.js, including the empty-title case
```

The same 9 names are also available as slash commands, for a host that wants
them. That path is off by default. Turn it on in the bundle patch:

```yaml
- id: dsh-adrian-agent-skills
  config:
    registerCommands: true
```

## Skills

All 25 skills are registered with the `ags-` prefix. The 4 personas are
registered as `ags-persona-*` skills, so a child can load one by name. All 29
stay `modelInvocable: true` and `userInvocable: false`. The model finds and loads
them on its own. They do not appear in your slash list, and they cannot collide
with a skill from another pack.

A child starts with an empty conversation. It cannot see your chat, your files,
or the main agent's messages. Tell the main agent what the child needs, or let
the brief remind it.

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
| `lib/brief.js` | Host-free delegation planning: the child plan and the injected brief |
| `lib/commands.js` | The 9 command rows and their skill mapping |
| `lib/frontmatter.js` | Reads `name` and `description` from a SKILL.md |
| `skills/` | The 25 skills, with the `idea-refine` support files |
| `references/` | 9 checklists that the skills cite |
| `agents/` | 4 personas, registered as `ags-persona-*` skills |
| `docs/delegation-spec.md` | The delegation contract and its acceptance criteria |
| `test/selftest.mjs` | The offline checks, including the brief size and body-leak checks |
| `test/registration.mjs` | Mounts the plugin on a fake host and proves all 38 skills and their policy |

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

This package is a port. It changes the packaging and the delivery:

1. Skill names gain the `ags-` prefix.
2. Skills register as model-invocable and not user-invocable.
3. The 9 commands become DSH commands, and their names gain the `ags-` prefix.
4. The 4 personas register as `ags-persona-*` skills, and each command delegates
   its work to a child that loads them.
5. Two checklists move from a skill folder to the shared `references/` folder.

The skill bodies, the checklists, and the persona documents are unchanged.

License: MIT. See `LICENSE`.
