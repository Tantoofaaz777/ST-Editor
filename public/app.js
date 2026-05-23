import { countTokens } from "./vendor/tokenizer.js";
import { renderMarkdown } from "./vendor/markdown.js";

const storageKey = "st-editor.cards.v1";

const fields = [
  "name",
  "creator",
  "character_version",
  "tags",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "creator_notes",
  "system_prompt",
  "post_history_instructions"
];

const state = {
  cards: [],
  activeId: null,
  draftCard: null,
  isDirty: false,
  search: "",
  selectedTags: new Set(),
  sortField: "name",
  sortDirection: "asc",
  viewMode: "grid",
  view: "library"
};

const elements = {
  libraryView: document.querySelector("#library-view"),
  editorView: document.querySelector("#editor-view"),
  form: document.querySelector("#card-form"),
  libraryGrid: document.querySelector("#library-grid"),
  emptyState: document.querySelector("#empty-state"),
  librarySectionTitle: document.querySelector("#library-section-title"),
  search: document.querySelector("#search-input"),
  filterMenu: document.querySelector("#filter-menu"),
  filterCount: document.querySelector("#filter-count"),
  filterTags: document.querySelector("#filter-tags"),
  sortFieldButton: document.querySelector("#sort-field-button"),
  sortDirectionButton: document.querySelector("#sort-direction-button"),
  viewModeButton: document.querySelector("#view-mode-button"),
  customSelects: document.querySelectorAll(".custom-select"),
  importInput: document.querySelector("#import-input"),
  newButton: document.querySelector("#new-card-button"),
  backButton: document.querySelector("#back-button"),
  saveStatus: document.querySelector("#save-status-pill"),
  saveButton: document.querySelector("#save-button"),
  exportButton: document.querySelector("#export-button"),
  exportPngButton: document.querySelector("#export-png-button"),
  duplicateButton: document.querySelector("#duplicate-button"),
  deleteButton: document.querySelector("#delete-button"),
  imageInput: document.querySelector("#image-input"),
  addGreetingButton: document.querySelector("#add-greeting-button"),
  alternateGreetingsList: document.querySelector("#alternate-greetings-list"),
  fullscreenEditor: document.querySelector("#fullscreen-editor"),
  fullscreenEditorBack: document.querySelector("#fullscreen-editor-back"),
  fullscreenEditorTitle: document.querySelector("#fullscreen-editor-title"),
  fullscreenMarkdownToggle: document.querySelector("#fullscreen-markdown-toggle"),
  fullscreenMarkdownPreview: document.querySelector("#fullscreen-markdown-preview"),
  fullscreenTokenCount: document.querySelector("#fullscreen-token-count"),
  fullscreenEditorTextarea: document.querySelector("#fullscreen-editor-textarea"),
  fullscreenEditorClose: document.querySelector("#fullscreen-editor-close"),
  deleteConfirmModal: document.querySelector("#delete-confirm-modal"),
  deleteConfirmMessage: document.querySelector("#delete-confirm-message"),
  deleteConfirmCancel: document.querySelector("#delete-confirm-cancel"),
  deleteConfirmSubmit: document.querySelector("#delete-confirm-submit"),
  title: document.querySelector("#screen-title"),
  toast: document.querySelector("#toast"),
  previewName: document.querySelector("#preview-name"),
  previewTokenCount: document.querySelector("#preview-token-count"),
  previewTags: document.querySelector("#preview-tags"),
  previewDescription: document.querySelector("#preview-description"),
  portraitImage: document.querySelector("#portrait-image"),
  portraitInitial: document.querySelector("#portrait-initial")
};

let activeFullscreenTextarea = null;
let isMarkdownPreviewActive = false;
let pendingDeleteId = null;

class AuthRequiredError extends Error {}

const sortFieldLabels = {
  name: "Name",
  updatedAt: "Date modified",
  tokens: "Token count",
  createdAt: "Date created"
};

const sortDirectionLabels = {
  asc: "Ascending",
  desc: "Descending"
};

const viewModeLabels = {
  grid: "Grid",
  list: "List"
};

const viewModeIcons = {
  grid: `
    <path d="M4 4h7v7H4z" />
    <path d="M13 4h7v7h-7z" />
    <path d="M4 13h7v7H4z" />
    <path d="M13 13h7v7h-7z" />
  `,
  list: `
    <path d="M8 6h12" />
    <path d="M8 12h12" />
    <path d="M8 18h12" />
    <path d="M4 6h.01" />
    <path d="M4 12h.01" />
    <path d="M4 18h.01" />
  `
};

function uid() {
  return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyCard() {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data: {
      name: "",
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "",
      character_version: "1.0",
      extensions: {}
    },
    imageDataUrl: ""
  };
}

