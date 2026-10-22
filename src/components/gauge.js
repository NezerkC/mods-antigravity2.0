/**
 * Generates an analog speedometer/tachometer SVG based on the reference design.
 * Features an unrotated 240° arc path with a linear gradient:
 * - Green (0% - Empty / Desocupado) on the left
 * - Yellow (40% - Moderate) at top center
 * - Orange (70% - High)
 * - Red (100% - Full / Lleno) on the right
 */
export function renderGaugeSvg(pct = 0, size = 18) {
  const clampedPct = Math.min(Math.max(pct, 0), 100);
  const angle = -120 + (clampedPct / 100) * 240;

  let needleColor = '#22c55e'; // Green when low
  if (clampedPct >= 85) needleColor = '#ef4444';      // Red when critical
  else if (clampedPct >= 60) needleColor = '#f97316'; // Orange when high
  else if (clampedPct >= 25) needleColor = '#eab308'; // Yellow when moderate

  return `
    <svg viewBox="0 0 100 100" width="${size}" height="${size}" style="vertical-align: middle; flex-shrink: 0; overflow: visible;">
      <defs>
        <linearGradient id="antigravityGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#22c55e" />
          <stop offset="35%" stop-color="#eab308" />
          <stop offset="70%" stop-color="#f97316" />
          <stop offset="100%" stop-color="#ef4444" />
        </linearGradient>
        <filter id="gaugeShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3" />
        </filter>
      </defs>
      
      <!-- Background Track (Dark muted) -->
      <path
        d="M 18.82 68 A 36 36 0 1 1 81.18 68"
        fill="none"
        stroke="rgba(255, 255, 255, 0.15)"
        stroke-width="10"
        stroke-linecap="round"
      />

      <!-- Color Gradient Gauge Track (Green at left/start -> Red at right/end) -->
      <path
        d="M 18.82 68 A 36 36 0 1 1 81.18 68"
        fill="none"
        stroke="url(#antigravityGaugeGrad)"
        stroke-width="10"
        stroke-linecap="round"
      />

      <!-- Needle pointing to current context -->
      <g style="transform-origin: 50px 50px; transform: rotate(${angle.toFixed(1)}deg); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);" filter="url(#gaugeShadow)">
        <polygon points="46.5,50 50,14 53.5,50" fill="${needleColor}" />
      </g>

      <!-- Center Hub Pivot -->
      <circle cx="50" cy="50" r="10" fill="#18181b" stroke="#ffffff" stroke-width="2" />
      <circle cx="50" cy="50" r="3.5" fill="#ffffff" />
    </svg>
  `.trim();
}
