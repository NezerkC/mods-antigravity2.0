import test from 'node:test';
import assert from 'node:assert/strict';
import { TailscaleDiscoveryService } from '../../framework/index.js';

const mockTailscaleJson = {
  Version: '1.102.2',
  BackendState: 'Running',
  TailscaleIPs: ['100.66.147.17', 'fd7a:115c:a1e0::1'],
  Self: {
    ID: 'node-self-1',
    NodeID: 1001,
    HostName: 'laptop-victor',
    DNSName: 'laptop-victor.tailnet.ts.net.',
    OS: 'windows',
    TailscaleIPs: ['100.66.147.17', 'fd7a:115c:a1e0::1'],
    Online: true
  },
  Peer: {
    'nodekey:peer-desktop': {
      ID: 'node-peer-1',
      NodeID: 2002,
      HostName: 'pc-desktop',
      DNSName: 'pc-desktop.tailnet.ts.net.',
      OS: 'windows',
      TailscaleIPs: ['100.97.240.57', 'fd7a:115c:a1e0::2'],
      Online: true,
      LastSeen: '2026-10-28T22:00:00Z'
    },
    'nodekey:peer-phone': {
      ID: 'node-peer-2',
      NodeID: 3003,
      HostName: 'Redmi 13C',
      DNSName: 'redmi-13c.tailnet.ts.net.',
      OS: 'android',
      TailscaleIPs: ['100.70.43.71'],
      Online: false,
      LastSeen: '2026-08-28T19:30:07Z'
    }
  }
};

test('TailscaleDiscoveryService - detects installed status correctly', () => {
  const service = new TailscaleDiscoveryService({
    execFn: () => JSON.stringify(mockTailscaleJson)
  });

  const status = service.checkStatus();
  assert.equal(status.isInstalled, true);
  assert.equal(status.isRunning, true);
  assert.equal(status.selfName, 'laptop-victor');
  assert.equal(status.selfIpv4, '100.66.147.17');
});

test('TailscaleDiscoveryService - handles missing or failing CLI gracefully', () => {
  const service = new TailscaleDiscoveryService({
    execFn: () => {
      throw new Error('tailscale: command not found');
    }
  });

  const status = service.checkStatus();
  assert.equal(status.isInstalled, false);
  assert.equal(status.isRunning, false);
  assert.deepEqual(service.getDevices(), []);
});

test('TailscaleDiscoveryService - parses devices separating self and peers', () => {
  const service = new TailscaleDiscoveryService({
    execFn: () => JSON.stringify(mockTailscaleJson)
  });

  const devices = service.getDevices();
  assert.equal(devices.length, 3);

  // Self device (Laptop)
  const selfDev = devices.find(d => d.isSelf);
  assert.ok(selfDev);
  assert.equal(selfDev.name, 'laptop-victor');
  assert.equal(selfDev.ipv4, '100.66.147.17');
  assert.equal(selfDev.online, true);
  assert.equal(selfDev.os, 'windows');

  // Peer device (PC Desktop)
  const desktop = devices.find(d => d.name === 'pc-desktop');
  assert.ok(desktop);
  assert.equal(desktop.isSelf, false);
  assert.equal(desktop.ipv4, '100.97.240.57');
  assert.equal(desktop.online, true);
  assert.equal(desktop.os, 'windows');

  // Peer device (Phone, offline)
  const phone = devices.find(d => d.name === 'Redmi 13C');
  assert.ok(phone);
  assert.equal(phone.isSelf, false);
  assert.equal(phone.online, false);
});

test('TailscaleDiscoveryService - filters online peers ready for remote connection', () => {
  const service = new TailscaleDiscoveryService({
    execFn: () => JSON.stringify(mockTailscaleJson)
  });

  const onlinePeers = service.getOnlinePeers();
  assert.equal(onlinePeers.length, 1);
  assert.equal(onlinePeers[0].name, 'pc-desktop');
  assert.equal(onlinePeers[0].ipv4, '100.97.240.57');
});

test('TailscaleDiscoveryService - finds device by name case-insensitively', () => {
  const service = new TailscaleDiscoveryService({
    execFn: () => JSON.stringify(mockTailscaleJson)
  });

  const found = service.findDeviceByName('PC-DESKTOP');
  assert.ok(found);
  assert.equal(found.ipv4, '100.97.240.57');

  const notFound = service.findDeviceByName('non-existent');
  assert.equal(notFound, null);
});
