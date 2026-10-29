#!/usr/bin/env node
import { RemoteHostServer } from '../framework/services/RemoteHostServer.js';
import { TailscaleDiscoveryService } from '../framework/services/TailscaleDiscoveryService.js';

// Parse CLI args (--host <ip>, --port <port>)
const args = process.argv.slice(2);
let host = '';
let port = 53911;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host' && args[i + 1]) {
    host = args[i + 1];
    i++;
  } else if (args[i] === '--port' && args[i + 1]) {
    port = Number(args[i + 1]);
    i++;
  }
}

// Auto-resolve Tailscale IP if not explicitly provided
if (!host) {
  try {
    const discovery = new TailscaleDiscoveryService();
    const status = discovery.checkStatus();
    if (status.isRunning && status.selfIpv4) {
      host = status.selfIpv4;
      console.log(`[REMOTE HOST] Tailscale detectado: Enlazando a ${host} (${status.selfName})`);
    }
  } catch {}
}

if (!host) {
  host = '127.0.0.1';
  console.log('[REMOTE HOST] Tailscale no activo: Enlazando a fallback 127.0.0.1');
}

const server = new RemoteHostServer({ host, port });

server.start().then(({ host: boundHost, port: boundPort }) => {
  console.log(`[REMOTE HOST] Servidor Parsec-Mesh activo en http://${boundHost}:${boundPort}`);
  console.log('[REMOTE HOST] Endpoints disponibles:');
  console.log(`  - Health:        http://${boundHost}:${boundPort}/api/v1/health`);
  console.log(`  - Conversations: http://${boundHost}:${boundPort}/api/v1/conversations`);
  console.log(`  - Stream SSE:    http://${boundHost}:${boundPort}/api/v1/conversations/:id/stream`);
}).catch((err) => {
  console.error('[REMOTE HOST] Error iniciando servidor:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[REMOTE HOST] Deteniendo servidor...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
