import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

/** Directories at the repo root that can never be a skill. */
const RESERVED = new Set(['scripts', 'node_modules', '.github', '.git']);

/** Files never copied into a published branch. */
const IGNORED = new Set(['.DS_Store', 'Thumbs.db']);

export const SEMVER = /^\d+\.\d+\.\d+$/;
const BRANCH_SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Numeric semver comparison: negative when a < b, zero when equal. */
export function compareSemver(a, b) {
  const [amaj, amin, apat] = a.split('.').map(Number);
  const [bmaj, bmin, bpat] = b.split('.').map(Number);
  return amaj - bmaj || amin - bmin || apat - bpat;
}

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...opts,
  }).trim();
}

/** Returns the trimmed stdout, or null when the command exits non-zero. */
export function gitOrNull(args, opts = {}) {
  try {
    return git(args, { stdio: ['pipe', 'pipe', 'ignore'], ...opts });
  } catch {
    return null;
  }
}

/** True when the command exits zero. For predicates like `merge-base --is-ancestor`. */
export function gitOk(args, opts = {}) {
  return gitOrNull(args, opts) !== null;
}

/**
 * Parses a flat YAML frontmatter block. Only `key: scalar` pairs are
 * supported — block scalars and nested maps are rejected loudly rather than
 * silently dropped, because a mis-parsed `name` would publish a garbage branch.
 */
export function parseFrontmatter(text, source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) throw new Error(`${source}: missing YAML frontmatter`);

  const data = {};
  for (const [i, line] of match[1].split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const pair = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line);
    if (!pair) {
      throw new Error(
        `${source}: frontmatter line ${i + 1} is not a "key: value" pair — ` +
          `nested maps, lists and block scalars are not supported:\n  ${line}`
      );
    }

    const [, key, raw] = pair;
    if (raw === '' || raw === '|' || raw === '>') {
      throw new Error(`${source}: frontmatter key "${key}" must be a single-line scalar`);
    }
    if (key in data) {
      throw new Error(`${source}: frontmatter key "${key}" appears twice`);
    }
    data[key] = unquote(raw.trim());
  }

  return { data, body: text.slice(match[0].length) };
}

