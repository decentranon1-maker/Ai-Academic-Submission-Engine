const fetch = require('node-fetch');
const { extractParagraphs, extractSentences } = require('./documentParser');

function generateNGrams(text, n = 4) {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const ngrams = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function calculateJaccardSimilarity(set1, set2) {
  const a = new Set(set1);
  const b = new Set(set2);
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

async function searchOpenAlexForSimilarity(text, perPage = 5) {
  try {
    const words = text.split(/\s+/).slice(0, 15).join(' ');
    const encoded = encodeURIComponent(words);
    const url = `https://api.openalex.org/works?search=${encoded}&per_page=${perPage}&select=id,title,abstract_inverted_index,publication_year,authorships`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'mailto:research@academic-engine.com' },
      timeout: 10000
    });

    if (!response.ok) return [];
    const data = await response.json();
    if (!data.results) return [];

    return data.results.map(item => {
      let abstract = '';
      if (item.abstract_inverted_index) {
        const words = [];
        Object.entries(item.abstract_inverted_index).forEach(([word, positions]) => {
          positions.forEach(pos => { words[pos] = word; });
        });
        abstract = words.filter(Boolean).join(' ');
      }
      return {
        title: item.title || '',
        abstract,
        year: item.publication_year,
        authors: (item.authorships || []).map(a => a.author?.display_name || '').filter(Boolean)
      };
    });
  } catch (err) {
    console.error('OpenAlex similarity search error:', err.message);
    return [];
  }
}

async function checkSimilarity(content) {
  const paragraphs = extractParagraphs(content);
  const results = {
    originalityScore: 100,
    totalChecked: 0,
    flaggedCount: 0,
    similarSections: []
  };

  if (paragraphs.length === 0) return results;

  const samplesToCheck = paragraphs
    .filter(p => p.length > 80)
    .slice(0, 15);

  results.totalChecked = samplesToCheck.length;

  const batchSize = 3;
  for (let i = 0; i < samplesToCheck.length; i += batchSize) {
    const batch = samplesToCheck.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (paragraph, batchIdx) => {
        const paraIndex = i + batchIdx;
        try {
          const externalWorks = await searchOpenAlexForSimilarity(paragraph, 3);

          let highestSimilarity = 0;
          let matchedSource = null;

          for (const work of externalWorks) {
            const compareText = work.abstract || work.title;
            if (!compareText || compareText.length < 30) continue;

            const paraNgrams = generateNGrams(paragraph);
            const sourceNgrams = generateNGrams(compareText);

            if (paraNgrams.length === 0 || sourceNgrams.length === 0) continue;

            const similarity = calculateJaccardSimilarity(paraNgrams, sourceNgrams);

            if (similarity > highestSimilarity) {
              highestSimilarity = similarity;
              matchedSource = work;
            }
          }

          if (highestSimilarity > 0.15) {
            return {
              paragraphIndex: paraIndex,
              text: paragraph.substring(0, 300) + (paragraph.length > 300 ? '...' : ''),
              similarityPercent: Math.round(highestSimilarity * 100),
              matchedSource: matchedSource ? {
                title: matchedSource.title,
                year: matchedSource.year,
                authors: matchedSource.authors.slice(0, 3).join(', ')
              } : null
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    const flagged = batchResults.filter(Boolean);
    results.similarSections.push(...flagged);
    results.flaggedCount += flagged.length;

    if (i + batchSize < samplesToCheck.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (results.totalChecked > 0) {
    const avgSimilarity = results.similarSections.reduce(
      (sum, s) => sum + s.similarityPercent, 0
    ) / results.totalChecked;
    results.originalityScore = Math.max(0, Math.round(100 - avgSimilarity));
  }

  results.similarSections.sort((a, b) => b.similarityPercent - a.similarityPercent);

  return results;
}

module.exports = { checkSimilarity };