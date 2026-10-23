import { CdpWebSocketClient } from '../framework/core/CdpWebSocketClient.js';
import { CdpPortResolver } from '../framework/core/CdpPortResolver.js';

async function testClickToggle() {
  const resolver = new CdpPortResolver();
  const port = await resolver.resolvePort();
  const client = new CdpWebSocketClient({ port });

  const query = `
    (() => {
      const tachBadge = document.querySelector('.antigravity-tachometer-badge');
      const agentBadge = document.querySelector('.antigravity-agent-badge');
      if (!tachBadge || !agentBadge) return { error: 'Badges not found' };

      const tachPortal = document.getElementById('antigravity-tachometer-popover-portal');
      const agentPortal = document.getElementById('antigravity-agent-dropdown-portal');

      // 1. Initial state (both closed)
      const initial = {
        tachOpen: tachPortal ? tachPortal.classList.contains('open') : false,
        agentOpen: agentPortal ? agentPortal.classList.contains('open') : false
      };

      // 2. Mouseenter on tachometer - SHOULD NOT OPEN!
      tachBadge.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const afterTachHover = {
        tachOpen: tachPortal ? tachPortal.classList.contains('open') : false
      };

      // 3. Click on tachometer - SHOULD OPEN!
      tachBadge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const afterTachClick = {
        tachOpen: tachPortal ? tachPortal.classList.contains('open') : false,
        badgeHasOpenClass: tachBadge.classList.contains('open')
      };

      // 4. Click on agent selector - SHOULD OPEN AGENT AND CLOSE TACHOMETER!
      agentBadge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const afterAgentClick = {
        tachOpen: tachPortal ? tachPortal.classList.contains('open') : false,
        agentOpen: agentPortal ? agentPortal.classList.contains('open') : false,
        agentBadgeHasOpenClass: agentBadge.classList.contains('open')
      };

      // 5. Click outside (on document body) - SHOULD CLOSE ALL!
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const afterOutsideClick = {
        tachOpen: tachPortal ? tachPortal.classList.contains('open') : false,
        agentOpen: agentPortal ? agentPortal.classList.contains('open') : false
      };

      return { initial, afterTachHover, afterTachClick, afterAgentClick, afterOutsideClick };
    })()
  `;

  const result = await client.evaluate(query);
  console.log(JSON.stringify(result, null, 2));
}

testClickToggle().catch(console.error);
