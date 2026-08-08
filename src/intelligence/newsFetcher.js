'use strict';
const axios = require('axios');
const RSSParser = require('rss-parser');

const rssParser = new RSSParser({
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutonomousAIAgent/1.0)' }
});

// RSS feeds for AI/tech content
const RSS_FEEDS = [
  { url: 'https://venturebeat.com/feed/', name: 'VentureBeat' },
  { url: 'https://techcrunch.com/feed/', name: 'TechCrunch' },
  { url: 'https://www.technologyreview.com/feed/', name: 'MIT Technology Review' },
  { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge' },
  { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica' }
];

// Keywords that signal AI/tech relevance
const AI_TECH_KEYWORDS = [
  'AI', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
  'LLM', 'large language model', 'GPT', 'ChatGPT', 'Claude', 'Gemini',
  'robotics', 'automation', 'cybersecurity', 'security', 'algorithm',
  'model', 'training', 'inference', 'transformer', 'diffusion',
  'open source', 'benchmark', 'agent', 'AGI', 'multimodal'
];

/**
 * Fetches top stories from Hacker News API (no key required).
 * Filters to AI/tech relevant stories.
 * @returns {Promise<Array<{title, summary, url, source, publishedAt}>>}
 */
async function fetchHackerNews() {
  try {
    console.log('[NewsFetcher] Fetching Hacker News top stories...');
    const idsResp = await axios.get(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      { timeout: 8000 }
    );
    const topIds = idsResp.data.slice(0, 40); // Take top 40

    const storyPromises = topIds.map(id =>
      axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 5000 })
        .then(r => r.data)
        .catch(() => null)
    );

    const stories = (await Promise.all(storyPromises)).filter(
      s => s && s.type === 'story' && s.url && s.title
    );

    // Filter to AI/tech relevant stories
    const relevant = stories.filter(story => {
      const text = (story.title + ' ' + (story.url || '')).toLowerCase();
      return AI_TECH_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
    });

    console.log(`[NewsFetcher] HackerNews: ${relevant.length} relevant stories found`);

    return relevant.map(s => ({
      title: s.title,
      summary: `From Hacker News (${s.score || 0} points, ${s.descendants || 0} comments): ${s.title}`,
      url: s.url,
      source: 'Hacker News',
      publishedAt: s.time ? new Date(s.time * 1000).toISOString() : new Date().toISOString()
    }));
  } catch (err) {
    console.error('[NewsFetcher] HackerNews error:', err.message);
    return [];
  }
}

/**
 * Fetches articles from NewsAPI.org.
 * @param {string} domain - Persona domain for query refinement
 * @returns {Promise<Array<{title, summary, url, source, publishedAt}>>}
 */
async function fetchNewsAPI(domain) {
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY || NEWS_API_KEY === 'your_newsapi_org_key_here') {
    console.log('[NewsFetcher] NewsAPI key not configured, skipping');
    return [];
  }

  try {
    console.log(`[NewsFetcher] Fetching from NewsAPI for domain: "${domain}"`);
    // Build a targeted query based on domain
    const domainQuery = domain.toLowerCase().includes('security')
      ? 'AI security OR AI vulnerability OR machine learning security'
      : 'artificial intelligence OR machine learning OR AI research';

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(domainQuery)}&sortBy=publishedAt&pageSize=15&language=en&apiKey=${NEWS_API_KEY}`;
    const resp = await axios.get(url, { timeout: 8000 });

    if (resp.data.status !== 'ok') {
      console.warn('[NewsFetcher] NewsAPI returned status:', resp.data.status);
      return [];
    }

    console.log(`[NewsFetcher] NewsAPI: ${resp.data.articles.length} articles found`);

    return resp.data.articles
      .filter(a => a.url && a.title && !a.title.includes('[Removed]'))
      .map(a => ({
        title: a.title,
        summary: a.description || a.title,
        url: a.url,
        source: a.source?.name || 'NewsAPI',
        publishedAt: a.publishedAt || new Date().toISOString()
      }));
  } catch (err) {
    console.error('[NewsFetcher] NewsAPI error:', err.message);
    return [];
  }
}

/**
 * Fetches articles from RSS feeds.
 * @param {string} domain - Persona domain for relevance filtering
 * @returns {Promise<Array<{title, summary, url, source, publishedAt}>>}
 */
async function fetchRSSFeeds(domain) {
  const results = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      const items = (parsed.items || []).slice(0, 8); // Max 8 per feed

      for (const item of items) {
        if (!item.title || !item.link) continue;

        const text = (item.title + ' ' + (item.contentSnippet || '') + ' ' + (item.content || '')).toLowerCase();
        const isRelevant = AI_TECH_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));

        if (isRelevant) {
          results.push({
            title: item.title.trim(),
            summary: item.contentSnippet
              ? item.contentSnippet.substring(0, 300)
              : item.title,
            url: item.link,
            source: feed.name,
            publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.error(`[NewsFetcher] RSS feed "${feed.name}" error:`, err.message);
    }
  }

  console.log(`[NewsFetcher] RSS feeds: ${results.length} relevant items found`);
  return results;
}

/**
 * Fetches candidates from all sources, deduplicates by URL, and returns merged list.
 * @param {object} persona - { name, domain }
 * @returns {Promise<Array>}
 */
async function fetchAllCandidates(persona) {
  // Fetch from all sources in parallel
  const [hnStories, newsApiArticles, rssArticles] = await Promise.all([
    fetchHackerNews(),
    fetchNewsAPI(persona.domain),
    fetchRSSFeeds(persona.domain)
  ]);

  const all = [...hnStories, ...newsApiArticles, ...rssArticles];

  // Deduplicate by URL
  const seen = new Set();
  const unique = all.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  console.log(`[NewsFetcher] Total unique candidates: ${unique.length}`);
  return unique;
}

module.exports = { fetchAllCandidates };
