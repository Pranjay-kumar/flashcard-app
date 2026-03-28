const state = {
  decks: [],
  currentDeck: null,
  quality: null,
  learn: null,
  review: null,
  settings: null,
  voice: {
    mediaRecorder: null,
    audioChunks: [],
    recording: false,
    recognition: null,
    autoMode: true,
    roundToken: 0,
    analyser: null,
    audioContext: null,
    audioSource: null,
    silenceInterval: null,
    silenceStartedAt: null,
  },
};

const LEARN_BATCH_SIZE = 7;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const API_BASE = window.location.origin.startsWith("http") ? window.location.origin : "http://127.0.0.1:5000";
const AUTO_SILENCE_MS = 5000;
const AUTO_SILENCE_THRESHOLD = 0.015;
const EVALUATION_ADVANCE_DELAY_MS = 2800;
const STILL_LEARNING_COOLDOWN_CARDS = 3;
const THEME_DEFAULTS = {
  theme_bg: "#eaf3ff",
  theme_bg2: "#dcecff",
  theme_panel: "#ffffff",
  theme_text: "#1d2b4a",
  theme_muted: "#60739d",
  theme_primary: "#2f7cff",
  theme_primary_dark: "#2469db",
  theme_danger: "#ef5a6f",
  theme_success: "#34b56f",
  theme_warning: "#ffac3d",
  theme_ring: "#87b6ff",
};

