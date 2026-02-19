// === AI Academic Submission Engine - Frontend Application ===

const API_URL = '/';

// === State Management ===
const state = {
  currentPage: 'landing',
  activePaperId: null,
  activePaper: null,
  references: [],
  citationSpots: [],
  similarityReport: null,
  libraryFilter: 'all',
  referenceFilter: 'all',
  chatHistory: [],
  formatStyles: null
};

// === Navigation ===
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.add('active');
    state.currentPage = page;
  }

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (activeLink) activeLink.classList.add('active');

  const navLinks = document.getElementById('navLinks');
  if (page === 'landing') {
    navLinks.classList.add('hidden');
    navLinks.classList.remove('md:flex');
  } else {
    navLinks.classList.remove('hidden');
    navLinks.classList.add('md:flex');
  }

  if (state.activePaperId) {
    switch (page) {
      case 'dashboard': loadDashboard(); break;
      case 'citations': break;
      case 'references': loadReferences(); break;
      case 'copilot': loadChatHistory(); break;
      case 'formatting': loadFormattingStyles(); break;
      case 'export': loadExportPage(); break;
    }
  }

  if (page === 'upload') loadPreviousPapers();
  if (page === 'library') loadLibrary();

  window.scrollTo(0, 0);
}

// === File Upload ===
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) uploadFile(files[0]);
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) uploadFile(files[0]);
}

document.addEventListener('DOMContentLoaded', () => {
  const uploadZone = document.getElementById('uploadZone');
  if (uploadZone) {
    uploadZone.addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
  }
});

async function uploadFile(file) {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];

  if (!allowedTypes.includes(file.type)) {
    showToast('Invalid file type. Please upload a PDF or Word document.', 'error');
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    showToast('File too large. Maximum size is 20MB.', 'error');
    return;
  }

  document.getElementById('uploadContent').classList.add('hidden');
  document.getElementById('uploadProgress').classList.remove('hidden');

  const progressBar = document.getElementById('progressBar');
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 15, 90);
    progressBar.style.width = `${progress}%`;
  }, 300);

  try {
    const formData = new FormData();
    formData.append('paper', file);

    const response = await fetch(`${API_URL}/api/papers/upload`, {
      method: 'POST',
      body: formData
    });

    clearInterval(progressInterval);
    progressBar.style.width = '100%';

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Upload failed');
    }

    const data = await response.json();
    state.activePaperId = data.id;
    state.activePaper = data;

    updatePaperIndicator(data.title);
    showToast('Paper uploaded and analyzed successfully!', 'success');

    setTimeout(() => {
      document.getElementById('uploadContent').classList.remove('hidden');
      document.getElementById('uploadProgress').classList.add('hidden');
      progressBar.style.width = '0%';
      navigateTo('dashboard');
    }, 500);

  } catch (err) {
    clearInterval(progressInterval);
    document.getElementById('uploadContent').classList.remove('hidden');
    document.getElementById('uploadProgress').classList.add('hidden');
    progressBar.style.width = '0%';
    showToast(err.message, 'error');
  }
}

