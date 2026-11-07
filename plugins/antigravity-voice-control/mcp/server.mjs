import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';

/**
 * List of administrative Language Server RPCs strictly prohibited from subprocess calls.
 */
export const RESTRICTED_RPCS = Object.freeze([
  'JetboxWriteState',
  'DeletePlugin',
  'InstallCustomization'
]);

/**
 * Error thrown when an agent or subprocess attempts to invoke a restricted RPC.
 */
export class RestrictedRpcError extends Error {
  /**
   * @param {string} method
   */
  constructor(method) {
    super(
      `Restricted RPC call rejected: "${method}". Subprocesses and agents are prohibited from modifying installation state directly. Use standard UI links (e.g. customization://<dir>) instead.`
    );
    this.name = 'RestrictedRpcError';
    this.method = method;
  }
}

/**
 * Client for Antigravity Language Server Connect RPC service.
 */
export class LanguageServerRpcClient {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.address] Host:port or URL of the Language Server
   * @param {string} [options.csrfToken] Antigravity CSRF token
   * @param {Function} [options.fetch] Custom fetch implementation
   */
  constructor(options = {}) {
    this.address = options.address || process.env.ANTIGRAVITY_LS_ADDRESS || '127.0.0.1:5387';
    this.csrfToken = options.csrfToken || process.env.ANTIGRAVITY_CSRF_TOKEN || '';
    this.fetch = options.fetch || globalThis.fetch;

    if (!this.fetch) {
      throw new Error('No fetch implementation available for LanguageServerRpcClient.');
    }
  }

  /**
   * Normalizes the host address to an HTTP origin.
   * @returns {string}
   */
  getBaseUrl() {
    const raw = this.address.trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw.replace(/\/+$/, '');
    }
    return `http://${raw}`;
  }

  /**
   * Invokes a Connect RPC method on the Language Server.
   *
   * @param {string} method Method name under LanguageServerService
   * @param {Object} [body={}] Request payload
   * @returns {Promise<Object>} Response payload
   */
  async callRpc(method, body = {}) {
    if (RESTRICTED_RPCS.includes(method)) {
      throw new RestrictedRpcError(method);
    }

    const url = `${this.getBaseUrl()}/exa.language_server_pb.LanguageServerService/${method}`;
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.csrfToken) {
      headers['x-codeium-csrf-token'] = this.csrfToken;
    }

    const response = await this.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {})
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(
        `LanguageServer RPC "${method}" failed with HTTP ${response.status}: ${errText || response.statusText}`
      );
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  /**
   * Retrieves all cascade trajectories and active conversations.
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  async listConversations(options = {}) {
    return this.callRpc('GetAllCascadeTrajectories', options);
  }

  /**
   * Dispatches a user prompt to a target conversation.
   * @param {Object} params
   * @param {string} params.cascadeId
   * @param {string} [params.text]
   * @param {string} [params.message]
   * @returns {Promise<Object>}
   */
  async sendConversationMessage({ cascadeId, text, message }) {
    if (!cascadeId) {
      throw new Error('cascadeId is required to send a conversation message.');
    }
    const content = text ?? message ?? '';
    return this.callRpc('SendUserCascadeMessage', {
      cascadeId,
      text: content,
      message: content
    });
  }

  /**
   * Focuses a specific conversation in the Antigravity UI.
   * @param {Object} params
   * @param {string} params.cascadeId
   * @returns {Promise<Object>}
   */
  async focusConversation({ cascadeId }) {
    if (!cascadeId) {
      throw new Error('cascadeId is required to focus conversation.');
    }
    return this.callRpc('SmartFocusConversation', { cascadeId });
  }

  /**
   * Cancels invocation or generation in a specific conversation.
   * @param {Object} params
   * @param {string} params.cascadeId
   * @returns {Promise<Object>}
   */
  async cancelConversation({ cascadeId }) {
    if (!cascadeId) {
      throw new Error('cascadeId is required to cancel conversation.');
    }
    return this.callRpc('CancelCascadeInvocation', { cascadeId });
  }

  /**
   * Spawns a new integrated terminal.
   * @param {Object} [params={}]
   * @param {string} [params.cwd]
   * @returns {Promise<Object>}
   */
  async createTerminal({ cwd } = {}) {
    return this.callRpc('CreateTerminal', { cwd: cwd || '' });
  }

  /**
   * Sends input text to an open integrated terminal.
   * @param {Object} params
   * @param {string} params.terminalId
   * @param {string} params.input
   * @returns {Promise<Object>}
   */
  async sendTerminalInput({ terminalId, input }) {
    if (!terminalId) {
      throw new Error('terminalId is required to send terminal input.');
    }
    return this.callRpc('SendTerminalInput', {
      terminalId,
      input: input ?? ''
    });
  }

  /**
   * Lists available models in the Language Server.
   * @returns {Promise<Object>}
   */
  async listModels() {
    return this.callRpc('GetAvailableModels', {});
  }
}

