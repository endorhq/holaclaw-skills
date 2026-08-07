Improve browser navigation in OpenClaw installations by using the [agent-browser](https://agent-browser.dev) CLI tool. The skill teaches the agent to drive a persistent browser session through accessibility-tree snapshots instead of raw DOM scraping, which reaches the goal faster, with fewer errors and fewer tokens.

It covers the core snapshot → act → diff loop, waiting strategies, form filling, file uploads, tab and dialog handling, screenshots, and the recovery patterns for when a page does not behave.

Use it whenever `web_fetch` is not enough.
