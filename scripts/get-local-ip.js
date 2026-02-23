#!/usr/bin/env node

/**
 * Script pentru a obține IP-ul local al mașinii pentru acces din rețea
 */

const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({
          interface: name,
          address: iface.address,
        });
      }
    }
  }

  return addresses;
}

const ips = getLocalIP();

console.log('\n🌐 IP-uri disponibile pentru acces din rețea:\n');
if (ips.length === 0) {
  console.log('❌ Nu s-au găsit IP-uri de rețea.');
  console.log('   Verifică că ești conectat la WiFi sau Ethernet.\n');
} else {
  ips.forEach(({ interface, address }) => {
    console.log(`   📍 ${address} (${interface})`);
    console.log(`      → http://${address}:3000\n`);
  });
  
  const primaryIP = ips[0]?.address;
  if (primaryIP) {
    console.log(`✅ Accesează aplicația de pe alte dispozitive din rețea:`);
    console.log(`   http://${primaryIP}:3000\n`);
    console.log(`💡 Asigură-te că firewall-ul permite conexiuni pe portul 3000.\n`);
  }
}