// === Previous Papers ===
async function loadPreviousPapers() {
  try {
    const response = await fetch(`${API_URL}/api/papers`);
    const papers = await response.json();

    const list = document.getElementById('papersList');
    const noPapers = document.getElementById('noPapers');

    if (!papers || papers.length === 0) {
      list.innerHTML = '';
      noPapers.classList.remove('hidden');
      return;
    }

    noPapers.classList.add('hidden');
    list.innerHTML = papers.map(paper => `
      <div class="paper-item" onclick="loadPaper('${paper.id}')">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg ${paper.file_type.includes('pdf') ? 'bg-danger/10 text-danger' : 'bg-primary-100 text-primary-600'} flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <div>
            <p class="font-medium text-academic-800 text-sm">${escapeHtml(paper.title || paper.original_filename)}</p>
            <p class="text-xs text-academic-400">${formatDate(paper.created_at)} &middot; ${paper.page_count || '?'} pages &middot; ${paper.journal_format}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-1 text-xs rounded-full ${paper.status === 'analyzed' ? 'bg-success/10 text-success' : 'bg-academic-100 text-academic-500'}">${paper.status}</span>
          <button onclick="event.stopPropagation(); deletePaper('${paper.id}')" class="p-1 text-academic-400 hover:text-danger transition-colors" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load papers:', err);
  }
}

async function loadPaper(paperId) {
  try {
    const response = await fetch(`${API_URL}/api/papers/${paperId}`);
    if (!response.ok) throw new Error('Failed to load paper');
    const data = await response.json();
    state.activePaperId = paperId;
    state.activePaper = data;
    updatePaperIndicator(data.title);
    navigateTo('dashboard');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePaper(paperId) {
  if (!confirm('Are you sure you want to delete this paper and all associated data?')) return;
  try {
    await fetch(`${API_URL}/api/papers/${paperId}`, { method: 'DELETE' });
    if (state.activePaperId === paperId) {
      state.activePaperId = null;
      state.activePaper = null;
      document.getElementById('paperIndicator').classList.add('hidden');
    }
    showToast('Paper deleted', 'info');
    loadPreviousPapers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Dashboard ===
async function loadDashboard() {
  if (!state.activePaperId) {
    showToast('Please upload a paper first', 'warning');
    navigateTo('upload');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/analysis/${state.activePaperId}`);
    const analysis = await response.json();

    document.getElementById('dashboardPaperTitle').textContent = analysis.title || '';
    document.getElementById('statWords').textContent = (analysis.wordCount || 0).toLocaleString();
    document.getElementById('statPages').textContent = analysis.pageCount || '-';

    const refsResp = await fetch(`${API_URL}/api/references/paper/${state.activePaperId}`);
    const refs = await refsResp.json();
    state.references = refs;
    const acceptedCount = refs.filter(r => r.status === 'accepted').length;
    document.getElementById('statRefs').textContent = `${acceptedCount}/${refs.length}`;

    // Keywords
    const keywordsList = document.getElementById('keywordsList');
    keywordsList.innerHTML = (analysis.keywords || []).map(kw =>
      `<span class="keyword-tag">${escapeHtml(kw)}</span>`
    ).join('');

    // Topics
    const topicsList = document.getElementById('topicsList');
    topicsList.innerHTML = (analysis.topics || []).map(topic => {
      const t = typeof topic === 'string' ? topic : topic.topic;
      const related = typeof topic === 'object' && topic.relatedTerms ? topic.relatedTerms.join(', ') : '';
      return `
        <div class="topic-item">
          <div>
            <p class="text-sm font-medium text-academic-800">${escapeHtml(t)}</p>
            ${related ? `<p class="text-xs text-academic-400 mt-0.5">${escapeHtml(related)}</p>` : ''}
          </div>
          <button onclick="searchReferencesForTopic('${escapeHtml(t)}')" class="text-xs text-primary-600 hover:text-primary-700 font-medium">Find refs</button>
        </div>`;
    }).join('');

    // Claims
    const claimsList = document.getElementById('claimsList');
    claimsList.innerHTML = (analysis.claims || []).slice(0, 10).map(claim => `
      <div class="claim-item ${claim.needsCitation === false ? 'has-citation' : ''}">
        <p class="text-sm text-academic-700">"${escapeHtml(claim.text)}"</p>
        <div class="flex items-center justify-between mt-2">
          <span class="text-xs text-academic-400">Confidence: ${Math.round((claim.confidence || 0) * 100)}%</span>
          ${claim.needsCitation !== false
        ? '<span class="text-xs text-warning font-medium">Needs citation</span>'
        : '<span class="text-xs text-success font-medium">Has citation</span>'}
        </div>
      </div>
    `).join('') || '<p class="text-sm text-academic-400">No significant claims detected</p>';

    // Structure
    const sectionsList = document.getElementById('sectionsList');
    sectionsList.innerHTML = (analysis.structure?.sections || []).map(s => `
      <div class="section-item">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        ${escapeHtml(s.name)}
      </div>
    `).join('') || '<p class="text-sm text-academic-400">No clear sections detected</p>';

    const issuesList = document.getElementById('issuesList');
    issuesList.innerHTML = (analysis.structure?.issues || []).map(issue => `
      <div class="issue-item ${issue.severity}">
        <svg class="w-4 h-4 mt-0.5 flex-shrink-0 ${issue.severity === 'high' ? 'text-danger' : 'text-warning'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
        <div>
          <p class="text-sm font-medium text-academic-700">${escapeHtml(issue.message)}</p>
          <p class="text-xs text-academic-400 mt-0.5">${escapeHtml(issue.suggestion)}</p>
        </div>
      </div>
    `).join('') || '<p class="text-sm text-success">No structural issues detected</p>';

    // Load similarity if exists
    loadSimilarityResults();

  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load analysis', 'error');
  }
}