const el = {
  deckList: document.getElementById("deckList"),
  deckTitle: document.getElementById("deckTitle"),
  cardsTable: document.getElementById("cardsTable"),
  newDeckBtn: document.getElementById("newDeckBtn"),
  addCardBtn: document.getElementById("addCardBtn"),
  deleteDeckBtn: document.getElementById("deleteDeckBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  learnBtn: document.getElementById("learnBtn"),
  reviewBtn: document.getElementById("reviewBtn"),
  qualityBtn: document.getElementById("qualityBtn"),
  importOpenBtn: document.getElementById("importOpenBtn"),
  createDeckDialog: document.getElementById("createDeckDialog"),
  createDeckName: document.getElementById("createDeckName"),
  createCardsList: document.getElementById("createCardsList"),
  createRowCount: document.getElementById("createRowCount"),
  addCreateRowBtn: document.getElementById("addCreateRowBtn"),
  addCreateRowsBtn: document.getElementById("addCreateRowsBtn"),
  createBulkCount: document.getElementById("createBulkCount"),
  createDeckSubmitBtn: document.getElementById("createDeckSubmitBtn"),
  createDeckMsg: document.getElementById("createDeckMsg"),
  importDialog: document.getElementById("importDialog"),
  importBtn: document.getElementById("importBtn"),
  importMsg: document.getElementById("importMsg"),
  importDeckName: document.getElementById("importDeckName"),
  importText: document.getElementById("importText"),
  termSeparatorMode: document.getElementById("termSeparatorMode"),
  termCustom: document.getElementById("termCustom"),
  cardSeparatorMode: document.getElementById("cardSeparatorMode"),
  cardCustom: document.getElementById("cardCustom"),
  learnScreen: document.getElementById("learnScreen"),
  learnFullscreenBtn: document.getElementById("learnFullscreenBtn"),
  closeLearnBtn: document.getElementById("closeLearnBtn"),
  flipCard: document.getElementById("flipCard"),
  learnProgress: document.getElementById("learnProgress"),
  learnBatchLabel: document.getElementById("learnBatchLabel"),
  learnDeckLabel: document.getElementById("learnDeckLabel"),
  learnMeterFill: document.getElementById("learnMeterFill"),
  learnTerm: document.getElementById("learnTerm"),
  learnDefinition: document.getElementById("learnDefinition"),
  stillBtn: document.getElementById("stillBtn"),
  correctBtn: document.getElementById("correctBtn"),
  speakTermBtn: document.getElementById("speakTermBtn"),
  voiceAutoBtn: document.getElementById("voiceAutoBtn"),
  forceStopBtn: document.getElementById("forceStopBtn"),
  manualVoiceRow: document.getElementById("manualVoiceRow"),
  voiceRecordBtn: document.getElementById("voiceRecordBtn"),
  voiceEvaluateBtn: document.getElementById("voiceEvaluateBtn"),
  voiceTranscript: document.getElementById("voiceTranscript"),
  voiceFeedback: document.getElementById("voiceFeedback"),
  reviewScreen: document.getElementById("reviewScreen"),
  closeReviewBtn: document.getElementById("closeReviewBtn"),
  reviewCard: document.getElementById("reviewCard"),
  reviewProgress: document.getElementById("reviewProgress"),
  reviewTerm: document.getElementById("reviewTerm"),
  reviewDefinition: document.getElementById("reviewDefinition"),
  reviewPrevBtn: document.getElementById("reviewPrevBtn"),
  reviewNextBtn: document.getElementById("reviewNextBtn"),
  settingsDialog: document.getElementById("settingsDialog"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  resetThemeBtn: document.getElementById("resetThemeBtn"),
  settingsMsg: document.getElementById("settingsMsg"),
  openrouterToken: document.getElementById("openrouterToken"),
  openrouterModel: document.getElementById("openrouterModel"),
  piperExecutable: document.getElementById("piperExecutable"),
  piperVoiceSelect: document.getElementById("piperVoiceSelect"),
  uploadVoiceBtn: document.getElementById("uploadVoiceBtn"),
  voiceFileInput: document.getElementById("voiceFileInput"),
  whisperModelSize: document.getElementById("whisperModelSize"),
  whisperComputeType: document.getElementById("whisperComputeType"),
  themeBg: document.getElementById("themeBg"),
  themeBg2: document.getElementById("themeBg2"),
  themePanel: document.getElementById("themePanel"),
  themeText: document.getElementById("themeText"),
  themeMuted: document.getElementById("themeMuted"),
  themePrimary: document.getElementById("themePrimary"),
  themePrimaryDark: document.getElementById("themePrimaryDark"),
  themeDanger: document.getElementById("themeDanger"),
  themeSuccess: document.getElementById("themeSuccess"),
  themeWarning: document.getElementById("themeWarning"),
  themeRing: document.getElementById("themeRing"),
  qualityDialog: document.getElementById("qualityDialog"),
  qualityCloseBtn: document.getElementById("qualityCloseBtn"),
  qualitySummary: document.getElementById("qualitySummary"),
  qualityRunBtn: document.getElementById("qualityRunBtn"),
  qualityFilter: document.getElementById("qualityFilter"),
  qualitySelectVisibleBtn: document.getElementById("qualitySelectVisibleBtn"),
  qualityClearSelectionBtn: document.getElementById("qualityClearSelectionBtn"),
  qualityApplyBtn: document.getElementById("qualityApplyBtn"),
  qualityProgressWrap: document.getElementById("qualityProgressWrap"),
  qualityProgressLabel: document.getElementById("qualityProgressLabel"),
  qualityProgressPct: document.getElementById("qualityProgressPct"),
  qualityProgressFill: document.getElementById("qualityProgressFill"),
  qualityList: document.getElementById("qualityList"),
  qualityMsg: document.getElementById("qualityMsg"),
};

function normalizeHexColor(value, fallback) {
  const v = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function currentThemeFromForm() {
  return {
    theme_bg: normalizeHexColor(el.themeBg.value, THEME_DEFAULTS.theme_bg),
    theme_bg2: normalizeHexColor(el.themeBg2.value, THEME_DEFAULTS.theme_bg2),
    theme_panel: normalizeHexColor(el.themePanel.value, THEME_DEFAULTS.theme_panel),
    theme_text: normalizeHexColor(el.themeText.value, THEME_DEFAULTS.theme_text),
    theme_muted: normalizeHexColor(el.themeMuted.value, THEME_DEFAULTS.theme_muted),
    theme_primary: normalizeHexColor(el.themePrimary.value, THEME_DEFAULTS.theme_primary),
    theme_primary_dark: normalizeHexColor(el.themePrimaryDark.value, THEME_DEFAULTS.theme_primary_dark),
    theme_danger: normalizeHexColor(el.themeDanger.value, THEME_DEFAULTS.theme_danger),
    theme_success: normalizeHexColor(el.themeSuccess.value, THEME_DEFAULTS.theme_success),
    theme_warning: normalizeHexColor(el.themeWarning.value, THEME_DEFAULTS.theme_warning),
    theme_ring: normalizeHexColor(el.themeRing.value, THEME_DEFAULTS.theme_ring),
  };
}

function applyTheme(themeValues) {
  const root = document.documentElement;
  root.style.setProperty("--bg", themeValues.theme_bg);
  root.style.setProperty("--bg2", themeValues.theme_bg2);
  root.style.setProperty("--panel", `${themeValues.theme_panel}d6`);
  root.style.setProperty("--text", themeValues.theme_text);
  root.style.setProperty("--muted", themeValues.theme_muted);
  root.style.setProperty("--primary", themeValues.theme_primary);
  root.style.setProperty("--primary-dark", themeValues.theme_primary_dark);
  root.style.setProperty("--danger", themeValues.theme_danger);
  root.style.setProperty("--success", themeValues.theme_success);
  root.style.setProperty("--warning", themeValues.theme_warning);
  root.style.setProperty("--ring", themeValues.theme_ring);
}

function separatorValue(mode, custom) {
  if (mode === "tab") return "\t";
  if (mode === "comma") return ",";
  if (mode === "newline") return "\n";
  if (mode === "semicolon") return ";";
  return custom;
}

async function api(url, options = {}) {
  const endpoint = url.startsWith("http") ? url : `${API_BASE}${url}`;
  try {
    const res = await fetch(endpoint, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("Backend not reachable. Make sure app.py is running on http://127.0.0.1:5000.");
    }
    throw err;
  }
}

async function loadDecks() {
  const data = await api("/api/decks");
  state.decks = data.decks;
  renderDecks();
}

function applySettingsToForm(settings) {
  el.openrouterToken.value = settings.openrouter_api_key || "";
  el.openrouterModel.value = settings.openrouter_model || "";
  el.piperExecutable.value = settings.piper_executable || "piper";
  el.whisperModelSize.value = settings.whisper_model_size || "base";
  el.whisperComputeType.value = settings.whisper_compute_type || "int8";
  el.themeBg.value = normalizeHexColor(settings.theme_bg, THEME_DEFAULTS.theme_bg);
  el.themeBg2.value = normalizeHexColor(settings.theme_bg2, THEME_DEFAULTS.theme_bg2);
  el.themePanel.value = normalizeHexColor(settings.theme_panel, THEME_DEFAULTS.theme_panel);
  el.themeText.value = normalizeHexColor(settings.theme_text, THEME_DEFAULTS.theme_text);
  el.themeMuted.value = normalizeHexColor(settings.theme_muted, THEME_DEFAULTS.theme_muted);
  el.themePrimary.value = normalizeHexColor(settings.theme_primary, THEME_DEFAULTS.theme_primary);
  el.themePrimaryDark.value = normalizeHexColor(settings.theme_primary_dark, THEME_DEFAULTS.theme_primary_dark);
  el.themeDanger.value = normalizeHexColor(settings.theme_danger, THEME_DEFAULTS.theme_danger);
  el.themeSuccess.value = normalizeHexColor(settings.theme_success, THEME_DEFAULTS.theme_success);
  el.themeWarning.value = normalizeHexColor(settings.theme_warning, THEME_DEFAULTS.theme_warning);
  el.themeRing.value = normalizeHexColor(settings.theme_ring, THEME_DEFAULTS.theme_ring);
  applyTheme(currentThemeFromForm());
}

function settingsFromForm() {
  return {
    openrouter_api_key: el.openrouterToken.value.trim(),
    openrouter_model: el.openrouterModel.value.trim(),
    piper_executable: el.piperExecutable.value.trim(),
    piper_model: el.piperVoiceSelect.value.trim(),
    whisper_model_size: el.whisperModelSize.value,
    whisper_compute_type: el.whisperComputeType.value,
    ...currentThemeFromForm(),
  };
}

function renderVoiceOptions(voices, selectedPath) {
  const options = [...voices];
  if (selectedPath && !options.some((voice) => voice.path === selectedPath)) {
    options.unshift({ path: selectedPath, label: `Custom (${selectedPath})` });
  }
  if (!options.length) {
    options.push({ path: "", label: "No voices found in models/" });
  }

  el.piperVoiceSelect.innerHTML = options
    .map((voice) => `<option value="${escapeHtml(voice.path)}">${escapeHtml(voice.label)}</option>`)
    .join("");
  el.piperVoiceSelect.value = selectedPath && options.some((voice) => voice.path === selectedPath)
    ? selectedPath
    : options[0].path;
}

async function loadVoices(selectedPath = "") {
  const data = await api("/api/voices");
  renderVoiceOptions(data.voices || [], selectedPath);
}

async function uploadVoiceFiles(files) {
  if (!files || !files.length) return;
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  const endpoint = `${API_BASE}/api/voices/upload`;
  const res = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Voice upload failed.");
  }
  const uploadedModelPath = (data.saved || []).find((path) => String(path || "").toLowerCase().endsWith(".onnx")) || "";
  const selectedPath = uploadedModelPath || el.piperVoiceSelect.value || "";
  renderVoiceOptions(data.voices || [], selectedPath);
  const missingConfigs = Array.isArray(data.missing_configs) ? data.missing_configs : [];
  if (missingConfigs.length) {
    el.settingsMsg.textContent = `Uploaded ${data.saved?.length || 0} file(s). Missing .onnx.json for: ${missingConfigs.map((p) => p.split(/[\\/]/).pop()).join(", ")}`;
    return;
  }
  el.settingsMsg.textContent = `Uploaded ${data.saved?.length || 0} file(s) into models/custom_voices/.`;
}

async function loadSettings() {
  const settings = await api("/api/settings");
  await loadVoices(settings.piper_model || "");
  state.settings = settings;
  applySettingsToForm(settings);
}

async function saveSettings() {
  const payload = settingsFromForm();
  await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.settings = payload;
  el.settingsMsg.textContent = "Saved.";
}

function renderDecks() {
  el.deckList.innerHTML = "";
  state.decks.forEach((deck) => {
    const btn = document.createElement("button");
    btn.className = "deck-item";
    if (state.currentDeck && state.currentDeck.name === deck.name) {
      btn.classList.add("active");
    }
    btn.textContent = `${deck.name} (${deck.count})`;
    btn.onclick = () => openDeck(deck.name);
    el.deckList.appendChild(btn);
  });
}

function renderCards(cards) {
  if (!cards.length) {
    el.cardsTable.innerHTML = `<p style="padding:16px;margin:0;color:#60739d;">No cards yet.</p>`;
    return;
  }
  const rows = cards
    .map((c) => `<tr><td>${escapeHtml(c.term)}</td><td>${escapeHtml(c.definition)}</td></tr>`)
    .join("");
  el.cardsTable.innerHTML = `
    <table>
      <thead><tr><th>Term</th><th>Definition</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function openDeck(name) {
  const data = await api(`/api/decks/${encodeURIComponent(name)}`);
  state.currentDeck = data;
  el.deckTitle.textContent = data.name;
  renderCards(data.cards);
  renderDecks();
}

function normalizeQualityResult(raw) {
  const original = raw.original || { term: "", definition: "" };
  const suggestion = raw.suggestion || original;
  const issues = Array.isArray(raw.issues) ? raw.issues.map((i) => String(i)) : [];
  const confidence = Number(raw.confidence || 0);
  return {
    card_index: Number(raw.card_index || 0),
    original: {
      term: String(original.term || ""),
      definition: String(original.definition || ""),
    },
    suggestion: {
      term: String(suggestion.term || original.term || ""),
      definition: String(suggestion.definition || original.definition || ""),
    },
    issues,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    severity: String(raw.severity || "low"),
    possible_incorrect: Boolean(raw.possible_incorrect),
    wrong_flag: Boolean(raw.wrong_flag),
    has_changes: Boolean(raw.has_changes),
    reason: String(raw.reason || ""),
    error: raw.error ? String(raw.error) : "",
    decision: "pending",
    selected: false,
    manual_term: null,
    manual_definition: null,
  };
}

function qualityProposedTerm(result) {
  if (result.manual_term !== null) return result.manual_term;
  return result.suggestion.term;
}

function qualityProposedDefinition(result) {
  if (result.manual_definition !== null) return result.manual_definition;
  return result.suggestion.definition;
}

function qualityHasManualEdit(result) {
  return result.manual_term !== null || result.manual_definition !== null;
}

function qualityWillChange(result) {
  const term = qualityProposedTerm(result).trim();
  const definition = qualityProposedDefinition(result).trim();
  return term !== result.original.term || definition !== result.original.definition;
}

function qualityPassesFilter(result, filterValue) {
  if (filterValue === "all") return true;
  if (filterValue === "needs_fix") return result.has_changes || result.wrong_flag || qualityHasManualEdit(result);
  if (filterValue === "wrong_flag") return result.wrong_flag;
  if (filterValue === "accepted") return result.decision === "accepted";
  if (filterValue === "rejected") return result.decision === "rejected";
  if (filterValue === "spelling_grammar") {
    return result.issues.includes("spelling") || result.issues.includes("grammar");
  }
  return true;
}

function qualityBadge(issue) {
  const label = issue.replaceAll("_", " ");
  return `<span class="quality-badge">${escapeHtml(label)}</span>`;
}

function renderQualitySummary() {
  if (!state.quality?.results?.length) {
    el.qualitySummary.textContent = "Run a check to review spelling, grammar, and possible wrong cards.";
    return;
  }
  const total = state.quality.results.length;
  const wrong = state.quality.results.filter((r) => r.wrong_flag).length;
  const needsFix = state.quality.results.filter((r) => r.has_changes || r.wrong_flag || qualityHasManualEdit(r)).length;
  const accepted = state.quality.results.filter((r) => r.decision === "accepted").length;
  const selected = state.quality.results.filter((r) => r.selected).length;
  el.qualitySummary.textContent = `Cards: ${total} | Needs fix: ${needsFix} | Possible wrong: ${wrong} | Accepted: ${accepted} | Selected: ${selected}`;
}

function renderQualityList() {
  const quality = state.quality;
  if (!quality) return;
  const filterValue = el.qualityFilter.value;
  const filtered = quality.results.filter((r) => qualityPassesFilter(r, filterValue));
  if (!filtered.length) {
    const hasAny = quality.results.length > 0;
    el.qualityList.innerHTML = hasAny
      ? `<p class="quality-empty">No cards match this filter. Try switching filter to "All".</p>`
      : `<p class="quality-empty">No cards available in this deck.</p>`;
    renderQualitySummary();
    return;
  }

  el.qualityList.innerHTML = filtered
    .map((r) => {
      const proposedTerm = qualityProposedTerm(r);
      const proposedDefinition = qualityProposedDefinition(r);
      const changed = qualityWillChange(r);
      const confidencePct = Math.round((r.confidence || 0) * 100);
      const badges = r.issues.length ? r.issues.map(qualityBadge).join("") : `<span class="quality-badge">clean</span>`;
      const wrongChip = r.wrong_flag ? `<span class="quality-flag">possible wrong (${confidencePct}%)</span>` : "";
      const reasonText = r.reason ? `<p class="quality-reason">${escapeHtml(r.reason)}</p>` : "";
      const errorText = r.error ? `<p class="quality-error">${escapeHtml(r.error)}</p>` : "";
      return `
        <article class="quality-card ${r.decision === "accepted" ? "accepted" : ""} ${r.decision === "rejected" ? "rejected" : ""}">
          <div class="quality-card-head">
            <label class="quality-select">
              <input type="checkbox" data-quality-select="${r.card_index}" ${r.selected ? "checked" : ""} />
              <span>Card ${r.card_index + 1}</span>
            </label>
            <div class="quality-meta">
              ${badges}
              ${wrongChip}
            </div>
          </div>
          <div class="quality-columns">
            <div class="quality-col">
              <p class="quality-col-title">Original</p>
              <p><strong>Term:</strong> ${escapeHtml(r.original.term)}</p>
              <p><strong>Definition:</strong> ${escapeHtml(r.original.definition)}</p>
            </div>
            <div class="quality-col">
              <p class="quality-col-title">Suggested / Editable</p>
              <label>Term</label>
              <textarea data-quality-term="${r.card_index}" rows="2">${escapeHtml(proposedTerm)}</textarea>
              <label>Definition</label>
              <textarea data-quality-definition="${r.card_index}" rows="3">${escapeHtml(proposedDefinition)}</textarea>
              <p class="quality-delta">${changed ? "Will update this card." : "No text changes."}</p>
            </div>
          </div>
          ${reasonText}
          ${errorText}
          <div class="quality-actions-row">
            <button type="button" class="btn btn-soft" data-quality-accept="${r.card_index}">Accept</button>
            <button type="button" class="btn btn-soft" data-quality-reject="${r.card_index}">Reject</button>
            <button type="button" class="btn btn-soft" data-quality-reset="${r.card_index}">Reset</button>
          </div>
        </article>
      `;
    })
    .join("");

  const bind = (selector, handler) => {
    [...el.qualityList.querySelectorAll(selector)].forEach((node) => {
      node.addEventListener("click", handler);
    });
  };

  bind("[data-quality-accept]", (event) => {
    const idx = Number(event.currentTarget.getAttribute("data-quality-accept"));
    const item = quality.results.find((r) => r.card_index === idx);
    if (!item) return;
    item.decision = "accepted";
    item.selected = true;
    renderQualityList();
  });

  bind("[data-quality-reject]", (event) => {
    const idx = Number(event.currentTarget.getAttribute("data-quality-reject"));
    const item = quality.results.find((r) => r.card_index === idx);
    if (!item) return;
    item.decision = "rejected";
    item.selected = false;
    renderQualityList();
  });

  bind("[data-quality-reset]", (event) => {
    const idx = Number(event.currentTarget.getAttribute("data-quality-reset"));
    const item = quality.results.find((r) => r.card_index === idx);
    if (!item) return;
    item.decision = "pending";
    item.manual_term = null;
    item.manual_definition = null;
    item.selected = false;
    renderQualityList();
  });

  [...el.qualityList.querySelectorAll("[data-quality-select]")].forEach((node) => {
    node.addEventListener("change", (event) => {
      const idx = Number(event.currentTarget.getAttribute("data-quality-select"));
      const item = quality.results.find((r) => r.card_index === idx);
      if (!item) return;
      item.selected = event.currentTarget.checked;
      if (item.selected && item.decision === "pending") item.decision = "accepted";
      renderQualitySummary();
    });
  });

  [...el.qualityList.querySelectorAll("[data-quality-term]")].forEach((node) => {
    node.addEventListener("input", (event) => {
      const idx = Number(event.currentTarget.getAttribute("data-quality-term"));
      const item = quality.results.find((r) => r.card_index === idx);
      if (!item) return;
      item.manual_term = event.currentTarget.value;
      item.decision = "accepted";
      item.selected = true;
      renderQualitySummary();
    });
  });

  [...el.qualityList.querySelectorAll("[data-quality-definition]")].forEach((node) => {
    node.addEventListener("input", (event) => {
      const idx = Number(event.currentTarget.getAttribute("data-quality-definition"));
      const item = quality.results.find((r) => r.card_index === idx);
      if (!item) return;
      item.manual_definition = event.currentTarget.value;
      item.decision = "accepted";
      item.selected = true;
      renderQualitySummary();
    });
  });

  renderQualitySummary();
}

function openQualityDialog() {
  if (!state.currentDeck) {
    alert("Select a deck first.");
    return;
  }
  const seedResults = (state.currentDeck.cards || []).map((card, index) => normalizeQualityResult({
    card_index: index,
    original: { term: card.term, definition: card.definition },
    suggestion: { term: card.term, definition: card.definition },
    issues: [],
    confidence: 0,
    severity: "low",
    possible_incorrect: false,
    wrong_flag: false,
    has_changes: false,
    reason: "",
  }));
  state.quality = {
    deck_name: state.currentDeck.name,
    results: seedResults,
  };
  el.qualityMsg.textContent = "";
  setQualityProgress(0, 0, "Idle");
  el.qualityFilter.value = "all";
  el.qualityList.innerHTML = "";
  renderQualitySummary();
  renderQualityList();
  el.qualityDialog.showModal();
}

function setQualityProgress(done, total, label = "Progress") {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeDone = Math.max(0, Number(done || 0));
  const pct = safeTotal > 0 ? Math.min(100, Math.round((safeDone / safeTotal) * 100)) : 0;
  el.qualityProgressWrap.classList.remove("hidden");
  el.qualityProgressLabel.textContent = `${label} (${safeDone}/${safeTotal})`;
  el.qualityProgressPct.textContent = `${pct}%`;
  el.qualityProgressFill.style.width = `${pct}%`;
}

async function runQualityCheck() {
  if (!state.currentDeck) {
    alert("Select a deck first.");
    return;
  }
  el.qualityMsg.textContent = "Checking cards with AI...";
  el.qualityRunBtn.disabled = true;
  el.qualityApplyBtn.disabled = true;
  const totalCards = (state.currentDeck.cards || []).length;
  const chunkSize = 20;
  const results = [];
  setQualityProgress(0, totalCards, "Checking");
  try {
    for (let start = 0; start < totalCards; start += chunkSize) {
      const limit = Math.min(chunkSize, totalCards - start);
      const data = await api(`/api/decks/${encodeURIComponent(state.currentDeck.name)}/quality-check`, {
        method: "POST",
        body: JSON.stringify({
          threshold: 0.65,
          batch_size: chunkSize,
          start_index: start,
          limit,
        }),
      });
      const chunkResults = (data.results || []).map(normalizeQualityResult);
      results.push(...chunkResults);
      setQualityProgress(start + limit, totalCards, "Checking");
    }
    state.quality = {
      deck_name: state.currentDeck.name,
      results: results.sort((a, b) => a.card_index - b.card_index),
    };
    const needsFix = state.quality.results.filter((r) => r.has_changes || r.wrong_flag).length;
    const wrongFlags = state.quality.results.filter((r) => r.wrong_flag).length;
    el.qualityMsg.textContent = `Done. ${needsFix} card(s) need attention, ${wrongFlags} flagged as possibly wrong.`;
    renderQualityList();
  } finally {
    el.qualityRunBtn.disabled = false;
    el.qualityApplyBtn.disabled = false;
  }
}

function qualitySelectVisible(selected) {
  if (!state.quality) return;
  const filterValue = el.qualityFilter.value;
  state.quality.results.forEach((result) => {
    if (qualityPassesFilter(result, filterValue)) {
      result.selected = selected;
      if (selected && result.decision === "pending") result.decision = "accepted";
    }
  });
  renderQualityList();
}

async function applySelectedQualityChanges() {
  if (!state.currentDeck || !state.quality) return;
  const updates = state.quality.results
    .filter((r) => r.selected && r.decision === "accepted")
    .map((r) => ({
      card_index: r.card_index,
      term: qualityProposedTerm(r).trim(),
      definition: qualityProposedDefinition(r).trim(),
    }))
    .filter((u) => u.term && u.definition)
    .filter((u) => {
      const source = state.quality.results.find((r) => r.card_index === u.card_index);
      if (!source) return false;
      return u.term !== source.original.term || u.definition !== source.original.definition;
    });

  if (!updates.length) {
    el.qualityMsg.textContent = "No selected changes to apply.";
    return;
  }
  el.qualityMsg.textContent = "Applying selected changes...";
  el.qualityApplyBtn.disabled = true;
  try {
    const data = await api(`/api/decks/${encodeURIComponent(state.currentDeck.name)}/cards/bulk-update`, {
      method: "POST",
      body: JSON.stringify({ updates }),
    });
    await openDeck(state.currentDeck.name);
    await loadDecks();
    el.qualityMsg.textContent = `Applied ${data.updated || 0} update(s).`;
  } finally {
    el.qualityApplyBtn.disabled = false;
  }
}

function createDeckRow(index, term = "", definition = "") {
  return `
    <article class="create-row" data-row="${index}">
      <div class="create-row-top">
        <p>Card ${index + 1}</p>
        <button type="button" class="icon-btn create-remove-row" data-remove="${index}">x</button>
      </div>
      <div class="create-grid">
        <textarea class="create-term create-textarea" rows="2" placeholder="Term">${escapeHtml(term)}</textarea>
        <textarea class="create-definition create-textarea" rows="2" placeholder="Definition">${escapeHtml(definition)}</textarea>
      </div>
    </article>
  `;
}

function autoGrowTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 72)}px`;
}

function renderCreateRows(rows) {
  el.createRowCount.textContent = `Cards: ${rows.length}`;
  el.createCardsList.innerHTML = rows
    .map((row, index) => createDeckRow(index, row.term, row.definition))
    .join("");
  const textareas = [...el.createCardsList.querySelectorAll(".create-textarea")];
  textareas.forEach((textarea) => {
    autoGrowTextarea(textarea);
    textarea.addEventListener("input", () => autoGrowTextarea(textarea));
  });
  const removeButtons = [...el.createCardsList.querySelectorAll(".create-remove-row")];
  removeButtons.forEach((btn) => {
    btn.onclick = () => {
      const cardEls = [...el.createCardsList.querySelectorAll(".create-row")];
      if (cardEls.length <= 1) return;
      cardEls[Number(btn.dataset.remove)]?.remove();
      const nextRows = [...el.createCardsList.querySelectorAll(".create-row")].map((cardEl) => ({
        term: cardEl.querySelector(".create-term")?.value || "",
        definition: cardEl.querySelector(".create-definition")?.value || "",
      }));
      renderCreateRows(nextRows);
    };
  });
}

function openCreateDeckDialog() {
  el.createDeckName.value = "";
  el.createDeckMsg.textContent = "";
  el.createBulkCount.value = "5";
  renderCreateRows([
    { term: "", definition: "" },
    { term: "", definition: "" },
    { term: "", definition: "" },
  ]);
  el.createDeckDialog.showModal();
}

function createRowsFromDom() {
  return [...el.createCardsList.querySelectorAll(".create-row")].map((cardEl) => ({
    term: cardEl.querySelector(".create-term")?.value || "",
    definition: cardEl.querySelector(".create-definition")?.value || "",
  }));
}

function addCreateRows(count) {
  const nextCount = Number(count);
  if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > 100) {
    el.createDeckMsg.textContent = "Choose a number between 1 and 100.";
    return;
  }
  const rows = createRowsFromDom();
  for (let i = 0; i < nextCount; i += 1) {
    rows.push({ term: "", definition: "" });
  }
  renderCreateRows(rows);
  el.createDeckMsg.textContent = "";
}

function collectCreateCards() {
  const rows = [...el.createCardsList.querySelectorAll(".create-row")];
  return rows
    .map((row) => ({
      term: (row.querySelector(".create-term")?.value || "").trim(),
      definition: (row.querySelector(".create-definition")?.value || "").trim(),
    }))
    .filter((row) => row.term && row.definition);
}

async function submitCreateDeck() {
  const deckName = el.createDeckName.value.trim();
  if (!deckName) {
    el.createDeckMsg.textContent = "Deck title is required.";
    return;
  }
  const cards = collectCreateCards();
  if (!cards.length) {
    el.createDeckMsg.textContent = "Add at least one complete card.";
    return;
  }
  await api("/api/decks", {
    method: "POST",
    body: JSON.stringify({ name: deckName }),
  });
  for (const card of cards) {
    await api(`/api/decks/${encodeURIComponent(deckName)}/cards`, {
      method: "POST",
      body: JSON.stringify(card),
    });
  }
  el.createDeckMsg.textContent = `Created "${deckName}" with ${cards.length} card(s).`;
  await loadDecks();
  await openDeck(deckName);
  el.createDeckDialog.close();
}

async function addCard() {
  if (!state.currentDeck) return alert("Select a deck first.");
  const term = prompt("Term:");
  if (!term) return;
  const definition = prompt("Definition:");
  if (!definition) return;
  await api(`/api/decks/${encodeURIComponent(state.currentDeck.name)}/cards`, {
    method: "POST",
    body: JSON.stringify({ term, definition }),
  });
  await openDeck(state.currentDeck.name);
  await loadDecks();
}

async function deleteDeck() {
  if (!state.currentDeck) return alert("Select a deck first.");
  if (!confirm(`Delete "${state.currentDeck.name}"?`)) return;
  await api(`/api/decks/${encodeURIComponent(state.currentDeck.name)}`, {
    method: "DELETE",
  });
  state.currentDeck = null;
  el.deckTitle.textContent = "Select a Deck";
  renderCards([]);
  await loadDecks();
}

function openImport() {
  if (state.currentDeck) el.importDeckName.value = state.currentDeck.name;
  el.importMsg.textContent = "";
  el.importDialog.showModal();
}

async function importDeck() {
  const payload = {
    deck_name: el.importDeckName.value.trim(),
    raw_text: el.importText.value,
    term_separator: separatorValue(el.termSeparatorMode.value, el.termCustom.value),
    card_separator: separatorValue(el.cardSeparatorMode.value, el.cardCustom.value),
  };
  try {
    const data = await api("/api/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    el.importMsg.textContent = `Imported ${data.imported} cards.`;
    await loadDecks();
    await openDeck(payload.deck_name);
  } catch (err) {
    el.importMsg.textContent = err.message;
  }
}

function chunkCards(cards, size) {
  const chunks = [];
  for (let i = 0; i < cards.length; i += size) {
    chunks.push(cards.slice(i, i + size));
  }
  return chunks;
}

function deckFingerprint(cards) {
  return cards.map((c) => `${c.term}\u241f${c.definition}`).join("\u241e");
}

function buildLearnStateFromDeck(deck) {
  const shuffledCards = shuffle([...deck.cards]).map((card, index) => ({
    ...card,
    id: `card-${index}`,
  }));
  const batches = chunkCards(shuffledCards.map((card) => card.id), LEARN_BATCH_SIZE);
  const cardsById = Object.fromEntries(shuffledCards.map((card) => [card.id, card]));
  const cardBatchIndex = {};
  batches.forEach((batch, index) => {
    batch.forEach((cardId) => {
      cardBatchIndex[cardId] = index;
    });
  });

  return {
    deckFingerprint: deckFingerprint(deck.cards),
    batches,
    batchIndex: 0,
    mainQueue: [],
    carryoverQueue: [],
    currentBatchMastered: new Set(),
    masteredCardIds: new Set(),
    cardsById,
    cardBatchIndex,
    wrongCountById: {},
    cooldownUntilById: {},
    cardsShownCount: 0,
    lastShownCardId: null,
    cardsSinceCarryover: 0,
    carryoverEvery: 2,
    currentCardId: null,
    current: null,
    correct: 0,
    still: 0,
    attempts: 0,
    revealed: false,
  };
}

function serializeLearnState(s) {
  return {
    deckFingerprint: s.deckFingerprint || deckFingerprint(state.currentDeck.cards),
    batches: s.batches,
    batchIndex: s.batchIndex,
    mainQueue: s.mainQueue,
    carryoverQueue: s.carryoverQueue,
    currentBatchMastered: [...s.currentBatchMastered],
    masteredCardIds: [...s.masteredCardIds],
    cardsById: s.cardsById,
    cardBatchIndex: s.cardBatchIndex,
    wrongCountById: s.wrongCountById,
    cooldownUntilById: s.cooldownUntilById,
    cardsShownCount: s.cardsShownCount,
    lastShownCardId: s.lastShownCardId,
    cardsSinceCarryover: s.cardsSinceCarryover,
    carryoverEvery: s.carryoverEvery,
    currentCardId: s.currentCardId,
    correct: s.correct,
    still: s.still,
    attempts: s.attempts,
  };
}

function hydrateLearnState(raw) {
  const hydrated = {
    ...raw,
    currentBatchMastered: new Set(raw.currentBatchMastered || []),
    masteredCardIds: new Set(raw.masteredCardIds || []),
    mainQueue: [...(raw.mainQueue || [])],
    carryoverQueue: [...(raw.carryoverQueue || [])],
    cardsById: raw.cardsById || {},
    cardBatchIndex: raw.cardBatchIndex || {},
    wrongCountById: raw.wrongCountById || {},
    cooldownUntilById: raw.cooldownUntilById || {},
    cardsShownCount: Number(raw.cardsShownCount || 0),
    lastShownCardId: raw.lastShownCardId || null,
    cardsSinceCarryover: Number(raw.cardsSinceCarryover || 0),
    carryoverEvery: Number(raw.carryoverEvery || 2),
    batchIndex: Number(raw.batchIndex || 0),
    attempts: Number(raw.attempts || 0),
    correct: Number(raw.correct || 0),
    still: Number(raw.still || 0),
    current: null,
    revealed: false,
  };

  const pendingCardId = raw.currentCardId;
  hydrated.currentCardId = null;
  if (pendingCardId && hydrated.cardsById[pendingCardId]) {
    hydrated.mainQueue = [pendingCardId, ...hydrated.mainQueue.filter((id) => id !== pendingCardId)];
  }
  return hydrated;
}

async function clearLearnProgress(deckName) {
  await api(`/api/learn-progress/${encodeURIComponent(deckName)}`, { method: "DELETE" });
}

async function persistLearnProgress() {
  if (!state.learn || !state.currentDeck?.name) return;
  await api(`/api/learn-progress/${encodeURIComponent(state.currentDeck.name)}`, {
    method: "POST",
    body: JSON.stringify({ state: serializeLearnState(state.learn) }),
  });
}

function persistLearnProgressSilently() {
  persistLearnProgress().catch(() => {});
}

function updateLearnProgress() {
  const s = state.learn;
  if (!s) return;

  const totalCards = Object.keys(s.cardsById).length;
  const hasActiveBatch = s.batchIndex < s.batches.length;
  const currentBatchSize = hasActiveBatch ? s.batches[s.batchIndex].length : 0;
  const batchPct = hasActiveBatch && currentBatchSize
    ? (s.currentBatchMastered.size / currentBatchSize) * 100
    : 100;

  if (hasActiveBatch) {
    el.learnProgress.textContent = `Batch ${s.batchIndex + 1}/${s.batches.length} | Resurfacing ${s.carryoverQueue.length}`;
    el.learnBatchLabel.textContent = `Batch progress: ${s.currentBatchMastered.size}/${currentBatchSize}`;
  } else {
    el.learnProgress.textContent = `Final cleanup | Resurfacing ${s.carryoverQueue.length}`;
    el.learnBatchLabel.textContent = "Batch progress: complete";
  }
  el.learnDeckLabel.textContent = `Deck mastered: ${s.masteredCardIds.size}/${totalCards}`;
  el.learnMeterFill.style.width = `${batchPct}%`;
}

function setupCurrentBatchQueue() {
  const s = state.learn;
  if (s.batchIndex >= s.batches.length) {
    s.mainQueue = [];
    s.currentBatchMastered = new Set();
    return;
  }
  const batchIds = s.batches[s.batchIndex];
  s.currentBatchMastered = new Set(batchIds.filter((id) => s.masteredCardIds.has(id)));
  s.mainQueue = shuffle(batchIds.filter((id) => !s.currentBatchMastered.has(id)));
  s.cardsSinceCarryover = 0;
}

function removeCardFromCarryover(s, cardId) {
  s.carryoverQueue = s.carryoverQueue.filter((id) => id !== cardId);
}

function addCardToCarryover(s, cardId) {
  removeCardFromCarryover(s, cardId);
  if (!s.carryoverQueue.length) {
    s.carryoverQueue.push(cardId);
    return;
  }
  const earlyWindow = Math.min(3, s.carryoverQueue.length);
  const insertAt = 1 + Math.floor(Math.random() * earlyWindow);
  s.carryoverQueue.splice(insertAt, 0, cardId);
}

function addVarietyCardFromUpcomingBatches(s) {
  if (s.batchIndex >= s.batches.length - 1) return false;
  for (let nextBatch = s.batchIndex + 1; nextBatch < s.batches.length; nextBatch += 1) {
    for (const cardId of s.batches[nextBatch]) {
      if (s.masteredCardIds.has(cardId)) continue;
      if (s.mainQueue.includes(cardId)) continue;
      if (s.carryoverQueue.includes(cardId)) continue;
      if (s.currentCardId === cardId) continue;
      const insertAt = Math.min(2, s.mainQueue.length);
      s.mainQueue.splice(insertAt, 0, cardId);
      return true;
    }
  }
  return false;
}

function cardEligibleByCooldown(s, cardId) {
  const unlockAt = Number(s.cooldownUntilById?.[cardId] || 0);
  return s.cardsShownCount >= unlockAt;
}

function popNextEligible(queue, s, allowBlockedFallback = false) {
  for (let i = 0; i < queue.length; i += 1) {
    const cardId = queue[i];
    if (cardEligibleByCooldown(s, cardId)) {
      queue.splice(i, 1);
      return cardId;
    }
  }
  if (!allowBlockedFallback || !queue.length) return null;
  return queue.shift();
}

function popNextEligiblePreferDifferent(queue, s, avoidCardId, allowBlockedFallback = false) {
  for (let i = 0; i < queue.length; i += 1) {
    const cardId = queue[i];
    if (cardId === avoidCardId) continue;
    if (cardEligibleByCooldown(s, cardId)) {
      queue.splice(i, 1);
      return cardId;
    }
  }
  return popNextEligible(queue, s, allowBlockedFallback);
}

function maybeAdvanceLearnBatch() {
  const s = state.learn;
  while (s.batchIndex < s.batches.length) {
    const target = s.batches[s.batchIndex].length;
    if (s.currentBatchMastered.size < target) return;
    s.batchIndex += 1;
    setupCurrentBatchQueue();
  }
}

function pickNextLearnCardId() {
  const s = state.learn;
  const avoidCardId = s.lastShownCardId;
  const hasActiveBatch = s.batchIndex < s.batches.length;
  if (!hasActiveBatch) {
    if (!s.carryoverQueue.length) return null;
    return popNextEligiblePreferDifferent(s.carryoverQueue, s, avoidCardId, true);
  }

  const shouldUseCarryover = s.carryoverQueue.length
    && (s.mainQueue.length === 0 || s.cardsSinceCarryover >= s.carryoverEvery);

  if (shouldUseCarryover) {
    const fromCarryover = popNextEligiblePreferDifferent(s.carryoverQueue, s, avoidCardId, false);
    if (fromCarryover) {
      s.cardsSinceCarryover = 0;
      return fromCarryover;
    }
  }

  const fromMain = popNextEligiblePreferDifferent(s.mainQueue, s, avoidCardId, false);
  if (fromMain) {
    s.cardsSinceCarryover += 1;
    return fromMain;
  }

  const fromCarryover = popNextEligiblePreferDifferent(s.carryoverQueue, s, avoidCardId, false);
  if (fromCarryover) {
    s.cardsSinceCarryover = 0;
    return fromCarryover;
  }

  const fromMainBlocked = popNextEligiblePreferDifferent(s.mainQueue, s, avoidCardId, true);
  if (fromMainBlocked) {
    s.cardsSinceCarryover += 1;
    return fromMainBlocked;
  }
  const fromCarryoverBlocked = popNextEligiblePreferDifferent(s.carryoverQueue, s, avoidCardId, true);
  if (fromCarryoverBlocked) {
    s.cardsSinceCarryover = 0;
    return fromCarryoverBlocked;
  }
  return null;
}

async function startLearn() {
  if (!state.currentDeck) return alert("Select a deck first.");
  if (!state.currentDeck.cards.length) return alert("This deck has no cards.");

  const currentFingerprint = deckFingerprint(state.currentDeck.cards);
  const saved = await api(`/api/learn-progress/${encodeURIComponent(state.currentDeck.name)}`);
  const savedState = saved.progress?.state;
  const canResume = savedState && savedState.deckFingerprint === currentFingerprint;
  const shouldResume = Boolean(canResume && confirm("Resume your previous Learn progress for this deck?"));

  if (shouldResume) {
    state.learn = hydrateLearnState(savedState);
  } else {
    if (savedState) {
      clearLearnProgress(state.currentDeck.name).catch(() => {});
    }
    state.learn = buildLearnStateFromDeck(state.currentDeck);
    setupCurrentBatchQueue();
  }

  el.learnScreen.classList.remove("hidden");
  el.voiceTranscript.value = "";
  el.voiceFeedback.textContent = "";
  el.voiceEvaluateBtn.disabled = true;
  updateLearnFullscreenButton();
  nextLearnCard();
}

function nextLearnCard() {
  const s = state.learn;
  if (!s) return;

  maybeAdvanceLearnBatch();
  const nextCardId = pickNextLearnCardId();
  if (!nextCardId) {
    alert(`Done! Attempts: ${s.attempts} | Correct: ${s.correct} | Still Learning taps: ${s.still}`);
    if (state.currentDeck?.name) clearLearnProgress(state.currentDeck.name).catch(() => {});
    state.learn = null;
    exitLearnFullscreen().catch(() => {});
    el.learnScreen.classList.add("hidden");
    return;
  }

  s.currentCardId = nextCardId;
  s.current = s.cardsById[nextCardId];
  s.cardsShownCount += 1;
  s.lastShownCardId = nextCardId;
  stopVoiceCapture();
  state.voice.roundToken += 1;
  s.revealed = false;
  el.flipCard.classList.remove("flipped");
  el.learnTerm.textContent = s.current.term;
  el.learnDefinition.textContent = s.current.definition;
  el.stillBtn.disabled = true;
  el.correctBtn.disabled = true;
  el.voiceTranscript.value = "";
  el.voiceEvaluateBtn.disabled = true;
  el.voiceFeedback.textContent = "";
  updateLearnProgress();
  if (state.voice.autoMode) {
    runAutoVoiceRound(state.voice.roundToken).catch((err) => {
      el.voiceFeedback.textContent = err.message || "Auto voice failed.";
    });
  }
  persistLearnProgressSilently();
}

function flipLearnCard() {
  if (!state.learn?.current) return;
  state.learn.revealed = true;
  el.flipCard.classList.toggle("flipped");
  const isFlipped = el.flipCard.classList.contains("flipped");
  el.stillBtn.disabled = !isFlipped;
  el.correctBtn.disabled = !isFlipped;
}

function markStillLearning(force = false) {
  const s = state.learn;
  if (!s?.revealed && !force) return;

  s.attempts += 1;
  s.still += 1;
  s.wrongCountById[s.currentCardId] = (s.wrongCountById[s.currentCardId] || 0) + 1;
  s.cooldownUntilById[s.currentCardId] = s.cardsShownCount + STILL_LEARNING_COOLDOWN_CARDS;
  addCardToCarryover(s, s.currentCardId);
  addVarietyCardFromUpcomingBatches(s);
  persistLearnProgressSilently();
  nextLearnCard();
}

function markCorrect(force = false) {
  const s = state.learn;
  if (!s?.revealed && !force) return;

  s.attempts += 1;
  s.correct += 1;
  removeCardFromCarryover(s, s.currentCardId);
  if (s.cardBatchIndex[s.currentCardId] === s.batchIndex) {
    s.currentBatchMastered.add(s.currentCardId);
  }
  s.masteredCardIds.add(s.currentCardId);
  maybeAdvanceLearnBatch();
  persistLearnProgressSilently();
  nextLearnCard();
}

function startReview() {
  if (!state.currentDeck) return alert("Select a deck first.");
  if (!state.currentDeck.cards.length) return alert("This deck has no cards.");
  state.review = {
    cards: [...state.currentDeck.cards],
    index: 0,
    flipped: false,
  };
  el.reviewScreen.classList.remove("hidden");
  renderReviewCard();
}

function renderReviewCard() {
  const s = state.review;
  const card = s.cards[s.index];
  el.reviewCard.classList.toggle("flipped", s.flipped);
  el.reviewTerm.textContent = card.term;
  el.reviewDefinition.textContent = card.definition;
  el.reviewProgress.textContent = `Card ${s.index + 1} of ${s.cards.length}`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shouldIgnoreShortcutTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function handleSpaceFlip(event) {
  if (event.code !== "Space" || shouldIgnoreShortcutTarget(event.target)) return;

  if (!el.learnScreen.classList.contains("hidden")) {
    event.preventDefault();
    flipLearnCard();
    return;
  }

  if (!el.reviewScreen.classList.contains("hidden")) {
    event.preventDefault();
    state.review.flipped = !state.review.flipped;
    renderReviewCard();
  }
}

function base64FromArrayBuffer(arrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function blobFromBase64(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function speakCurrentTerm() {
  if (!state.learn?.current) return;
  await speakText(state.learn.current.term);
}

function setAutoVoiceButton() {
  el.voiceAutoBtn.textContent = `Auto Voice: ${state.voice.autoMode ? "On" : "Off"}`;
  el.voiceAutoBtn.className = state.voice.autoMode ? "btn btn-primary" : "btn btn-soft";
  el.manualVoiceRow.style.display = state.voice.autoMode ? "none" : "flex";
}

function isLearnFullscreenActive() {
  return document.fullscreenElement === el.learnScreen || el.learnScreen.classList.contains("full-bleed");
}

function updateLearnFullscreenButton() {
  const active = isLearnFullscreenActive();
  el.learnFullscreenBtn.textContent = active ? "Exit Full Screen" : "Full Screen";
  el.learnFullscreenBtn.className = active ? "btn btn-primary" : "btn btn-soft";
}

async function exitLearnFullscreen() {
  el.learnScreen.classList.remove("full-bleed");
  if (document.fullscreenElement === el.learnScreen && document.exitFullscreen) {
    try {
      await document.exitFullscreen();
    } catch (err) {
      // ignore fullscreen exit failures and continue in windowed mode
    }
  }
  updateLearnFullscreenButton();
}

async function toggleLearnFullscreen() {
  const alreadyFullscreen = isLearnFullscreenActive();
  if (alreadyFullscreen) {
    await exitLearnFullscreen();
    return;
  }

  el.learnScreen.classList.add("full-bleed");
  if (!document.fullscreenElement && typeof el.learnScreen.requestFullscreen === "function") {
    try {
      await el.learnScreen.requestFullscreen();
    } catch (err) {
      // fallback to CSS full-bleed mode if native fullscreen is blocked
    }
  }
  updateLearnFullscreenButton();
}

function stopVoiceCapture() {
  if (state.voice.mediaRecorder && state.voice.recording) {
    state.voice.mediaRecorder.stop();
  }
  state.voice.mediaRecorder = null;
  if (state.voice.silenceInterval) {
    clearInterval(state.voice.silenceInterval);
    state.voice.silenceInterval = null;
  }
  state.voice.silenceStartedAt = null;
  if (state.voice.audioSource) {
    try {
      state.voice.audioSource.disconnect();
    } catch (err) {
      // ignore disconnect errors during cleanup
    }
  }
  if (state.voice.analyser) {
    try {
      state.voice.analyser.disconnect();
    } catch (err) {
      // ignore disconnect errors during cleanup
    }
  }
  if (state.voice.audioContext) {
    state.voice.audioContext.close().catch(() => {});
  }
  state.voice.audioSource = null;
  state.voice.analyser = null;
  state.voice.audioContext = null;
  if (state.voice.recognition) {
    state.voice.recognition.onend = null;
    state.voice.recognition.stop();
    state.voice.recognition = null;
  }
  state.voice.recording = false;
  el.voiceRecordBtn.textContent = "Start Voice Answer";
  el.forceStopBtn.classList.add("hidden");
}

async function speakText(text, options = {}) {
  const showStatus = options.showStatus !== false;
  if (showStatus) el.voiceFeedback.textContent = "Generating voice...";
  const data = await api("/api/voice/tts", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  const blob = blobFromBase64(data.audio_base64, data.mime_type || "audio/wav");
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Audio playback failed."));
    };
    audio.play().catch((err) => {
      URL.revokeObjectURL(url);
      reject(err);
    });
  });
}

async function startVoiceRecording(autoRoundToken = null) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  state.voice.audioChunks = [];
  state.voice.mediaRecorder = recorder;
  state.voice.recording = true;
  el.forceStopBtn.classList.remove("hidden");

  recorder.ondataavailable = (event) => {
    if (event.data?.size) state.voice.audioChunks.push(event.data);
  };
  recorder.onstop = async () => {
    try {
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(state.voice.audioChunks, { type: mimeType });
      stream.getTracks().forEach((track) => track.stop());
      const b64 = base64FromArrayBuffer(await blob.arrayBuffer());
      el.voiceFeedback.textContent = "Transcribing...";
      const data = await api("/api/voice/stt", {
        method: "POST",
        body: JSON.stringify({
          audio_base64: b64,
          mime_type: mimeType,
          stt_mode: autoRoundToken === null ? "manual" : "auto",
        }),
      });
      el.voiceTranscript.value = data.text || "";
      el.voiceEvaluateBtn.disabled = !el.voiceTranscript.value.trim();
      if (data.text) {
        if (autoRoundToken !== null && autoRoundToken === state.voice.roundToken) {
          await evaluateVoiceAnswerText(data.text, autoRoundToken);
        } else {
          el.voiceFeedback.textContent = "Transcribed. Review and evaluate.";
        }
      } else {
        el.voiceFeedback.textContent = "No speech detected.";
      }
    } catch (err) {
      el.voiceFeedback.textContent = err.message || "Transcription failed.";
    } finally {
      if (state.voice.silenceInterval) {
        clearInterval(state.voice.silenceInterval);
        state.voice.silenceInterval = null;
      }
      state.voice.silenceStartedAt = null;
      state.voice.recording = false;
      state.voice.mediaRecorder = null;
      el.voiceRecordBtn.textContent = "Start Voice Answer";
      el.forceStopBtn.classList.add("hidden");
    }
  };
  recorder.start();
  el.voiceRecordBtn.textContent = "Stop Recording";
  el.voiceFeedback.textContent = "Recording...";

  if (autoRoundToken !== null) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);

    state.voice.audioContext = audioContext;
    state.voice.audioSource = source;
    state.voice.analyser = analyser;
    state.voice.silenceStartedAt = null;

    state.voice.silenceInterval = setInterval(() => {
      if (!state.voice.recording || autoRoundToken !== state.voice.roundToken) return;

      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const centered = (buffer[i] - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / buffer.length);

      if (rms > AUTO_SILENCE_THRESHOLD) {
        state.voice.silenceStartedAt = null;
        return;
      }

      if (!state.voice.silenceStartedAt) {
        state.voice.silenceStartedAt = Date.now();
        return;
      }

      if (Date.now() - state.voice.silenceStartedAt >= AUTO_SILENCE_MS) {
        stopVoiceRecording();
      }
    }, 180);
  }
}

