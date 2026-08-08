'use strict';
/**
 * Module C — Persona Engine: Validation Suite
 *
 * Stateless validation functions for generated post objects.
 * Each function is pure and independently testable.
 *
 * Primary entry point:
 *   validate(post, topicUrl) → { valid: boolean, errors: string[] }
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MIN_WORDS = 150;
const MAX_WORDS = 280;
const MAX_HASHTAGS = 3;

/**
 * Phrases that violate persona quality standards.
 * Checked case-insensitively against the post text.
 */
const FORBIDDEN_PHRASES = [
  'game-changer',
  'game changer',
  'revolutionary',
  'groundbreaking',
  'paradigm shift',
  'in conclusion',
  'cutting-edge',
  'unprecedented',
  'the future of ai',
  'ai is transforming',
  'ai is revolutionizing',
  'the possibilities are endless',
  'as we navigate',
  'here are 5 things',
  'here are 3 things',
  'here are 7 things',
  'you need to know',
  'don\'t miss this',
];

/**
 * Post openings that are explicitly forbidden.
 * Matched against the trimmed beginning of the post text.
 */
const FORBIDDEN_OPENINGS = [
  /^i\s/i,                            // Starts with "I "
  /^in today's world/i,               // "In today's world..."
  /^in today's (rapidly|fast|ever)/i, // "In today's rapidly..."
];

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that the post object contains all required top-level fields.
 * @param {object} post - The generated post object from Gemini
 * @param {string} topicUrl - The original topic URL (used for source checks)
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validatePostObject(post, topicUrl) {
  const errors = [];

  if (!post || typeof post !== 'object') {
    return ['Post object is null or not an object'];
  }

  if (!post.postText || typeof post.postText !== 'string' || post.postText.trim().length === 0) {
    errors.push('Missing or empty: postText');
  }

  if (!post.rationale || typeof post.rationale !== 'object') {
    errors.push('Missing or invalid: rationale (must be an object)');
    return errors; // early return — remaining rationale checks will crash without this field
  }

  const r = post.rationale;

  if (!r.whySelected || typeof r.whySelected !== 'string' || r.whySelected.trim().length === 0) {
    errors.push('Missing or empty: rationale.whySelected');
  }

  if (!r.whyRelevantNow || typeof r.whyRelevantNow !== 'string' || r.whyRelevantNow.trim().length === 0) {
    errors.push('Missing or empty: rationale.whyRelevantNow');
  }

  if (!r.editorialStandards || typeof r.editorialStandards !== 'string' || r.editorialStandards.trim().length === 0) {
    errors.push('Missing or empty: rationale.editorialStandards');
  }

  if (!Array.isArray(r.sources) || r.sources.length === 0) {
    errors.push('Missing or empty: rationale.sources (must be a non-empty array)');
  }

  return errors;
}

/**
 * Counts whitespace-delimited words in a string.
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Validates that the post text is within the required word count range.
 * @param {string} text - Post text to check
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validateWordCount(text) {
  if (!text || typeof text !== 'string') {
    return ['Word count check failed: text is missing'];
  }

  const words = countWords(text);

  if (words < MIN_WORDS) {
    return [`Post is too short: ${words} words (minimum ${MIN_WORDS})`];
  }

  if (words > MAX_WORDS) {
    return [`Post is too long: ${words} words (maximum ${MAX_WORDS})`];
  }

  return [];
}

/**
 * Validates that the post does not begin with a forbidden opening.
 * @param {string} text - Post text to check
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validateForbiddenOpenings(text) {
  if (!text || typeof text !== 'string') return [];

  const trimmed = text.trim();
  const errors = [];

  for (const pattern of FORBIDDEN_OPENINGS) {
    if (pattern.test(trimmed)) {
      errors.push(`Post opens with a forbidden pattern: "${trimmed.substring(0, 40)}..."`);
      break; // only report one opening violation
    }
  }

  return errors;
}

/**
 * Validates that the post does not contain forbidden hype phrases.
 * @param {string} text - Post text to check
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validateForbiddenPhrases(text) {
  if (!text || typeof text !== 'string') return [];

  const lower = text.toLowerCase();
  const errors = [];

  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      errors.push(`Post contains forbidden phrase: "${phrase}"`);
    }
  }

  return errors;
}

/**
 * Validates that the post does not exceed the maximum hashtag count.
 * @param {string} text - Post text to check
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validateHashtags(text) {
  if (!text || typeof text !== 'string') return [];

  const hashtags = text.match(/#\w+/g) || [];

  if (hashtags.length > MAX_HASHTAGS) {
    return [`Post has ${hashtags.length} hashtags — maximum is ${MAX_HASHTAGS}`];
  }

  return [];
}

/**
 * Validates that the original topic URL is present in the rationale sources.
 * Prevents source hallucination by ensuring provenance is preserved.
 *
 * @param {string[]} sources - Array of source URLs from rationale
 * @param {string} topicUrl - The original approved topic URL
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validateSourceIntegrity(sources, topicUrl) {
  const errors = [];

  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push('Source integrity: no sources present in rationale');
    return errors;
  }

  if (!topicUrl || typeof topicUrl !== 'string') {
    // If we have no topic URL to compare, skip source check
    return [];
  }

  const normalizedTopicUrl = topicUrl.trim().toLowerCase();
  const hasOriginalSource = sources.some(s =>
    typeof s === 'string' && s.trim().toLowerCase() === normalizedTopicUrl
  );

  if (!hasOriginalSource) {
    errors.push(`Source integrity: original topic URL not found in generated sources. Expected: ${topicUrl}`);
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY VALIDATION ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs all validators against the generated post object.
 *
 * @param {object} post - Generated post object from Gemini
 * @param {string} topicUrl - Original approved topic URL
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(post, topicUrl) {
  const errors = [];

  // 1. Required fields
  errors.push(...validatePostObject(post, topicUrl));

  // If postText is missing entirely, we cannot run text validators — return early
  if (!post || !post.postText) {
    return { valid: false, errors };
  }

  const text = post.postText;
  const sources = post.rationale?.sources || [];

  // 2. Word count
  errors.push(...validateWordCount(text));

  // 3. Forbidden openings
  errors.push(...validateForbiddenOpenings(text));

  // 4. Forbidden phrases
  errors.push(...validateForbiddenPhrases(text));

  // 5. Hashtag limit
  errors.push(...validateHashtags(text));

  // 6. Source integrity
  errors.push(...validateSourceIntegrity(sources, topicUrl));

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validate,
  // Individual validators exported for unit testing
  validatePostObject,
  validateWordCount,
  validateForbiddenOpenings,
  validateForbiddenPhrases,
  validateHashtags,
  validateSourceIntegrity,
  countWords,
  // Constants exported for test reference
  MIN_WORDS,
  MAX_WORDS,
  MAX_HASHTAGS,
  FORBIDDEN_PHRASES,
};
