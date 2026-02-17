function formatAuthorsAPA(authors) {
  if (!authors || authors.length === 0) return 'Unknown Author';
  if (typeof authors === 'string') {
    try {
      authors = JSON.parse(authors);
    } catch {
      return authors;
    }
  }

  const formatted = authors.map(a => {
    const parts = a.trim().split(' ');
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
    return `${last}, ${initials}`;
  });

  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
  if (formatted.length <= 20) {
    return formatted.slice(0, -1).join(', ') + ', & ' + formatted[formatted.length - 1];
  }
  return formatted.slice(0, 19).join(', ') + ', ... ' + formatted[formatted.length - 1];
}

function formatAuthorsIEEE(authors) {
  if (!authors || authors.length === 0) return 'Unknown Author';
  if (typeof authors === 'string') {
    try {
      authors = JSON.parse(authors);
    } catch {
      return authors;
    }
  }

  const formatted = authors.map(a => {
    const parts = a.trim().split(' ');
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
    return `${initials} ${last}`;
  });

  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  return formatted.slice(0, -1).join(', ') + ', and ' + formatted[formatted.length - 1];
}

function formatAuthorsNature(authors) {
  if (!authors || authors.length === 0) return 'Unknown Author';
  if (typeof authors === 'string') {
    try {
      authors = JSON.parse(authors);
    } catch {
      return authors;
    }
  }

  const formatted = authors.map(a => {
    const parts = a.trim().split(' ');
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
    return `${last}, ${initials}`;
  });

  if (formatted.length <= 5) {
    return formatted.slice(0, -1).join(', ') + ' & ' + formatted[formatted.length - 1];
  }
  return formatted.slice(0, 5).join(', ') + ' et al.';
}

function formatReferenceAPA(ref) {
  const authors = formatAuthorsAPA(ref.authors);
  const year = ref.year ? `(${ref.year})` : '(n.d.)';
  const title = ref.title || 'Untitled';
  const journal = ref.journal ? `*${ref.journal}*` : '';
  const doi = ref.doi ? `https://doi.org/${ref.doi}` : '';

  let citation = `${authors} ${year}. ${title}.`;
  if (journal) citation += ` ${journal}.`;
  if (doi) citation += ` ${doi}`;

  return citation.trim();
}

function formatReferenceIEEE(ref, index = 1) {
  const authors = formatAuthorsIEEE(ref.authors);
  const title = ref.title ? `"${ref.title},"` : '"Untitled,"';
  const journal = ref.journal ? `*${ref.journal}*` : '';
  const year = ref.year || 'n.d.';
  const doi = ref.doi ? `doi: ${ref.doi}` : '';

  let citation = `[${index}] ${authors}, ${title}`;
  if (journal) citation += ` ${journal},`;
  citation += ` ${year}.`;
  if (doi) citation += ` ${doi}`;

  return citation.trim();
}

function formatReferenceDeSci(ref) {
  const authors = formatAuthorsAPA(ref.authors);
  const year = ref.year || 'n.d.';
  const title = ref.title || 'Untitled';
  const journal = ref.journal || '';
  const doi = ref.doi ? `DOI: ${ref.doi}` : '';

  let citation = `${authors} (${year}). "${title}."`;
  if (journal) citation += ` ${journal}.`;
  if (doi) citation += ` ${doi}`;
  citation += ` [Verified via decentralized metadata]`;

  return citation.trim();
}

function formatReferenceNature(ref, index = 1) {
  const authors = formatAuthorsNature(ref.authors);
  const title = ref.title || 'Untitled';
  const journal = ref.journal ? `*${ref.journal}*` : '';
  const year = ref.year ? `(${ref.year})` : '';
  const doi = ref.doi ? `https://doi.org/${ref.doi}` : '';

  let citation = `${index}. ${authors} ${title}.`;
  if (journal) citation += ` ${journal}`;
  if (year) citation += ` ${year}.`;
  if (doi) citation += ` ${doi}`;

  return citation.trim();
}

function formatReferenceElsevier(ref) {
  return formatReferenceAPA(ref);
}

