/**
 * Scopes and isolates raw CSS rules to prevent injected mod styles
 * from conflicting with Antigravity host UI.
 */
export class StyleIsolator {
  /**
   * Scopes CSS rules by prefixing non-at-rule selectors with a root container selector.
   * @param {string} css Raw CSS stylesheet string.
   * @param {string} scopeSelector Root container selector (e.g. #antigravity-mod-myid).
   * @returns {string} Scoped CSS string.
   */
  static scopeCss(css, scopeSelector) {
    if (!css || typeof css !== 'string') return '';
    const cleanScope = scopeSelector.trim();
    if (!cleanScope) return css;

    // Strip comments to ensure clean selector tokenization
    const commentFreeCss = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // Tokenize at-rules (like @keyframes, @media) by tracking balanced braces
    const atRuleBlocks = [];
    let text = commentFreeCss;
    let strippedCss = '';

    while (text.length > 0) {
      const atIndex = text.indexOf('@');
      if (atIndex === -1) {
        strippedCss += text;
        break;
      }

      strippedCss += text.slice(0, atIndex);
      text = text.slice(atIndex);

      let depth = 0;
      let endIndex = -1;

      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }

      if (endIndex !== -1) {
        const fullAtRule = text.slice(0, endIndex + 1);
        atRuleBlocks.push(fullAtRule.trim());
        text = text.slice(endIndex + 1);
      } else {
        strippedCss += text;
        break;
      }
    }

    // Now scope standard selector rules: selector { ... }
    const scopedStandardRules = strippedCss.replace(/([^{}]+)\{([^{}]+)\}/g, (match, selectorGroup, declarations) => {
      const trimmedGroup = selectorGroup.trim();
      if (!trimmedGroup) return match;

      const scopedSelectors = trimmedGroup
        .split(',')
        .map(sel => sel.trim())
        .filter(Boolean)
        .map(sel => {
          if (
            sel.includes('-portal') ||
            sel.includes('antigravity-agent-dropdown') ||
            sel.includes('antigravity-mods-manager-portal') ||
            sel.includes('antigravity-git') ||
            sel.includes('git-') ||
            sel.startsWith('.mod-') ||
            sel.startsWith('.mods-manager-') ||
            sel.startsWith('.agent-') ||
            sel.startsWith('.antigravity-agent-item') ||
            sel.startsWith('body') ||
            sel.startsWith(':root')
          ) {
            return sel;
          }
          return `${cleanScope} ${sel}`;
        })
        .join(', ');

      return `${scopedSelectors} {${declarations}}`;
    }).trim();

    // Recombine preserved at-rules and scoped standard rules
    const combined = [];
    if (atRuleBlocks.length) {
      combined.push(atRuleBlocks.join('\n\n'));
    }
    if (scopedStandardRules) {
      combined.push(scopedStandardRules);
    }

    return combined.join('\n\n');
  }
}