/**
 * MCP Tools Schema declarations.
 */
export const MCP_TOOLS = [
  {
    name: 'list_conversations',
    description: 'List open Antigravity conversations, trajectories, and workspace cascades.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceUris: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional workspace URIs to filter conversations'
        }
      }
    }
  },
  {
    name: 'send_conversation_message',
    description: 'Dispatch a prompt directly to a named conversation cascade without polluting current context.',
    inputSchema: {
      type: 'object',
      properties: {
        cascadeId: {
          type: 'string',
          description: 'Unique identifier of the target cascade'
        },
        text: {
          type: 'string',
          description: 'Prompt text to send into the target conversation'
        }
      },
      required: ['cascadeId', 'text']
    }
  },
  {
    name: 'focus_conversation',
    description: 'Focus a specific conversation in the Antigravity UI.',
    inputSchema: {
      type: 'object',
      properties: {
        cascadeId: {
          type: 'string',
          description: 'ID of the cascade to focus'
        }
      },
      required: ['cascadeId']
    }
  },
  {
    name: 'cancel_conversation',
    description: 'Cancel an active cascade invocation or generation.',
    inputSchema: {
      type: 'object',
      properties: {
        cascadeId: {
          type: 'string',
          description: 'ID of the cascade to cancel'
        }
      },
      required: ['cascadeId']
    }
  },
  {
    name: 'create_terminal',
    description: 'Create an integrated terminal session with an optional working directory.',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Initial working directory for the terminal'
        }
      }
    }
  },
  {
    name: 'send_terminal_input',
    description: 'Send input text or commands to an active integrated terminal.',
    inputSchema: {
      type: 'object',
      properties: {
        terminalId: {
          type: 'string',
          description: 'Identifier of the terminal session'
        },
        input: {
          type: 'string',
          description: 'Input command string to execute'
        }
      },
      required: ['terminalId', 'input']
    }
  },
  {
    name: 'list_models',
    description: 'List available models configured in the Language Server.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Starts the stdio JSON-RPC 2.0 MCP server.
 * @param {Object} [options={}]
 */
export function startStdioServer(options = {}) {
  const client = new LanguageServerRpcClient(options);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  const sendResponse = (id, result, error = null) => {
    const payload = {
      jsonrpc: '2.0',
      id
    };
    if (error) {
      payload.error = {
        code: error.code || -32603,
        message: error.message || String(error)
      };
    } else {
      payload.result = result;
    }
    process.stdout.write(JSON.stringify(payload) + '\n');
  };

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
      req = JSON.parse(trimmed);
    } catch (err) {
      sendResponse(null, null, { code: -32700, message: `Parse error: ${err.message}` });
      return;
    }

    if (!req || typeof req !== 'object') return;
    const { id, method, params } = req;

    // Handle notifications (no response needed)
    if (id === undefined || id === null) {
      return;
    }

    try {
      switch (method) {
        case 'initialize': {
          sendResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'antigravity-voice-control-mcp',
              version: '1.0.0'
            }
          });
          break;
        }

        case 'tools/list': {
          sendResponse(id, { tools: MCP_TOOLS });
          break;
        }

        case 'tools/call': {
          const { name, arguments: args = {} } = params || {};
          let result;

          switch (name) {
            case 'list_conversations':
              result = await client.listConversations(args);
              break;
            case 'send_conversation_message':
              result = await client.sendConversationMessage(args);
              break;
            case 'focus_conversation':
              result = await client.focusConversation(args);
              break;
            case 'cancel_conversation':
              result = await client.cancelConversation(args);
              break;
            case 'create_terminal':
              result = await client.createTerminal(args);
              break;
            case 'send_terminal_input':
              result = await client.sendTerminalInput(args);
              break;
            case 'list_models':
              result = await client.listModels();
              break;
            default:
              throw new Error(`Tool not found: "${name}"`);
          }

          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          });
          break;
        }

        default: {
          sendResponse(id, null, {
            code: -32601,
            message: `Method not found: "${method}"`
          });
          break;
        }
      }
    } catch (err) {
      sendResponse(id, null, {
        code: -32603,
        message: err.message || String(err)
      });
    }
  });

  return rl;
}

// Detect if run directly as a script
const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile && currentFile === invokedFile) {
  startStdioServer();
}