function formatReferenceSpringer(ref) {
  const authors = formatAuthorsNature(ref.authors);
  const year = ref.year ? `(${ref.year})` : '(n.d.)';
  const title = ref.title || 'Untitled';
  const journal = ref.journal ? `*${ref.journal}*` : '';
  const doi = ref.doi ? `https://doi.org/${ref.doi}` : '';

  let citation = `${authors} ${year} ${title}.`;
  if (journal) citation += ` ${journal}.`;
  if (doi) citation += ` ${doi}`;

  return citation.trim();
}

function formatReference(ref, style = 'APA', index = 1) {
  switch (style) {
    case 'APA': return formatReferenceAPA(ref);
    case 'IEEE': return formatReferenceIEEE(ref, index);
    case 'DeSci': return formatReferenceDeSci(ref);
    case 'Nature': return formatReferenceNature(ref, index);
    case 'Elsevier': return formatReferenceElsevier(ref);
    case 'Springer': return formatReferenceSpringer(ref);
    default: return formatReferenceAPA(ref);
  }
}

function formatInTextCitation(ref, style = 'APA', index = 1) {
  let firstAuthor = 'Unknown';
  let authors = ref.authors;
  if (typeof authors === 'string') {
    try { authors = JSON.parse(authors); } catch { authors = [ref.authors]; }
  }
  if (authors && authors.length > 0) {
    const parts = authors[0].trim().split(' ');
    firstAuthor = parts[parts.length - 1];
  }

  const year = ref.year || 'n.d.';

  switch (style) {
    case 'APA':
      if (!authors || authors.length <= 2) {
        const names = (authors || []).map(a => {
          const p = a.trim().split(' ');
          return p[p.length - 1];
        });
        return `(${names.join(' & ')}, ${year})`;
      }
      return `(${firstAuthor} et al., ${year})`;

    case 'IEEE':
      return `[${index}]`;

    case 'DeSci':
      return `(${firstAuthor}, ${year})`;

    case 'Nature':
      if (!authors || authors.length === 1) return `${firstAuthor} (ref. ${index})`;
      return `${firstAuthor} et al. (ref. ${index})`;

    case 'Elsevier':
      return `(${firstAuthor} et al., ${year})`;

    case 'Springer':
      return `[${index}]`;

    default:
      return `(${firstAuthor}, ${year})`;
  }
}

function generateBibliography(references, style = 'APA') {
  if (!references || references.length === 0) return '';

  const sorted = [...references].sort((a, b) => {
    if (style === 'IEEE' || style === 'Nature' || style === 'Springer') return 0;
    let authorA = '';
    let authorB = '';
    const authorsA = typeof a.authors === 'string' ? a.authors : (a.authors || []).join(', ');
    const authorsB = typeof b.authors === 'string' ? b.authors : (b.authors || []).join(', ');
    authorA = authorsA.toLowerCase();
    authorB = authorsB.toLowerCase();
    return authorA.localeCompare(authorB);
  });

  return sorted
    .map((ref, idx) => formatReference(ref, style, idx + 1))
    .join('\n\n');
}

const JOURNAL_FORMATTING = {
  Nature: {
    inTextStyle: 'superscript_number',
    bibStyle: 'numbered',
    spacing: 'single',
    fontHint: 'Times New Roman, 10pt'
  },
  Elsevier: {
    inTextStyle: 'author_year',
    bibStyle: 'alphabetical',
    spacing: 'double',
    fontHint: 'Times New Roman, 12pt'
  },
  Springer: {
    inTextStyle: 'numbered_bracket',
    bibStyle: 'numbered',
    spacing: 'single',
    fontHint: 'Times New Roman, 10pt'
  },
  IEEE: {
    inTextStyle: 'numbered_bracket',
    bibStyle: 'numbered',
    spacing: 'single',
    fontHint: 'Times New Roman, 10pt'
  },
  APA: {
    inTextStyle: 'author_year',
    bibStyle: 'alphabetical',
    spacing: 'double',
    fontHint: 'Times New Roman, 12pt'
  },
  DeSci: {
    inTextStyle: 'author_year',
    bibStyle: 'alphabetical',
    spacing: 'single',
    fontHint: 'Open Sans, 11pt'
  }
};

function getJournalFormatting(style) {
  return JOURNAL_FORMATTING[style] || JOURNAL_FORMATTING.APA;
}

module.exports = {
  formatReference,
  formatInTextCitation,
  generateBibliography,
  getJournalFormatting
};