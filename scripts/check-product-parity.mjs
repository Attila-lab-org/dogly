#!/usr/bin/env node
/**
 * Fail CI when consumer product screens diverge between mobile and mobile-web.
 * ADR-017 / docs/PRODUCT_PARITY.md
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const RELATIVE_PATHS = [
  'app/(tabs)/_layout.tsx',
  'app/(tabs)/home.tsx',
  'app/(tabs)/diary.tsx',
  'app/(tabs)/rocky.tsx',
  'app/(tabs)/around.tsx',
  'app/care/index.tsx',
  'app/dogs/[dogId]/memories.tsx',
  'src/features/home/HomeConversation.tsx',
  'src/features/home/api.ts',
  'src/features/dogs/DogCareOverview.tsx',
  'src/features/care/CareEventCard.tsx',
  'src/features/core/types.ts',
];

function digest(path) {
  const raw = readFileSync(path);
  // Normalize line endings so Windows CRLF vs Linux LF does not false-fail.
  const normalized = raw.toString('utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized).digest('hex');
}

const drifts = [];

for (const rel of RELATIVE_PATHS) {
  const nativePath = join(root, 'apps/mobile', rel);
  const webPath = join(root, 'apps/mobile-web', rel);
  if (!existsSync(nativePath) || !existsSync(webPath)) {
    drifts.push(`${rel} — missing on one side`);
    continue;
  }
  if (digest(nativePath) !== digest(webPath)) {
    drifts.push(rel);
  }
}

if (drifts.length) {
  console.error('Product parity drift (ADR-017). Keep mobile and mobile-web identical for:');
  for (const item of drifts) console.error(`  - ${item}`);
  console.error('See docs/PRODUCT_PARITY.md');
  process.exit(1);
}

console.log(`Product parity OK (${RELATIVE_PATHS.length} paths).`);