function normalizeImportedCard(raw) {
  const source =
    raw && (raw.spec === "chara_card_v2" || raw.spec === "chara_card_v3") && raw.data
      ? raw.data
      : raw;
  const card = emptyCard();
  card.data = {
    ...card.data,
    ...source,
    tags: Array.isArray(source.tags) ? source.tags : splitLinesOrCommas(source.tags),
    alternate_greetings: Array.isArray(source.alternate_greetings)
      ? source.alternate_greetings
      : splitLines(source.alternate_greetings),
    extensions:
      source.extensions && typeof source.extensions === "object" ? source.extensions : {}
  };
  card.data.name = card.data.name || "Imported card";
  return card;
}

function toSillyTavernJson(card) {
  const data = {
    name: card.data.name || "",
    description: card.data.description || "",
    personality: card.data.personality || "",
    scenario: card.data.scenario || "",
    first_mes: card.data.first_mes || "",
    mes_example: card.data.mes_example || "",
    creator_notes: card.data.creator_notes || "",
    system_prompt: card.data.system_prompt || "",
    post_history_instructions: card.data.post_history_instructions || "",
    alternate_greetings: card.data.alternate_greetings || [],
    tags: card.data.tags || [],
    creator: card.data.creator || "",
    character_version: card.data.character_version || "",
    extensions: card.data.extensions || {}
  };

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data
  };
}

function toSillyTavernPngJson(card) {
  const json = toSillyTavernJson(card);
  const data = json.data;
  return {
    name: data.name,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    first_mes: data.first_mes,
    mes_example: data.mes_example,
    creatorcomment: data.creator_notes,
    avatar: "none",
    talkativeness: "0.5",
    fav: false,
    tags: data.tags,
    spec: json.spec,
    spec_version: json.spec_version,
    data,
    create_date: card.createdAt || card.updatedAt || new Date().toISOString()
  };
}

function splitLines(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLinesOrCommas(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStoredCard(card) {
  return {
    ...emptyCard(),
    ...card,
    createdAt: card.createdAt || card.updatedAt || new Date().toISOString(),
    updatedAt: card.updatedAt || card.createdAt || new Date().toISOString(),
    data: {
      ...emptyCard().data,
      ...(card.data || {}),
      tags: Array.isArray(card.data?.tags) ? card.data.tags : splitLinesOrCommas(card.data?.tags),
      alternate_greetings: Array.isArray(card.data?.alternate_greetings)
        ? card.data.alternate_greetings
        : splitLines(card.data?.alternate_greetings),
      extensions:
        card.data?.extensions && typeof card.data.extensions === "object" ? card.data.extensions : {}
    }
  };
}

async function redirectIfAuthRequired(response) {
  if (response.status !== 401) return;
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (payload.code === "AUTH_REQUIRED") {
    throw new AuthRequiredError("Authentication required");
  }
}

function redirectToLogin() {
  window.location.href = "/login";
}

async function loadCards() {
  let serverCards = [];
  try {
    const response = await fetch("/api/cards");
    if (!response.ok) {
      await redirectIfAuthRequired(response);
      throw new Error(`Could not load cards: ${response.status}`);
    }
    serverCards = await response.json();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      redirectToLogin();
      throw error;
    }
    try {
      serverCards = JSON.parse(localStorage.getItem(storageKey)) || [];
      showToast("Using browser backup. Could not read the app data folder.");
    } catch {
      serverCards = [];
    }
  }

  let browserCards = [];
  try {
    browserCards = JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    browserCards = [];
  }

  if (!serverCards.length && browserCards.length) {
    serverCards = browserCards;
    await persistCards(serverCards);
  }

  state.cards = Array.isArray(serverCards) ? serverCards.map(normalizeStoredCard) : [];
  state.activeId = state.cards[0]?.id || null;
}

function cardTokenCount(card) {
  return countTokens([
    card.data.name,
    card.data.description,
    card.data.personality,
    card.data.scenario,
    card.data.first_mes,
    card.data.mes_example
  ].join("\n"));
}

function cardDateValue(card, key) {
  return new Date(card[key] || card.updatedAt || card.createdAt || 0).getTime() || 0;
}

async function persistCards(cards = state.cards) {
  try {
    const response = await fetch("/api/cards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cards)
    });
    if (!response.ok) {
      await redirectIfAuthRequired(response);
      throw new Error(`Could not save cards: ${response.status}`);
    }
    localStorage.removeItem(storageKey);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      localStorage.setItem(storageKey, JSON.stringify(cards));
      redirectToLogin();
      return;
    }
    console.error(error);
    localStorage.setItem(storageKey, JSON.stringify(cards));
    showToast("Could not save to the app folder. Saved a browser backup.");
  }
}

function cloneCard(card) {
  return structuredClone(card);
}

function activeCard() {
  return state.cards.find((card) => card.id === state.activeId) || state.cards[0];
}

function editorCard() {
  return state.draftCard || activeCard();
}

