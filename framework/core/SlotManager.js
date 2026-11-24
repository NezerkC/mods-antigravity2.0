// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Victor Manuel Martinez Munoz

/**
 * Manages target UI slots in the Antigravity 2.0 DOM and generates
 * collision-free injection payloads for registered mods across all active chat panels.
 */
export class SlotManager {
  constructor() {
    /** @type {Map<string, { selector: string, strategy: 'before'|'after'|'append'|'prepend' }>} */
    this.slots = new Map([
      ['header-actions', {
        selector: 'button[data-testid="model-selector-trigger"]',
        strategy: 'after'
      }],
      ['header-right', {
        selector: 'header, [role="banner"]',
        strategy: 'append'
      }],
      ['menubar-actions', {
        selector: '.shrink-0 > .bg-sidebar',
        strategy: 'append'
      }],
      ['status-bar', {
        selector: 'footer, [data-testid="status-bar"]',
        strategy: 'append'
      }],
      ['floating-dock', {
        selector: 'body',
        strategy: 'append'
      }],
      ['aux-pane-tab', {
        selector: 'button[data-testid="aux-pane-new-tab-button"]',
        strategy: 'before'
      }],
      ['chat-input-actions', {
        selector: 'button[aria-label="Record voice memo"]',
        strategy: 'before'
      }]
    ]);
  }

  /**
   * Registers a new slot or overrides an existing slot target.
   * @param {string} slotId
   * @param {{ selector: string, strategy: 'before'|'after'|'append'|'prepend' }} definition
   */
  registerSlot(slotId, definition) {
    if (!definition || !definition.selector) {
      throw new Error(`Invalid slot definition for "${slotId}". Selector is required.`);
    }
    this.slots.set(slotId, {
      selector: definition.selector,
      strategy: definition.strategy || 'append'
    });
  }

