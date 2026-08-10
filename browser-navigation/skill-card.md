# Skill Card

## Description

Browser navigation teaches your agent how to use the [`agent-browser`](https://agent-browser.dev) to navigate and automate web workflows efficiently.

This skill is ready for commercial and non-commercial use.

## Owner

HolaClaw Team

## License/Terms of Use

Apache-2.0

## Use Case

Developers and end users running OpenClaw agents that need to read from or act on websites and web apps when `web_fetch` is not enough.

Use this skill with the `agent-browser` CLI tool to automate web workflows. It's a single skill that provides the most used CLI commands and a framework for agents to navigate and interact with websites. We tested it against different web tasks in OpenClaw to confirm it reduces the time and number of iterations to complete a task.

## Deployment Geography for Use

Global

### Requirements / Dependencies

**Requires API Key or External Credential:** No

**Credential Type(s):** None

Depends on the `agent-browser` CLI tool, from the Vercel team. You can see the [installation guide](https://agent-browser.dev/installation). Developed and tested against `agent-browser` 0.27.x; older releases may not support every flag used here (`snapshot -i -c`, `diff snapshot --baseline`).

The skill itself requires no credential, but it drives a real browser that may already hold the user's authenticated sessions and cookies. Treat the browser profile it attaches to as a credential.

Do not include secrets in prompts/logs/output; use least-privilege credentials; rotate keys as appropriate.

## Known Risks and Mitigations

Risk: Page content is attacker-controlled. Anything returned by `snapshot`, `read`, `get`, or `console` may contain text crafted to be read as instructions by the agent.

Mitigation: The skill declares all browser output untrusted input and forbids acting on instructions found in a page. Keep the agent's other tools least-privilege so an injected instruction has nothing valuable to reach.

Risk: The agent acts as the authenticated user. A single browser session persists across commands, so the agent can take irreversible actions under the user's real identity — sending, purchasing, deleting, or submitting forms.

Mitigation: Confirm the URL and the intent before submitting forms or personal data, prefer a dedicated browser profile over the daily-driver one, and review which tabs are open before starting a task.

Risk: Credentials and session state can leak. Login pages, cookies, and `state save` / `state load` files contain secrets that may end up in chat transcripts, logs, or shell history.

Mitigation: The user fills logins manually by default. The agent may only submit credentials after an explicit warning about the implications and a final confirmation, and it must never echo, print, or upload secret values or state files.

Risk: Element references go stale. Snapshot refs (`@eXX`) are renumbered on every snapshot, so acting on a ref from an earlier snapshot can trigger the wrong control.

Mitigation: Re-snapshot after URL changes, opened widgets, or large diffs, and verify consequential actions with `get url` and `diff snapshot`.

Risk: Local files hold page data. Snapshots are written to `~/.cache/holaclaw-browser/`, and screenshots and PDFs to temporary paths. These can contain personal data or tokens that were visible on screen.

Mitigation: Writes are scoped to that cache directory and to temporary paths, and the skill instructs deleting them when the task finishes. Treat them as sensitive for as long as they exist.

Risk: Automating a third-party site may violate its terms of service or trip its anti-automation controls.

Mitigation: The operator is responsible for confirming they are authorized to automate the sites they target.

Risk: Excessive agency through CLI escape hatches. `--init-script` and `--enable` run code before any page JavaScript.

Mitigation: The skill forbids both flags.

## References

- https://holaclaw.ai
- https://agent-browser.dev/
- [`agent-browser` installation guide](https://agent-browser.dev/installation)
- [Published skill branch](https://github.com/endorhq/holaclaw-skills/tree/browser-navigation)

## Skill Output

**Output Type(s):** Analysis, Shell commands (`agent-browser` CLI invocations), Files

**Output Format:** Markdown with inline bash code blocks; accessibility-tree snapshots as text; screenshots as PNG; pages as PDF

**Output Parameters:** 1D

**Other Properties Related to Output:** Side effects — mutates live browser and session state, and writes snapshot, screenshot, and PDF files under `~/.cache/holaclaw-browser/` and temporary paths, which the skill instructs deleting on task completion. No page data is retained beyond those files.

## Skill Version

v1.0.1

## Ethical Considerations

HolaClaw Team believes trustworthy AI is a shared responsibility. Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment.

This skill drives a browser under the user's own identity and sessions. It should not be used to circumvent access controls or anti-automation measures, to collect personal data without a lawful basis, or to act on a third party's behalf without their authorization. Consequential actions — purchases, messages, deletions, or anything that submits personal data — warrant human confirmation.

Please report quality, risk, or security concerns [here](https://github.com/endorhq/holaclaw-skills/security).
