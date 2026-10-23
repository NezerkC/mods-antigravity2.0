import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Service responsible for discovering and parsing agent markdown files (*.agent.md, agent.md, Agente *.md, SKILL.md)
 * across workspace directories and global Antigravity/Gemini configuration vaults.
 */
export class AgentDiscoveryService {
  /**
   * @param {Object} [options]
   * @param {string[]} [options.searchRoots]
   */
  constructor(options = {}) {
    const homedir = os.homedir();
    this.searchRoots = options.searchRoots || [
      process.cwd(),
      path.join(homedir, '.gemini', 'antigravity', 'scratch', 'architecture-vault'),
      path.join(homedir, '.gemini', 'config', 'skills'),
      path.join(homedir, '.gemini', 'antigravity', 'agents')
    ];
  }

  /**
   * Scans configured paths and returns all discovered agents.
   * @returns {Array<Object>} List of structured agent descriptor objects.
   */
  discoverAgents() {
    const discovered = new Map();

    for (const root of this.searchRoots) {
      if (!fs.existsSync(root)) continue;
      this._scanDirectory(root, discovered, 0, 4);
    }

    return Array.from(discovered.values());
  }

  /**
   * Recursively scans a directory for agent markdown files.
   * @private
   */
  _scanDirectory(dir, map, depth, maxDepth) {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and .git
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          this._scanDirectory(fullPath, map, depth + 1, maxDepth);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          if (this._isAgentFile(entry.name, fullPath)) {
            const agent = this.parseAgentFile(fullPath);
            if (agent && agent.id && !map.has(agent.id)) {
              map.set(agent.id, agent);
            }
          }
        }
      }
    } catch {
      // Gracefully continue on permission or filesystem errors
    }
  }

  /**
   * Determines if a markdown file represents an agent definition.
   * @private
   */
  _isAgentFile(filename, fullPath) {
    const lower = filename.toLowerCase();
    if (lower === 'agent.md' || lower.endsWith('.agent.md') || lower.startsWith('agente ') || lower.startsWith('agente_')) {
      return true;
    }
    if (lower === 'skill.md' && fullPath.includes('skills')) {
      return true;
    }
    return false;
  }

  /**
   * Parses frontmatter or markdown content from an agent file.
   * @param {string} filePath
   * @returns {Object|null}
   */
  parseAgentFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const filename = path.basename(filePath, '.md');

      let name = '';
      let role = '';
      let category = 'Specialist';
      let suite = 'Workspace';
      let icon = '🤖';

      // Detect suite by location
      if (filePath.includes('architecture-vault') || filePath.includes('Bóveda') || filename.toLowerCase().startsWith('agente')) {
        suite = 'Bóveda';
        icon = '🏛️';
      } else if (filePath.toLowerCase().includes('sdd') || filename.toLowerCase().includes('sdd')) {
        suite = 'Gentleman SDD';
        icon = '⚡';
      } else if (filePath.includes('skills')) {
        suite = 'Skills';
        icon = '🛠️';
      }

      // 1. Try parsing YAML frontmatter
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        const fmLines = fmMatch[1].split('\n');
        for (const line of fmLines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          let val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

          if (key === 'name') name = val;
          else if (key === 'description' || key === 'role') role = val;
          else if (key === 'category' || key === 'dominio') category = val;
          else if (key === 'icon') icon = val;
        }
      }

      // Clean up common prefix wrappers in names and roles
      if (name) {
        name = name
          .replace(/^(SKILL(\s+AAS)?:\s*|🤖\s*Agente\s*(Especialista)?:\s*|Agente\s*)/i, '')
          .replace(/\s*\([^)]*Flujos[^)]*\)/i, '')
          .trim();
      }
      if (role) {
        role = role.replace(/^(description:\s*|role:\s*)/i, '').replace(/^["']|["']$/g, '').trim();
      }

      // 2. If name not in frontmatter, extract from first heading
      if (!name) {
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match) {
          name = h1Match[1].replace(/^(Agente|Agent|SKILL:)\s*/i, '').trim();
        } else {
          name = filename.replace(/^Agente\s*/i, '').replace(/[-_]/g, ' ');
        }
      }

      // 3. If role not in frontmatter, extract from subtitle or first non-empty paragraph
      if (!role) {
        const lines = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').split('\n');
        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('![')) {
            role = trimmed.slice(0, 80);
            break;
          }
        }
        if (!role) role = `${name} Specialist`;
      }

      // Generate a clean slug id
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || filename.toLowerCase();

      return {
        id,
        name,
        role,
        category,
        suite,
        icon,
        filePath
      };
    } catch {
      return null;
    }
  }
}
