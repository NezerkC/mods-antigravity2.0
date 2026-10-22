/**
 * Vector SVG representation of the Fedora Hat and Sunglasses icon.
 * Matches the classic spy / agent silhouette.
 */
export function renderAgentIconSvg(size = 16) {
  return `
    <svg class="antigravity-agent-icon" viewBox="0 0 100 100" width="${size}" height="${size}" fill="currentColor" style="vertical-align: middle; flex-shrink: 0; overflow: visible;">
      <!-- Fedora Hat Crown with classic crease -->
      <path d="M 33 40 C 29 23, 40 13, 50 18 C 60 13, 71 23, 67 40 Z" />
      
      <!-- Hat Ribbon Band -->
      <path d="M 31 38 C 44 35, 56 35, 69 38 L 71 43 C 57 40, 43 40, 29 43 Z" opacity="0.8" />
      
      <!-- Wide Curved Brim -->
      <path d="M 12 47 C 32 38, 68 38, 88 47 C 68 43, 32 43, 12 47 Z" />
      
      <!-- Sunglasses Frame -->
      <path d="M 24 57 C 24 53, 46 53, 47 57 L 46 69 C 45 77, 26 77, 25 69 Z" />
      <path d="M 53 57 C 54 53, 76 53, 76 57 L 75 69 C 74 77, 55 77, 54 69 Z" />
      
      <!-- Sunglasses Bridge -->
      <path d="M 46 57 Q 50 54 54 57" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none" />
      
      <!-- Lens Gloss Highlights -->
      <path d="M 28 58 Q 38 56 42 61" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6" />
      <path d="M 57 58 Q 67 56 71 61" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6" />
    </svg>
  `.trim();
}
