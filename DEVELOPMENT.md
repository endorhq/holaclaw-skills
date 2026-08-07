# Development

How to add, change and release skills in this catalog.

`main` is the source of truth. Everything you edit lives here, and a GitHub Action mirrors each skill to its own
branch so `openclaw skills install` can find it. You never touch those branches by hand.

## Requirements

Node 18 or newer, and git. There are no dependencies to install — the scripts use only the standard library and
git plumbing.

## Layout

```
main
├── browser-navigation/          one directory per skill
│   ├── SKILL.md                 the skill, with frontmatter
│   └── README.md                prose body of the published README
├── scripts/                     the publishing automation
├── LICENSE                      shipped with every skill
└── README.md                    catalog, with a generated table
```

## Anatomy of a skill

A directory is a skill when it contains a `SKILL.md`. The directory name becomes the branch name, so it must be
lowercase kebab-case.

**`SKILL.md`** — the skill itself. Its frontmatter must be flat `key: value` pairs:

```yaml
---
name: browser-navigation      # must equal the directory name
description: "…"              # what OpenClaw matches against to trigger the skill
version: 1.0.0                # semver, MAJOR.MINOR.PATCH
---
```

Two optional keys: `title` overrides the heading of the published README (default: the directory name in title
case), and `summary` overrides the catalog blurb (default: the first sentence of the skill's `README.md`).

**`README.md`** — the prose body of the published README. Write only the description of the skill; the install
instructions, the link back to this catalog, and the license section are appended automatically.

Anything else in the directory (`references/`, `scripts/`, `assets/`, …) ships with the skill untouched, with
two exceptions: dotfiles and OS junk (`.DS_Store`, `Thumbs.db`) are never published, and a symlink fails the
run — publish branches only carry regular files.

## Adding a skill

1. Create `<skill-name>/` with a `SKILL.md` and a `README.md` as described above. Start at `version: 1.0.0`.
2. Run `node scripts/gen-readme.mjs` to refresh the catalog table in the root `README.md`.
3. Run `node scripts/publish.mjs` to check it plans cleanly.
4. Open a pull request.

On merge, the action creates the `<skill-name>` branch and the `<skill-name>-v1.0.0` tag.

## Updating a skill

1. Edit the files under `<skill-name>/`.
2. **Bump `version:` in its `SKILL.md`.** Nothing infers this for you — see below.
3. Run `node scripts/gen-readme.mjs` if the version or summary changed.
4. Run `node scripts/publish.mjs` as a pre-flight.
5. Open a pull request.

On merge, the action appends one commit to the `<skill-name>` branch and creates `<skill-name>-v<version>`.

Only the skill you touched is republished. The publisher runs over every skill on every push, but each one is a
no-op unless its content actually changed, so a change to one skill never disturbs the others.

## Versioning

Versions are declared, not inferred, so a release is always a deliberate act that shows up in code review.

The rules the automation enforces:

- **Skill content changed, version already tagged** → the run fails and asks you to bump. Tags are never moved
  or overwritten.
- **Skill content changed, version bumped** → new branch commit, new tag.
- **Version lower than an existing tag** → the run fails. The branch head is what `@<skill>` installs, so a
  downgrade would silently ship an older release as "latest". Versions only move forward.
- **Nothing changed** → nothing happens.
- **Only the shared boilerplate changed** — the README template in `scripts/lib/skills.mjs`, or the root
  `LICENSE` — → every branch is refreshed with a `(republish)` commit and **no** new tag. Rewording the install
  instructions is not a new version of anyone's skill.

That last case works because each publish commit records a `Source-Tree` trailer: the hash of the skill
directory exactly as authored. The next run compares against it to tell "the author changed something" apart
from "the wrapper changed".

## Running the automation locally

```bash
node scripts/gen-readme.mjs           # rewrite the catalog table in README.md
node scripts/gen-readme.mjs --check   # exit 1 if the table is stale (what CI runs)

node scripts/publish.mjs              # plan every skill, change nothing
node scripts/publish.mjs --write      # update local refs
node scripts/publish.mjs --write --push
node scripts/publish.mjs --skill browser-navigation
```

`publish.mjs` with no flags is a dry run and is the same planner CI uses, so it catches a missing version bump
before you push. This matters most when committing straight to `main`, where the pull request check never runs.

The publisher builds its trees in a scratch index and never touches your working tree, so it is safe to run on a
dirty checkout. Even the dry run needs a git identity (`user.name` / `user.email`), because the planner builds
real (unreferenced) commit objects to compare trees.

If you run `--write` without `--push`, nothing is lost: the next `--write --push` pushes every local publish ref
the remote is missing, not just what changed in that run. Pushes are `--atomic`, so a failure publishes nothing
rather than half the skills.

## CI

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `check.yml` | pull requests | Fails on a stale catalog table, invalid frontmatter, or content changed without a version bump. |
| `publish-skills.yml` | push to `main` | Publishes branches and tags. Also runs the catalog check first. |

`publish-skills.yml` also accepts a manual `workflow_dispatch` with two inputs: `skill` to limit the run to one
skill, and `reset_branch` to re-root a branch as an orphan. `reset_branch` rewrites history and therefore
requires `skill` — the publisher refuses to re-root more than one branch per run.

Two repository rulesets back the publisher's guarantees against direct pushes: release tags (`*-v*`) cannot be
updated or deleted, and non-`main` single-segment branches (the publish branches) cannot be deleted or
force-pushed. Repository admins are the only bypass. This means a `reset_branch` run fails in CI at the push —
re-rooting is a rare, deliberate act, so run it locally as an admin
(`node scripts/publish.mjs --write --push --reset-branch --skill NAME`) instead.

Runs are serialised through a `concurrency` group so two merges cannot race on the same branch push. The action
pushes with `GITHUB_TOKEN`, which by design does not re-trigger workflows, so publishing cannot loop.

Each job declares its own `permissions` rather than inheriting the repository default: `check.yml` is read-only,
and only the publish job gets `contents: write`. This is required here, not just hygiene — the organization pins
the default token to read-only, which is a starting point a workflow can raise, not a cap.

## Published branches

Each branch is an **orphan**: it shares no history with `main` and contains only the skill's files plus
`LICENSE`. Cloning one is cheap, and its history reads as that skill's changelog.

```
main                              branch: browser-navigation
├── browser-navigation/           ├── SKILL.md
│   ├── SKILL.md          ──▶     ├── README.md   (generated)
│   └── README.md                 └── LICENSE
├── LICENSE                       tag: browser-navigation-v1.0.0
└── README.md
```

Never commit to a publish branch. The next release overwrites whatever is there, and the publisher refuses to
build on a branch that shares history with `main`.

Because branches are named after directories, git treats `browser-navigation` as ambiguous in commands that
accept both a revision and a path. Use `git log browser-navigation --` to disambiguate.

## Removing or renaming a skill

Deleting a skill directory does **not** delete its published branch — that would break every existing install.
The branch simply stops receiving updates. Delete it manually only if you are certain nobody has installed it.

A rename is a new skill: it publishes to a new branch, and the old branch is left frozen. Update `name:` in the
frontmatter to match the new directory name, or the run fails.

## Troubleshooting

**`<skill>/ changed but <skill>-vX.Y.Z is already published`**
You edited the skill without bumping `version:` in its `SKILL.md`. Bump it.

**`README.md catalog is stale`**
Run `node scripts/gen-readme.mjs` and commit the result.

**`branch "<skill>" shares history with <sha> and is not an orphan`**
Something committed to the publish branch directly, or the branch predates this automation. Re-run with
`--reset-branch --skill <skill>` to re-root it. This rewrites that branch, which the branch ruleset only allows
for repository admins — run it locally, not through CI.

**`local "<skill>" and "origin/<skill>" have diverged`**
You ran `--write` without `--push` and the remote moved on. Delete the local branch and re-run.

**`cannot determine owner/repo from origin`**
The install URLs are derived from the `origin` remote locally, and from `GITHUB_REPOSITORY` in CI. Point
`origin` at the github.com URL, or set `GITHUB_REPOSITORY` yourself. If these disagree, the catalog table you
generate locally will not match the one CI expects and `check.yml` will fail.

**The publish job fails on `git push` with a 403**
`GITHUB_TOKEN` did not get write access. The organization pins the default token permission to read-only, so
`publish-skills.yml` grants `contents: write` on the job itself. Check that grant is still present — an
organization ruleset restricting branch or tag creation would produce the same symptom. Nothing is left
half-published when this happens: no branch, no tag, `main` untouched. Fix the permission and re-run the
workflow; no new commit is needed.

**`version X.Y.Z is lower than the already-published vA.B.C`**
The `version:` in `SKILL.md` went backwards relative to an existing release tag. Set it higher than every
published version of that skill.

**`only regular files can be published`**
The skill directory contains a symlink. Replace it with a copy of the file — publish branches only carry
regular files.

**`frontmatter line N is not a "key: value" pair`**
The frontmatter parser only accepts flat scalars — no nested maps, lists, or block scalars. This is deliberate:
a mis-parsed `name` would publish a branch under the wrong name.
