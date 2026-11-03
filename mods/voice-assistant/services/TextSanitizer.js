/**
 * Sanitizes Markdown, code blocks, URLs, and developer artifacts into
 * clean, natural conversational text suitable for Text-to-Speech (TTS) synthesis.
 */
export class TextSanitizer {
  /**
   * Cleans text for speech synthesis.
   * @param {string} [rawText='']
   * @param {number} [maxChars=800]
   * @returns {string}
   */
  static sanitizeForSpeech(rawText = '', maxChars = 800) {
    if (!rawText || typeof rawText !== 'string') {
      return '';
    }

    let text = rawText;

    // 1. Remove fenced code blocks (e.g., ```js ... ```)
    text = text.replace(/```[\s\S]*?```/g, ' [bloque de código omitido] ');

    // 2. Remove markdown images: ![alt](url)
    text = text.replace(/!\[.*?\]\(.*?\)/g, '');

    // 3. Convert markdown links: [label](url) -> label
    text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');

    // 4. Remove standalone URLs (http/https/ftp)
    text = text.replace(/https?:\/\/\S+/gi, '');

    // 5. Remove HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // 6. Convert inline code `foo` -> foo
    text = text.replace(/`([^`]+)`/g, '$1');

    // 7. Strip markdown header markers, blockquotes, bullets, horizontal rules
    text = text.replace(/^\s*#{1,6}\s+/gm, '');
    text = text.replace(/^\s*>\s*/gm, '');
    text = text.replace(/^\s*[-*+]\s+/gm, '');
    text = text.replace(/^\s*\d+\.\s+/gm, '');
    text = text.replace(/^---$/gm, '');

    // 8. Strip bold/italic/strike markers (**foo**, *foo*, ~~foo~~)
    text = text.replace(/[*_~]{1,3}/g, '');

    // 9. Normalize whitespace and newlines
    text = text.replace(/\s+/g, ' ').trim();

    // 10. Truncate safely if too long
    if (text.length > maxChars) {
      text = text.slice(0, maxChars).trim() + '...';
    }

    return text;
  }
}
