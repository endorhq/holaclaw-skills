#!/usr/bin/env node
// Regenerates the catalog table in the root README.
//
//   node scripts/gen-readme.mjs           rewrite README.md in place
//   node scripts/gen-readme.mjs --check   exit 1 if README.md is stale (CI)

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, discoverSkills, renderCatalog, repoSlug, spliceCatalog } from './lib/skills.mjs';

const check = process.argv.includes('--check');
const readmePath = path.join(ROOT, 'README.md');

const current = fs.readFileSync(readmePath, 'utf8');
const updated = spliceCatalog(current, renderCatalog(discoverSkills(), repoSlug()));

if (current === updated) {
  console.log('README.md catalog is up to date.');
  process.exit(0);
}

if (check) {
  console.error('README.md catalog is stale. Run `node scripts/gen-readme.mjs` and commit the result.');
  process.exit(1);
}

fs.writeFileSync(readmePath, updated);
console.log('README.md catalog updated.');
