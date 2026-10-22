/**
 * Generates an analog speedometer/tachometer SVG based on the reference design.
 * Features a 240° rainbow gradient track, dark center pivot, and an animated red needle.
 */
export function renderGaugeSvg(pct = 0, size = 18) {
  const clampedPct = Math.min(Math.max(pct, 0), 100);
  const angle = -120 + (clampedPct / 100) * 240;

  // Arc calculations:
  // Center: (50, 50), Radius: 36
  // Circumference = 2 * PI * 36 = 226.19
  // 240 deg arc length = 226.19 * (240 / 360) = 150.8
  const dashLength = 150.8;
  const circumference = 226.19;

  return `
    <svg viewBox="0 0 100 100" width="${size}" height="${size}" style="vertical-align: middle; flex-shrink: 0; overflow: visible;">
      <defs>
        <linearGradient id="antigravityGaugeGrad" x1="0%" y1="100%" x2="100%" y2="100%">
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
      <circle
        cx="50"
        cy="50"
        r="36"
        fill="none"
        stroke="rgba(255, 255, 255, 0.15)"
        stroke-width="10"
        stroke-dasharray="${dashLength} ${circumference}"
        stroke-linecap="round"
        transform="rotate(150 50 50)"
      />

      <!-- Color Gradient Gauge Track -->
      <circle
        cx="50"
        cy="50"
        r="36"
        fill="none"
        stroke="url(#antigravityGaugeGrad)"
        stroke-width="10"
        stroke-dasharray="${dashLength} ${circumference}"
        stroke-linecap="round"
        transform="rotate(150 50 50)"
      />

      <!-- Red Needle -->
      <g style="transform-origin: 50px 50px; transform: rotate(${angle.toFixed(1)}deg); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);" filter="url(#gaugeShadow)">
        <polygon points="46.5,50 50,14 53.5,50" fill="#ef4444" />
      </g>

      <!-- Center Hub Pivot -->
      <circle cx="50" cy="50" r="10" fill="#18181b" stroke="#ffffff" stroke-width="2" />
      <circle cx="50" cy="50" r="3.5" fill="#ffffff" />
    </svg>
  `.trim();
}
