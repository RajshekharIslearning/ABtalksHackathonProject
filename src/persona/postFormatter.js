'use strict';
/**
 * Module C — Persona Engine: Post Formatter
 *
 * Safe, non-destructive text cleanup only.
 *
 * This module DOES NOT:
 * - Rewrite meaning
 * - Invent content
 * - Truncate text
 * - Alter technical claims
 *
 * This module DOES:
 * - Trim leading/trailing whitespace
 * - Remove accidental surrounding quotes
 * - Normalize excessive blank lines (max 2 consecutive)
 * - Normalize excessive internal spaces
 * - Remove accidental markdown code fences
 * - Normalize malformed hashtag spacing
 * - Format the rationale object into a readable string for DB storage
 */

/**
 * Removes accidental surrounding quotes that the model may add.
 * Only strips if the entire string is wrapped in the same quote character.
 *
 * @param {string} text
 * @returns {string}
 */
function stripSurroundingQuotes(text) {
  const t = text.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('\u2018') && t.endsWith('\u2019')) || // left/right single
    (t.startsWith('\u201C') && t.endsWith('\u201D'))    // left/right double
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/**
 * Removes markdown code fences that the model may accidentally include.
 * Strips ```json, ```text, ``` etc.
 *
 * @param {string} text
 * @returns {string}
 */
function removeMarkdownFences(text) {
  return text
    .replace(/^```[\w]*\s*/gm, '')
    .replace(/```\s*$/gm, '')
    .trim();
}

/**
 * Normalizes runs of more than 2 consecutive blank lines down to 2.
 * Preserves intentional paragraph spacing without allowing excessive gaps.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeBlankLines(text) {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Normalizes runs of more than 2 spaces inside a line (not at line start).
 * Preserves intentional indentation (e.g. list items).
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeExcessiveSpaces(text) {
  // Replace 2+ spaces not at the start of a line with a single space
  return text.replace(/([^\n]) {2,}/g, '$1 ');
}

/**
 * Normalizes malformed hashtag spacing.
 * Ensures hashtags are preceded by a space or a newline and
 * have no space between # and the tag word.
 *
 * Examples of what this fixes:
 *   "word#tag"  → "word #tag"
 *   "# tag"     → "#tag"
 *   "#  tag"    → "#tag"
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeHashtagSpacing(text) {
  // Remove space(s) between # and the word
  let result = text.replace(/#\s+(\w)/g, '#$1');

  // Ensure a hashtag is preceded by a space or newline if it follows a non-whitespace char
  result = result.replace(/([^\s\n])(#\w)/g, '$1 $2');

  return result;
}

/**
 * Formats the rationale object into a compact, human-readable pipe-delimited
 * string for DB storage.
 *
 * The format is:
 *   SELECTED BECAUSE: ... | TIMELY BECAUSE: ... | EDITORIAL FIT: ... | SOURCES: url1, url2
 *
 * @param {object} rationale - { whySelected, whyRelevantNow, editorialStandards, sources }
 * @returns {string}
 */
function formatRationale(rationale) {
  if (!rationale || typeof rationale !== 'object') {
    return 'Rationale not available';
  }

  const parts = [
    `SELECTED BECAUSE: ${rationale.whySelected || 'N/A'}`,
    `TIMELY BECAUSE: ${rationale.whyRelevantNow || 'N/A'}`,
    `EDITORIAL FIT: ${rationale.editorialStandards || 'N/A'}`,
    `SOURCES: ${Array.isArray(rationale.sources) ? rationale.sources.join(', ') : 'N/A'}`,
  ];

  return parts.join(' | ');
}

/**
 * Applies all safe formatting passes to the post text.
 * Each pass is non-destructive and preserves original meaning.
 *
 * @param {string} text - Raw post text from Gemini
 * @returns {string} Cleaned post text
 */
function formatPostText(text) {
  if (!text || typeof text !== 'string') return '';

  let result = text;

  result = removeMarkdownFences(result);
  result = stripSurroundingQuotes(result);
  result = normalizeExcessiveSpaces(result);
  result = normalizeBlankLines(result);
  result = normalizeHashtagSpacing(result);

  return result.trim();
}

module.exports = {
  formatPostText,
  formatRationale,
  // Sub-functions exported for unit testing
  stripSurroundingQuotes,
  removeMarkdownFences,
  normalizeBlankLines,
  normalizeExcessiveSpaces,
  normalizeHashtagSpacing,
};
