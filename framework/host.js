import { createDefaultHost } from './core/ModDaemon.js';

/**
 * Standard host entrypoint for Antigravity Mod Framework.
 * Uses createDefaultHost() to ensure all first-party mods (Tachometer, Agent Selector,
 * Mods Manager, and Git Graph) are registered and dispatched together.
 */
export async function runModLoader() {
  try {
    const host = createDefaultHost();
    await host.dispatch();
  } catch (err) {
    // Fail silently in background hook context to ensure no blocking errors
  }
}