function syncDraftToLibrary() {
  if (!state.draftCard) return activeCard();
  const nextCard = cloneCard(state.draftCard);
  nextCard.updatedAt = new Date().toISOString();
  const index = state.cards.findIndex((card) => card.id === nextCard.id);
  if (index >= 0) {
    state.cards[index] = nextCard;
  } else {
    state.cards.unshift(nextCard);
  }
  state.activeId = nextCard.id;
  state.draftCard = cloneCard(nextCard);
  return nextCard;
}

function setSaveStatus(isDirty) {
  state.isDirty = isDirty;
  elements.saveStatus.textContent = isDirty ? "Unsaved changes" : "Saved";
  elements.saveStatus.classList.toggle("is-dirty", isDirty);
}

function closeCustomSelects(exceptSelect = null) {
  elements.customSelects.forEach((select) => {
    if (select === exceptSelect) return;
    select.classList.remove("is-open");
    select.querySelector(".custom-select__button")?.setAttribute("aria-expanded", "false");
    const menu = select.querySelector(".custom-select__menu");
    if (menu) menu.hidden = true;
  });
}

function updateSortButtons() {
  elements.sortFieldButton.textContent = sortFieldLabels[state.sortField];
  elements.sortDirectionButton.textContent = sortDirectionLabels[state.sortDirection];
}

function updateViewModeButton() {
  const label = elements.viewModeButton.querySelector("span");
  const icon = elements.viewModeButton.querySelector("svg");
  if (label) label.textContent = viewModeLabels[state.viewMode];
  if (icon) icon.innerHTML = viewModeIcons[state.viewMode];
}

function isEditorVisible() {
  return state.view === "editor" && !elements.editorView.classList.contains("is-hidden");
}

function readForm() {
  const card = editorCard();
  if (!card) return;

  const formData = new FormData(elements.form);
  for (const field of fields) {
    const value = formData.get(field) || "";
    if (field === "tags") {
      card.data.tags = splitLinesOrCommas(value);
    } else if (field === "alternate_greetings") {
      card.data.alternate_greetings = splitLines(value);
    } else {
      card.data[field] = value;
    }
  }
  card.data.alternate_greetings = readAlternateGreetingFields();
  card.updatedAt = new Date().toISOString();
}

function writeForm(card) {
  for (const field of fields) {
    const input = document.querySelector(`#${field}`);
    if (!input) continue;
    if (field === "tags") {
      input.value = (card.data.tags || []).join(", ");
    } else {
      input.value = card.data[field] || "";
    }
  }
  renderAlternateGreetingFields(card.data.alternate_greetings || []);
  updatePreview();
}

function filteredCards() {
  const query = state.search.trim().toLowerCase();
  const selectedTags = [...state.selectedTags].map((tag) => tag.toLowerCase());
  const cards = state.cards.filter((card) => {
    const haystack = [
      card.data.name,
      card.data.creator,
      card.data.description,
      ...(card.data.tags || [])
    ]
      .join(" ")
      .toLowerCase();
    const cardTags = (card.data.tags || []).map((tag) => tag.toLowerCase());
    const matchesTags = selectedTags.every((tag) => cardTags.includes(tag));
    return haystack.includes(query) && matchesTags;
  });

  return cards.sort((first, second) => {
    let firstValue;
    let secondValue;

    if (state.sortField === "tokens") {
      firstValue = cardTokenCount(first);
      secondValue = cardTokenCount(second);
    } else if (state.sortField === "updatedAt" || state.sortField === "createdAt") {
      firstValue = cardDateValue(first, state.sortField);
      secondValue = cardDateValue(second, state.sortField);
    } else {
      firstValue = (first.data.name || "Untitled").toLowerCase();
      secondValue = (second.data.name || "Untitled").toLowerCase();
    }

    const direction = state.sortDirection === "desc" ? -1 : 1;
    if (firstValue > secondValue) return direction;
    if (firstValue < secondValue) return -direction;
    return 0;
  });
}

