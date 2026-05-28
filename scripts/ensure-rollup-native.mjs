#!/usr/bin/env node
// ABOUTME: Ensures Rollup's Linux x64 native binary is installed after npm install (Vercel optional-deps bug).
// ABOUTME: No-op on macOS/Windows; on linux x64 runs a targeted install of @rollup/rollup-linux-x64-gnu.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { arch, platform } from 'node:process'

if (platform !== 'linux' || arch !== 'x64') {
  process.exit(0)
}

const require = createRequire(import.meta.url)
const rollupPkg = require('rollup/package.json')
const pkg = `@rollup/rollup-linux-x64-gnu@${rollupPkg.version}`

console.log(`[ensure-rollup-native] installing ${pkg}…`)
execSync(`npm install ${pkg} --legacy-peer-deps --no-save`, {
  stdio: 'inherit',
  env: { ...process.env, npm_config_optional: 'true' },
})
