/**
 * Generates dynamic SVG topology graph paths and nodes for Git branches and commits
 * matching the compact VS Code Git Graph aesthetic.
 */

const LANE_COLORS = [
  '#38bdf8', // Sky Blue (Feature / Current branch)
  '#f97316', // Orange (main / remote)
  '#a855f7', // Purple
  '#22c55e', // Emerald
  '#ec4899', // Pink
  '#06b6d4'  // Cyan
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
 * @param {number} [options.rowHeight=26] Base header row height
 * @param {number} [options.fileRowHeight=22] Height per expanded file row
 * @param {number} [options.laneWidth=14] Width per branch lane
 * @param {number} [options.startX=14] Left margin for lane 0
 * @param {number} [options.startY=13] Y-center of first row
 * @returns {string} SVG markup string
 */
export function renderGitGraphSvg(commits = [], options = {}) {
  if (!Array.isArray(commits) || commits.length === 0) {
    return '';
  }

  const rowHeight = options.rowHeight ?? 26;
  const fileRowHeight = options.fileRowHeight ?? 22;
  const laneWidth = options.laneWidth ?? 14;
  const startX = options.startX ?? (options.laneWidth ? options.laneWidth : 14);
  const startY = options.startY ?? 13;

  let maxLane = 0;
  for (const c of commits) {
    if (typeof c.lane === 'number' && c.lane > maxLane) {
      maxLane = c.lane;
    }
  }

  const svgWidth = Math.max(32, startX + (maxLane + 1) * laneWidth + 8);

  // Compute Y-center coordinates for each commit taking expanded files into account
  const commitCoords = [];
  let currentY = 0;

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const isExpanded = !!commit.expanded;
    const fileCount = Array.isArray(commit.files) ? commit.files.length : 0;
    const extraHeight = isExpanded ? fileCount * fileRowHeight : 0;

    const cy = currentY + startY;
    commitCoords.push({
      cy,
      lane: commit.lane ?? 0,
      totalHeight: rowHeight + extraHeight
    });

    currentY += rowHeight + extraHeight;
  }

  const svgHeight = Math.max(currentY, commits.length * rowHeight);

  let pathsMarkup = '';
  let nodesMarkup = '';

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const coord = commitCoords[i];
    const lane = coord.lane;
    const cx = startX + lane * laneWidth;
    const cy = coord.cy;
    const color = getLaneColor(lane);

    // Draw connecting routes down to next commit rows
    if (Array.isArray(commit.routes)) {
      for (const route of commit.routes) {
        const nextIdx = i + 1;
        if (nextIdx >= commits.length) continue;

        const nextCoord = commitCoords[nextIdx];
        const fromX = startX + route.fromLane * laneWidth;
        const fromY = cy;
        const toX = startX + route.toLane * laneWidth;
        const toY = nextCoord.cy;
        const routeColor = getLaneColor(Math.min(route.fromLane, route.toLane));

        if (route.fromLane === route.toLane) {
          // Straight vertical trunk line
          pathsMarkup += `
            <line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="${routeColor}" stroke-width="2" stroke-linecap="round"/>
          `;
        } else {
          // Curved Bezier branch or merge
          const deltaY = toY - fromY;
          const cpY1 = fromY + deltaY * 0.45;
          const cpY2 = toY - deltaY * 0.45;
          pathsMarkup += `
            <path d="M ${fromX} ${fromY} C ${fromX} ${cpY1}, ${toX} ${cpY2}, ${toX} ${toY}" fill="none" stroke="${routeColor}" stroke-width="2" stroke-linecap="round"/>
          `;
        }
      }
    }

    // Node Circle
    const isHead = (Array.isArray(commit.refs) && commit.refs.some(r => r.includes('HEAD'))) || i === 0;
    if (isHead) {
      // Glowing halo ring around current/HEAD commit
      nodesMarkup += `
        <circle cx="${cx}" cy="${cy}" r="6.5" fill="none" stroke="${color}" stroke-width="1.8" class="git-node-halo"/>
        <circle cx="${cx}" cy="${cy}" r="3" fill="${color}" class="git-node-head" data-hash="${commit.hash}"/>
      `;
    } else {
      nodesMarkup += `
        <circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}" stroke="#181a1f" stroke-width="1.5" class="git-node" data-hash="${commit.hash}"/>
      `;
    }
  }

  return `
    <svg class="git-graph-svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="min-width: ${svgWidth}px; height: ${svgHeight}px;" xmlns="http://www.w3.org/2000/svg">
      <g class="git-graph-routes">
        ${pathsMarkup}
      </g>
      <g class="git-graph-nodes">
        ${nodesMarkup}
      </g>
    </svg>
  `.trim();
}
