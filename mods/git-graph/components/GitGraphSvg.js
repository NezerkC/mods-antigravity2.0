/**
 * Generates dynamic SVG topology graph paths and nodes for Git branches and commits
 * matching the compact VS Code Git Graph aesthetic.
 */

export const LANE_COLORS = [
  '#38bdf8', // Sky Blue (Main / Trunk)
  '#f97316', // Orange
  '#a855f7', // Purple
  '#22c55e', // Emerald
  '#ec4899', // Pink
  '#06b6d4'  // Cyan
];

/**
 * Returns color associated with a lane index.
 * Self-contained palette so getLaneColor.toString() works cleanly in browser runtime.
 * @param {number} lane
 * @returns {string}
 */
export function getLaneColor(lane = 0) {
  const palette = [
    '#38bdf8',
    '#f97316',
    '#a855f7',
    '#22c55e',
    '#ec4899',
    '#06b6d4'
  ];
  return palette[Math.abs(lane) % palette.length];
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
  const startY = options.startY ?? Math.floor(rowHeight / 2);

  let maxLane = 0;
  for (const c of commits) {
    if (typeof c.lane === 'number' && c.lane > maxLane) {
      maxLane = c.lane;
    }
    if (Array.isArray(c.routes)) {
      for (const r of c.routes) {
        if (typeof r.fromLane === 'number' && r.fromLane > maxLane) maxLane = r.fromLane;
        if (typeof r.toLane === 'number' && r.toLane > maxLane) maxLane = r.toLane;
      }
    }
  }

  const hasExpanded = commits.some(c => !!c.expanded && Array.isArray(c.files) && c.files.length > 0);
  const extraPad = hasExpanded ? 22 : 8;
  const svgWidth = Math.max(36, startX + (maxLane + 1) * laneWidth + extraPad);

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
      rowTop: currentY,
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
        const routeColor = getLaneColor(typeof route.colorLane === 'number' ? route.colorLane : Math.min(route.fromLane, route.toLane));

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

    // Render inline inspection capsule: --< * * * * >--
    const isExpanded = !!commit.expanded;
    const fileCount = Array.isArray(commit.files) ? commit.files.length : 0;
    if (isExpanded && fileCount > 0) {
      const subOffset = Math.max(12, laneWidth * 0.85);
      const subX = cx + subOffset;
      const filesStartY = coord.rowTop + rowHeight;
      const itemBottomY = coord.rowTop + coord.totalHeight;
      const firstFileY = filesStartY + (fileRowHeight / 2);
      const lastFileY = filesStartY + (fileCount - 1) * fileRowHeight + (fileRowHeight / 2);
      const spineTopY = Math.min(firstFileY, filesStartY + 4);
      const spineBottomY = Math.max(spineTopY, lastFileY + 4);
      const closeTargetY = Math.min(itemBottomY - 1, spineBottomY + 7);

      // Opening bracket curve: --<
      pathsMarkup += `
        <path d="M ${cx} ${cy} C ${cx + 4} ${cy + 5}, ${subX - 2} ${spineTopY - 4}, ${subX} ${spineTopY}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" class="git-capsule-open"/>
      `;

      // Vertical spine connecting files
      pathsMarkup += `
        <line x1="${subX}" y1="${spineTopY}" x2="${subX}" y2="${spineBottomY}" stroke="${color}" stroke-width="1.4" stroke-dasharray="2,2" class="git-capsule-spine"/>
      `;

      // File nodes (* * * *) with semantic status colors aligned 1:1 with each .git-file-row center
      for (let f = 0; f < fileCount; f++) {
        const file = commit.files[f];
        const fileStatus = (typeof file === 'object' && file.status) ? file.status.toUpperCase() : 'M';
        const fileY = filesStartY + f * fileRowHeight + (fileRowHeight / 2);

        let fileColor = '#f59e0b'; // Amber (Modified)
        if (fileStatus === 'A') fileColor = '#22c55e'; // Emerald (Added)
        else if (fileStatus === 'D') fileColor = '#ef4444'; // Red (Deleted)
        else if (fileStatus === 'R') fileColor = '#06b6d4'; // Cyan (Renamed)

        nodesMarkup += `
          <circle cx="${subX}" cy="${fileY}" r="2.8" fill="${fileColor}" stroke="#181a1f" stroke-width="1" class="git-file-node" data-file-index="${f}"/>
        `;
      }

      // Closing bracket curve: >--
      pathsMarkup += `
        <path d="M ${subX} ${spineBottomY} C ${subX - 2} ${spineBottomY + 3}, ${cx + 4} ${closeTargetY - 2}, ${cx} ${closeTargetY}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" class="git-capsule-close"/>
      `;
    }

    // Node Circle
    const isHead = (Array.isArray(commit.refs) && commit.refs.some(r => r.includes('HEAD'))) || i === 0;
    const isPushed = commit.pushed !== false;

    if (isHead) {
      // Glowing halo ring around current/HEAD commit
      nodesMarkup += `
        <circle cx="${cx}" cy="${cy}" r="6.5" fill="none" stroke="${color}" stroke-width="1.8" class="git-node-halo"/>
        <circle cx="${cx}" cy="${cy}" r="3" fill="${color}" class="git-node-head" data-hash="${commit.hash}"/>
      `;
    } else if (!isPushed) {
      // Local unpushed commit: concentric target ring
      nodesMarkup += `
        <circle cx="${cx}" cy="${cy}" r="5.5" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="2,2" class="git-node-unpushed-ring"/>
        <circle cx="${cx}" cy="${cy}" r="3" fill="${color}" stroke="#181a1f" stroke-width="1" class="git-node git-node-unpushed" data-hash="${commit.hash}"/>
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
