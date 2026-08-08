'use strict';
/**
 * Module C — Persona Engine: Standalone Test Suite
 *
 * Run with: node src/persona/test.js
 *
 * Tests the complete Module C pipeline in isolation.
 * Does NOT require the full server, scheduler, or SQLite DB.
 *
 * Covers:
 *  - Module import checks
 *  - Persona profile resolution (known + unknown domains)
 *  - Validator unit tests
 *  - Post formatter unit tests
 *  - Post object contract shape
 *  - Live generation test (runs only if GEMINI_API_KEY is set)
 */

require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// TEST HARNESS
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
    failures.push(label);
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TOPIC = {
  title: 'Researchers discover a critical vulnerability in an open-source LLM inference system',
  summary: 'Security researchers identified a remote code execution vulnerability affecting deployments of a widely used open-source inference system. The issue stems from an unsanitized deserialization path in the model loading routine. Production deployments using the default configuration are affected.',
  url: 'https://example.com/llm-inference-vulnerability-2024',
  whyNow: 'The vulnerability was publicly disclosed and a proof-of-concept exploit is available, raising urgency for operators running the affected software.',
  whySelected: 'Directly relevant to AI security professionals managing inference infrastructure. Combines model supply chain risk with classic software vulnerability patterns.',
  relevanceScore: 0.92,
};