// === Auto Source References ===
async function autoSourceReferences() {
  if (!state.activePaperId) return;

  const btn = document.getElementById('autoSourceBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner w-4 h-4 border-2"></div> Sourcing...';

  try {
    const response = await fetch(`${API_URL}/api/references/auto-source/${state.activePaperId}`, {
      method: 'POST'
    });

    if (!response.ok) throw new Error('Failed to source references');
    const data = await response.json();

    showToast(`Found ${data.count} verified references from Crossref & OpenAlex`, 'success');
    loadDashboard();
    state.references = data.references;
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> Auto-Source References`;
  }
}

// === Similarity Check ===
async function runSimilarityCheck() {
  if (!state.activePaperId) return;

  const btn = document.getElementById('similarityBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner w-4 h-4 border-2"></div> Checking...';

  try {
    const response = await fetch(`${API_URL}/api/similarity/${state.activePaperId}`, {
      method: 'POST'
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Similarity check failed');
    }

    const data = await response.json();
    state.similarityReport = data;
    showToast(`Originality: ${data.originalityScore}%`, data.originalityScore >= 80 ? 'success' : 'warning');
    displaySimilarityResults(data);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> Similarity Check`;
  }
}

async function loadSimilarityResults() {
  try {
    const response = await fetch(`${API_URL}/api/similarity/${state.activePaperId}`);
    if (response.ok) {
      const data = await response.json();
      state.similarityReport = data;
      displaySimilarityResults(data);
    }
  } catch { /* No report yet */ }
}

function displaySimilarityResults(data) {
  const container = document.getElementById('similarityResults');
  container.classList.remove('hidden');

  const score = data.originality_score ?? data.originalityScore ?? 0;
  document.getElementById('statOriginality').textContent = `${score}%`;

  const circle = document.getElementById('origScoreCircle');
  circle.className = `originality-circle ${score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'}`;
  document.getElementById('origScoreVal').textContent = `${score}%`;

  document.getElementById('simChecked').textContent = data.total_checked ?? data.totalChecked ?? '-';
  document.getElementById('simFlagged').textContent = data.flagged_count ?? data.flaggedCount ?? '-';

  const sections = data.similar_sections ?? data.similarSections ?? [];
  const list = document.getElementById('similarSectionsList');
  list.innerHTML = sections.map(s => `
    <div class="p-4 bg-warning/5 rounded-lg border border-warning/20">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-semibold text-warning">Paragraph ${(s.paragraphIndex || 0) + 1} - ${s.similarityPercent}% similar</span>
        ${s.matchedSource ? `<span class="text-xs text-academic-400">${escapeHtml(s.matchedSource.title || '').substring(0, 60)}</span>` : ''}
      </div>
      <p class="text-sm text-academic-600 italic">"${escapeHtml(s.text || '')}"</p>
    </div>
  `).join('') || '<p class="text-sm text-success">No significant similarities found.</p>';
}

// === Citation Spots ===
async function detectCitationSpots() {
  if (!state.activePaperId) {
    showToast('Please upload a paper first', 'warning');
    return;
  }

  const btn = document.getElementById('detectSpotsBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner w-4 h-4 border-2"></div> Detecting...';

  try {
    const response = await fetch(`${API_URL}/api/analysis/${state.activePaperId}/citation-spots`);
    if (!response.ok) throw new Error('Failed to detect citation spots');

    const data = await response.json();
    state.citationSpots = data.spots || [];

    renderCitationSpots();
    showToast(`Found ${data.count} spots where citations are needed`, 'info');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> Detect Citation Spots`;
  }
}

function renderCitationSpots() {
  const list = document.getElementById('citationSpotsList');

  if (state.citationSpots.length === 0) {
    list.innerHTML = '<p class="text-academic-400 text-center py-8">No citation spots detected. Your paper may already have adequate citations.</p>';
    return;
  }

  list.innerHTML = state.citationSpots.map((spot, idx) => `
    <div class="citation-spot-card slide-up" style="animation-delay: ${idx * 0.05}s" id="spot-${spot.id}">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-semibold text-academic-500">Paragraph ${(spot.paragraphIndex || 0) + 1}</span>
        <span class="px-2 py-1 text-xs rounded-full bg-warning/10 text-warning font-medium">Citation needed</span>
      </div>
      <div class="claim-text mb-4">${escapeHtml(spot.sentence || spot.claimText || '')}</div>
      <p class="text-xs text-academic-400 mb-3">${escapeHtml(spot.reason || '')}</p>
      <div class="flex gap-2">
        <button onclick="suggestCitationsForSpot('${spot.id}')" class="btn-primary text-xs">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          Find Citations
        </button>
      </div>
      <div id="suggestions-${spot.id}" class="mt-4 space-y-3 hidden"></div>
    </div>
  `).join('');
}

async function suggestCitationsForSpot(spotId) {
  if (!state.activePaperId) return;

  try {
    const response = await fetch(
      `${API_URL}/api/analysis/${state.activePaperId}/suggest-citations/${spotId}`,
      { method: 'POST' }
    );

    if (!response.ok) throw new Error('Failed to get suggestions');
    const data = await response.json();

    const container = document.getElementById(`suggestions-${spotId}`);
    container.classList.remove('hidden');

    container.innerHTML = data.suggestions.map(sugg => {
      const ref = sugg.reference;
      const authors = Array.isArray(ref.authors) ? ref.authors : [];
      const qualityClass = ref.qualityScore >= 70 ? 'high' : ref.qualityScore >= 40 ? 'medium' : 'low';

      return `
        <div class="suggestion-card fade-in" id="sugg-${sugg.id}">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <p class="text-sm font-medium text-academic-800">${escapeHtml(ref.title)}</p>
              <p class="text-xs text-academic-500 mt-1">${escapeHtml(authors.join(', '))} ${ref.year ? `(${ref.year})` : ''}</p>
              ${ref.journal ? `<p class="text-xs text-academic-400 italic mt-0.5">${escapeHtml(ref.journal)}</p>` : ''}
              ${ref.doi ? `<a href="https://doi.org/${ref.doi}" target="_blank" class="doi-link mt-1 block">DOI: ${escapeHtml(ref.doi)}</a>` : ''}
            </div>
            <span class="quality-badge ${qualityClass}">${ref.qualityScore}/100</span>
          </div>
          <p class="text-xs text-academic-500 mt-2 italic">${escapeHtml(sugg.explanation || '')}</p>
          <div class="flex items-center gap-2 mt-3">
            <button onclick="acceptCitationSuggestion('${sugg.id}', '${ref.id}')" class="btn-success">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              Accept
            </button>
            <button onclick="rejectCitationSuggestion('${sugg.id}')" class="btn-danger">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              Reject
            </button>
            <button onclick="editReference('${ref.id}', '${escapeHtml(ref.title)}', '${escapeHtml(authors.join(', '))}', ${ref.year || 'null'}, '${escapeHtml(ref.journal || '')}', '${escapeHtml(ref.doi || '')}')" class="btn-warning">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              Edit
            </button>
            <button onclick="saveToLibrary('${ref.id}')" class="btn-ghost text-xs" title="Save to library">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function acceptCitationSuggestion(suggId, refId) {
  try {
    await fetch(`${API_URL}/api/analysis/citation-suggestion/${suggId}/accept`, { method: 'PATCH' });
    const el = document.getElementById(`sugg-${suggId}`);
    if (el) {
      el.classList.add('opacity-50');
      el.querySelector('.btn-success').innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Accepted';
      el.querySelector('.btn-success').disabled = true;
    }
    showToast('Citation accepted', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function rejectCitationSuggestion(suggId) {
  try {
    await fetch(`${API_URL}/api/analysis/citation-suggestion/${suggId}/reject`, { method: 'PATCH' });
    const el = document.getElementById(`sugg-${suggId}`);
    if (el) {
      el.classList.add('opacity-30');
    }
    showToast('Citation rejected', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === References Page ===
async function loadReferences() {
  if (!state.activePaperId) return;

  try {
    const response = await fetch(`${API_URL}/api/references/paper/${state.activePaperId}`);
    const refs = await response.json();
    state.references = refs;
    renderReferences();
  } catch (err) {
    console.error('Failed to load references:', err);
  }
}

function renderReferences() {
  const list = document.getElementById('referencesList');
  let filtered = state.references;

  if (state.referenceFilter !== 'all') {
    filtered = state.references.filter(r => r.status === state.referenceFilter);
  }

  if (filtered.length === 0) {
    list.innerHTML = '<p class="text-academic-400 text-center py-8">No references found for this filter.</p>';
    return;
  }

  list.innerHTML = filtered.map(ref => {
    const authors = Array.isArray(ref.authors) ? ref.authors : [];
    const qualityClass = ref.quality_score >= 70 ? 'high' : ref.quality_score >= 40 ? 'medium' : 'low';

    return `
      <div class="reference-card ${ref.status} fade-in">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <p class="text-sm font-semibold text-academic-800">${escapeHtml(ref.title)}</p>
              <span class="quality-badge ${qualityClass}">${ref.quality_score || 0}/100</span>
            </div>
            <p class="text-xs text-academic-500">${escapeHtml(authors.join(', '))} ${ref.year ? `(${ref.year})` : ''}</p>
            ${ref.journal ? `<p class="text-xs text-academic-400 italic">${escapeHtml(ref.journal)}</p>` : ''}
            ${ref.doi ? `<a href="https://doi.org/${ref.doi}" target="_blank" class="doi-link block mt-1">DOI: ${escapeHtml(ref.doi)}</a>` : ''}
            ${ref.quality_explanation ? `<p class="text-xs text-academic-400 mt-1">${escapeHtml(ref.quality_explanation)}</p>` : ''}
            <div class="flex items-center gap-3 mt-1">
              <span class="text-xs text-academic-400">Source: ${escapeHtml(ref.source || 'unknown')}</span>
              <span class="text-xs text-academic-400">Citations: ${ref.citation_count || 0}</span>
              ${ref.verified ? '<span class="text-xs text-success font-medium">Verified</span>' : ''}
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            ${ref.status !== 'accepted' ? `<button onclick="acceptReference('${ref.id}')" class="btn-success">Accept</button>` : '<span class="text-xs text-success font-semibold">Accepted</span>'}
            ${ref.status !== 'rejected' ? `<button onclick="rejectReference('${ref.id}')" class="btn-danger">Reject</button>` : ''}
            <button onclick="editReference('${ref.id}', '${escapeJs(ref.title)}', '${escapeJs(authors.join(', '))}', ${ref.year || 'null'}, '${escapeJs(ref.journal || '')}', '${escapeJs(ref.doi || '')}')" class="btn-warning">Edit</button>
            <button onclick="saveToLibrary('${ref.id}')" class="btn-ghost text-xs">Save</button>
            <button onclick="explainCitation('${ref.id}')" class="btn-ghost text-xs">Explain</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function filterReferences(filter) {
  state.referenceFilter = filter;
  document.querySelectorAll('[data-filter]').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-filter="${filter}"]`)?.classList.add('active');
  renderReferences();
}

async function acceptReference(refId) {
  try {
    await fetch(`${API_URL}/api/references/${refId}/accept`, { method: 'PATCH' });
    const ref = state.references.find(r => r.id === refId);
    if (ref) ref.status = 'accepted';
    renderReferences();
    showToast('Reference accepted', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function rejectReference(refId) {
  try {
    await fetch(`${API_URL}/api/references/${refId}/reject`, { method: 'PATCH' });
    const ref = state.references.find(r => r.id === refId);
    if (ref) ref.status = 'rejected';
    renderReferences();
    showToast('Reference rejected', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function explainCitation(refId) {
  if (!state.activePaperId) return;

  try {
    const response = await fetch(`${API_URL}/api/copilot/${state.activePaperId}/explain-citation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceId: refId })
    });

    if (!response.ok) throw new Error('Failed to get explanation');
    const data = await response.json();

    const explanation = data.explanation;
    const msg = `Citation Explanation for "${data.reference.title}":\n\n` +
      `Relevance: ${explanation.relevance}\n` +
      `Credibility: ${explanation.credibility}\n` +
      `Authors: ${explanation.authors}\n` +
      `Verification: ${explanation.verification}\n` +
      `Recommendation: ${explanation.recommendation}`;

    alert(msg);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Search References ===
function showSearchModal() {
  document.getElementById('searchModal').classList.remove('hidden');
  document.getElementById('refSearchInput').focus();
}

function hideSearchModal() {
  document.getElementById('searchModal').classList.add('hidden');
  document.getElementById('searchResults').innerHTML = '';
}

async function searchNewReferences() {
  const query = document.getElementById('refSearchInput').value.trim();
  if (!query) return;

  const resultsDiv = document.getElementById('searchResults');
  resultsDiv.innerHTML = '<div class="flex justify-center py-4"><div class="loading-spinner"></div></div>';

  try {
    const response = await fetch(`${API_URL}/api/references/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, paperId: state.activePaperId, maxResults: 10 })
    });

    if (!response.ok) throw new Error('Search failed');
    const data = await response.json();

    resultsDiv.innerHTML = data.references.map(ref => {
      const authors = Array.isArray(ref.authors) ? ref.authors : [];
      const qualityClass = ref.qualityScore >= 70 ? 'high' : ref.qualityScore >= 40 ? 'medium' : 'low';

      return `
        <div class="reference-card suggested fade-in">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <p class="text-sm font-medium text-academic-800">${escapeHtml(ref.title)}</p>
              <p class="text-xs text-academic-500">${escapeHtml(authors.join(', '))} ${ref.year ? `(${ref.year})` : ''}</p>
              ${ref.journal ? `<p class="text-xs text-academic-400 italic">${escapeHtml(ref.journal)}</p>` : ''}
              ${ref.doi ? `<a href="https://doi.org/${ref.doi}" target="_blank" class="doi-link block mt-1">DOI: ${ref.doi}</a>` : ''}
            </div>
            <div class="flex items-center gap-2">
              <span class="quality-badge ${qualityClass}">${ref.qualityScore}/100</span>
              <button onclick="acceptReference('${ref.id}')" class="btn-success">Accept</button>
            </div>
          </div>
        </div>`;
    }).join('') || '<p class="text-sm text-academic-400 text-center py-4">No references found.</p>';

    state.references = [...state.references, ...data.references.map(r => ({
      ...r,
      quality_score: r.qualityScore,
      quality_explanation: r.qualityExplanation,
      citation_count: r.citationCount
    }))];

  } catch (err) {
    resultsDiv.innerHTML = `<p class="text-sm text-danger text-center py-4">${err.message}</p>`;
  }
}

async function searchReferencesForTopic(topic) {
  document.getElementById('refSearchInput').value = topic;
  navigateTo('references');
  showSearchModal();
  await searchNewReferences();
}

// === Edit Reference ===
function editReference(id, title, authors, year, journal, doi) {
  document.getElementById('editRefId').value = id;
  document.getElementById('editRefTitle').value = title || '';
  document.getElementById('editRefAuthors').value = authors || '';
  document.getElementById('editRefYear').value = year || '';
  document.getElementById('editRefJournal').value = journal || '';
  document.getElementById('editRefDoi').value = doi || '';
  document.getElementById('editRefModal').classList.remove('hidden');
}

function closeEditRefModal() {
  document.getElementById('editRefModal').classList.add('hidden');
}

async function saveEditedReference() {
  const id = document.getElementById('editRefId').value;
  const data = {
    title: document.getElementById('editRefTitle').value,
    authors: document.getElementById('editRefAuthors').value.split(',').map(a => a.trim()),
    year: parseInt(document.getElementById('editRefYear').value) || null,
    journal: document.getElementById('editRefJournal').value,
    doi: document.getElementById('editRefDoi').value
  };

  try {
    await fetch(`${API_URL}/api/references/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    closeEditRefModal();
    showToast('Reference updated', 'success');
    loadReferences();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === AI Co-Pilot ===
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message || !state.activePaperId) {
    if (!state.activePaperId) showToast('Please upload a paper first', 'warning');
    return;
  }

  input.value = '';
  appendChatMessage('user', message);

  try {
    const response = await fetch(`${API_URL}/api/copilot/${state.activePaperId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    if (!response.ok) throw new Error('Chat failed');
    const data = await response.json();

    appendChatMessage('assistant', data.response, data.suggestions, data.actions);
  } catch (err) {
    appendChatMessage('assistant', `Sorry, I encountered an error: ${err.message}`);
  }
}

function sendQuickChat(message) {
  document.getElementById('chatInput').value = message;
  sendChatMessage();
}

function appendChatMessage(role, text, suggestions, actions) {
  const container = document.getElementById('chatMessages');

  const formatted = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  let suggestionsHtml = '';
  if (suggestions && suggestions.length > 0) {
    suggestionsHtml = `<div class="flex flex-wrap gap-1.5 mt-3">${suggestions.map(s =>
      `<button onclick="sendQuickChat('${escapeJs(s)}')" class="px-2.5 py-1 bg-white/50 rounded-full text-xs text-academic-600 hover:bg-white transition-colors border border-academic-200">${escapeHtml(s)}</button>`
    ).join('')}</div>`;
  }

  let actionsHtml = '';
  if (actions && actions.length > 0) {
    actionsHtml = `<div class="flex gap-2 mt-3">${actions.map(a => {
      let onclick = '';
      switch (a.type) {
        case 'auto_source': onclick = 'autoSourceReferences()'; break;
        case 'run_similarity': onclick = 'runSimilarityCheck()'; break;
        case 'view_references': onclick = "navigateTo('references')"; break;
        default: onclick = '';
      }
      return `<button onclick="${onclick}" class="btn-primary text-xs">${escapeHtml(a.label)}</button>`;
    }).join('')}</div>`;
  }

  container.innerHTML += `
    <div class="chat-message ${role} fade-in">
      <div class="chat-bubble ${role}">
        ${formatted}
        ${suggestionsHtml}
        ${actionsHtml}
      </div>
    </div>`;

  container.scrollTop = container.scrollHeight;
}

async function loadChatHistory() {
  if (!state.activePaperId) return;
  try {
    const response = await fetch(`${API_URL}/api/copilot/${state.activePaperId}/history`);
    const history = await response.json();

    if (history.length > 0) {
      const container = document.getElementById('chatMessages');
      container.innerHTML = '';
      history.forEach(msg => {
        appendChatMessage(msg.role, msg.content);
      });
    }
  } catch { /* No history yet */ }
}

async function rephraseText() {
  const text = document.getElementById('rephraseInput').value.trim();
  if (!text || !state.activePaperId) {
    if (!state.activePaperId) showToast('Please upload a paper first', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/copilot/${state.activePaperId}/rephrase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error('Rephrase failed');
    const data = await response.json();

    const resultDiv = document.getElementById('rephraseResult');
    resultDiv.classList.remove('hidden');
    document.getElementById('rephrasedText').textContent = data.rephrased;

    const improvementsDiv = document.getElementById('rephraseImprovements');
    improvementsDiv.innerHTML = (data.improvements || []).map(imp =>
      `<p class="text-xs text-academic-500">&bull; ${escapeHtml(imp)}</p>`
    ).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Formatting ===
async function loadFormattingStyles() {
  try {
    const response = await fetch(`${API_URL}/api/formatting/styles`);
    const styles = await response.json();
    state.formatStyles = styles;

    const currentFormat = state.activePaper?.journal_format || 'APA';
    const container = document.getElementById('formatStyles');

    container.innerHTML = Object.entries(styles).map(([key, style]) => `
      <div class="format-card ${key === currentFormat ? 'selected' : ''}" onclick="applyFormat('${key}')" data-format="${key}">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-bold text-academic-800">${escapeHtml(style.name)}</h3>
          ${key === currentFormat ? '<span class="text-xs text-primary-600 font-medium">Active</span>' : ''}
        </div>
        <p class="text-xs text-academic-500 mb-3">${escapeHtml(style.description)}</p>
        <div class="space-y-2">
          <div>
            <span class="text-xs text-academic-400">In-text:</span>
            <code class="text-xs bg-academic-100 px-2 py-0.5 rounded ml-1">${escapeHtml(style.inTextExample)}</code>
          </div>
          <div>
            <span class="text-xs text-academic-400">Bibliography:</span>
            <p class="text-xs text-academic-600 mt-0.5 font-serif">${escapeHtml(style.bibExample)}</p>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load styles:', err);
  }
}

async function applyFormat(style) {
  if (!state.activePaperId) return;

  try {
    const response = await fetch(`${API_URL}/api/formatting/${state.activePaperId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style })
    });

    if (!response.ok) throw new Error('Failed to apply format');
    const data = await response.json();

    if (state.activePaper) state.activePaper.journal_format = style;

    document.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`[data-format="${style}"]`)?.classList.add('selected');

    const preview = document.getElementById('formatPreview');
    preview.classList.remove('hidden');
    document.getElementById('bibPreview').textContent = data.bibliography || 'No accepted references to preview.';

    document.getElementById('exportStyle').value = style;

    showToast(`Format applied: ${style}`, 'success');
    loadFormattingStyles();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Export ===
async function loadExportPage() {
  if (!state.activePaperId) return;

  try {
    const paper = state.activePaper;
    document.getElementById('exportTitle').textContent = paper?.title || '-';
    document.getElementById('exportWords').textContent = paper?.content ? paper.content.split(/\s+/).length.toLocaleString() : '-';
    document.getElementById('exportFormat').textContent = paper?.journal_format || 'APA';
    document.getElementById('exportStyle').value = paper?.journal_format || 'APA';

    const refsResp = await fetch(`${API_URL}/api/references/paper/${state.activePaperId}`);
    const refs = await refsResp.json();
    const accepted = refs.filter(r => r.status === 'accepted');
    document.getElementById('exportRefs').textContent = accepted.length.toString();
  } catch (err) {
    console.error('Export page load error:', err);
  }
}

async function exportPaper() {
  if (!state.activePaperId) {
    showToast('Please upload a paper first', 'warning');
    return;
  }

  const style = document.getElementById('exportStyle').value;
  const btn = document.getElementById('exportBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner w-4 h-4 border-2"></div> Generating...';

  try {
    const response = await fetch(`${API_URL}/api/export/${state.activePaperId}/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style })
    });

    if (!response.ok) throw new Error('Export failed');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.activePaper?.title || 'paper').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}_${style}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast('PDF downloaded successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Download PDF`;
  }
}

async function previewExport() {
  if (!state.activePaperId) return;

  const style = document.getElementById('exportStyle').value;

  try {
    const response = await fetch(`${API_URL}/api/export/${state.activePaperId}/preview?style=${style}`);
    if (!response.ok) throw new Error('Preview failed');
    const data = await response.json();

    const preview = document.getElementById('exportPreview');
    preview.classList.remove('hidden');

    const content = data.content || '';
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p class="mb-3">${escapeHtml(p.trim())}</p>`).join('');

    document.getElementById('previewContent').innerHTML = `
      <div class="text-center mb-6">
        <h2 class="text-xl font-bold text-academic-900">${escapeHtml(data.title || 'Untitled')}</h2>
        <p class="text-xs text-academic-400 mt-1">Formatted in ${data.style} style | ${data.wordCount || 0} words</p>
      </div>
      <div class="border-t border-academic-200 pt-4 mb-6">${paragraphs}</div>
      ${data.bibliography ? `
        <div class="border-t-2 border-academic-300 pt-4">
          <h3 class="font-bold text-academic-900 mb-3">${style === 'IEEE' ? 'REFERENCES' : 'References'}</h3>
          <div class="whitespace-pre-wrap text-academic-700">${escapeHtml(data.bibliography)}</div>
        </div>` : ''}
    `;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Reference Library ===
async function loadLibrary() {
  try {
    const response = await fetch(`${API_URL}/api/library`);
    const refs = await response.json();

    const projectsResp = await fetch(`${API_URL}/api/library/projects`);
    const projects = await projectsResp.json();

    const tabsContainer = document.getElementById('libraryProjectTabs');
    tabsContainer.innerHTML = projects.map(p =>
      `<button onclick="filterLibrary('${escapeJs(p.project_name)}')" class="filter-tab" data-lib-filter="${escapeHtml(p.project_name)}">${escapeHtml(p.project_name)} (${p.count})</button>`
    ).join('');

    const list = document.getElementById('libraryList');
    let filtered = refs;
    if (state.libraryFilter !== 'all') {
      filtered = refs.filter(r => r.project_name === state.libraryFilter);
    }

    if (filtered.length === 0) {
      list.innerHTML = '<p class="text-academic-400 text-center py-8">No references in your library.</p>';
      return;
    }

    list.innerHTML = filtered.map(ref => `
      <div class="library-card fade-in">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <p class="text-sm font-semibold text-academic-800">${escapeHtml(ref.title)}</p>
              <span class="px-2 py-0.5 bg-academic-100 rounded-full text-xs text-academic-500">${escapeHtml(ref.project_name)}</span>
            </div>
            <p class="text-xs text-academic-500">${escapeHtml(ref.authors || '')} ${ref.year ? `(${ref.year})` : ''}</p>
            ${ref.journal ? `<p class="text-xs text-academic-400 italic">${escapeHtml(ref.journal)}</p>` : ''}
            ${ref.doi ? `<a href="https://doi.org/${ref.doi}" target="_blank" class="doi-link block mt-1">DOI: ${ref.doi}</a>` : ''}
            ${ref.notes ? `<p class="text-xs text-academic-400 mt-1 bg-academic-50 p-2 rounded">${escapeHtml(ref.notes)}</p>` : ''}
            ${ref.tags && ref.tags.length > 0 ? `<div class="flex gap-1 mt-1">${ref.tags.map(t => `<span class="keyword-tag text-xs">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
          <button onclick="deleteLibraryRef('${ref.id}')" class="btn-danger text-xs">Remove</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Library load error:', err);
  }
}

function filterLibrary(filter) {
  state.libraryFilter = filter;
  document.querySelectorAll('[data-lib-filter]').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-lib-filter="${filter}"]`)?.classList.add('active');
  loadLibrary();
}

async function saveToLibrary(refId) {
  try {
    const response = await fetch(`${API_URL}/api/library/save-from-paper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceId: refId })
    });

    if (!response.ok) throw new Error('Failed to save');
    showToast('Reference saved to library', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showAddToLibraryModal() {
  document.getElementById('addLibraryModal').classList.remove('hidden');
}

function closeAddLibraryModal() {
  document.getElementById('addLibraryModal').classList.add('hidden');
}

async function addToLibrary() {
  const data = {
    title: document.getElementById('libTitle').value,
    authors: document.getElementById('libAuthors').value.split(',').map(a => a.trim()).filter(Boolean),
    year: parseInt(document.getElementById('libYear').value) || null,
    journal: document.getElementById('libJournal').value,
    doi: document.getElementById('libDoi').value,
    projectName: document.getElementById('libProject').value || 'Default',
    notes: document.getElementById('libNotes').value
  };

  if (!data.title) {
    showToast('Title is required', 'error');
    return;
  }

  try {
    await fetch(`${API_URL}/api/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    closeAddLibraryModal();
    showToast('Reference added to library', 'success');
    loadLibrary();

    ['libTitle', 'libAuthors', 'libYear', 'libJournal', 'libDoi', 'libProject', 'libNotes']
      .forEach(id => document.getElementById(id).value = '');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteLibraryRef(refId) {
  if (!confirm('Remove this reference from your library?')) return;
  try {
    await fetch(`${API_URL}/api/library/${refId}`, { method: 'DELETE' });
    showToast('Reference removed', 'info');
    loadLibrary();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Utilities ===
function updatePaperIndicator(title) {
  const indicator = document.getElementById('paperIndicator');
  indicator.classList.remove('hidden');
  indicator.classList.add('flex');
  document.getElementById('activePaperTitle').textContent = title || 'Paper loaded';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const content = document.getElementById('toastContent');

  const icons = {
    success: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
    error: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
    warning: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>',
    info: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
  };

  content.className = `flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border text-sm font-medium toast-${type}`;
  content.innerHTML = `${icons[type] || icons.info} ${escapeHtml(message)}`;

  toast.classList.remove('hidden');
  toast.classList.add('fade-in');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// === Initialize ===
document.addEventListener('DOMContentLoaded', () => {
  navigateTo('landing');
});
