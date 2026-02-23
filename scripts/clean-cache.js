#!/usr/bin/env node
/**
 * Sterge cache-ul Next.js (.next si .turbo).
 * Ruleaza dupa ce opresti dev server-ul (Ctrl+C).
 * Apoi: pnpm dev
 */
const fs = require('fs')
const path = require('path')

const dirs = ['.next', '.turbo']
const cwd = process.cwd()

for (const dir of dirs) {
  const full = path.join(cwd, dir)
  if (!fs.existsSync(full)) continue
  try {
    fs.rmSync(full, { recursive: true })
    console.log('Sters:', dir)
  } catch (err) {
    console.error('Eroare la stergerea', dir + ':', err.message)
    console.error('Opreste dev server-ul (Ctrl+C), apoi ruleaza din nou: node scripts/clean-cache.js')
    process.exit(1)
  }
}

console.log('Gata. Porneste dev server: pnpm dev')
