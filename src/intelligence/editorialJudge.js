'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
let model;

function getModel() {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }
  return model;
}

/**
 * Safely parses JSON from Gemini response text, stripping markdown fences.
 * @param {string} text
 * @returns {object}
 */
function safeParseJson(text) {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // Find the first { and last } to extract JSON
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');

  return JSON.parse(cleaned.substring(start, end + 1));
}

/**
 * Uses Gemini to evaluate topic candidates and return approved/rejected lists.
 * @param {Array} candidates - Array of { title, summary, url, source }
 * @param {object} persona - { name, domain }
 * @param {string[]} publishedTopics - Already published topic titles
 * @returns {Promise<{ approved: Array, rejected: Array }>}
 */
async function judgeTopicsWithGemini(candidates, persona, publishedTopics) {
  const mdl = getModel();

  const publishedList = publishedTopics.length > 0
    ? publishedTopics.slice(0, 20).join('\n- ')
    : '(none yet)';

  const candidateList = candidates
    .map((c, i) => `${i + 1}. TITLE: ${c.title}\n   SUMMARY: ${c.summary?.substring(0, 200) || 'N/A'}\n   SOURCE: ${c.source || 'Unknown'}\n   URL: ${c.url}`)
    .join('\n\n');

  const prompt = `You are the editorial AI for ${persona.name}, an autonomous ${persona.domain} expert and thought leader.

Your task: evaluate these AI/tech news headlines and decide which ones merit a post.

## PERSONA
- Name: ${persona.name}
- Domain: ${persona.domain}
- Editorial Standards:
  * Topics must be directly relevant to ${persona.domain} or broadly to AI/technology
  * Must have genuine technical depth, real-world impact, or novel insight
  * Must NOT be gossip, celebrity tech-use, clickbait, or trivially generic content
  * Prefer: recent breakthroughs, research findings, policy/regulatory changes, security incidents, tooling releases
  * Reject: "AI is changing X industry" filler, simple product announcements without depth, opinion pieces without data

## ALREADY PUBLISHED TOPICS (avoid repetition)
- ${publishedList}

## CANDIDATES TO EVALUATE
${candidateList}

## INSTRUCTIONS
- Approve 1 to 3 topics maximum — be selective
- Reject all others with a specific, honest reason
- Approved topics must not substantially overlap with already-published topics

Respond with ONLY valid JSON (no markdown, no explanation outside the JSON):
{
  "approved": [
    {
      "index": 1,
      "title": "exact title from candidates",
      "url": "exact url from candidates",
      "whySelected": "Specific reason this meets editorial standards",
      "whyNow": "Why this is particularly timely or relevant right now",
      "relevanceScore": 0.85
    }
  ],
  "rejected": [
    {
      "index": 2,
      "title": "exact title from candidates",
      "reason": "Specific reason for rejection"
    }
  ]
}`;

  const result = await mdl.generateContent(prompt);
  const text = result.response.text();

  const parsed = safeParseJson(text);

  // Enrich approved topics with full candidate data
  const enrichedApproved = (parsed.approved || []).map(a => {
    const original = candidates[a.index - 1] || candidates.find(c => c.title === a.title) || {};
    return {
      title: a.title || original.title,
      summary: original.summary || '',
      url: a.url || original.url,
      source: original.source || 'Unknown',
      whySelected: a.whySelected || '',
      whyNow: a.whyNow || '',
      relevanceScore: a.relevanceScore || 0.7
    };
  });

  const enrichedRejected = (parsed.rejected || []).map(r => ({
    topic: r.title,
    reason: r.reason || 'Did not meet editorial standards'
  }));

  return { approved: enrichedApproved, rejected: enrichedRejected };
}

module.exports = { judgeTopicsWithGemini, safeParseJson };
