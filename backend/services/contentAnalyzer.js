const { extractParagraphs, extractSentences } = require('./documentParser');

const ACADEMIC_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'shall', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
  'they', 'them', 'their', 'we', 'our', 'you', 'your', 'he', 'she', 'his',
  'her', 'not', 'no', 'nor', 'if', 'then', 'than', 'so', 'such', 'both',
  'each', 'which', 'who', 'whom', 'what', 'when', 'where', 'how', 'all',
  'any', 'more', 'most', 'other', 'some', 'only', 'also', 'very', 'just',
  'about', 'above', 'after', 'before', 'between', 'through', 'during', 'into',
  'over', 'under', 'again', 'further', 'while', 'however', 'although', 'though',
  'because', 'since', 'therefore', 'thus', 'hence', 'being', 'there', 'here',
  'study', 'paper', 'research', 'used', 'using', 'based', 'show', 'shown',
  'found', 'results', 'method', 'data', 'figure', 'table', 'section'
]);

const CLAIM_INDICATORS = [
  'studies show', 'research indicates', 'evidence suggests', 'it has been shown',
  'according to', 'previous work', 'recent findings', 'it is known that',
  'literature suggests', 'data indicates', 'experiments demonstrate',
  'results confirm', 'analysis reveals', 'observations suggest',
  'it has been demonstrated', 'researchers have found', 'it is established',
  'widely accepted', 'commonly believed', 'generally recognized',
  'significantly', 'correlates with', 'leads to', 'causes', 'affects',
  'influences', 'contributes to', 'associated with', 'linked to',
  'increases', 'decreases', 'improves', 'reduces', 'enhances',
  'compared to', 'in contrast', 'unlike', 'similarly', 'moreover',
  'furthermore', 'notably', 'importantly', 'critically', 'essentially',
  'proven', 'demonstrated', 'established', 'confirmed', 'validated',
  'percent', '%', 'statistically', 'p-value', 'significant difference'
];

function extractKeywords(content, maxKeywords = 20) {
  if (!content) return [];

  const words = content
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !ACADEMIC_STOP_WORDS.has(w) && !/^\d+$/.test(w));

  const freq = {};
  words.forEach(w => {
    freq[w] = (freq[w] || 0) + 1;
  });

  const bigrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (!ACADEMIC_STOP_WORDS.has(words[i]) && !ACADEMIC_STOP_WORDS.has(words[i + 1])) {
      bigrams.push(bigram);
    }
  }

  const bigramFreq = {};
  bigrams.forEach(b => {
    bigramFreq[b] = (bigramFreq[b] || 0) + 1;
  });

  const allTerms = [];
  Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .forEach(([word, count]) => allTerms.push({ term: word, score: count, type: 'keyword' }));

  Object.entries(bigramFreq)
    .filter(([, count]) => count >= 2)
    .forEach(([bigram, count]) => allTerms.push({ term: bigram, score: count * 1.5, type: 'phrase' }));

  return allTerms
    .sort((a, b) => b.score - a.score)
    .slice(0, maxKeywords)
    .map(t => t.term);
}

function extractTopics(content) {
  if (!content) return [];
  const keywords = extractKeywords(content, 30);

  const topicClusters = [];
  const used = new Set();

  keywords.forEach(kw => {
    if (used.has(kw)) return;
    const cluster = [kw];
    used.add(kw);

    keywords.forEach(other => {
      if (used.has(other)) return;
      if (kw.includes(other) || other.includes(kw) ||
        kw.split(' ').some(w => other.includes(w))) {
        cluster.push(other);
        used.add(other);
      }
    });

    topicClusters.push({
      topic: cluster[0],
      relatedTerms: cluster.slice(1),
      weight: cluster.length
    });
  });

  return topicClusters
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
}

function extractClaims(content) {
  if (!content) return [];
  const paragraphs = extractParagraphs(content);
  const claims = [];

  paragraphs.forEach((para, paraIndex) => {
    const sentences = extractSentences(para);
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      const matchedIndicators = CLAIM_INDICATORS.filter(ind =>
        lowerSentence.includes(ind.toLowerCase())
      );

      if (matchedIndicators.length > 0) {
        claims.push({
          text: sentence.substring(0, 300),
          paragraphIndex: paraIndex,
          indicators: matchedIndicators,
          confidence: Math.min(1, matchedIndicators.length * 0.3 + 0.2),
          needsCitation: !sentence.match(/\(\w+,?\s*\d{4}\)/) &&
            !sentence.match(/\[\d+\]/)
        });
      }
    });
  });

  return claims
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 30);
}

function detectCitationSpots(content) {
  const claims = extractClaims(content);
  return claims
    .filter(c => c.needsCitation)
    .map(c => ({
      paragraphIndex: c.paragraphIndex,
      sentence: c.text,
      claimText: c.text,
      reason: `Contains unsupported claim indicators: ${c.indicators.slice(0, 3).join(', ')}`,
      confidence: c.confidence
    }));
}

function analyzeStructure(content) {
  if (!content) return { sections: [], issues: [] };

  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const sections = [];
  const issues = [];

  const expectedSections = [
    'abstract', 'introduction', 'background', 'literature review',
    'methodology', 'methods', 'results', 'discussion', 'conclusion',
    'references', 'bibliography', 'acknowledgments'
  ];

  const foundSections = [];
  lines.forEach((line, idx) => {
    const lowerLine = line.toLowerCase().replace(/^\d+\.?\s*/, '');
    expectedSections.forEach(section => {
      if (lowerLine === section || lowerLine.startsWith(section + ' ') ||
        lowerLine.startsWith(section + ':')) {
        foundSections.push({ name: section, lineIndex: idx });
        sections.push({ name: line, lineIndex: idx, type: section });
      }
    });
  });

  const criticalSections = ['abstract', 'introduction', 'conclusion', 'references'];
  criticalSections.forEach(section => {
    if (!foundSections.find(s => s.name === section)) {
      issues.push({
        type: 'missing_section',
        severity: 'high',
        message: `Missing "${section}" section`,
        suggestion: `Consider adding a ${section} section to your paper`
      });
    }
  });

  const paragraphs = extractParagraphs(content);
  if (paragraphs.length < 5) {
    issues.push({
      type: 'structure',
      severity: 'medium',
      message: 'Paper appears to have very few paragraphs',
      suggestion: 'Consider expanding your content with more detailed paragraphs'
    });
  }

  const wordCount = content.split(/\s+/).length;
  if (wordCount < 1000) {
    issues.push({
      type: 'length',
      severity: 'medium',
      message: `Paper is relatively short (${wordCount} words)`,
      suggestion: 'Most academic papers are 3,000-8,000 words'
    });
  }

  return { sections, issues, wordCount, paragraphCount: paragraphs.length };
}

module.exports = {
  extractKeywords,
  extractTopics,
  extractClaims,
  detectCitationSpots,
  analyzeStructure
};