function stopVoiceRecording() {
  if (!state.voice.mediaRecorder || !state.voice.recording) return;
  state.voice.mediaRecorder.stop();
}

async function toggleVoiceRecording() {
  if (!state.learn?.current) {
    throw new Error("Open Learn mode first.");
  }
  if (state.voice.recording) {
    stopVoiceRecording();
    return;
  }
  await startVoiceRecording();
}

async function evaluateVoiceAnswerText(spokenText, roundToken = null) {
  if (!state.learn?.current) return;
  const isManualEvaluation = roundToken === null;
  if (roundToken !== null && roundToken !== state.voice.roundToken) return;
  el.voiceFeedback.textContent = "Evaluating answer...";
  const result = await api("/api/voice/evaluate", {
    method: "POST",
    body: JSON.stringify({
      term: state.learn.current.term,
      definition: state.learn.current.definition,
      spoken_text: spokenText,
    }),
  });

  state.learn.revealed = true;
  el.flipCard.classList.add("flipped");
  el.stillBtn.disabled = false;
  el.correctBtn.disabled = false;

  const scorePct = Math.round((result.score || 0) * 100);
  const correction = result.correction || `Correct term: ${state.learn.current.term}.`;
  const explanation = result.explanation || `Expected answer: ${state.learn.current.definition}.`;
  const verdict = result.is_correct ? "Correct" : "Not quite";
  el.voiceFeedback.textContent = `${verdict} (${scorePct}%). ${correction} ${explanation}`;

  const narration = `${correction} ${explanation}`;
  if (state.voice.autoMode) {
    try {
      await speakText(narration, { showStatus: false });
    } catch (err) {
      el.voiceFeedback.textContent = `Playback issue: ${err.message || "could not play explanation"}. Continuing...`;
    }
  }

  if (!state.learn) return;
  if (roundToken !== null && roundToken !== state.voice.roundToken) return;
  if (isManualEvaluation) {
    const prompt = result.is_correct
      ? "Click Correct (or Still Learning) when you are ready to continue."
      : "Review the explanation, then click Still Learning or Correct to continue.";
    el.voiceFeedback.textContent = `${el.voiceFeedback.textContent} ${prompt}`;
    el.voiceEvaluateBtn.disabled = true;
    return;
  }

  el.stillBtn.disabled = true;
  el.correctBtn.disabled = true;
  el.voiceEvaluateBtn.disabled = true;
  await wait(EVALUATION_ADVANCE_DELAY_MS);
  if (!state.learn) return;
  if (roundToken !== null && roundToken !== state.voice.roundToken) return;
  if (result.is_correct) {
    markCorrect(true);
  } else {
    markStillLearning(true);
  }
  el.voiceTranscript.value = "";
  el.voiceEvaluateBtn.disabled = true;
}

