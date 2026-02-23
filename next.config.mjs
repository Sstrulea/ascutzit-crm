import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ascunde indicatorul „N issues” din colțul ecranului în dev (evită confuzia cu erorile la butoane)
  devIndicators: false,

  // Acces din retea (hotspot / WiFi): permite origin-uri LAN în dev când rulezi cu -H 0.0.0.0
  // Formatul este hostname (fără http:// sau port). Adaugă IP-ul tău LAN dacă se schimbă.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.100.35',
    '192.168.0.162',
    '10.5.0.2',
    '10.100.0.22',
    '192.168.88.197',
    '0.0.0.0',
  ],
  // eslint nu mai este suportat aici în Next.js 16 – folosește eslint.config.* sau variabila de mediu
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // ✅ Optimizare imagini - LCP improvement 20-40%
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 zile cache
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  
  // Rădăcina proiectului pentru Turbopack (evită inferarea greșită când există lockfile și în home)
  turbopack: {
    root: path.resolve(__dirname),
  },

  // ✅ Optimizare bundle
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'date-fns',
      'recharts',
    ],
  },
  
  // ✅ Compression și headers
  compress: true,
  poweredByHeader: false,
}

export default nextConfig
