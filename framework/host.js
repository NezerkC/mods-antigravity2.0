import { ModHost } from './core/ModHost.js';
import { ContextTachometerMod } from '../mods/context-tachometer/index.js';
import { AgentSelectorMod } from '../mods/agent-selector/index.js';
import { ModsManagerMod } from '../mods/mods-manager/index.js';

/**
 * Standard host entrypoint for Antigravity Mod Framework.
 */
export async function runModLoader() {
  try {
    const host = new ModHost();
    // Register default first-party mods
    host.registerMod(new ContextTachometerMod());
    host.registerMod(new AgentSelectorMod());
    host.registerMod(new ModsManagerMod());

    await host.dispatch();
  } catch (err) {
    // Fail silently in background hook context to ensure no blocking errors
    // Console log only in debug mode
  }
}
