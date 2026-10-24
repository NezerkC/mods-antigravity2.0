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

    return `
      (() => {
        let anchors = Array.from(document.querySelectorAll('${slot.selector}'));
        if (!anchors.length && '${slotId}' === 'aux-pane-tab') {
          const auxBar = document.querySelector('[data-active-tab-id]') ||
                         document.querySelector('.shrink-0.flex.items-center.gap-0\\\\.5.border-b') ||
                         document.querySelector('div[class*="shrink-0"][class*="border-b"]');
          if (auxBar) {
            anchors = [auxBar.querySelector('.overflow-x-auto') || auxBar];
          }
        }

        // Clean up any misplaced legacy slot containers that were injected directly inside non-flex wrappers
        document.querySelectorAll('#${containerId}').forEach(el => {
          if (el.parentElement && !el.parentElement.className.includes('flex')) {
            el.remove();
          }
        });

        // If containers already exist in the DOM, ensure mod nodes are refreshed immediately
        document.querySelectorAll('#${containerId}').forEach(container => {
          let modNode = container.querySelector('#${modWrapperId}');
          if (!modNode) {
            modNode = document.createElement('div');
            modNode.id = '${modWrapperId}';
            modNode.className = '${modWrapperId}';
            modNode.style.display = 'inline-flex';
            modNode.style.alignItems = 'center';
            modNode.style.height = '28px';
            container.appendChild(modNode);
          }
          modNode.setAttribute('data-version', '2');
          modNode.innerHTML = ${JSON.stringify(htmlContent)};
        });

        if (!anchors.length) return;

        for (const anchor of anchors) {
          let parent;
          let targetItem = anchor;

          if ('${slot.strategy}' === 'append' || '${slot.strategy}' === 'prepend') {
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
            container.style.setProperty('app-region', 'no-drag');

            if ('${slot.strategy}' === 'after') {
              if (targetItem.nextSibling) {
                parent.insertBefore(container, targetItem.nextSibling);
              } else {
                parent.appendChild(container);
              }
            } else if ('${slot.strategy}' === 'before') {
              parent.insertBefore(container, targetItem);
            } else if ('${slot.strategy}' === 'prepend') {
              parent.prepend(container);
            } else {
              parent.appendChild(container);
            }
          } else {
            // Ensure slot container remains directly in parent flex row, right after targetItem
            if ('${slot.strategy}' === 'after' && (container.parentElement !== parent || container.previousElementSibling !== targetItem)) {
              if (targetItem.nextSibling) {
                parent.insertBefore(container, targetItem.nextSibling);
              } else {
                parent.appendChild(container);
              }
            } else if (('${slot.strategy}' === 'append' || '${slot.strategy}' === 'prepend') && container.parentElement !== parent) {
              parent.appendChild(container);
            }
          }

          let modNode = container.querySelector('#${modWrapperId}');
          if (!modNode) {
            modNode = document.createElement('div');
            modNode.id = '${modWrapperId}';
            modNode.className = '${modWrapperId}';
            modNode.style.display = 'inline-flex';
            modNode.style.alignItems = 'center';
            modNode.style.height = '28px';
            container.appendChild(modNode);
          }
          modNode.setAttribute('data-version', '2');
          modNode.innerHTML = ${JSON.stringify(htmlContent)};
        }
      })();
    `;
  }
}
