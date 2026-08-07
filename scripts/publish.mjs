#!/usr/bin/env node
// Publishes each skill directory to its own orphan branch and version tag.
//
//   node scripts/publish.mjs                    plan every skill, change nothing
//   node scripts/publish.mjs --write            update local refs
//   node scripts/publish.mjs --write --push     update local refs and push them
//   node scripts/publish.mjs --skill NAME       limit to one skill
//   node scripts/publish.mjs --reset-branch     re-root a branch that is not yet an orphan
//
// A branch holds nothing but the skill directory plus the repo LICENSE, and
// each publish appends one commit to it — the branch history is the release log.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SEMVER, ROOT, compareSemver, discoverSkills, git, gitOk, gitOrNull, loadSkill, renderSkillReadme, repoSlug } from './lib/skills.mjs';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (flag) => {
  const at = argv.indexOf(flag);
  if (at === -1) return undefined;
  const next = argv[at + 1];
  if (next === undefined || next.startsWith('-')) {
    console.error(`${flag} requires a value`);
    process.exit(2);
  }
  return next;
};

const write = has('--write');
const push = has('--push');
const resetBranch = has('--reset-branch');
const only = value('--skill');

if (push && !write) {
  console.error('--push requires --write');
  process.exit(2);
}
if (resetBranch && !only) {
  console.error('--reset-branch rewrites branch history; limit it to one skill with --skill NAME');
  process.exit(2);
}

const slug = repoSlug();
const sourceSha = git(['rev-parse', 'HEAD']);

let skills;
try {
  skills = only ? [loadSkill(only)] : discoverSkills();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (skills.length === 0) {
  console.error('no skills found');
  process.exit(1);
}

// A scratch index keeps tree building out of the working tree entirely, so
// this is safe to run on a dirty checkout.
const indexFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'publish-')), 'index');
const indexEnv = { ...process.env, GIT_INDEX_FILE: indexFile };

const plans = skills.map(plan);
const failures = plans.filter((p) => p.error);

for (const p of plans) {
  if (p.error) console.error(`✗ ${p.skill.name}: ${p.error}`);
  else console.log(`${p.action === 'noop' ? '·' : '→'} ${p.skill.name}: ${p.detail}`);
}

if (failures.length) process.exit(1);

// With --push, an empty plan still goes through the push step: local refs from
// an earlier --write without --push look like noops here but are unknown to
// the remote until pushed.
const pending = plans.filter((p) => p.action !== 'noop');
if (!pending.length && !(write && push)) {
  console.log('\nNothing to publish.');
  process.exit(0);
}

if (!write) {
  console.log(`\n${pending.length} skill(s) would be published. Re-run with --write to apply.`);
  process.exit(0);
}

const refspecs = [];
for (const p of pending) {
  if (p.commit) {
    git(['update-ref', `refs/heads/${p.skill.branch}`, p.commit]);
    refspecs.push(`refs/heads/${p.skill.branch}`);
  }
  if (p.needsTag) {
    gitStdin(['tag', '-a', '-F', '-', p.skill.tag, p.commit ?? p.branchTip], `${p.skill.name} ${p.skill.version}\n`);
    refspecs.push(`refs/tags/${p.skill.tag}`);
  }
  console.log(`published ${p.skill.name} → ${p.skill.branch} @ ${(p.commit ?? p.branchTip).slice(0, 8)}`);
}