  /**
   * Retrieves definition for a given slot.
   * @param {string} slotId
   */
  getSlot(slotId) {
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Slot "${slotId}" is not registered in SlotManager.`);
    }
    return slot;
  }

  /**
   * Gets deterministic DOM element ID for a slot container.
   * @param {string} slotId
   * @returns {string}
   */
  getContainerId(slotId) {
    return `antigravity-slot-${slotId}`;
  }

  /**
   * Computes a deterministic content signature to skip redundant innerHTML writes.
   * @param {string} html
   * @returns {string}
   */
  static computeHtmlSignature(html) {
    const text = String(html || '');
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }
    return `${text.length}:${(hash >>> 0).toString(36)}`;
  }

  /**
   * Generates browser-executable JavaScript to mount a mod within a target slot
   * across ALL conversation tabs and split panels matching the selector.
   * @param {Object} params
   * @param {string} params.slotId
   * @param {string} params.modId
   * @param {string} params.htmlContent
   * @returns {string}
   */
  generateMountCode({ slotId, modId, htmlContent }) {
    const slot = this.getSlot(slotId);
    const containerId = this.getContainerId(slotId);
    const modWrapperId = `antigravity-mod-${modId}`;
    const htmlSig = SlotManager.computeHtmlSignature(htmlContent);

    return `
      (() => {
        let anchorEntries = Array.from(document.querySelectorAll('${slot.selector}'))
          .map(anchor => ({ anchor, strategy: '${slot.strategy}' }));

        if (!anchorEntries.length && '${slotId}' === 'aux-pane-tab') {
          const sidePanelNewTabBtns = Array.from(document.querySelectorAll('button[data-testid="side-panel-new-tab-button"]'));
          if (sidePanelNewTabBtns.length) {
            anchorEntries = sidePanelNewTabBtns.map(anchor => ({ anchor, strategy: 'before' }));
          } else {
            let auxBars = Array.from(document.querySelectorAll('[data-active-tab-id], [data-side-panel-strip="true"]'));
            if (!auxBars.length) {
              auxBars = Array.from(document.querySelectorAll('.shrink-0.flex.items-center.gap-0\\\\.5.border-b'));
            }
            if (!auxBars.length) {
              auxBars = Array.from(document.querySelectorAll('div[class*="shrink-0"][class*="border-b"]'));
            }
            for (const auxBar of auxBars) {
              const newTabBtn = auxBar.querySelector('button[data-testid="side-panel-new-tab-button"], button[data-testid="aux-pane-new-tab-button"]');
              if (newTabBtn) {
                anchorEntries.push({ anchor: newTabBtn, strategy: 'before' });
              } else {
                const tabScrollStrip = auxBar.querySelector('.overflow-x-auto');
                if (tabScrollStrip) {
                  anchorEntries.push({ anchor: tabScrollStrip, strategy: 'after' });
                } else {
                  anchorEntries.push({ anchor: auxBar, strategy: 'append' });
                }
              }
            }
          }
        }

        // Clean up any misplaced legacy slot containers that were injected directly inside non-flex wrappers
        if ('${slot.strategy}' === 'before' || '${slot.strategy}' === 'after') {
          document.querySelectorAll('#${containerId}').forEach(el => {
            const parent = el.parentElement;
            const parentCls = parent && typeof parent.className === 'string' ? parent.className : '';
            if (parent && !parentCls.includes('flex') && !parent.hasAttribute('data-active-tab-id') && !parent.hasAttribute('data-side-panel-strip')) {
              el.remove();
            }
          });
        }

        const ensureSlotSizing = (container) => {
          if (container.style.minWidth !== '0') container.style.minWidth = '0';
          if (container.style.maxWidth !== '100%') container.style.maxWidth = '100%';
        };

        const syncModNode = (container) => {
          ensureSlotSizing(container);
          let modNode = container.querySelector('#${modWrapperId}');
          if (!modNode) {
            modNode = document.createElement('div');
            modNode.id = '${modWrapperId}';
            modNode.className = '${modWrapperId}';
            modNode.style.display = 'inline-flex';
            modNode.style.alignItems = 'center';
            modNode.style.height = '28px';
            if ('${slotId}' === 'header-actions') {
              modNode.style.minWidth = '0';
              modNode.style.maxWidth = '100%';
            }
            container.appendChild(modNode);
          }
          if (modNode.getAttribute('data-version') !== '2') {
            modNode.setAttribute('data-version', '2');
          }
          const prevSig = modNode.getAttribute('data-sig');
          const isLiveStateMod = '${modId}' === 'agent-selector' || '${modId}' === 'context-tachometer';
          if (!modNode.firstElementChild || (!isLiveStateMod && prevSig !== '${htmlSig}')) {
            modNode.innerHTML = ${JSON.stringify(htmlContent)};
            modNode.setAttribute('data-sig', '${htmlSig}');
          }
        };

        // If containers already exist in the DOM, ensure mod nodes are hydrated without redundant innerHTML churn
        document.querySelectorAll('#${containerId}').forEach(syncModNode);

        if (!anchorEntries.length) return;

        for (const { anchor, strategy } of anchorEntries) {
          let parent;
          let targetItem = anchor;

          if (strategy === 'append' || strategy === 'prepend') {
            parent = anchor;
          } else {
            parent = anchor.parentElement;
            if (!parent) continue;

            const candidateFlex = anchor.parentElement ? (
              anchor.parentElement.closest('.flex.items-center.gap-1') || 
              anchor.parentElement.closest('.flex.items-center') || 
              anchor.parentElement.closest('.flex')
            ) : null;

            if (candidateFlex && candidateFlex.contains(anchor)) {
              let curr = anchor;
              while (curr.parentElement && curr.parentElement !== candidateFlex) {
                curr = curr.parentElement;
              }
              if (curr.parentElement === candidateFlex) {
                parent = candidateFlex;
                targetItem = curr;
              }
            }
          }

          let container = parent.querySelector('#${containerId}');
          if (!container) {
            container = document.createElement('div');
            container.id = '${containerId}';
            container.className = 'antigravity-slot-container ${containerId}';
            container.style.display = 'inline-flex';
            container.style.alignItems = 'center';
            container.style.gap = '6px';
            container.style.height = '100%';
            container.style.minWidth = '0';
            container.style.maxWidth = '100%';
            container.style.setProperty('app-region', 'no-drag');

            if (strategy === 'after') {
              if (targetItem.nextSibling) {
                parent.insertBefore(container, targetItem.nextSibling);
              } else {
                parent.appendChild(container);
              }
            } else if (strategy === 'before') {
              parent.insertBefore(container, targetItem);
            } else if (strategy === 'prepend') {
              parent.prepend(container);
            } else {
              parent.appendChild(container);
            }
          } else {
            // Ensure slot container remains in the expected position relative to targetItem
            if (strategy === 'after' && (container.parentElement !== parent || container.previousElementSibling !== targetItem)) {
              if (targetItem.nextSibling) {
                parent.insertBefore(container, targetItem.nextSibling);
              } else {
                parent.appendChild(container);
              }
            } else if (strategy === 'before' && (container.parentElement !== parent || container.nextElementSibling !== targetItem)) {
              parent.insertBefore(container, targetItem);
            } else if (strategy === 'prepend' && (container.parentElement !== parent || parent.firstElementChild !== container)) {
              parent.prepend(container);
            } else if (strategy === 'append' && container.parentElement !== parent) {
              parent.appendChild(container);
            }
          }

          syncModNode(container);
        }
      })();
    `;
  }
}
