/**
 * Generates dynamic SVG topology graph paths and nodes for Git branches and commits.
 */

const LANE_COLORS = [
  '#38bdf8', // Cyan (Main)
  '#a855f7', // Purple
  '#22c55e', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4'  // Teal
];

/**
 * Returns color associated with a lane index.
 * @param {number} lane
 * @returns {string}
 */
export function getLaneColor(lane = 0) {
  return LANE_COLORS[Math.abs(lane) % LANE_COLORS.length];
}

/**
 * Renders topological SVG curves, lines, and nodes for an array of commits.
 * @param {Array<Object>} commits
 * @param {Object} [options]
 * @param {number} [options.rowHeight=44]
 * @param {number} [options.laneWidth=20]
 * @param {number} [options.startX=20]
 * @param {number} [options.startY=22]
 * @returns {string} SVG markup string
 */
export function renderGitGraphSvg(commits = [], options = {}) {
  if (!Array.isArray(commits) || commits.length === 0) {
    return '';
  }

  const rowHeight = options.rowHeight ?? 44;
  const laneWidth = options.laneWidth ?? 20;
  const startX = options.startX ?? 20;
  const startY = options.startY ?? 22;

  let maxLane = 0;
  for (const c of commits) {
    if (typeof c.lane === 'number' && c.lane > maxLane) {
      maxLane = c.lane;
    }
  }

  const svgWidth = startX + (maxLane + 1) * laneWidth + 10;
  const svgHeight = commits.length * rowHeight;

  let pathsMarkup = '';
  let nodesMarkup = '';

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const lane = commit.lane ?? 0;
    const cx = startX + lane * laneWidth;
    const cy = startY + i * rowHeight;
    const color = getLaneColor(lane);

    // Draw connecting routes down to next rows
    if (Array.isArray(commit.routes)) {
      for (const route of commit.routes) {
        const fromX = startX + route.fromLane * laneWidth;
        const fromY = cy;
        const toX = startX + route.toLane * laneWidth;
        const toY = cy + rowHeight;
        const routeColor = getLaneColor(Math.min(route.fromLane, route.toLane));

        if (route.fromLane === route.toLane) {
          // Straight trunk line
          pathsMarkup += `
            <line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="${routeColor}" stroke-width="2" stroke-linecap="round"/>
          `;
        } else {
          // Curved Bezier branch or merge
          const cpY1 = fromY + rowHeight * 0.5;
          const cpY2 = toY - rowHeight * 0.5;
          pathsMarkup += `
            <path d="M ${fromX} ${fromY} C ${fromX} ${cpY1}, ${toX} ${cpY2}, ${toX} ${toY}" fill="none" stroke="${routeColor}" stroke-width="2" stroke-linecap="round"/>
          `;
        }
      }
    }

    // Node Circle
    const isHead = Array.isArray(commit.refs) && commit.refs.some(r => r.includes('HEAD'));
    if (isHead) {
      nodesMarkup += `
        <circle cx="${cx}" cy="${cy}" r="7" fill="${color}" opacity="0.35"/>
      `;
    }

    nodesMarkup += `
      <circle cx="${cx}" cy="${cy}" r="${isHead ? 5 : 4}" fill="${color}" stroke="#0f111a" stroke-width="2" class="git-node" data-hash="${commit.hash}"/>
    `;
  }

  return `
    <svg class="git-graph-svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <g class="git-routes">${pathsMarkup}</g>
      <g class="git-nodes">${nodesMarkup}</g>
    </svg>
  `.trim();
}
