import test from 'node:test';
import assert from 'node:assert/strict';
import { ModDaemon } from '../../framework/core/ModDaemon.js';

test('ModDaemon - constructor initializes with default configuration and status', () => {
  const daemon = new ModDaemon({ pollIntervalMs: 1000 });
  const status = daemon.getStatus();

  assert.equal(status.isRunning, false);
  assert.equal(status.connectedPort, null);
  assert.equal(status.lastInjectedAt, null);
  assert.equal(status.pollIntervalMs, 1000);
});

test('ModDaemon - tick returns disconnected when CDP probe fails', async () => {
  const mockResolver = {
    resolvePort: async () => 53908,
    probePort: async () => false
  };

  const daemon = new ModDaemon({ portResolver: mockResolver });
  const result = await daemon.tick();

  assert.equal(result.status, 'disconnected');
  assert.equal(result.port, null);
  assert.equal(daemon.getStatus().connectedPort, null);
});

test('ModDaemon - tick skips injection when mods are already present in DOM', async () => {
  const mockResolver = {
    resolvePort: async () => 53908,
    probePort: async () => true
  };

  let evaluateCalled = false;
  let dispatchCalled = false;

  const mockCdpClient = {
    evaluate: async () => {
      evaluateCalled = true;
      return { value: true }; // Already injected
    }
  };

  const mockHost = {
    dispatch: async () => {
      dispatchCalled = true;
    }
  };

  const daemon = new ModDaemon({
    portResolver: mockResolver,
    modHost: mockHost,
    cdpClientFactory: () => mockCdpClient
  });

  const result = await daemon.tick();

  assert.equal(result.status, 'active');
  assert.equal(result.port, 53908);
  assert.equal(evaluateCalled, true);
  assert.equal(dispatchCalled, false);
});

test('ModDaemon - tick pauses and skips injection when stealth kill-switch is active', async () => {
  const mockResolver = {
    resolvePort: async () => 53908,
    probePort: async () => true
  };

  let dispatchCalled = false;
  const mockCdpClient = {
    evaluate: async () => ({ value: 'paused' })
  };

  const mockHost = {
    dispatch: async () => {
      dispatchCalled = true;
    }
  };

  const daemon = new ModDaemon({
    portResolver: mockResolver,
    modHost: mockHost,
    cdpClientFactory: () => mockCdpClient
  });

  const result = await daemon.tick();

  assert.equal(result.status, 'paused');
  assert.equal(result.port, 53908);
  assert.equal(dispatchCalled, false);
});

test('ModDaemon - tick dispatches mod injection when CDP is alive and mods are missing', async () => {
  const mockResolver = {
    resolvePort: async () => 53908,
    probePort: async () => true
  };

  let dispatchCalled = false;

  const mockCdpClient = {
    evaluate: async () => ({ value: false }) // Not injected
  };

  const mockHost = {
    dispatch: async () => {
      dispatchCalled = true;
      return { success: true };
    }
  };

  const daemon = new ModDaemon({
    portResolver: mockResolver,
    modHost: mockHost,
    cdpClientFactory: () => mockCdpClient
  });

  const result = await daemon.tick();

  assert.equal(result.status, 'injected');
  assert.equal(result.port, 53908);
  assert.equal(dispatchCalled, true);
  assert.ok(daemon.getStatus().lastInjectedAt > 0);
});

test('ModDaemon - start and stop manage timer and running state', async () => {
  const mockResolver = {
    resolvePort: async () => 53908,
    probePort: async () => false
  };

  const daemon = new ModDaemon({ portResolver: mockResolver, pollIntervalMs: 50 });
  assert.equal(daemon.getStatus().isRunning, false);

  daemon.start();
  assert.equal(daemon.getStatus().isRunning, true);

  daemon.stop();
  assert.equal(daemon.getStatus().isRunning, false);
});

test('ModDaemon - handles dispatch errors gracefully without crashing', async () => {
  const mockResolver = {
    resolvePort: async () => 53908,
    probePort: async () => true
  };

  const mockCdpClient = {
    evaluate: async () => ({ value: false })
  };

  const mockHost = {
    dispatch: async () => {
      throw new Error('CDP connection timeout');
    }
  };

  const daemon = new ModDaemon({
    portResolver: mockResolver,
    modHost: mockHost,
    cdpClientFactory: () => mockCdpClient
  });

  const result = await daemon.tick();

  assert.equal(result.status, 'error');
  assert.ok(result.error.includes('CDP connection timeout'));
  assert.equal(daemon.getStatus().isRunning, false);
});
