const fetch = require('node-fetch');

const CROSSREF_API = 'https://api.crossref.org/works';
const OPENALEX_API = 'https://api.openalex.org/works';

async function searchCrossref(query, maxResults = 5) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `${CROSSREF_API}?query=${encodedQuery}&rows=${maxResults}&select=DOI,title,author,published-print,published-online,container-title,is-referenced-by-count,abstract,URL,type&sort=relevance&order=desc`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AIAcademicEngine/1.0 (mailto:research@academic-engine.com)'
      },
      timeout: 15000
    });

    if (!response.ok) {
      console.error('Crossref API error:', response.status);
      return [];
    }

    const data = await response.json();
    if (!data.message || !data.message.items) return [];

    return data.message.items.map(item => {
      const published = item['published-print'] || item['published-online'] || {};
      const dateParts = published['date-parts'] ? published['date-parts'][0] : [];
      const year = dateParts[0] || null;

      const authors = (item.author || []).map(a => {
        const parts = [a.given, a.family].filter(Boolean);
        return parts.join(' ');
      });

      return {
        title: Array.isArray(item.title) ? item.title[0] : (item.title || 'Untitled'),
        authors: authors,
        year: year,
        journal: Array.isArray(item['container-title'])
          ? item['container-title'][0]
          : (item['container-title'] || ''),
        doi: item.DOI || '',
        url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
        abstract: item.abstract ? item.abstract.replace(/<[^>]*>/g, '').substring(0, 500) : '',
        citationCount: item['is-referenced-by-count'] || 0,
        source: 'crossref',
        type: item.type || 'journal-article',
        verified: true
      };
    });
  } catch (err) {
    console.error('Crossref search error:', err.message);
    return [];
  }
}

async function searchOpenAlex(query, maxResults = 5) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `${OPENALEX_API}?search=${encodedQuery}&per_page=${maxResults}&sort=relevance_score:desc&select=id,doi,title,authorships,publication_year,primary_location,cited_by_count,abstract_inverted_index,type`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'mailto:research@academic-engine.com'
      },
      timeout: 15000
    });

    if (!response.ok) {
      console.error('OpenAlex API error:', response.status);
      return [];
    }

    const data = await response.json();
    if (!data.results) return [];

    return data.results.map(item => {
      const authors = (item.authorships || []).map(a =>
        a.author ? a.author.display_name : ''
      ).filter(Boolean);

      let journal = '';
      if (item.primary_location && item.primary_location.source) {
        journal = item.primary_location.source.display_name || '';
      }

      let abstract = '';
      if (item.abstract_inverted_index) {
        const words = [];
        const inverted = item.abstract_inverted_index;
        Object.entries(inverted).forEach(([word, positions]) => {
          positions.forEach(pos => {
            words[pos] = word;
          });
        });
        abstract = words.filter(Boolean).join(' ').substring(0, 500);
      }

      const doi = item.doi ? item.doi.replace('https://doi.org/', '') : '';

      return {
        title: item.title || 'Untitled',
        authors: authors,
        year: item.publication_year || null,
        journal: journal,
        doi: doi,
        url: item.doi || item.id || '',
        abstract: abstract,
        citationCount: item.cited_by_count || 0,
        source: 'openalex',
        type: item.type || 'journal-article',
        verified: true
      };
    });
  } catch (err) {
    console.error('OpenAlex search error:', err.message);
    return [];
  }
}

async function searchReferences(query, maxResults = 10) {
  const halfMax = Math.ceil(maxResults / 2);

  const [crossrefResults, openAlexResults] = await Promise.all([
    searchCrossref(query, halfMax),
    searchOpenAlex(query, halfMax)
  ]);

  const combined = [...crossrefResults, ...openAlexResults];

  const seen = new Set();
  const unique = combined.filter(ref => {
    const key = ref.doi || ref.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, maxResults);
}

async function verifyDOI(doi) {
  try {
    const response = await fetch(`https://doi.org/api/handles/${doi}`, {
      timeout: 10000
    });
    return response.ok;
  } catch {
    return false;
  }
}

function calculateQualityScore(reference) {
  let score = 0;
  const explanation = [];

  if (reference.citationCount > 100) {
    score += 30;
    explanation.push(`Highly cited (${reference.citationCount} citations)`);
  } else if (reference.citationCount > 20) {
    score += 20;
    explanation.push(`Well cited (${reference.citationCount} citations)`);
  } else if (reference.citationCount > 5) {
    score += 10;
    explanation.push(`Moderately cited (${reference.citationCount} citations)`);
  } else {
    score += 5;
    explanation.push(`Few citations (${reference.citationCount})`);
  }

  const currentYear = new Date().getFullYear();
  if (reference.year) {
    const age = currentYear - reference.year;
    if (age <= 2) {
      score += 25;
      explanation.push('Very recent publication');
    } else if (age <= 5) {
      score += 20;
      explanation.push('Recent publication');
    } else if (age <= 10) {
      score += 15;
      explanation.push('Relatively recent');
    } else {
      score += 5;
      explanation.push('Older publication');
    }
  }

  if (reference.journal && reference.journal.length > 0) {
    score += 20;
    explanation.push(`Published in ${reference.journal}`);
  } else {
    score += 5;
    explanation.push('Journal information limited');
  }

  if (reference.doi) {
    score += 15;
    explanation.push('Has verified DOI');
  }

  if (reference.verified) {
    score += 10;
    explanation.push(`Sourced from ${reference.source}`);
  }

  return {
    score: Math.min(100, score),
    explanation: explanation.join('. ') + '.'
  };
}

module.exports = {
  searchCrossref,
  searchOpenAlex,
  searchReferences,
  verifyDOI,
  calculateQualityScore
};