if (push) {
  // Push every skill's local refs, not just this run's: a previous --write
  // without --push left refs the planner now reports as noops, and pushing an
  // up-to-date ref costs nothing. --atomic so a partial failure cannot leave
  // half the skills published. --force-with-lease only matters for a re-root;
  // appended commits fast-forward.
  const toPush = plans.flatMap((p) => [
    ...(gitOrNull(['rev-parse', '--verify', `refs/heads/${p.skill.branch}`]) ? [`refs/heads/${p.skill.branch}`] : []),
    ...localReleaseTags(p.skill),
  ]);
  if (toPush.length) {
    execFileSync('git', ['push', '--atomic', ...(resetBranch ? ['--force-with-lease'] : []), 'origin', ...toPush], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } else {
    console.log('\nNo local publish refs to push.');
  }
} else {
  console.log(`\nNot pushed. Run: git push origin ${refspecs.join(' ')}\n(or re-run with --write --push, which also picks up anything left unpushed)`);
}

function plan(skill) {
  const tree = buildTree(skill);
  const sourceTree = buildSourceTree(skill);
  const { tip: branchTip, diverged } = resolveBranchTip(skill.branch);
  const branchTree = branchTip && git(['rev-parse', `${branchTip}^{tree}`]);
  const tagCommit = gitOrNull(['rev-parse', '--verify', `refs/tags/${skill.tag}^{commit}`]);

  if (diverged && !resetBranch) {
    return {
      skill,
      error:
        `local "${skill.branch}" and "origin/${skill.branch}" have diverged. ` +
        `Push or delete the local branch before publishing.`,
    };
  }

  // A publish branch must not share history with main. The first release is an
  // orphan commit; a branch carrying main's history is a leftover from the
  // pre-automation layout and has to be re-rooted deliberately.
  const shared = branchTip && gitOrNull(['merge-base', branchTip, sourceSha]);
  if (shared && !resetBranch) {
    return {
      skill,
      error:
        `branch "${skill.branch}" shares history with ${sourceSha.slice(0, 8)} and is not an orphan. ` +
        `Re-run with --reset-branch to re-root it (this rewrites the branch).`,
    };
  }

  // A new tag must move forward: publishing a lower version would make the
  // branch head — what "@<skill>" installs — an older release than a tag that
  // already exists. Recreating a deleted tag at the same version stays legal.
  if (!tagCommit) {
    const newest = newestPublishedVersion(skill);
    if (newest && compareSemver(skill.version, newest) < 0) {
      return {
        skill,
        error: `version ${skill.version} is lower than the already-published v${newest} — versions only move forward`,
      };
    }
  }

  if (branchTree === tree) {
    if (tagCommit) return { skill, action: 'noop', detail: `unchanged, ${skill.tag} already published` };
    return { skill, action: 'tag', branchTip, needsTag: true, detail: `unchanged, creating missing tag ${skill.tag}` };
  }

  // Something changed — but only a change the *author* made is a new release.
  // Editing the README template or LICENSE rewrites every published branch
  // without touching a single skill, and must not demand a version bump from
  // all of them. The previous run records what the author's files hashed to,
  // so the two cases can be told apart.
  const previousSource = branchTip && trailer(branchTip, 'Source-Tree');
  const skillChanged = previousSource ? sourceTree !== previousSource : true;

  if (skillChanged && tagCommit) {
    return {
      skill,
      error:
        `${skill.name}/ changed but ${skill.tag} is already published. ` +
        `Bump "version" in ${skill.name}/SKILL.md — tags are never moved.`,
    };
  }

  const parent = resetBranch ? null : branchTip;
  const summary = skillChanged ? `${skill.name} ${skill.version}` : `${skill.name} ${skill.version} (republish)`;
  const message =
    `${summary}\n\n` +
    `Generated from ${skill.name}/ on ${sourceSha.slice(0, 8)}. Do not edit this branch directly.\n\n` +
    `Source-Commit: ${sourceSha}\n` +
    `Source-Tree: ${sourceTree}\n` +
    `Skill-Version: ${skill.version}\n`;

  const commit = gitStdin(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-F', '-'], message);

  return {
    skill,
    action: 'publish',
    commit,
    needsTag: !tagCommit,
    detail: !skillChanged
      ? `boilerplate changed, refreshing ${skill.branch} (no new version)`
      : branchTip
        ? `${resetBranch ? 're-rooting' : 'updating'} ${skill.branch}, tagging ${skill.tag}`
        : `creating orphan ${skill.branch}, tagging ${skill.tag}`,
  };
}

/**
 * Which commit the next release builds on. CI has no local publish branches, so
 * this is normally the remote-tracking ref; a local ref wins when it exists,
 * because the only thing that creates one is a previous --write without --push.
 * Genuine divergence is reported rather than guessed at.
 */
function resolveBranchTip(branch) {
  const remote = gitOrNull(['rev-parse', '--verify', `refs/remotes/origin/${branch}`]);
  const local = gitOrNull(['rev-parse', '--verify', `refs/heads/${branch}`]);

  if (!local || !remote || local === remote) return { tip: local ?? remote };
  if (gitOk(['merge-base', '--is-ancestor', remote, local])) return { tip: local };
  if (gitOk(['merge-base', '--is-ancestor', local, remote])) return { tip: remote };
  return { tip: local, diverged: true };
}

/**
 * Writes the published file set into the scratch index and returns its tree:
 * the whole skill directory, the repo LICENSE, and a generated README that
 * replaces the authored body.
 */
function buildTree(skill) {
  git(['read-tree', '--empty'], { env: indexEnv });

  for (const rel of skill.files) {
    if (rel === 'README.md') continue;
    const abs = path.join(skill.dir, rel);
    const mode = fs.statSync(abs).mode & 0o111 ? '100755' : '100644';
    addToIndex(mode, git(['hash-object', '-w', '--', abs]), rel);
  }

  addToIndex('100644', git(['hash-object', '-w', '--', path.join(ROOT, 'LICENSE')]), 'LICENSE');
  addToIndex('100644', gitStdin(['hash-object', '-w', '--stdin'], renderSkillReadme(skill, slug)), 'README.md');

  return git(['write-tree'], { env: indexEnv });
}

/**
 * Hashes the skill directory exactly as authored — no LICENSE, no rendered
 * README. This is the fingerprint of what a contributor actually wrote, and
 * changing it is what obliges them to bump the version.
 */
function buildSourceTree(skill) {
  git(['read-tree', '--empty'], { env: indexEnv });

  for (const rel of skill.files) {
    const abs = path.join(skill.dir, rel);
    const mode = fs.statSync(abs).mode & 0o111 ? '100755' : '100644';
    addToIndex(mode, git(['hash-object', '-w', '--', abs]), rel);
  }

  return git(['write-tree'], { env: indexEnv });
}

/** Every local release tag of a skill (`<name>-vX.Y.Z`), as fully-qualified refs. */
function localReleaseTags(skill) {
  return releaseVersions(skill).map((v) => `refs/tags/${skill.name}-v${v}`);
}

/** The highest version among a skill's local release tags, or null. */
function newestPublishedVersion(skill) {
  return releaseVersions(skill).sort(compareSemver).at(-1) ?? null;
}

function releaseVersions(skill) {
  return (gitOrNull(['tag', '-l', `${skill.name}-v*`]) ?? '')
    .split('\n')
    .map((tag) => tag.slice(skill.name.length + 2))
    .filter((version) => SEMVER.test(version));
}

/** Reads a `Key: value` trailer from a commit message, or null. */
function trailer(commit, key) {
  const message = git(['show', '-s', '--format=%B', commit]);
  return new RegExp(`^${key}: ([0-9a-f]{40,64})$`, 'm').exec(message)?.[1] ?? null;
}

function addToIndex(mode, sha, filePath) {
  git(['update-index', '--add', '--cacheinfo', `${mode},${sha},${filePath}`], { env: indexEnv });
}

function gitStdin(args, input) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', input }).trim();
}