function unquote(value) {
  if (value.length >= 2 && value[0] === '"' && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  if (value.length >= 2 && value[0] === "'" && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/**
 * Every file in `dir`, as paths relative to `dir`, sorted and filtered.
 * Dotfiles and OS junk are excluded; anything that is not a regular file or
 * directory (symlinks above all) is an error — silently dropping one would
 * publish a skill missing a file nobody noticed.
 */
function walk(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || IGNORED.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
    else throw new Error(`${path.join(dir, entry.name)}: only regular files can be published — replace the symlink with the file itself`);
  }
  return out;
}

/**
 * The skill card ships to users alongside the skill, so the version it states
 * has to be the version that was published. Nothing else keeps the two in sync:
 * the card is hand-written, and a frontmatter bump would otherwise leave it
 * silently describing the previous release.
 */
function assertSkillCardVersion(name, dir, version) {
  const cardPath = path.join(dir, 'skill-card.md');
  if (!fs.existsSync(cardPath)) return;

  const source = `${name}/skill-card.md`;
  const section = /^##\s+Skill Version\s*:?\s*$\n+(.+)$/m.exec(fs.readFileSync(cardPath, 'utf8'));
  if (!section) {
    throw new Error(`${source}: missing a "## Skill Version" section stating v${version}`);
  }

  const stated = section[1].trim().replace(/^v/, '');
  if (stated !== version) {
    throw new Error(
      `${source}: "Skill Version" says ${JSON.stringify(stated)} but ${name}/SKILL.md frontmatter says ${JSON.stringify(version)} — bump both together`,
    );
  }
}

export function loadSkill(name) {
  // Validate the name before it touches the filesystem — it may come from the
  // --skill flag, and a branch-safe name can never escape ROOT.
  if (!BRANCH_SAFE.test(name)) {
    throw new Error(`skill name "${name}" must be lowercase kebab-case (it becomes a branch name)`);
  }
  if (RESERVED.has(name)) {
    throw new Error(`"${name}" is a reserved directory and cannot be a skill`);
  }

  const dir = path.join(ROOT, name);
  const skillPath = path.join(dir, 'SKILL.md');
  const source = `${name}/SKILL.md`;

  const { data } = parseFrontmatter(fs.readFileSync(skillPath, 'utf8'), source);

  if (data.name !== name) {
    throw new Error(`${source}: frontmatter name "${data.name}" must match the directory name "${name}"`);
  }
  if (!data.description) {
    throw new Error(`${source}: frontmatter is missing "description"`);
  }
  if (!SEMVER.test(data.version ?? '')) {
    throw new Error(`${source}: frontmatter "version" must be MAJOR.MINOR.PATCH, got ${JSON.stringify(data.version)}`);
  }

  const readmePath = path.join(dir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    throw new Error(`${name}/README.md is missing — it is the body of the published README`);
  }

  assertSkillCardVersion(name, dir, data.version);

  return {
    name,
    dir,
    version: data.version,
    description: data.description,
    title: data.title ?? titleCase(name),
    summary: data.summary ?? firstSentence(fs.readFileSync(readmePath, 'utf8')),
    body: fs.readFileSync(readmePath, 'utf8').trim(),
    files: walk(dir),
    branch: name,
    tag: `${name}-v${data.version}`,
  };
}

export function discoverSkills() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !RESERVED.has(e.name))
    .filter((e) => fs.existsSync(path.join(ROOT, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort()
    .map(loadSkill);
}

function titleCase(slug) {
  return slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** First sentence of a markdown body, used as the catalog blurb. */
function firstSentence(markdown) {
  const paragraph = markdown.trim().split(/\r?\n\s*\r?\n/)[0].replace(/\s+/g, ' ');
  const end = /[.!?](?=\s|$)/.exec(paragraph);
  return end ? paragraph.slice(0, end.index + 1) : paragraph;
}

/**
 * `owner/repo` for the current checkout. Prefers the value GitHub Actions
 * injects so a repository rename never leaves a stale URL in a README.
 */
export function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;

  const url = gitOrNull(['remote', 'get-url', 'origin']);
  const match = url && /^(?:git@github\.com:|(?:ssh|git|https?):\/\/(?:[^@]+@)?github\.com\/)([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  if (!match) {
    throw new Error(
      `cannot determine owner/repo from origin (${url ?? 'no remote'}) — ` +
        'point "origin" at a github.com URL or set GITHUB_REPOSITORY'
    );
  }
  return match[1];
}

/** The README published to a skill branch: authored body + generated boilerplate. */
export function renderSkillReadme(skill, slug) {
  return `# ${skill.title}

${skill.body}

## Install

\`\`\`bash
openclaw skills install git:${slug}@${skill.branch}
\`\`\`

That tracks the latest release. To pin this exact version instead:

\`\`\`bash
openclaw skills install git:${slug}@${skill.tag}
\`\`\`

## More skills

This branch is published automatically from the [\`${slug}\`](https://github.com/${slug}) catalog, which holds
every skill we maintain — see its [README](https://github.com/${slug}#readme) for the full list and for how
this branch is generated. Edits belong on \`main\`, in the \`${skill.name}/\` directory; anything committed
here is overwritten on the next release.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
`;
}

/** The generated catalog block in the root README. */
export function renderCatalog(skills, slug) {
  const cell = (text) => text.replace(/\|/g, '\\|');
  const rows = skills.map(
    (s) =>
      `| [\`${s.name}\`](./${s.name}) | ${cell(s.summary)} | \`v${s.version}\` | ` +
      `\`openclaw skills install git:${slug}@${s.name}\` |`
  );

  return [
    '| Skill | What it does | Latest | Install |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export const CATALOG_START = '<!-- catalog:start -->';
export const CATALOG_END = '<!-- catalog:end -->';

export function spliceCatalog(readme, block) {
  const start = readme.indexOf(CATALOG_START);
  const end = readme.indexOf(CATALOG_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md must contain ${CATALOG_START} and ${CATALOG_END} markers`);
  }
  return (
    readme.slice(0, start + CATALOG_START.length) + '\n\n' + block + '\n\n' + readme.slice(end)
  );
}
