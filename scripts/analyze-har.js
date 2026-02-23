const fs = require('fs')
const path = process.argv[2] || 'docs/10.5.0.2 1min de navigare.har'
const har = JSON.parse(fs.readFileSync(path, 'utf8'))
const entries = har.log.entries || []

const byEndpoint = {}   // path + query param names (e.g. /rest/v1/service_files?select=id,status&lead_id=)
const byTable = {}      // doar tabelul Supabase (service_files, pipelines, etc.)
const byHost = {}
let total = 0

for (const e of entries) {
  const url = e.request?.url || ''
  total++
  try {
    const u = new URL(url)
    byHost[u.hostname] = (byHost[u.hostname] || 0) + 1

    if (u.pathname.includes('/rest/v1/')) {
      const table = u.pathname.replace(/.*\/rest\/v1\//, '').split('?')[0].split('/')[0]
      byTable[table] = (byTable[table] || 0) + 1
    }

    const pathname = u.pathname
    const search = u.search || ''
    let key = pathname
    if (search) {
      const params = new URLSearchParams(search)
      const paramNames = [...params.keys()].sort().join(',')
      key = pathname + '?' + paramNames.substring(0, 50)
    }
    byEndpoint[key] = (byEndpoint[key] || 0) + 1
  } catch (_) {
    byEndpoint[url.substring(0, 80)] = (byEndpoint[url.substring(0, 80)] || 0) + 1
  }
}

console.log('=== TOTAL REQUESTURI:', total, '===\n')

console.log('--- Pe HOST ---')
Object.entries(byHost)
  .sort((a, b) => b[1] - a[1])
  .forEach(([h, n]) => console.log(String(n).padStart(6), h))

console.log('\n--- Pe TABEL Supabase (rest/v1/...) ---')
Object.entries(byTable)
  .sort((a, b) => b[1] - a[1])
  .forEach(([t, n]) => console.log(String(n).padStart(6), t))

console.log('\n--- Top ENDPOINT-uri (path + parametri) ---')
Object.entries(byEndpoint)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40)
  .forEach(([k, n]) => console.log(String(n).padStart(6), k))
