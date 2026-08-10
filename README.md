# Browser Navigation

Improve browser navigation in OpenClaw installations by using the [agent-browser](https://agent-browser.dev) CLI tool. The skill teaches the agent to drive a persistent browser session through accessibility-tree snapshots instead of raw DOM scraping, which reaches the goal faster, with fewer errors and fewer tokens.

It covers the core snapshot → act → diff loop, waiting strategies, form filling, file uploads, tab and dialog handling, screenshots, and the recovery patterns for when a page does not behave.

Use it whenever `web_fetch` is not enough.

## Install

```bash
openclaw skills install git:endorhq/holaclaw-skills@browser-navigation
```

That tracks the latest release. To pin this exact version instead:

```bash
openclaw skills install git:endorhq/holaclaw-skills@browser-navigation-v1.0.1
```

## More skills

This branch is published automatically from the [`endorhq/holaclaw-skills`](https://github.com/endorhq/holaclaw-skills) catalog, which holds
every skill we maintain — see its [README](https://github.com/endorhq/holaclaw-skills#readme) for the full list and for how
this branch is generated. Edits belong on `main`, in the `browser-navigation/` directory; anything committed
here is overwritten on the next release.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
