import { CdpPortResolver } from '../src/core/CdpPortResolver.js';
import { CdpWebSocketClient } from '../src/core/CdpWebSocketClient.js';

async function testInteractive() {
  const resolver = new CdpPortResolver();
  const port = resolver.resolvePort();
  const client = new CdpWebSocketClient({ port, timeoutMs: 3000 });

  console.log('Testing interactive agent dropdown click & positioning...');

  const expression = `
    (() => {
      const badge = document.querySelector('.antigravity-agent-badge');
      if (!badge) return { error: 'Agent badge not found' };

      // 1. Click badge to open
      badge.click();

      const portal = document.getElementById('antigravity-agent-dropdown-portal');
      if (!portal) return { error: 'Portal element not found' };

      const isOpen = portal.classList.contains('open');
      const rect = portal.getBoundingClientRect();
      const badgeRect = badge.getBoundingClientRect();

      // 2. Select an agent: 'sdd-apply'
      window.__selectAntigravityAgent('sdd-apply', 'SDD Apply (TDD)', 'hsl(24, 95%, 55%)');

      const activeName = document.querySelector('.antigravity-active-agent-name')?.textContent;
      const isOpenAfterSelect = portal.classList.contains('open');

      // 3. Test Tachometer Popover
      const tachBadge = document.querySelector('.antigravity-tachometer-badge');
      if (tachBadge) {
        window.__showTachometerPopover(tachBadge);
      }
      const tachPortal = document.getElementById('antigravity-tachometer-popover-portal');
      const tachRect = tachPortal ? tachPortal.getBoundingClientRect() : null;
      const tachOpen = tachPortal ? tachPortal.classList.contains('open') : false;

      // Close tachometer
      if (tachPortal) {
        tachPortal.classList.remove('open');
        tachPortal.__isPinned = false;
      }

      return {
        window: { width: window.innerWidth, height: window.innerHeight },
        badgeRect: { top: badgeRect.top, bottom: badgeRect.bottom, left: badgeRect.left },
        agentPortal: {
          isOpen,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          fullyVisibleInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth
        },
        selectionTest: {
          activeName,
          closedAfterSelect: !isOpenAfterSelect
        },
        tachometerTest: {
          isOpen: tachOpen,
          top: tachRect?.top,
          bottom: tachRect?.bottom,
          fullyVisibleInViewport: tachRect ? (tachRect.top >= 0 && tachRect.bottom <= window.innerHeight) : false
        }
      };
    })()
  `;

  const res = await client.evaluate(expression);
  console.log('Interactive Live Test Result:\n', JSON.stringify(res.value, null, 2));
}

testInteractive();
