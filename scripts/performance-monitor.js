#!/usr/bin/env node

/**
 * 📊 Performance Monitor Script
 * 
 * Rulează teste de performanță și generează rapoarte
 * 
 * Usage:
 *   node scripts/performance-monitor.js
 *   node scripts/performance-monitor.js --routes /leads/saloane,/leads/frizerii
 *   node scripts/performance-monitor.js --output reports/perf-report.json
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

// Configurare
const CONFIG = {
  baseUrl: process.env.PERF_BASE_URL || 'http://localhost:3000',
  routes: [
    '/',
    '/leads/saloane',
    '/leads/frizerii',
    '/leads/horeca',
    '/leads/reparatii',
    '/leads/vanzari',
    '/configurari/catalog',
  ],
  thresholds: {
    ttfb: 200, // ms
    fcp: 1500, // ms
    lcp: 2500, // ms
    bundleSize: 1024 * 1024, // 1MB
  },
  outputDir: 'reports',
}

// Parse arguments
const args = process.argv.slice(2)
let customRoutes = null
let outputFile = null

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--routes' && args[i + 1]) {
    customRoutes = args[i + 1].split(',')
    i++
  }
  if (args[i] === '--output' && args[i + 1]) {
    outputFile = args[i + 1]
    i++
  }
}

const routes = customRoutes || CONFIG.routes

// Măsurare TTFB pentru o rută
async function measureTTFB(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const client = url.startsWith('https') ? https : http
    
    const req = client.get(url, (res) => {
      const ttfb = Date.now() - start
      let body = ''
      
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        resolve({
          ttfb,
          statusCode: res.statusCode,
          contentLength: parseInt(res.headers['content-length'] || body.length, 10),
          headers: res.headers,
        })
      })
    })
    
    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('Timeout'))
    })
  })
}

// Analiză bundle size
async function analyzeBundleSize(buildDir = '.next') {
  const results = {
    totalJs: 0,
    totalCss: 0,
    chunks: [],
  }
  
  const staticDir = path.join(buildDir, 'static', 'chunks')
  
  if (!fs.existsSync(staticDir)) {
    return { error: 'Build not found. Run `npm run build` first.' }
  }
  
  const files = fs.readdirSync(staticDir)
  
  for (const file of files) {
    const filePath = path.join(staticDir, file)
    const stat = fs.statSync(filePath)
    
    if (file.endsWith('.js')) {
      results.totalJs += stat.size
      if (stat.size > 50 * 1024) { // > 50KB
        results.chunks.push({
          name: file,
          size: stat.size,
          sizeKB: (stat.size / 1024).toFixed(1),
        })
      }
    } else if (file.endsWith('.css')) {
      results.totalCss += stat.size
    }
  }
  
  results.chunks.sort((a, b) => b.size - a.size)
  results.totalJsKB = (results.totalJs / 1024).toFixed(1)
  results.totalCssKB = (results.totalCss / 1024).toFixed(1)
  
  return results
}

// Generare raport
async function generateReport() {
  console.log('📊 Starting Performance Analysis...\n')
  
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: CONFIG.baseUrl,
    routes: {},
    bundle: {},
    issues: [],
    summary: {},
  }
  
  // 1. Test TTFB pentru fiecare rută
  console.log('🔍 Testing routes TTFB...')
  for (const route of routes) {
    const url = `${CONFIG.baseUrl}${route}`
    try {
      const result = await measureTTFB(url)
      report.routes[route] = result
      
      const status = result.ttfb > CONFIG.thresholds.ttfb ? '🔴' : '🟢'
      console.log(`  ${status} ${route}: ${result.ttfb}ms (${result.statusCode})`)
      
      if (result.ttfb > CONFIG.thresholds.ttfb) {
        report.issues.push({
          type: 'SLOW_TTFB',
          route,
          value: result.ttfb,
          threshold: CONFIG.thresholds.ttfb,
          severity: result.ttfb > CONFIG.thresholds.ttfb * 2 ? 'critical' : 'warning',
        })
      }
    } catch (error) {
      console.log(`  ❌ ${route}: ${error.message}`)
      report.routes[route] = { error: error.message }
    }
  }
  
  // 2. Analiză bundle
  console.log('\n📦 Analyzing bundle size...')
  report.bundle = await analyzeBundleSize()
  
  if (report.bundle.totalJs) {
    const status = report.bundle.totalJs > CONFIG.thresholds.bundleSize ? '🔴' : '🟢'
    console.log(`  ${status} Total JS: ${report.bundle.totalJsKB}KB`)
    console.log(`  📄 Total CSS: ${report.bundle.totalCssKB}KB`)
    
    if (report.bundle.chunks.length > 0) {
      console.log(`  📋 Large chunks (>50KB):`)
      for (const chunk of report.bundle.chunks.slice(0, 5)) {
        console.log(`     - ${chunk.name}: ${chunk.sizeKB}KB`)
      }
    }
    
    if (report.bundle.totalJs > CONFIG.thresholds.bundleSize) {
      report.issues.push({
        type: 'LARGE_BUNDLE',
        value: report.bundle.totalJs,
        threshold: CONFIG.thresholds.bundleSize,
        severity: 'critical',
      })
    }
  }
  
  // 3. Sumar
  const avgTTFB = Object.values(report.routes)
    .filter(r => r.ttfb)
    .reduce((sum, r) => sum + r.ttfb, 0) / routes.length
  
  report.summary = {
    totalRoutes: routes.length,
    avgTTFB: Math.round(avgTTFB),
    totalIssues: report.issues.length,
    criticalIssues: report.issues.filter(i => i.severity === 'critical').length,
  }
  
  // 4. Output
  console.log('\n📈 Summary:')
  console.log(`  Routes tested: ${report.summary.totalRoutes}`)
  console.log(`  Average TTFB: ${report.summary.avgTTFB}ms`)
  console.log(`  Issues found: ${report.summary.totalIssues} (${report.summary.criticalIssues} critical)`)
  
  // Salvează raport
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true })
  }
  
  const reportPath = outputFile || path.join(CONFIG.outputDir, `perf-${Date.now()}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\n💾 Report saved: ${reportPath}`)
  
  // Exit code based on issues
  if (report.summary.criticalIssues > 0) {
    console.log('\n❌ Critical issues found!')
    process.exit(1)
  }
  
  console.log('\n✅ Performance check passed!')
  return report
}

// Run
generateReport().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})

