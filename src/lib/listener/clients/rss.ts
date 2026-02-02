// ============================================
// RSS CLIENT
// ============================================
// Fetches and parses RSS feeds from tech news sources

import { RSSArticle, RSSFeed, RSSFeedConfig } from '../types';

// ============================================
// DEFAULT FEEDS
// ============================================

export const DEFAULT_FEEDS: RSSFeedConfig[] = [
  // Major tech news
  { url: 'https://techcrunch.com/feed/', name: 'TechCrunch', category: 'tech' },
  { url: 'https://www.wired.com/feed/rss', name: 'Wired', category: 'tech' },
  { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge', category: 'tech' },
  { url: 'https://arstechnica.com/feed/', name: 'Ars Technica', category: 'tech' },

  // Security-focused
  { url: 'https://krebsonsecurity.com/feed/', name: 'Krebs on Security', category: 'security' },
  { url: 'https://www.bleepingcomputer.com/feed/', name: 'BleepingComputer', category: 'security' },
  { url: 'https://www.darkreading.com/rss.xml', name: 'Dark Reading', category: 'security' },
  { url: 'https://threatpost.com/feed/', name: 'Threatpost', category: 'security' },

  // Startup / Business
  { url: 'https://venturebeat.com/feed/', name: 'VentureBeat', category: 'startup' },
];

// ============================================
// RSS PARSING
// ============================================

/**
 * Parse RSS/Atom feed XML into articles
 * Simple parser that handles common RSS 2.0 and Atom formats
 */
function parseRSSXml(xml: string): RSSArticle[] {
  const articles: RSSArticle[] = [];

  // Try RSS 2.0 format first (most common)
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

  for (const match of itemMatches) {
    const itemXml = match[1];

    const article: RSSArticle = {
      title: extractTag(itemXml, 'title'),
      link: extractTag(itemXml, 'link') || extractAttr(itemXml, 'link', 'href'),
      description: extractTag(itemXml, 'description'),
      content: extractTag(itemXml, 'content:encoded') || extractTag(itemXml, 'content'),
      pubDate: parseDate(extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date')),
      author: extractTag(itemXml, 'author') || extractTag(itemXml, 'dc:creator'),
      guid: extractTag(itemXml, 'guid') || extractTag(itemXml, 'link'),
      categories: extractAllTags(itemXml, 'category'),
    };

    if (article.title && article.link) {
      articles.push(article);
    }
  }

  // If no RSS items found, try Atom format
  if (articles.length === 0) {
    const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi);

    for (const match of entryMatches) {
      const entryXml = match[1];

      const article: RSSArticle = {
        title: extractTag(entryXml, 'title'),
        link: extractAttr(entryXml, 'link', 'href') || extractTag(entryXml, 'link'),
        description: extractTag(entryXml, 'summary'),
        content: extractTag(entryXml, 'content'),
        pubDate: parseDate(extractTag(entryXml, 'published') || extractTag(entryXml, 'updated')),
        author: extractTag(entryXml, 'name') || extractTag(entryXml, 'author'),
        guid: extractTag(entryXml, 'id'),
        categories: extractAllTags(entryXml, 'category'),
      };

      if (article.title && article.link) {
        articles.push(article);
      }
    }
  }

  return articles;
}

/**
 * Extract content from XML tag
 */
function extractTag(xml: string, tagName: string): string {
  // Handle CDATA sections
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle regular tags
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  if (match) {
    // Decode HTML entities
    return decodeHtmlEntities(match[1].trim());
  }

  return '';
}

/**
 * Extract attribute from XML tag
 */
function extractAttr(xml: string, tagName: string, attrName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*${attrName}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : '';
}

/**
 * Extract all occurrences of a tag
 */
function extractAllTags(xml: string, tagName: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const value = decodeHtmlEntities(match[1].trim());
    if (value) results.push(value);
  }
  return results;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return undefined;
    return date;
  } catch {
    return undefined;
  }
}

// ============================================
// FETCH FUNCTIONS
// ============================================

/**
 * Fetch and parse a single RSS feed
 */
export async function fetchFeed(
  url: string,
  name: string,
  timeoutMs: number = 10000
): Promise<RSSFeed> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Helix-Listener/1.0 (RSS Feed Reader)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    const articles = parseRSSXml(xml);

    return {
      url,
      name,
      articles,
      lastFetched: new Date(),
    };
  } catch (error) {
    console.error(`Failed to fetch RSS feed ${name} (${url}):`, error);
    return {
      url,
      name,
      articles: [],
      lastFetched: new Date(),
    };
  }
}

/**
 * Fetch multiple RSS feeds in parallel
 */
export async function fetchAllFeeds(
  configs?: RSSFeedConfig[],
  maxArticlesPerFeed: number = 20
): Promise<RSSFeed[]> {
  const feedConfigs = configs || DEFAULT_FEEDS;

  const feeds = await Promise.all(
    feedConfigs.map(config => fetchFeed(config.url, config.name))
  );

  // Limit articles per feed
  return feeds.map(feed => ({
    ...feed,
    articles: feed.articles.slice(0, maxArticlesPerFeed),
  }));
}

/**
 * Fetch feeds and return combined articles sorted by date
 */
export async function fetchRecentArticles(
  configs?: RSSFeedConfig[],
  maxArticles: number = 100,
  maxAgeHours: number = 48
): Promise<Array<RSSArticle & { feedName: string }>> {
  const feeds = await fetchAllFeeds(configs);
  const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  // Combine all articles with feed name
  const allArticles: Array<RSSArticle & { feedName: string }> = [];

  for (const feed of feeds) {
    for (const article of feed.articles) {
      // Filter by age if pubDate is available
      if (article.pubDate && article.pubDate < cutoffDate) continue;

      allArticles.push({
        ...article,
        feedName: feed.name,
      });
    }
  }

  // Sort by date (newest first)
  allArticles.sort((a, b) => {
    const dateA = a.pubDate?.getTime() || 0;
    const dateB = b.pubDate?.getTime() || 0;
    return dateB - dateA;
  });

  return allArticles.slice(0, maxArticles);
}

// ============================================
// UTILITIES
// ============================================

/**
 * Extract clean text from article (strips HTML)
 */
export function getArticleText(article: RSSArticle): string {
  const parts: string[] = [];

  if (article.title) parts.push(article.title);
  if (article.description) {
    const clean = article.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    parts.push(clean);
  }
  if (article.content) {
    const clean = article.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    parts.push(clean);
  }

  return parts.join('\n\n');
}

/**
 * Get article URL (normalized)
 */
export function getArticleUrl(article: RSSArticle): string {
  return article.link || '';
}