const PERSONAS = [
  { name: 'Ada', domain: 'AI Security' },
  { name: 'Alex', domain: 'Machine Learning' },
  { name: 'Taylor', domain: 'Quantum Computing' }, // Unknown domain — must fall back to default
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: MODULE IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

section('1. Module Imports');

let personaProfiles, validators, postFormatter, writer;

try {
  personaProfiles = require('./personaProfiles');
  assert(typeof personaProfiles.getPersonaProfile === 'function', 'personaProfiles exports getPersonaProfile()');
  assert(typeof personaProfiles.DEFAULT_PROFILE === 'object', 'personaProfiles exports DEFAULT_PROFILE');
  assert(personaProfiles.PERSONA_REGISTRY instanceof Map, 'personaProfiles exports PERSONA_REGISTRY as a Map');
} catch (err) {
  console.error('  ❌ Failed to import personaProfiles:', err.message);
  failed++;
}

try {
  validators = require('./validators');
  assert(typeof validators.validate === 'function', 'validators exports validate()');
  assert(typeof validators.validateWordCount === 'function', 'validators exports validateWordCount()');
  assert(typeof validators.validateForbiddenPhrases === 'function', 'validators exports validateForbiddenPhrases()');
  assert(typeof validators.validateHashtags === 'function', 'validators exports validateHashtags()');
  assert(typeof validators.validateSourceIntegrity === 'function', 'validators exports validateSourceIntegrity()');
  assert(typeof validators.validateForbiddenOpenings === 'function', 'validators exports validateForbiddenOpenings()');
  assert(typeof validators.countWords === 'function', 'validators exports countWords()');
} catch (err) {
  console.error('  ❌ Failed to import validators:', err.message);
  failed++;
}

try {
  postFormatter = require('./postFormatter');
  assert(typeof postFormatter.formatPostText === 'function', 'postFormatter exports formatPostText()');
  assert(typeof postFormatter.formatRationale === 'function', 'postFormatter exports formatRationale()');
  assert(typeof postFormatter.stripSurroundingQuotes === 'function', 'postFormatter exports stripSurroundingQuotes()');
  assert(typeof postFormatter.normalizeHashtagSpacing === 'function', 'postFormatter exports normalizeHashtagSpacing()');
} catch (err) {
  console.error('  ❌ Failed to import postFormatter:', err.message);
  failed++;
}

try {
  writer = require('./writer');
  assert(typeof writer.writeAndPublishPost === 'function', 'writer exports writeAndPublishPost()');
} catch (err) {
  console.error('  ❌ Failed to import writer:', err.message);
  failed++;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: PERSONA PROFILE RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

section('2. Persona Profile Resolution');

const { getPersonaProfile, DEFAULT_PROFILE } = personaProfiles;

// Known domains
const aiSecProfile = getPersonaProfile('AI Security');
assert(aiSecProfile !== DEFAULT_PROFILE, 'AI Security resolves to a specific profile (not default)');
assert(aiSecProfile.role.toLowerCase().includes('security'), 'AI Security profile has correct role');
assert(Array.isArray(aiSecProfile.opinions) && aiSecProfile.opinions.length > 0, 'AI Security profile has opinions');
assert(Array.isArray(aiSecProfile.writingPatterns) && aiSecProfile.writingPatterns.length > 0, 'AI Security profile has writingPatterns');
assert(Array.isArray(aiSecProfile.forbiddenPatterns) && aiSecProfile.forbiddenPatterns.length > 0, 'AI Security profile has forbiddenPatterns');

const mlProfile = getPersonaProfile('Machine Learning');
assert(mlProfile !== DEFAULT_PROFILE, 'Machine Learning resolves to a specific profile');
assert(mlProfile.role.toLowerCase().includes('machine learning'), 'Machine Learning profile has correct role');

const aiEngProfile = getPersonaProfile('AI Engineering');
assert(aiEngProfile !== DEFAULT_PROFILE, 'AI Engineering resolves to a specific profile');

const cloudProfile = getPersonaProfile('Cloud Architecture');
assert(cloudProfile !== DEFAULT_PROFILE, 'Cloud Architecture resolves to a specific profile');

const cyberProfile = getPersonaProfile('Cybersecurity');
assert(cyberProfile !== DEFAULT_PROFILE, 'Cybersecurity resolves to a specific profile');

const swEngProfile = getPersonaProfile('Software Engineering');
assert(swEngProfile !== DEFAULT_PROFILE, 'Software Engineering resolves to a specific profile');

// Unknown domain — must NOT crash
const unknownProfile = getPersonaProfile('Quantum Computing');
assert(unknownProfile === DEFAULT_PROFILE, 'Unknown domain "Quantum Computing" falls back to DEFAULT_PROFILE');
assert(typeof unknownProfile.role === 'string', 'Default profile has a role string');

// Edge cases — must NOT crash
const nullProfile = getPersonaProfile(null);
assert(nullProfile === DEFAULT_PROFILE, 'null domain falls back to DEFAULT_PROFILE');

const emptyProfile = getPersonaProfile('');
assert(emptyProfile === DEFAULT_PROFILE, 'Empty string domain falls back to DEFAULT_PROFILE');

// Case normalization
const caseProfile = getPersonaProfile('ai security');
assert(caseProfile !== DEFAULT_PROFILE, 'Lowercase "ai security" resolves correctly');
const caseProfile2 = getPersonaProfile('AI SECURITY');
// uppercase won't match (not handled), confirm it falls back gracefully without throwing
assert(typeof caseProfile2 === 'object', '"AI SECURITY" uppercase falls back gracefully (no crash)');

// Check all 6 known domains are in the registry
const { PERSONA_REGISTRY } = personaProfiles;
const expectedDomains = ['ai security', 'machine learning', 'ai engineering', 'cloud architecture', 'cybersecurity', 'software engineering'];
expectedDomains.forEach(domain => {
  assert(PERSONA_REGISTRY.has(domain), `PERSONA_REGISTRY contains "${domain}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: VALIDATORS — UNIT TESTS
// ─────────────────────────────────────────────────────────────────────────────

section('3. Validators — Unit Tests');

const { validate, validateWordCount, validateForbiddenOpenings, validateForbiddenPhrases,
        validateHashtags, validateSourceIntegrity, countWords, MIN_WORDS, MAX_WORDS } = validators;

// ── Word count ──────────────────────────────────────────────────────────────

// Generate text of exact word counts
function makeText(wordCount) {
  return Array(wordCount).fill('word').join(' ');
}

assert(countWords('hello world') === 2, 'countWords: "hello world" → 2');
assert(countWords('  spaced   out  words  ') === 3, 'countWords: handles extra spaces');

assert(validateWordCount(makeText(150)).length === 0, 'Word count: 150 words → valid');
assert(validateWordCount(makeText(280)).length === 0, 'Word count: 280 words → valid');
assert(validateWordCount(makeText(149)).length > 0, 'Word count: 149 words → invalid (too short)');
assert(validateWordCount(makeText(281)).length > 0, 'Word count: 281 words → invalid (too long)');
assert(validateWordCount(makeText(200)).length === 0, 'Word count: 200 words → valid (midrange)');

// ── Forbidden openings ──────────────────────────────────────────────────────

assert(validateForbiddenOpenings('I think this is interesting').length > 0, 'Forbidden opening: "I ..." caught');
assert(validateForbiddenOpenings("In today's world, everything changes").length > 0, 'Forbidden opening: "In today\'s world..." caught');
assert(validateForbiddenOpenings('Security researchers have discovered...').length === 0, 'Good opening: "Security researchers..." → valid');
assert(validateForbiddenOpenings('The vulnerability affects...').length === 0, 'Good opening: "The vulnerability..." → valid');

// ── Forbidden phrases ───────────────────────────────────────────────────────

const hypeText = 'This is a game-changer for the industry.';
assert(validateForbiddenPhrases(hypeText).length > 0, 'Forbidden phrase: "game-changer" caught');

const hypeText2 = 'This revolutionary approach will change everything.';
assert(validateForbiddenPhrases(hypeText2).length > 0, 'Forbidden phrase: "revolutionary" caught');

const hypeText3 = 'This is GROUNDBREAKING work by the team.';
assert(validateForbiddenPhrases(hypeText3).length > 0, 'Forbidden phrase: "groundbreaking" case-insensitive caught');

const goodText = 'The vulnerability exploits an unsanitized deserialization path.';
assert(validateForbiddenPhrases(goodText).length === 0, 'Clean technical text → no forbidden phrases');

// ── Hashtag limit ───────────────────────────────────────────────────────────

assert(validateHashtags('Good post #AI #Security').length === 0, 'Hashtags: 2 → valid');
assert(validateHashtags('Post #AI #Security #LLM').length === 0, 'Hashtags: 3 → valid (at limit)');
assert(validateHashtags('Post #AI #Security #LLM #Hacking').length > 0, 'Hashtags: 4 → invalid (over limit)');
assert(validateHashtags('Post with no hashtags').length === 0, 'Hashtags: 0 → valid');

// ── Source integrity ────────────────────────────────────────────────────────

const topicUrl = 'https://example.com/llm-inference-vulnerability-2024';
assert(validateSourceIntegrity([topicUrl], topicUrl).length === 0, 'Source integrity: exact match → valid');
assert(validateSourceIntegrity([topicUrl, 'https://other.com'], topicUrl).length === 0, 'Source integrity: topic URL + extra → valid');
assert(validateSourceIntegrity(['https://different.com'], topicUrl).length > 0, 'Source integrity: missing topic URL → invalid');
assert(validateSourceIntegrity([], topicUrl).length > 0, 'Source integrity: empty sources → invalid');

// ── Full validate() function ────────────────────────────────────────────────

const validPost = {
  postText: makeText(200), // 200 clean words, no forbidden phrases
  rationale: {
    whySelected: 'Directly relevant to AI security practitioners.',
    whyRelevantNow: 'Vulnerability was recently disclosed with public PoC.',
    editorialStandards: 'Provides specific technical detail rather than generic commentary.',
    sources: [topicUrl],
  },
};

const fullValidation = validate(validPost, topicUrl);
assert(fullValidation.valid === true, 'validate(): valid post → { valid: true }');
assert(fullValidation.errors.length === 0, 'validate(): valid post → no errors');

// Invalid post — missing required fields
const invalidPost = { postText: 'short', rationale: null };
const invalidResult = validate(invalidPost, topicUrl);
assert(invalidResult.valid === false, 'validate(): post with null rationale → invalid');
assert(invalidResult.errors.length > 0, 'validate(): post with null rationale → errors array not empty');

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: POST FORMATTER — UNIT TESTS
// ─────────────────────────────────────────────────────────────────────────────

section('4. Post Formatter — Unit Tests');

const { formatPostText, formatRationale,
        stripSurroundingQuotes, removeMarkdownFences,
        normalizeBlankLines, normalizeHashtagSpacing } = postFormatter;

// ── stripSurroundingQuotes ──────────────────────────────────────────────────

assert(stripSurroundingQuotes('"hello"') === 'hello', 'stripSurroundingQuotes: removes double quotes');
assert(stripSurroundingQuotes("'hello'") === 'hello', 'stripSurroundingQuotes: removes single quotes');
assert(stripSurroundingQuotes('hello') === 'hello', 'stripSurroundingQuotes: unquoted string unchanged');
assert(stripSurroundingQuotes('"hello world"') === 'hello world', 'stripSurroundingQuotes: multi-word quoted string');

// ── removeMarkdownFences ────────────────────────────────────────────────────

const fencedText = '```json\n{"foo": "bar"}\n```';
const unfencedResult = removeMarkdownFences(fencedText);
assert(!unfencedResult.includes('```'), 'removeMarkdownFences: removes backtick fences');

const plainText = 'This is normal text without fences.';
assert(removeMarkdownFences(plainText) === plainText, 'removeMarkdownFences: leaves normal text unchanged');

// ── normalizeBlankLines ─────────────────────────────────────────────────────

const excessiveBlankLines = 'Para 1.\n\n\n\n\nPara 2.';
const normalizedLines = normalizeBlankLines(excessiveBlankLines);
assert(!normalizedLines.includes('\n\n\n'), 'normalizeBlankLines: reduces 3+ blank lines to 2');

// ── normalizeHashtagSpacing ─────────────────────────────────────────────────

assert(normalizeHashtagSpacing('word#tag') === 'word #tag', 'normalizeHashtagSpacing: adds space before hashtag');
assert(normalizeHashtagSpacing('# tag') === '#tag', 'normalizeHashtagSpacing: removes space after #');
assert(normalizeHashtagSpacing('#AI #Security') === '#AI #Security', 'normalizeHashtagSpacing: well-formed hashtags unchanged');

// ── formatPostText (integration) ────────────────────────────────────────────

const messyText = '```\n"  Hello world.   \n\n\n\n\nNew para.  "\n```';
const cleaned = formatPostText(messyText);
assert(!cleaned.includes('```'), 'formatPostText: removes markdown fences');
assert(cleaned === cleaned.trim(), 'formatPostText: result is trimmed');

// ── formatRationale ─────────────────────────────────────────────────────────

const rationaleObj = {
  whySelected: 'High security relevance.',
  whyRelevantNow: 'Zero-day disclosed publicly.',
  editorialStandards: 'Technical depth meets persona standards.',
  sources: [topicUrl],
};
const rationaleStr = formatRationale(rationaleObj);
assert(typeof rationaleStr === 'string', 'formatRationale: returns a string');
assert(rationaleStr.includes('SELECTED BECAUSE'), 'formatRationale: includes "SELECTED BECAUSE"');
assert(rationaleStr.includes('TIMELY BECAUSE'), 'formatRationale: includes "TIMELY BECAUSE"');
assert(rationaleStr.includes('EDITORIAL FIT'), 'formatRationale: includes "EDITORIAL FIT"');
assert(rationaleStr.includes('SOURCES'), 'formatRationale: includes "SOURCES"');
assert(rationaleStr.includes(topicUrl), 'formatRationale: includes the topic URL');
assert(formatRationale(null) === 'Rationale not available', 'formatRationale: handles null gracefully');

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: POST OBJECT CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

section('5. Post Object Contract Shape');

// Construct a mock post manually to validate the shape specification
const { nanoid } = require('nanoid');
const mockPost = {
  id: `p_${nanoid(10)}`,
  agentId: 'test-agent-001',
  text: makeText(200),
  rationale: formatRationale(rationaleObj),
  sources: [topicUrl],
  topic: MOCK_TOPIC.title,
  createdAt: new Date().toISOString(),
};

assert(typeof mockPost.id === 'string', 'Post: id is a string');
assert(/^p_[A-Za-z0-9_-]{10}$/.test(mockPost.id), `Post: id matches format p_XXXXXXXXXX (got: ${mockPost.id})`);
assert(typeof mockPost.agentId === 'string', 'Post: agentId is a string');
assert(typeof mockPost.text === 'string', 'Post: text is a string');
assert(typeof mockPost.rationale === 'string', 'Post: rationale is a string (DB-ready)');
assert(Array.isArray(mockPost.sources), 'Post: sources is an array');
assert(mockPost.sources.length > 0, 'Post: sources is non-empty');
assert(typeof mockPost.topic === 'string', 'Post: topic is a string');
assert(typeof mockPost.createdAt === 'string', 'Post: createdAt is a string');

// Validate ISO 8601 format
const isoDate = new Date(mockPost.createdAt);
assert(!isNaN(isoDate.getTime()), 'Post: createdAt is valid ISO 8601');

// ID uniqueness — generate 5 and check for duplicates
const ids = new Set();
for (let i = 0; i < 5; i++) {
  ids.add(`p_${nanoid(10)}`);
}
assert(ids.size === 5, 'Post ID: 5 generated IDs are all unique (nanoid collision check)');

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: WRITER INPUT VALIDATION (no API key required)
// ─────────────────────────────────────────────────────────────────────────────

section('6. Writer — Input Validation (no API call)');

// These should return null with log messages, never throw
async function runInputValidationTests() {
  const { writeAndPublishPost } = writer;

  // Missing agentId
  const r1 = await writeAndPublishPost('', PERSONAS[0], MOCK_TOPIC);
  assert(r1 === null, 'writeAndPublishPost: empty agentId → null (no crash)');

  // Missing persona
  const r2 = await writeAndPublishPost('agent-001', null, MOCK_TOPIC);
  assert(r2 === null, 'writeAndPublishPost: null persona → null (no crash)');

  // Missing topic.title
  const r3 = await writeAndPublishPost('agent-001', PERSONAS[0], { ...MOCK_TOPIC, title: '' });
  assert(r3 === null, 'writeAndPublishPost: empty topic.title → null (no crash)');

  // Missing topic.url
  const r4 = await writeAndPublishPost('agent-001', PERSONAS[0], { ...MOCK_TOPIC, url: '' });
  assert(r4 === null, 'writeAndPublishPost: empty topic.url → null (no crash)');

  // Missing topic.summary
  const r5 = await writeAndPublishPost('agent-001', PERSONAS[0], { ...MOCK_TOPIC, summary: '' });
  assert(r5 === null, 'writeAndPublishPost: empty topic.summary → null (no crash)');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: LIVE GENERATION TEST (only runs if GEMINI_API_KEY is set)
// ─────────────────────────────────────────────────────────────────────────────

async function runLiveGenerationTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.log('\n⚠️  GEMINI_API_KEY not set — skipping live generation tests.');
    console.log('   Set GEMINI_API_KEY in .env to enable live generation validation.\n');
    return;
  }

  section('7. Live Generation Tests');

  const { writeAndPublishPost } = writer;

  for (const persona of PERSONAS) {
    console.log(`\n  → Generating for: ${persona.name} (${persona.domain})`);
    const start = Date.now();

    try {
      const post = await writeAndPublishPost('test-agent-live', persona, MOCK_TOPIC);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (post === null) {
        assert(false, `Live gen: ${persona.domain} — returned null (check logs above)`);
        continue;
      }

      assert(post !== null, `Live gen: ${persona.domain} → post returned (not null)`);
      assert(typeof post.id === 'string' && /^p_[A-Za-z0-9_-]{10}$/.test(post.id), `Live gen: ${persona.domain} → valid post ID (${post.id})`);
      assert(typeof post.text === 'string' && post.text.length > 0, `Live gen: ${persona.domain} → text is non-empty`);
      assert(typeof post.rationale === 'string' && post.rationale.length > 0, `Live gen: ${persona.domain} → rationale is non-empty`);
      assert(Array.isArray(post.sources) && post.sources.includes(MOCK_TOPIC.url), `Live gen: ${persona.domain} → source provenance preserved`);
      assert(post.topic === MOCK_TOPIC.title, `Live gen: ${persona.domain} → topic matches`);
      assert(!isNaN(new Date(post.createdAt).getTime()), `Live gen: ${persona.domain} → valid ISO timestamp`);

      // Word count on the actual post text
      const wordCount = validators.countWords(post.text);
      assert(wordCount >= 150 && wordCount <= 280, `Live gen: ${persona.domain} → word count ${wordCount} within 150–280`);

      // Source integrity — original URL must be present
      assert(post.sources.includes(MOCK_TOPIC.url), `Live gen: ${persona.domain} → original topic URL in sources`);

      // Forbidden openings
      const trimmedText = post.text.trim();
      const startsWithI = /^I\s/i.test(trimmedText);
      const startsWithInToday = /^In today's world/i.test(trimmedText);
      assert(!startsWithI, `Live gen: ${persona.domain} → post does not start with "I"`);
      assert(!startsWithInToday, `Live gen: ${persona.domain} → post does not start with "In today's world"`);

      console.log(`     ⏱️  Generated in ${elapsed}s`);
      console.log(`     📝 Preview: ${post.text.substring(0, 120)}...`);

    } catch (err) {
      assert(false, `Live gen: ${persona.domain} — threw unexpectedly: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function runAll() {
  console.log('\n' + '='.repeat(60));
  console.log('  Module C — Persona Engine Test Suite');
  console.log('='.repeat(60));

  try {
    await runInputValidationTests();
    await runLiveGenerationTest();
  } catch (err) {
    console.error('\n❌ Test runner encountered an unexpected error:', err);
    failed++;
  }

  // ── Results ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failures.length > 0) {
    console.log('\n  Failed checks:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }

  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
