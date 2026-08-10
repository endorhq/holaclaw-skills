# HolaClaw Skills

A catalog of [OpenClaw](https://openclaw.ai) skills we build and maintain. Every skill lives in its own
directory on `main`, and is published automatically to a dedicated branch you can install from.

## Skills

<!-- catalog:start -->

| Skill | What it does | Latest | Install |
| --- | --- | --- | --- |
| [`browser-navigation`](./browser-navigation) | Improve browser navigation in OpenClaw installations by using the [agent-browser](https://agent-browser.dev) CLI tool. | `v1.0.1` | `openclaw skills install git:endorhq/holaclaw-skills@browser-navigation` |

<!-- catalog:end -->

Each command above tracks the latest release of that skill. To pin a specific version, swap the branch for a
version tag — `@browser-navigation-v1.0.0` instead of `@browser-navigation`.

## How this repository works

`openclaw skills install` expects a repository whose root holds a single `SKILL.md`, so a catalog cannot be
installed directly. Instead, `main` is the monorepo where skills are authored, and a GitHub Action republishes
each one to a branch shaped the way OpenClaw expects.

```
main                              branch: browser-navigation
├── browser-navigation/           ├── SKILL.md
│   ├── SKILL.md          ──▶     ├── README.md
│   └── README.md                 └── LICENSE
├── LICENSE                       tag: browser-navigation-v1.0.0
└── README.md
```

The publish branches are **orphans**: they share no history with `main` and contain nothing but the skill's own
files, so cloning one costs almost nothing. Each release appends a single commit, which makes the branch history
a readable changelog for that skill. Never commit to a publish branch — the next release overwrites it.

Versions are declared by the author, not inferred. Bumping `version:` in a skill's `SKILL.md` is what cuts a
release; the action then updates that skill's branch and creates the matching tag, and refuses to move a tag that
already exists.

## Contributing

See [DEVELOPMENT.md](./DEVELOPMENT.md) for how to add a skill, release a change, run the automation locally, and
what to do when a check fails.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