async function evaluateVoiceAnswer() {
  const spokenText = el.voiceTranscript.value.trim();
  if (!spokenText) throw new Error("No transcript to evaluate.");
  await evaluateVoiceAnswerText(spokenText);
}

async function startLiveRecognitionAndEvaluate(roundToken) {
  await startVoiceRecording(roundToken);
  el.voiceFeedback.textContent = "Listening... (auto-stops after 5s of silence)";
}

async function runAutoVoiceRound(roundToken) {
  if (!state.learn?.current) return;
  if (roundToken !== state.voice.roundToken) return;

  el.voiceFeedback.textContent = "Speaking term...";
  await speakText(state.learn.current.term);
  if (roundToken !== state.voice.roundToken || !state.learn) return;
  el.voiceFeedback.textContent = "Listening...";
  await startLiveRecognitionAndEvaluate(roundToken);
}

el.newDeckBtn.onclick = openCreateDeckDialog;
el.addCardBtn.onclick = () => addCard().catch(showError);
el.deleteDeckBtn.onclick = () => deleteDeck().catch(showError);
el.settingsBtn.onclick = () => {
  el.settingsMsg.textContent = "";
  el.settingsDialog.showModal();
};
el.saveSettingsBtn.onclick = () => saveSettings().catch(showError);
el.uploadVoiceBtn.onclick = () => {
  el.voiceFileInput.click();
};
el.voiceFileInput.onchange = async () => {
  try {
    const files = [...(el.voiceFileInput.files || [])];
    if (!files.length) return;
    el.settingsMsg.textContent = "Uploading voice files...";
    el.uploadVoiceBtn.disabled = true;
    await uploadVoiceFiles(files);
  } catch (err) {
    showError(err);
  } finally {
    el.uploadVoiceBtn.disabled = false;
    el.voiceFileInput.value = "";
  }
};
el.resetThemeBtn.onclick = () => {
  el.themeBg.value = THEME_DEFAULTS.theme_bg;
  el.themeBg2.value = THEME_DEFAULTS.theme_bg2;
  el.themePanel.value = THEME_DEFAULTS.theme_panel;
  el.themeText.value = THEME_DEFAULTS.theme_text;
  el.themeMuted.value = THEME_DEFAULTS.theme_muted;
  el.themePrimary.value = THEME_DEFAULTS.theme_primary;
  el.themePrimaryDark.value = THEME_DEFAULTS.theme_primary_dark;
  el.themeDanger.value = THEME_DEFAULTS.theme_danger;
  el.themeSuccess.value = THEME_DEFAULTS.theme_success;
  el.themeWarning.value = THEME_DEFAULTS.theme_warning;
  el.themeRing.value = THEME_DEFAULTS.theme_ring;
  applyTheme(currentThemeFromForm());
};
el.importOpenBtn.onclick = openImport;
el.addCreateRowBtn.onclick = () => {
  addCreateRows(1);
};
el.addCreateRowsBtn.onclick = () => {
  addCreateRows(Number(el.createBulkCount.value || 0));
};
el.createBulkCount.onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCreateRows(Number(el.createBulkCount.value || 0));
  }
};
el.createDeckSubmitBtn.onclick = () => {
  submitCreateDeck().catch((err) => {
    el.createDeckMsg.textContent = err.message || "Failed to create deck.";
  });
};
el.importBtn.onclick = () => importDeck().catch(showError);
el.learnBtn.onclick = () => startLearn().catch(showError);
el.reviewBtn.onclick = startReview;
el.qualityBtn.onclick = openQualityDialog;
el.qualityCloseBtn.onclick = () => el.qualityDialog.close();
el.qualityRunBtn.onclick = () => runQualityCheck().catch(showError);
el.qualityFilter.onchange = () => renderQualityList();
el.qualitySelectVisibleBtn.onclick = () => qualitySelectVisible(true);
el.qualityClearSelectionBtn.onclick = () => qualitySelectVisible(false);
el.qualityApplyBtn.onclick = () => applySelectedQualityChanges().catch(showError);
el.flipCard.onclick = flipLearnCard;
el.stillBtn.onclick = markStillLearning;
el.correctBtn.onclick = markCorrect;
el.voiceAutoBtn.onclick = () => {
  state.voice.autoMode = !state.voice.autoMode;
  setAutoVoiceButton();
  if (state.voice.autoMode && state.learn?.current) {
    stopVoiceCapture();
    state.voice.roundToken += 1;
    runAutoVoiceRound(state.voice.roundToken).catch((err) => {
      el.voiceFeedback.textContent = err.message || "Auto voice failed.";
    });
  }
};
el.speakTermBtn.onclick = () => speakCurrentTerm().catch(showError);
el.forceStopBtn.onclick = () => stopVoiceRecording();
el.voiceRecordBtn.onclick = () => toggleVoiceRecording().catch(showError);
el.voiceEvaluateBtn.onclick = () => evaluateVoiceAnswer().catch(showError);
el.learnFullscreenBtn.onclick = () => {
  toggleLearnFullscreen().catch(showError);
};
el.closeReviewBtn.onclick = () => el.reviewScreen.classList.add("hidden");
el.reviewCard.onclick = () => {
  state.review.flipped = !state.review.flipped;
  renderReviewCard();
};
el.reviewPrevBtn.onclick = () => {
  state.review.index = (state.review.index - 1 + state.review.cards.length) % state.review.cards.length;
  state.review.flipped = false;
  renderReviewCard();
};
el.reviewNextBtn.onclick = () => {
  state.review.index = (state.review.index + 1) % state.review.cards.length;
  state.review.flipped = false;
  renderReviewCard();
};
document.addEventListener("keydown", handleSpaceFlip);
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement !== el.learnScreen) {
    el.learnScreen.classList.remove("full-bleed");
  }
  updateLearnFullscreenButton();
});
el.closeLearnBtn.onclick = () => {
  stopVoiceCapture();
  state.voice.roundToken += 1;
  persistLearnProgressSilently();
  state.learn = null;
  exitLearnFullscreen().catch(() => {});
  el.learnScreen.classList.add("hidden");
};
el.voiceTranscript.oninput = () => {
  el.voiceEvaluateBtn.disabled = !el.voiceTranscript.value.trim();
};
[
  el.themeBg,
  el.themeBg2,
  el.themePanel,
  el.themeText,
  el.themeMuted,
  el.themePrimary,
  el.themePrimaryDark,
  el.themeDanger,
  el.themeSuccess,
  el.themeWarning,
  el.themeRing,
].forEach((picker) => {
  picker.oninput = () => applyTheme(currentThemeFromForm());
});

function showError(err) {
  alert(err.message || "Something went wrong.");
}

setAutoVoiceButton();
updateLearnFullscreenButton();
Promise.all([loadDecks(), loadSettings()]).catch(showError);
