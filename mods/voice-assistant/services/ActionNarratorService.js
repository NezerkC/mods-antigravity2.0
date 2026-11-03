/**
 * Translates raw Antigravity agent steps, tool executions, thoughts, and
 * subagent interactions into concise, natural Spanish voice cues.
 */
export class ActionNarratorService {
  /**
   * Translates a raw action, step title, or event description into a spoken Spanish phrase.
   * @param {string} [action='']
   * @param {Object} [meta={}]
   * @param {string} [meta.type] Event type ('thought'|'tool'|'subagent_dispatch'|'subagent_return')
   * @param {string} [meta.role] Subagent role if applicable
   * @returns {string|null} The phrase to speak, or null if ignored.
   */
  static translateAction(action = '', meta = {}) {
    const raw = String(action || '').trim();

    // 1. Explicit Subagent Events
    if (meta.type === 'subagent_return' || /subagent.*(return|completed|responded|finish)/i.test(raw)) {
      return 'Recepcionando respuestas de subagentes';
    }

    if (meta.type === 'subagent_dispatch' || /invoke_subagent|launching subagent|delegat/i.test(raw)) {
      const role = meta.role || ActionNarratorService.extractRole(raw);
      return role ? `Delegando tarea a subagente ${role}` : 'Delegando tarea a subagente';
    }

    if (!raw) {
      return null;
    }

    // 2. Working Thought Steps
    if (/^thought for \d+s/i.test(raw) || /^thinking/i.test(raw)) {
      return 'Pensando...';
    }

    // 3. Multi-action summaries
    if (/explored files,\s*ran commands/i.test(raw)) {
      return 'Explorando archivos y ejecutando comandos...';
    }

    // 4. File Operations
    const readMatch = raw.match(/read (?:file\s+)?([^\s>]+)/i);
    if (readMatch) {
      const fileName = ActionNarratorService.extractBasename(readMatch[1]);
      return fileName ? `Leyendo archivo ${fileName}...` : 'Leyendo archivo...';
    }

    const editMatch = raw.match(/(?:edit|modify) (?:file\s+)?([^\s>]+)/i);
    if (editMatch) {
      const fileName = ActionNarratorService.extractBasename(editMatch[1]);
      return fileName ? `Modificando archivo ${fileName}...` : 'Modificando archivo...';
    }

    const writeMatch = raw.match(/(?:write|create) (?:file\s+)?([^\s>]+)/i);
    if (writeMatch) {
      const fileName = ActionNarratorService.extractBasename(writeMatch[1]);
      return fileName ? `Creando archivo ${fileName}...` : 'Creando archivo...';
    }

    // 5. Command Operations
    if (/^ran check git status/i.test(raw)) {
      return 'Verificando estado de Git...';
    }

    if (/^ran list project (files|directories)/i.test(raw)) {
      return 'Listando archivos del proyecto...';
    }

    if (/^ran inspect/i.test(raw)) {
      return 'Inspeccionando archivos del sistema...';
    }

    if (/^ran commands/i.test(raw) || /^ran /i.test(raw) || /^run command/i.test(raw)) {
      return 'Ejecutando comandos...';
    }

    // 6. Generic Analysis
    if (/^analyzed /i.test(raw)) {
      return 'Analizando contexto...';
    }

    return null;
  }

  /**
   * Extracts clean filename from path or string.
   * @param {string} [filePath='']
   * @returns {string}
   */
  static extractBasename(filePath = '') {
    if (!filePath) return '';
    const clean = filePath.replace(/[`'"]/g, '').split(/[/\\]/).pop();
    return clean || '';
  }

  /**
   * Attempts to extract a subagent role name from a prompt or string.
   * @param {string} [text='']
   * @returns {string}
   */
  static extractRole(text = '') {
    const match = text.match(/(?:to|subagent|role)\s+["']?([A-Za-z0-9_-]+)["']?/i);
    return match ? match[1] : '';
  }
}