function renderLibrary() {
  const cards = filteredCards();

  elements.libraryGrid.innerHTML = "";
  elements.librarySectionTitle.textContent = `Characters (${cards.length})`;
  elements.emptyState.hidden = cards.length > 0;
  elements.libraryGrid.classList.toggle("is-list-view", state.viewMode === "list");
  renderFilterTags();
  updateSortButtons();
  updateViewModeButton();

  if (!state.cards.length) {
    elements.emptyState.querySelector("h3").textContent = "No characters yet";
    elements.emptyState.querySelector("p").textContent = "Create a new character or import a JSON card.";
  } else {
    elements.emptyState.querySelector("h3").textContent = "No characters found";
    elements.emptyState.querySelector("p").textContent = "Create a new character or clear your search.";
  }

  for (const card of cards) {
    const libraryDescription =
      card.data.creator_notes?.trim() || card.data.description?.trim() || "No description yet.";
    const tokenCount = cardTokenCount(card);
    const updatedDate = formatShortDate(card.updatedAt);
    const createdDate = formatShortDate(card.createdAt || card.updatedAt);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "library-item";
    button.innerHTML = `
      <div class="library-item__top">
        <div class="library-initial">
          ${card.imageDataUrl
            ? `<img src="${escapeHtml(card.imageDataUrl)}" alt="" />`
            : escapeHtml((card.data.name || "U").slice(0, 1).toUpperCase())}
        </div>
        <div>
          <h3>${escapeHtml(card.data.name || "Untitled")}</h3>
          <p>${escapeHtml([card.data.creator, card.data.character_version].filter(Boolean).join(" - ") || "JSON V2")}</p>
        </div>
      </div>
      <p>${escapeHtml(shorten(libraryDescription, 150))}</p>
      <div class="library-item__meta">
        <span class="meta-pill token-meta">${escapeHtml(tokenLabel(tokenCount))}</span>
        <span class="meta-pill date-meta">Modified ${escapeHtml(updatedDate)}</span>
        <span class="meta-pill date-meta">Created ${escapeHtml(createdDate)}</span>
        ${(card.data.tags || []).slice(0, 4).map((tag) => `<span class="meta-pill">${escapeHtml(tag)}</span>`).join("")}
        ${(card.data.tags || []).length ? "" : `<span class="meta-pill">No tags</span>`}
      </div>
    `;
    button.addEventListener("click", () => {
      state.activeId = card.id;
      showEditor();
    });
    elements.libraryGrid.append(button);
  }
}

function renderFilterTags() {
  const tags = [...new Set(state.cards.flatMap((card) => card.data.tags || []))]
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second));
  const tagSet = new Set(tags);
  state.selectedTags = new Set([...state.selectedTags].filter((tag) => tagSet.has(tag)));
  elements.filterTags.innerHTML = "";

  if (!tags.length) {
    elements.filterTags.innerHTML = `<span class="filter-empty">No tags yet</span>`;
  }

  for (const tag of tags) {
    const id = `filter-tag-${slugify(tag)}`;
    const label = document.createElement("label");
    label.className = "tag-filter";
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(tag)}" ${state.selectedTags.has(tag) ? "checked" : ""} />
      <span>${escapeHtml(tag)}</span>
    `;
    label.querySelector("input").id = id;
    elements.filterTags.append(label);
  }

  const activeCount = state.selectedTags.size;
  elements.filterCount.textContent = String(activeCount);
  elements.filterCount.hidden = activeCount === 0;
}

function updatePreview() {
  const formData = new FormData(elements.form);
  const data = Object.fromEntries(formData.entries());
  const tags = splitLinesOrCommas(data.tags);
  const countedFields = [
    data.name,
    data.description,
    data.personality,
    data.scenario,
    data.first_mes,
    data.mes_example
  ];
  const tokenCount = countTokens(countedFields.join("\n"));
  const name = data.name?.trim() || "Untitled";

  elements.title.textContent = name;
  elements.previewName.textContent = name;
  elements.previewTokenCount.textContent = tokenLabel(tokenCount);
  elements.portraitInitial.textContent = name.slice(0, 1).toUpperCase();
  elements.portraitImage.src = editorCard()?.imageDataUrl || "";
  elements.portraitImage.hidden = !editorCard()?.imageDataUrl;
  const creatorNotes = data.creator_notes?.trim() || "";
  elements.previewDescription.textContent = creatorNotes;
  elements.previewDescription.hidden = !creatorNotes;

  elements.previewTags.innerHTML = "";
  const previewTags = tags.slice(0, 8);
  elements.previewTags.hidden = !previewTags.length;
  for (const tag of previewTags) {
    const pill = document.createElement("span");
    pill.className = "tag";
    pill.textContent = tag;
    elements.previewTags.append(pill);
  }

  updateTextareaTokenCounters();
}

function readAlternateGreetingFields() {
  return [...elements.alternateGreetingsList.querySelectorAll(".alternate-greeting")]
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function renderAlternateGreetingFields(greetings) {
  elements.alternateGreetingsList.innerHTML = "";
  greetings.forEach((greeting) => addAlternateGreetingField(greeting));
}

function addAlternateGreetingField(value = "") {
  const index = elements.alternateGreetingsList.children.length + 1;
  const wrapper = document.createElement("div");
  wrapper.className = "alternate-field";
  wrapper.innerHTML = `
    <div class="field-header">
      <span>Alternate greeting #${index}</span>
      <div class="alternate-actions">
        <button class="move-greeting-button" type="button" data-direction="up" aria-label="Move alternate greeting up">↑</button>
        <button class="move-greeting-button" type="button" data-direction="down" aria-label="Move alternate greeting down">↓</button>
        <button class="remove-greeting-button" type="button" aria-label="Remove alternate greeting">-</button>
      </div>
    </div>
    <textarea class="alternate-greeting" rows="5"></textarea>
  `;
  wrapper.querySelector(".alternate-greeting").value = value;
  elements.alternateGreetingsList.append(wrapper);
  enhanceTextareas(wrapper);
  updateAlternateGreetingLabels();
}

function updateAlternateGreetingLabels() {
  [...elements.alternateGreetingsList.querySelectorAll(".alternate-field")].forEach(
    (field, index) => {
      field.querySelector(".field-header span").textContent = `Alternate greeting #${index + 1}`;
      const fields = elements.alternateGreetingsList.querySelectorAll(".alternate-field");
      const upButton = field.querySelector('[data-direction="up"]');
      const downButton = field.querySelector('[data-direction="down"]');
      upButton.disabled = index === 0;
      downButton.disabled = index === fields.length - 1;
    }
  );
  updatePreview();
}

function enhanceTextareas(root = document) {
  root.querySelectorAll("textarea").forEach((textarea) => {
    if (textarea.closest(".fullscreen-editor") || textarea.dataset.enhancedEditor) return;

    const shell = document.createElement("div");
    shell.className = "textarea-shell";
    textarea.parentNode.insertBefore(shell, textarea);
    shell.append(textarea);

    const button = document.createElement("button");
    button.className = "expand-editor-button";
    button.type = "button";
    button.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8 3H3v5" />
        <path d="M3 3l7 7" />
        <path d="M16 21h5v-5" />
        <path d="M21 21l-7-7" />
      </svg>
    `;
    button.setAttribute("aria-label", `Open ${getTextareaLabel(textarea)} in fullscreen editor`);
    shell.append(button);

    if (!textarea.dataset.noTokenCounter) {
      const counter = document.createElement("span");
      counter.className = "token-counter";
      counter.setAttribute("aria-label", `Token count for ${getTextareaLabel(textarea)}`);
      textarea.tokenCounter = counter;
      placeTokenCounter(textarea, counter);
    }

    textarea.dataset.enhancedEditor = "true";
    updateTextareaTokenCounter(textarea);
  });
}

function placeTokenCounter(textarea, counter) {
  const field = textarea.closest("label, .field-group, .alternate-field");
  if (!field) return;

  const header = field.querySelector(":scope > .field-header");
  if (header) {
    const action = header.querySelector(":scope > button, :scope > .alternate-actions");
    if (action) {
      header.insertBefore(counter, action);
    } else {
      header.append(counter);
    }
    return;
  }

  const label = field.querySelector(":scope > span");
  if (!label) return;

  const row = document.createElement("div");
  row.className = "textarea-label-row";
  label.parentNode.insertBefore(row, label);
  row.append(label, counter);
}

function updateTextareaTokenCounters(root = elements.form) {
  root.querySelectorAll("textarea").forEach(updateTextareaTokenCounter);
}

function updateTextareaTokenCounter(textarea) {
  const counter = textarea.tokenCounter;
  if (!counter) return;
  counter.textContent = tokenLabel(countTokens(textarea.value));
}

function tokenLabel(count) {
  return `${formatNumber(count)} ${count === 1 ? "token" : "tokens"}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatShortDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function getTextareaLabel(textarea) {
  const field = textarea.closest("label, .field-group, .alternate-field");
  return field?.querySelector(".field-header span, span")?.textContent?.trim() || "field";
}

function openFullscreenEditor(textarea) {
  activeFullscreenTextarea = textarea;
  setMarkdownPreviewActive(false);
  elements.fullscreenEditorTitle.textContent = getTextareaLabel(textarea);
  elements.fullscreenEditorTextarea.value = textarea.value;
  elements.fullscreenTokenCount.hidden = Boolean(textarea.dataset.noTokenCounter);
  updateFullscreenTokenCount();
  elements.fullscreenEditor.hidden = false;
  document.body.classList.add("modal-open");
  elements.fullscreenEditorTextarea.focus();
}

function updateFullscreenTokenCount() {
  if (elements.fullscreenTokenCount.hidden) return;
  elements.fullscreenTokenCount.textContent = tokenLabel(countTokens(elements.fullscreenEditorTextarea.value));
}

function setMarkdownPreviewActive(isActive) {
  isMarkdownPreviewActive = isActive;
  elements.fullscreenMarkdownToggle.setAttribute("aria-pressed", String(isActive));
  elements.fullscreenMarkdownToggle.classList.toggle("is-active", isActive);
  elements.fullscreenEditorTextarea.hidden = isActive;
  elements.fullscreenMarkdownPreview.hidden = !isActive;
  if (isActive) {
    elements.fullscreenMarkdownPreview.innerHTML = sanitizeMarkdownHtml(
      renderMarkdown(elements.fullscreenEditorTextarea.value)
    );
  }
}

function sanitizeMarkdownHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on")) node.removeAttribute(attribute.name);
      if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML;
}

function closeFullscreenEditor({ applyChanges = true } = {}) {
  if (activeFullscreenTextarea) {
    if (applyChanges) {
      activeFullscreenTextarea.value = elements.fullscreenEditorTextarea.value;
      activeFullscreenTextarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    activeFullscreenTextarea.blur();
  }
  elements.form
    .querySelectorAll(".textarea-shell.is-active")
    .forEach((shell) => shell.classList.remove("is-active"));
  elements.form
    .querySelectorAll(".textarea-shell.is-hovered")
    .forEach((shell) => shell.classList.remove("is-hovered"));
  activeFullscreenTextarea = null;
  setMarkdownPreviewActive(false);
  elements.fullscreenEditor.hidden = true;
  document.body.classList.remove("modal-open");
}

function render() {
  const card = editorCard();
  renderLibrary();
  if (card && isEditorVisible()) {
    writeForm(card);
    enhanceTextareas(elements.form);
  }
}

function showLibrary() {
  state.draftCard = null;
  setSaveStatus(false);
  state.view = "library";
  elements.libraryView.classList.remove("is-hidden");
  elements.editorView.classList.add("is-hidden");
  renderLibrary();
}

function showEditor() {
  state.view = "editor";
  elements.libraryView.classList.add("is-hidden");
  elements.editorView.classList.remove("is-hidden");
  const card = activeCard();
  state.draftCard = card ? cloneCard(card) : null;
  if (state.draftCard) writeForm(state.draftCard);
  setSaveStatus(false);
  enhanceTextareas(elements.form);
}

function saveActiveCard() {
  readForm();
  syncDraftToLibrary();
  persistCards();
  setSaveStatus(false);
  renderLibrary();
  showToast("Card saved to the local library.");
}

function createCard() {
  state.draftCard = null;
  const card = emptyCard();
  card.data.name = "New card";
  state.cards.unshift(card);
  state.activeId = card.id;
  persistCards();
  showEditor();
}

function duplicateCard() {
  readForm();
  const current = editorCard();
  const clone = cloneCard(current);
  clone.id = uid();
  clone.updatedAt = new Date().toISOString();
  clone.data.name = `${clone.data.name || "Card"} copy`;
  state.cards.unshift(clone);
  state.activeId = clone.id;
  persistCards();
  showEditor();
  showToast("Card duplicated.");
}

function requestDeleteCard() {
  const current = activeCard();
  if (!current) return;
  pendingDeleteId = current.id;
  elements.deleteConfirmMessage.textContent = `Delete "${current.data.name || "Untitled"}"? This action cannot be undone.`;
  elements.deleteConfirmModal.hidden = false;
  document.body.classList.add("modal-open");
  elements.deleteConfirmCancel.focus();
}

function closeDeleteConfirm() {
  pendingDeleteId = null;
  elements.deleteConfirmModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function confirmDeleteCard() {
  const current = state.cards.find((card) => card.id === pendingDeleteId);
  if (!current) {
    closeDeleteConfirm();
    return;
  }

  state.cards = state.cards.filter((card) => card.id !== current.id);
  state.activeId = state.cards[0]?.id || null;
  persistCards();
  closeDeleteConfirm();
  showLibrary();
  showToast("Card deleted.");
}

function exportActiveCard() {
  readForm();
  const card = editorCard();
  const payload = JSON.stringify(toSillyTavernJson(card), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const filename = `${slugify(card.data.name || "character-card")}.json`;
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast(`Exported: ${filename}`);
}

async function exportActiveCardPng() {
  readForm();
  const card = editorCard();
  const basePng = card.imageDataUrl
    ? await imageDataUrlToPngBytes(card.imageDataUrl)
    : await generateFallbackPortraitPng(card.data.name || "Character");
  const payload = toSillyTavernPngJson(card);
  const pngBytes = writeCardJsonToPng(basePng, payload);
  const blob = new Blob([pngBytes], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const filename = `${slugify(card.data.name || "character-card")}.png`;
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast(`Exported: ${filename}`);
}

async function importCard(file) {
  const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  if (isPng) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const json = readCardJsonFromPng(bytes);
    const card = normalizeImportedCard(json);
    card.imageDataUrl = await fileToDataUrl(file);
    state.cards.unshift(card);
    state.activeId = card.id;
    persistCards();
    showEditor();
    showToast("PNG imported.");
    return;
  }

  const text = await file.text();
  const json = JSON.parse(text);
  const card = normalizeImportedCard(json);
  state.cards.unshift(card);
  state.activeId = card.id;
  persistCards();
  showEditor();
  showToast("JSON imported.");
}

async function setCardImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const card = editorCard();
  if (!card) return;
  card.imageDataUrl = await fileToDataUrl(file);
  setSaveStatus(true);
  updatePreview();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function imageDataUrlToPngBytes(dataUrl) {
  if (dataUrl.startsWith("data:image/png")) return dataUrlToBytes(dataUrl);

  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return dataUrlToBytes(canvas.toDataURL("image/png"));
}

async function generateFallbackPortraitPng(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, "#4fb7a2");
  gradient.addColorStop(1, "#d6a463");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  context.fillStyle = "#111111";
  context.font = "900 180px Nunito, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText((name || "?").slice(0, 1).toUpperCase(), 256, 270);
  return dataUrlToBytes(canvas.toDataURL("image/png"));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = src;
  });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function readCardJsonFromPng(bytes) {
  const chunks = readPngChunks(bytes);
  const textChunks = chunks
    .filter((chunk) => chunk.type === "tEXt")
    .map((chunk) => parseTextChunk(chunk.data));
  const cardChunk = textChunks.find((chunk) => chunk.keyword === "ccv3")
    || textChunks.find((chunk) => chunk.keyword === "chara");
  if (!cardChunk) throw new Error("No SillyTavern card data found in this PNG.");
  return JSON.parse(decodeBase64Utf8(cardChunk.text));
}

function writeCardJsonToPng(bytes, cardJson) {
  const chunks = readPngChunks(bytes);
  const text = encodeBase64Utf8(JSON.stringify(cardJson));
  const cardChunks = [makeTextChunk("chara", text), makeTextChunk("ccv3", text)];
  const output = [bytes.slice(0, 8)];

  for (const chunk of chunks) {
    if (chunk.type === "tEXt") {
      const textChunk = parseTextChunk(chunk.data);
      if (textChunk.keyword === "chara" || textChunk.keyword === "ccv3") continue;
    }

    if (chunk.type === "IEND") output.push(...cardChunks);
    output.push(writePngChunk(chunk.type, chunk.data));
  }

  return concatBytes(output);
}

function readPngChunks(bytes) {
  const signature = "89504e470d0a1a0a";
  const actual = [...bytes.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== signature) throw new Error("This is not a valid PNG file.");

  const chunks = [];
  let offset = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    offset += 4;
    const type = String.fromCharCode(...bytes.slice(offset, offset + 4));
    offset += 4;
    const data = bytes.slice(offset, offset + length);
    offset += length;
    offset += 4;
    chunks.push({ type, data });
    if (type === "IEND") break;
  }
  return chunks;
}

function parseTextChunk(data) {
  const separator = data.indexOf(0);
  const keyword = bytesToLatin1(data.slice(0, separator));
  const text = bytesToLatin1(data.slice(separator + 1));
  return { keyword, text };
}

function bytesToLatin1(bytes) {
  let text = "";
  bytes.forEach((byte) => {
    text += String.fromCharCode(byte);
  });
  return text;
}

function makeTextChunk(keyword, text) {
  const keywordBytes = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(text);
  const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  data.set(keywordBytes, 0);
  data[keywordBytes.length] = 0;
  data.set(textBytes, keywordBytes.length + 1);
  return writePngChunk("tEXt", data);
}

function writePngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const output = new Uint8Array(12 + data.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(8 + data.length, crc32(output.slice(4, 8 + data.length)));
  return output;
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "character-card";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shorten(value, maxLength) {
  const text = String(value).trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2400);
}

elements.form.addEventListener("input", () => {
  updatePreview();
  setSaveStatus(true);
});
elements.form.addEventListener("click", (event) => {
  const button = event.target.closest?.(".expand-editor-button");
  if (!button) return;
  const textarea = button.closest(".textarea-shell")?.querySelector("textarea");
  if (textarea) openFullscreenEditor(textarea);
});
elements.form.addEventListener("pointerover", (event) => {
  if (event.pointerType !== "mouse") return;
  const shell = event.target.closest?.(".textarea-shell");
  if (shell) shell.classList.add("is-hovered");
});
elements.form.addEventListener("pointerout", (event) => {
  if (event.pointerType !== "mouse") return;
  const shell = event.target.closest?.(".textarea-shell");
  if (!shell || shell.contains(event.relatedTarget)) return;
  shell.classList.remove("is-hovered");
});
elements.form.addEventListener("focusin", (event) => {
  const shell = event.target.closest?.(".textarea-shell");
  if (!shell) return;
  shell.classList.add("is-active");
});
elements.form.addEventListener("pointerdown", (event) => {
  const shell = event.target.closest?.(".textarea-shell");
  elements.form
    .querySelectorAll(".textarea-shell.is-active")
    .forEach((activeShell) => {
      if (activeShell !== shell) activeShell.classList.remove("is-active");
    });
  if (shell) shell.classList.add("is-active");
});
document.addEventListener("pointerdown", (event) => {
  if (event.target.closest?.(".textarea-shell, .fullscreen-editor")) return;
  elements.form
    .querySelectorAll(".textarea-shell.is-active")
    .forEach((shell) => shell.classList.remove("is-active"));
});
elements.fullscreenEditorClose.addEventListener("click", closeFullscreenEditor);
elements.fullscreenEditorBack.addEventListener("click", () => closeFullscreenEditor({ applyChanges: false }));
elements.fullscreenMarkdownToggle.addEventListener("click", () => {
  setMarkdownPreviewActive(!isMarkdownPreviewActive);
});
elements.fullscreenEditorTextarea.addEventListener("input", () => {
  updateFullscreenTokenCount();
  if (isMarkdownPreviewActive) setMarkdownPreviewActive(true);
});
elements.fullscreenEditor.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeFullscreenEditor();
});
elements.search.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderLibrary();
});
elements.filterTags.addEventListener("change", (event) => {
  const input = event.target.closest?.("input[type='checkbox']");
  if (!input) return;
  if (input.checked) {
    state.selectedTags.add(input.value);
  } else {
    state.selectedTags.delete(input.value);
  }
  renderLibrary();
});
elements.customSelects.forEach((select) => {
  const button = select.querySelector(".custom-select__button");
  const menu = select.querySelector(".custom-select__menu");
  button.addEventListener("click", () => {
    const willOpen = menu.hidden;
    closeCustomSelects(select);
    select.classList.toggle("is-open", willOpen);
    button.setAttribute("aria-expanded", String(willOpen));
    menu.hidden = !willOpen;
  });
  menu.addEventListener("click", (event) => {
    const option = event.target.closest?.("button[data-value]");
    if (!option) return;
    if (select.dataset.select === "sort-field") {
      state.sortField = option.dataset.value;
    } else if (select.dataset.select === "sort-direction") {
      state.sortDirection = option.dataset.value;
    }
    closeCustomSelects();
    renderLibrary();
  });
});
elements.viewModeButton.addEventListener("click", () => {
  state.viewMode = state.viewMode === "grid" ? "list" : "grid";
  renderLibrary();
});
document.addEventListener("click", (event) => {
  if (event.target.closest?.(".custom-select")) return;
  closeCustomSelects();
  if (!event.target.closest?.(".filter-menu")) {
    elements.filterMenu.removeAttribute("open");
  }
});
elements.newButton.addEventListener("click", createCard);
elements.backButton.addEventListener("click", showLibrary);
elements.saveButton.addEventListener("click", saveActiveCard);
elements.exportButton.addEventListener("click", exportActiveCard);
elements.exportPngButton.addEventListener("click", exportActiveCardPng);
elements.duplicateButton.addEventListener("click", duplicateCard);
elements.deleteButton.addEventListener("click", requestDeleteCard);
elements.deleteConfirmCancel.addEventListener("click", closeDeleteConfirm);
elements.deleteConfirmSubmit.addEventListener("click", confirmDeleteCard);
elements.deleteConfirmModal.addEventListener("click", (event) => {
  if (event.target.closest?.("[data-confirm-cancel]")) closeDeleteConfirm();
});
elements.deleteConfirmModal.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDeleteConfirm();
});
elements.imageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    await setCardImage(file);
  } catch (error) {
    console.error(error);
    showToast("Could not use this image.");
  } finally {
    event.target.value = "";
  }
});
elements.addGreetingButton.addEventListener("click", () => {
  addAlternateGreetingField();
  const fields = elements.alternateGreetingsList.querySelectorAll(".alternate-greeting");
  fields[fields.length - 1].focus();
  setSaveStatus(true);
});
elements.alternateGreetingsList.addEventListener("click", (event) => {
  const moveButton = event.target.closest(".move-greeting-button");
  if (moveButton) {
    const field = moveButton.closest(".alternate-field");
    const direction = moveButton.dataset.direction;
    if (direction === "up" && field.previousElementSibling) {
      elements.alternateGreetingsList.insertBefore(field, field.previousElementSibling);
    }
    if (direction === "down" && field.nextElementSibling) {
      elements.alternateGreetingsList.insertBefore(field.nextElementSibling, field);
    }
    updateAlternateGreetingLabels();
    field.querySelector(".alternate-greeting")?.focus();
    setSaveStatus(true);
    return;
  }

  if (!event.target.closest(".remove-greeting-button")) return;
  event.target.closest(".alternate-field").remove();
  updateAlternateGreetingLabels();
  setSaveStatus(true);
});
elements.alternateGreetingsList.addEventListener("input", () => {
  updatePreview();
  setSaveStatus(true);
});
elements.importInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    await importCard(file);
  } catch (error) {
    console.error(error);
    showToast("Could not import this JSON.");
  } finally {
    event.target.value = "";
  }
});

await loadCards();
enhanceTextareas(elements.form);
showLibrary();
