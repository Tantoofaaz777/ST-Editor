import { renderMarkdown } from "./vendor/markdown.js";

const storageKey = "st-editor.cards.v1";
const personaStorageKey = "st-editor.personas.v1";
const recoveryStorageKey = "st-editor.auth-recovery.v1";
const libraryPageSize = 25;

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
  personas: [],
  activeId: null,
  activePersonaId: null,
  draftCard: null,
  draftPersona: null,
  isDirty: false,
  isPersonaDirty: false,
  isMigratingThumbnails: false,
  activeLibraryType: "characters",
  search: "",
  selectedTags: new Set(),
  sortField: "name",
  sortDirection: "asc",
  viewMode: "grid",
  view: "library",
  libraryPages: {
    characters: 1,
    personas: 1
  },
  libraryScrollY: 0
};

const elements = {
  libraryView: document.querySelector("#library-view"),
  editorView: document.querySelector("#editor-view"),
  personaEditorView: document.querySelector("#persona-editor-view"),
  form: document.querySelector("#card-form"),
  personaForm: document.querySelector("#persona-form"),
  libraryGrid: document.querySelector("#library-grid"),
  emptyState: document.querySelector("#empty-state"),
  librarySectionTitle: document.querySelector("#library-section-title"),
  pagination: document.querySelector("#pagination"),
  paginationPrev: document.querySelector("#pagination-prev"),
  paginationNext: document.querySelector("#pagination-next"),
  paginationStatus: document.querySelector("#pagination-status"),
  search: document.querySelector("#search-input"),
  filterMenu: document.querySelector("#filter-menu"),
  filterCount: document.querySelector("#filter-count"),
  filterTags: document.querySelector("#filter-tags"),
  sortFieldButton: document.querySelector("#sort-field-button"),
  sortDirectionButton: document.querySelector("#sort-direction-button"),
  viewModeButton: document.querySelector("#view-mode-button"),
  customSelects: document.querySelectorAll(".custom-select"),
  charactersTab: document.querySelector("#characters-tab"),
  personasTab: document.querySelector("#personas-tab"),
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
  fullscreenEditorTextarea: document.querySelector("#fullscreen-editor-textarea"),
  fullscreenEditorClose: document.querySelector("#fullscreen-editor-close"),
  deleteConfirmModal: document.querySelector("#delete-confirm-modal"),
  deleteConfirmMessage: document.querySelector("#delete-confirm-message"),
  deleteConfirmCancel: document.querySelector("#delete-confirm-cancel"),
  deleteConfirmSubmit: document.querySelector("#delete-confirm-submit"),
  title: document.querySelector("#screen-title"),
  toast: document.querySelector("#toast"),
  previewName: document.querySelector("#preview-name"),
  previewTags: document.querySelector("#preview-tags"),
  previewDescription: document.querySelector("#preview-description"),
  portraitImage: document.querySelector("#portrait-image"),
  portraitInitial: document.querySelector("#portrait-initial"),
  personaBackButton: document.querySelector("#persona-back-button"),
  personaSaveStatus: document.querySelector("#persona-save-status-pill"),
  personaSaveButton: document.querySelector("#persona-save-button"),
  personaCopyButton: document.querySelector("#persona-copy-button"),
  personaDownloadImageButton: document.querySelector("#persona-download-image-button"),
  personaDeleteButton: document.querySelector("#persona-delete-button"),
  personaImageInput: document.querySelector("#persona-image-input"),
  personaTitle: document.querySelector("#persona-screen-title"),
  personaName: document.querySelector("#persona-name"),
  personaDescription: document.querySelector("#persona-description"),
  personaPreviewName: document.querySelector("#persona-preview-name"),
  personaPreviewDescription: document.querySelector("#persona-preview-description"),
  personaPortraitImage: document.querySelector("#persona-portrait-image"),
  personaPortraitInitial: document.querySelector("#persona-portrait-initial")
};

let activeFullscreenTextarea = null;
let isMarkdownPreviewActive = false;
let pendingDeleteId = null;

class AuthRequiredError extends Error {}

const sortFieldLabels = {
  name: "Name",
  updatedAt: "Date modified",
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
    <path d="M200-520q-33 0-56.5-23.5T120-600v-160q0-33 23.5-56.5T200-840h160q33 0 56.5 23.5T440-760v160q0 33-23.5 56.5T360-520H200Zm0 400q-33 0-56.5-23.5T120-200v-160q0-33 23.5-56.5T200-440h160q33 0 56.5 23.5T440-360v160q0 33-23.5 56.5T360-120H200Zm400-400q-33 0-56.5-23.5T520-600v-160q0-33 23.5-56.5T600-840h160q33 0 56.5 23.5T840-760v160q0 33-23.5 56.5T760-520H600Zm0 400q-33 0-56.5-23.5T520-200v-160q0-33 23.5-56.5T600-440h160q33 0 56.5 23.5T840-360v160q0 33-23.5 56.5T760-120H600ZM200-600h160v-160H200v160Zm400 0h160v-160H600v160Zm0 400h160v-160H600v160Zm-400 0h160v-160H200v160Zm400-400Zm0 240Zm-240 0Zm0-240Z" />
  `,
  list: `
    <path d="M320-600q-17 0-28.5-11.5T280-640q0-17 11.5-28.5T320-680h480q17 0 28.5 11.5T840-640q0 17-11.5 28.5T800-600H320Zm0 160q-17 0-28.5-11.5T280-480q0-17 11.5-28.5T320-520h480q17 0 28.5 11.5T840-480q0 17-11.5 28.5T800-440H320Zm0 160q-17 0-28.5-11.5T280-320q0-17 11.5-28.5T320-360h480q17 0 28.5 11.5T840-320q0 17-11.5 28.5T800-280H320ZM160-600q-17 0-28.5-11.5T120-640q0-17 11.5-28.5T160-680q17 0 28.5 11.5T200-640q0 17-11.5 28.5T160-600Zm0 160q-17 0-28.5-11.5T120-480q0-17 11.5-28.5T160-520q17 0 28.5 11.5T200-480q0 17-11.5 28.5T160-440Zm0 160q-17 0-28.5-11.5T120-320q0-17 11.5-28.5T160-360q17 0 28.5 11.5T200-320q0 17-11.5 28.5T160-280Z" />
  `
};

function uid() {
  return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function personaUid() {
  return `persona-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    imageDataUrl: "",
    imageThumbnailDataUrl: "",
    imagePath: "",
    thumbnailPath: "",
    imageUrl: "",
    thumbnailUrl: ""
  };
}

function emptyPersona() {
  return {
    id: personaUid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: "",
    description: "",
    imageDataUrl: "",
    imageThumbnailDataUrl: "",
    imagePath: "",
    thumbnailPath: "",
    imageUrl: "",
    thumbnailUrl: ""
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
  const sourceData = card.data || {};
  const data = {
    ...sourceData,
    name: sourceData.name || "",
    description: sourceData.description || "",
    personality: sourceData.personality || "",
    scenario: sourceData.scenario || "",
    first_mes: sourceData.first_mes || "",
    mes_example: sourceData.mes_example || "",
    creator_notes: sourceData.creator_notes || "",
    system_prompt: sourceData.system_prompt || "",
    post_history_instructions: sourceData.post_history_instructions || "",
    alternate_greetings: sourceData.alternate_greetings || [],
    tags: sourceData.tags || [],
    creator: sourceData.creator || "",
    character_version: sourceData.character_version || "",
    extensions: sourceData.extensions || {}
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
  const hasImageField = Object.prototype.hasOwnProperty.call(card, "imageDataUrl");
  const hasThumbnailField = Object.prototype.hasOwnProperty.call(card, "imageThumbnailDataUrl");
  const imageDataUrl = typeof card.imageDataUrl === "string" ? card.imageDataUrl : "";
  const imageThumbnailDataUrl =
    typeof card.imageThumbnailDataUrl === "string" ? card.imageThumbnailDataUrl : "";
  const imagePath = typeof card.imagePath === "string" ? card.imagePath : "";
  const thumbnailPath = typeof card.thumbnailPath === "string" ? card.thumbnailPath : "";
  const imageUrl = typeof card.imageUrl === "string" ? card.imageUrl : "";
  const thumbnailUrl = typeof card.thumbnailUrl === "string" ? card.thumbnailUrl : "";
  return {
    ...emptyCard(),
    ...card,
    createdAt: card.createdAt || card.updatedAt || new Date().toISOString(),
    updatedAt: card.updatedAt || card.createdAt || new Date().toISOString(),
    imageDataUrl,
    imageThumbnailDataUrl,
    imagePath,
    thumbnailPath,
    imageUrl,
    thumbnailUrl,
    hasImage: Boolean(imageDataUrl || imagePath || imageUrl || imageThumbnailDataUrl || thumbnailPath || thumbnailUrl || card.hasImage),
    hasThumbnail: Boolean(imageThumbnailDataUrl || thumbnailPath || thumbnailUrl || card.hasThumbnail),
    imageLoaded: hasImageField || Boolean(imagePath || imageUrl) || !card.hasImage,
    thumbnailLoaded: hasThumbnailField || Boolean(thumbnailPath || thumbnailUrl) || !card.hasImage,
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

function normalizeStoredPersona(persona) {
  const hasImageField = Object.prototype.hasOwnProperty.call(persona, "imageDataUrl");
  const hasThumbnailField = Object.prototype.hasOwnProperty.call(persona, "imageThumbnailDataUrl");
  const imageDataUrl = typeof persona.imageDataUrl === "string" ? persona.imageDataUrl : "";
  const imageThumbnailDataUrl =
    typeof persona.imageThumbnailDataUrl === "string" ? persona.imageThumbnailDataUrl : "";
  const imagePath = typeof persona.imagePath === "string" ? persona.imagePath : "";
  const thumbnailPath = typeof persona.thumbnailPath === "string" ? persona.thumbnailPath : "";
  const imageUrl = typeof persona.imageUrl === "string" ? persona.imageUrl : "";
  const thumbnailUrl = typeof persona.thumbnailUrl === "string" ? persona.thumbnailUrl : "";
  return {
    ...emptyPersona(),
    ...persona,
    name: persona.name || "",
    description: persona.description || "",
    createdAt: persona.createdAt || persona.updatedAt || new Date().toISOString(),
    updatedAt: persona.updatedAt || persona.createdAt || new Date().toISOString(),
    imageDataUrl,
    imageThumbnailDataUrl,
    imagePath,
    thumbnailPath,
    imageUrl,
    thumbnailUrl,
    hasImage: Boolean(imageDataUrl || imagePath || imageUrl || imageThumbnailDataUrl || thumbnailPath || thumbnailUrl || persona.hasImage),
    hasThumbnail: Boolean(imageThumbnailDataUrl || thumbnailPath || thumbnailUrl || persona.hasThumbnail),
    imageLoaded: hasImageField || Boolean(imagePath || imageUrl) || !persona.hasImage,
    thumbnailLoaded: hasThumbnailField || Boolean(thumbnailPath || thumbnailUrl) || !persona.hasImage
  };
}

function toStoredCard(card) {
  const storedCard = cloneCard(card);
  delete storedCard.hasImage;
  delete storedCard.hasThumbnail;
  delete storedCard.imageLoaded;
  delete storedCard.thumbnailLoaded;
  delete storedCard.imageUrl;
  delete storedCard.thumbnailUrl;
  if (!storedCard.imageDataUrl) delete storedCard.imageDataUrl;
  if (!storedCard.imageThumbnailDataUrl) delete storedCard.imageThumbnailDataUrl;
  if (!storedCard.imagePath) delete storedCard.imagePath;
  if (!storedCard.thumbnailPath) delete storedCard.thumbnailPath;
  return storedCard;
}

function toStoredPersona(persona) {
  const storedPersona = cloneCard(persona);
  delete storedPersona.hasImage;
  delete storedPersona.hasThumbnail;
  delete storedPersona.imageLoaded;
  delete storedPersona.thumbnailLoaded;
  delete storedPersona.imageUrl;
  delete storedPersona.thumbnailUrl;
  if (!storedPersona.imageDataUrl) delete storedPersona.imageDataUrl;
  if (!storedPersona.imageThumbnailDataUrl) delete storedPersona.imageThumbnailDataUrl;
  if (!storedPersona.imagePath) delete storedPersona.imagePath;
  if (!storedPersona.thumbnailPath) delete storedPersona.thumbnailPath;
  return storedPersona;
}

function cardsForRecovery(cards = state.cards) {
  const recoveryCards = cards.map(toStoredCard);
  if (!state.draftCard) return recoveryCards;
  const draftCard = toStoredCard(state.draftCard);
  const draftIndex = recoveryCards.findIndex((card) => card.id === draftCard.id);
  if (draftIndex >= 0) {
    recoveryCards[draftIndex] = draftCard;
  } else {
    recoveryCards.unshift(draftCard);
  }
  return recoveryCards;
}

function saveRecoverySnapshot(cards = cardsForRecovery()) {
  localStorage.setItem(recoveryStorageKey, JSON.stringify(cards));
}

function restoreRecoverySnapshot(serverCards) {
  let recoveryCards = [];
  try {
    recoveryCards = JSON.parse(localStorage.getItem(recoveryStorageKey)) || [];
  } catch {
    recoveryCards = [];
  }

  if (!Array.isArray(recoveryCards) || !recoveryCards.length) return serverCards;

  const mergedCards = serverCards.map(normalizeStoredCard);
  for (const recoveryCard of recoveryCards.map(normalizeStoredCard)) {
    const index = mergedCards.findIndex((card) => card.id === recoveryCard.id);
    if (index >= 0) {
      const serverTime = cardDateValue(mergedCards[index], "updatedAt");
      const recoveryTime = cardDateValue(recoveryCard, "updatedAt");
      if (recoveryTime >= serverTime) mergedCards[index] = recoveryCard;
    } else {
      mergedCards.unshift(recoveryCard);
    }
  }

  localStorage.removeItem(recoveryStorageKey);
  showToast("Recovered unsaved changes from before sign-in.");
  return mergedCards;
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
    const response = await fetch("/api/cards/summary");
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

  const normalizedServerCards = Array.isArray(serverCards)
    ? serverCards.map(normalizeStoredCard)
    : [];
  state.cards = restoreRecoverySnapshot(normalizedServerCards);
  state.activeId = state.cards[0]?.id || null;
}

async function loadPersonas() {
  let serverPersonas = [];
  try {
    const response = await fetch("/api/personas/summary");
    if (!response.ok) {
      await redirectIfAuthRequired(response);
      throw new Error(`Could not load personas: ${response.status}`);
    }
    serverPersonas = await response.json();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      redirectToLogin();
      throw error;
    }
    try {
      serverPersonas = JSON.parse(localStorage.getItem(personaStorageKey)) || [];
      showToast("Using browser persona backup. Could not read the app data folder.");
    } catch {
      serverPersonas = [];
    }
  }

  let browserPersonas = [];
  try {
    browserPersonas = JSON.parse(localStorage.getItem(personaStorageKey)) || [];
  } catch {
    browserPersonas = [];
  }

  if (!serverPersonas.length && browserPersonas.length) {
    serverPersonas = browserPersonas;
    await persistPersonas(serverPersonas);
  }

  state.personas = Array.isArray(serverPersonas)
    ? serverPersonas.map(normalizeStoredPersona)
    : [];
  state.activePersonaId = state.personas[0]?.id || null;
}

function cardDateValue(card, key) {
  return new Date(card[key] || card.updatedAt || card.createdAt || 0).getTime() || 0;
}

async function persistCards(cards = state.cards) {
  try {
    const response = await fetch("/api/cards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cards.map(toStoredCard))
    });
    if (!response.ok) {
      await redirectIfAuthRequired(response);
      throw new Error(`Could not save cards: ${response.status}`);
    }
    localStorage.removeItem(storageKey);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      saveRecoverySnapshot(cardsForRecovery(cards));
      redirectToLogin();
      return;
    }
    console.error(error);
    localStorage.setItem(storageKey, JSON.stringify(cards));
    showToast("Could not save to the app folder. Saved a browser backup.");
  }
}

async function persistPersonas(personas = state.personas) {
  try {
    const response = await fetch("/api/personas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(personas.map(toStoredPersona))
    });
    if (!response.ok) {
      await redirectIfAuthRequired(response);
      throw new Error(`Could not save personas: ${response.status}`);
    }
    localStorage.removeItem(personaStorageKey);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      localStorage.setItem(personaStorageKey, JSON.stringify(personas.map(toStoredPersona)));
      redirectToLogin();
      return;
    }
    console.error(error);
    localStorage.setItem(personaStorageKey, JSON.stringify(personas));
    showToast("Could not save personas to the app folder. Saved a browser backup.");
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

function activePersona() {
  return state.personas.find((persona) => persona.id === state.activePersonaId) || state.personas[0];
}

function editorPersona() {
  return state.draftPersona || activePersona();
}

function cardThumbnailSource(card) {
  return card?.imageThumbnailDataUrl || card?.thumbnailUrl || "";
}

function itemThumbnailSource(item) {
  return item?.imageThumbnailDataUrl || item?.thumbnailUrl || "";
}

async function loadFullCard(card) {
  if (!card || card.imageLoaded || !card.hasImage) return card;
  const response = await fetch(`/api/cards/${encodeURIComponent(card.id)}`);
  if (!response.ok) {
    await redirectIfAuthRequired(response);
    throw new Error(`Could not load card: ${response.status}`);
  }
  const fullCard = normalizeStoredCard(await response.json());
  const index = state.cards.findIndex((item) => item.id === fullCard.id);
  if (index !== -1) state.cards[index] = fullCard;
  return fullCard;
}

async function loadFullImageForExport(card) {
  if (!card || card.imageDataUrl || !card.hasImage) return card;
  const fullCard = await loadFullCard(card);
  if (fullCard.imageDataUrl || !fullCard.imageUrl) return fullCard;
  fullCard.imageDataUrl = await urlToDataUrl(fullCard.imageUrl);
  fullCard.imageLoaded = true;
  return fullCard;
}

async function loadFullPersonaImage(persona) {
  if (!persona || persona.imageDataUrl || !persona.hasImage) return persona;
  if (!persona.imageUrl) return persona;
  persona.imageDataUrl = await urlToDataUrl(persona.imageUrl);
  persona.imageLoaded = true;
  return persona;
}

function needsThumbnailMigration(card) {
  return Boolean(card?.hasImage && !card.imageThumbnailDataUrl && !card.thumbnailUrl);
}

function queueThumbnailMigration() {
  const missingCount = state.cards.filter(needsThumbnailMigration).length;
  if (!missingCount || state.isMigratingThumbnails) return;
  const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 250));
  schedule(() => migrateThumbnails());
}

async function migrateThumbnails() {
  if (state.isMigratingThumbnails) return;
  state.isMigratingThumbnails = true;
  const missing = state.cards.filter(needsThumbnailMigration);
  if (!missing.length) {
    state.isMigratingThumbnails = false;
    return;
  }

  showToast(`Creating ${missing.length} image thumbnails...`);
  let migratedCount = 0;

  for (const summaryCard of missing) {
    const currentCard = state.cards.find((card) => card.id === summaryCard.id);
    if (!needsThumbnailMigration(currentCard)) continue;

    try {
      const fullCard = await loadFullImageForExport(currentCard);
      if (!fullCard?.imageDataUrl) continue;
      fullCard.imageThumbnailDataUrl = await createThumbnailDataUrl(fullCard.imageDataUrl);
      fullCard.hasImage = true;
      fullCard.hasThumbnail = true;
      fullCard.thumbnailLoaded = true;
      fullCard.imageDataUrl = "";
      fullCard.imageLoaded = false;

      if (state.draftCard?.id === fullCard.id && !state.isDirty) {
        state.draftCard = cloneCard(fullCard);
        if (isEditorVisible()) writeForm(state.draftCard);
      }

      renderLibrary();
      await persistCards();
      migratedCount += 1;
      await wait(80);
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        redirectToLogin();
        return;
      }
      console.error(error);
    }
  }

  state.isMigratingThumbnails = false;
  if (migratedCount) showToast(`Created ${migratedCount} image thumbnails.`);
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

    if (state.sortField === "updatedAt" || state.sortField === "createdAt") {
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

function filteredPersonas() {
  const query = state.search.trim().toLowerCase();
  const personas = state.personas.filter((persona) => {
    const haystack = [persona.name, persona.description].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return personas.sort((first, second) => {
    let firstValue;
    let secondValue;

    if (state.sortField === "updatedAt" || state.sortField === "createdAt") {
      firstValue = cardDateValue(first, state.sortField);
      secondValue = cardDateValue(second, state.sortField);
    } else {
      firstValue = (first.name || "Untitled persona").toLowerCase();
      secondValue = (second.name || "Untitled persona").toLowerCase();
    }

    const direction = state.sortDirection === "desc" ? -1 : 1;
    if (firstValue > secondValue) return direction;
    if (firstValue < secondValue) return -direction;
    return 0;
  });
}

function activeLibraryPageKey() {
  return state.activeLibraryType === "personas" ? "personas" : "characters";
}

function resetActiveLibraryPage() {
  state.libraryPages[activeLibraryPageKey()] = 1;
}

function paginatedLibraryItems(items) {
  const pageKey = activeLibraryPageKey();
  const pageCount = Math.max(1, Math.ceil(items.length / libraryPageSize));
  const currentPage = Math.min(Math.max(1, state.libraryPages[pageKey] || 1), pageCount);
  state.libraryPages[pageKey] = currentPage;
  const start = (currentPage - 1) * libraryPageSize;
  return {
    currentPage,
    pageCount,
    pageItems: items.slice(start, start + libraryPageSize)
  };
}

function renderLibrary() {
  const isPersonas = state.activeLibraryType === "personas";
  const items = isPersonas ? filteredPersonas() : filteredCards();
  const { currentPage, pageCount, pageItems } = paginatedLibraryItems(items);
  const totalItems = isPersonas ? state.personas.length : state.cards.length;

  elements.libraryGrid.innerHTML = "";
  elements.librarySectionTitle.textContent = `${isPersonas ? "Personas" : "Characters"} (${items.length})`;
  elements.emptyState.hidden = items.length > 0;
  elements.pagination.hidden = items.length <= libraryPageSize;
  elements.paginationStatus.textContent = `Page ${currentPage} of ${pageCount}`;
  elements.paginationPrev.disabled = currentPage <= 1;
  elements.paginationNext.disabled = currentPage >= pageCount;
  elements.libraryGrid.classList.toggle("is-list-view", state.viewMode === "list");
  elements.filterMenu.hidden = isPersonas;
  elements.importInput.closest(".file-button").style.display = isPersonas ? "none" : "";
  updateNewButtonLabel(isPersonas ? "New persona" : "New character");
  elements.search.placeholder = isPersonas ? "Name, description..." : "Name, tag, creator...";
  elements.charactersTab.classList.toggle("active", !isPersonas);
  elements.personasTab.classList.toggle("active", isPersonas);
  renderFilterTags();
  updateSortButtons();
  updateViewModeButton();

  if (!totalItems) {
    elements.emptyState.querySelector("h3").textContent = isPersonas ? "No personas yet" : "No characters yet";
    elements.emptyState.querySelector("p").textContent = isPersonas
      ? "Create a persona and add the text you want to copy into SillyTavern."
      : "Create a new character or import a JSON card.";
  } else {
    elements.emptyState.querySelector("h3").textContent = isPersonas ? "No personas found" : "No characters found";
    elements.emptyState.querySelector("p").textContent = isPersonas
      ? "Clear your search to see more personas."
      : "Create a new character or clear your search.";
  }

  for (const item of pageItems) {
    if (isPersonas) {
      renderPersonaLibraryItem(item);
    } else {
      renderCharacterLibraryItem(item);
    }
  }
}

function updateNewButtonLabel(label) {
  const text = elements.newButton.querySelector("span");
  if (text) {
    text.textContent = label;
    return;
  }
  elements.newButton.textContent = label;
}

function renderCharacterLibraryItem(card) {
    const libraryDescription =
      card.data.creator_notes?.trim() || card.data.description?.trim() || "No description yet.";
    const updatedDate = formatShortDate(card.updatedAt);
    const createdDate = formatShortDate(card.createdAt || card.updatedAt);
    const subtitle = [card.data.creator, card.data.character_version]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" - ");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "library-item";
    button.innerHTML = `
      <div class="library-item__top">
        <div class="library-initial">
          ${cardThumbnailSource(card)
            ? `<img src="${escapeHtml(cardThumbnailSource(card))}" alt="" />`
            : escapeHtml((card.data.name || "U").slice(0, 1).toUpperCase())}
        </div>
        <div>
          <h3>${escapeHtml(card.data.name || "Untitled")}</h3>
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
        </div>
      </div>
      <p>${escapeHtml(shorten(libraryDescription, 150))}</p>
      <div class="library-item__meta">
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

function renderPersonaLibraryItem(persona) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "library-item";
  button.innerHTML = `
    <div class="library-item__top">
      <div class="library-initial">
        ${itemThumbnailSource(persona)
          ? `<img src="${escapeHtml(itemThumbnailSource(persona))}" alt="" />`
          : escapeHtml((persona.name || "P").slice(0, 1).toUpperCase())}
      </div>
      <div>
        <h3>${escapeHtml(persona.name || "Untitled persona")}</h3>
      </div>
    </div>
    <p>${escapeHtml(shorten(persona.description || "No description yet.", 150))}</p>
  `;
  button.addEventListener("click", () => {
    state.activePersonaId = persona.id;
    showPersonaEditor();
  });
  elements.libraryGrid.append(button);
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
  const name = data.name?.trim() || "Untitled";

  elements.title.textContent = name;
  elements.previewName.textContent = name;
  elements.portraitInitial.textContent = name.slice(0, 1).toUpperCase();
  const portraitSource = cardThumbnailSource(editorCard());
  elements.portraitImage.src = portraitSource;
  elements.portraitImage.hidden = !portraitSource;
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
}

function readPersonaForm() {
  const persona = editorPersona();
  if (!persona) return;
  const formData = new FormData(elements.personaForm);
  persona.name = formData.get("name") || "";
  persona.description = formData.get("description") || "";
  persona.updatedAt = new Date().toISOString();
}

function writePersonaForm(persona) {
  elements.personaName.value = persona.name || "";
  elements.personaDescription.value = persona.description || "";
  updatePersonaPreview();
}

function updatePersonaPreview() {
  const formData = new FormData(elements.personaForm);
  const name = formData.get("name")?.trim() || "Untitled persona";
  const description = formData.get("description")?.trim() || "";
  const persona = editorPersona();
  const portraitSource = itemThumbnailSource(persona);

  elements.personaTitle.textContent = name;
  elements.personaPreviewName.textContent = name;
  elements.personaPortraitInitial.textContent = name.slice(0, 1).toUpperCase();
  elements.personaPortraitImage.src = portraitSource;
  elements.personaPortraitImage.hidden = !portraitSource;
  elements.personaPreviewDescription.textContent = description || "No description yet.";
}

function syncPersonaDraftToLibrary() {
  if (!state.draftPersona) return activePersona();
  const nextPersona = cloneCard(state.draftPersona);
  nextPersona.updatedAt = new Date().toISOString();
  const index = state.personas.findIndex((persona) => persona.id === nextPersona.id);
  if (index >= 0) {
    state.personas[index] = nextPersona;
  } else {
    state.personas.unshift(nextPersona);
  }
  state.activePersonaId = nextPersona.id;
  state.draftPersona = cloneCard(nextPersona);
  return nextPersona;
}

function setPersonaSaveStatus(isDirty) {
  state.isPersonaDirty = isDirty;
  elements.personaSaveStatus.textContent = isDirty ? "Unsaved changes" : "Saved";
  elements.personaSaveStatus.classList.toggle("is-dirty", isDirty);
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
      <svg class="material-icon" aria-hidden="true" viewBox="0 -960 960 960">
        <path d="M280-280h120q17 0 28.5 11.5T440-240q0 17-11.5 28.5T400-200H240q-17 0-28.5-11.5T200-240v-160q0-17 11.5-28.5T240-440q17 0 28.5 11.5T280-400v120Zm400-400H560q-17 0-28.5-11.5T520-720q0-17 11.5-28.5T560-760h160q17 0 28.5 11.5T760-720v160q0 17-11.5 28.5T720-520q-17 0-28.5-11.5T680-560v-120Z" />
      </svg>
    `;
    button.setAttribute("aria-label", `Open ${getTextareaLabel(textarea)} in fullscreen editor`);
    shell.append(button);

    textarea.dataset.enhancedEditor = "true";
  });
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
  elements.fullscreenEditor.hidden = false;
  document.body.classList.add("modal-open");
  elements.fullscreenEditorTextarea.focus();
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
  elements.personaForm
    .querySelectorAll(".textarea-shell.is-active")
    .forEach((shell) => shell.classList.remove("is-active"));
  elements.personaForm
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
  state.draftPersona = null;
  setSaveStatus(false);
  setPersonaSaveStatus(false);
  state.view = "library";
  elements.libraryView.classList.remove("is-hidden");
  elements.editorView.classList.add("is-hidden");
  elements.personaEditorView.classList.add("is-hidden");
  renderLibrary();
  requestAnimationFrame(() => window.scrollTo(0, state.libraryScrollY));
}

async function showEditor() {
  if (state.view === "library") state.libraryScrollY = window.scrollY;
  state.view = "editor";
  elements.libraryView.classList.add("is-hidden");
  elements.editorView.classList.remove("is-hidden");
  elements.personaEditorView.classList.add("is-hidden");
  window.scrollTo(0, 0);
  const card = activeCard();
  state.draftCard = card ? cloneCard(card) : null;
  if (state.draftCard) writeForm(state.draftCard);
  setSaveStatus(false);
  enhanceTextareas(elements.form);
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

function showPersonaEditor() {
  if (state.view === "library") state.libraryScrollY = window.scrollY;
  state.view = "persona-editor";
  elements.libraryView.classList.add("is-hidden");
  elements.editorView.classList.add("is-hidden");
  elements.personaEditorView.classList.remove("is-hidden");
  window.scrollTo(0, 0);
  const persona = activePersona();
  state.draftPersona = persona ? cloneCard(persona) : null;
  if (state.draftPersona) writePersonaForm(state.draftPersona);
  setPersonaSaveStatus(false);
  enhanceTextareas(elements.personaForm);
  requestAnimationFrame(() => window.scrollTo(0, 0));
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
  if (state.activeLibraryType === "personas") {
    createPersona();
    return;
  }
  state.draftCard = null;
  const card = emptyCard();
  card.data.name = "New card";
  state.cards.unshift(card);
  state.activeId = card.id;
  persistCards();
  showEditor();
}

function createPersona() {
  state.draftPersona = null;
  const persona = emptyPersona();
  persona.name = "New persona";
  state.personas.unshift(persona);
  state.activePersonaId = persona.id;
  persistPersonas();
  showPersonaEditor();
}

function saveActivePersona() {
  readPersonaForm();
  syncPersonaDraftToLibrary();
  persistPersonas();
  setPersonaSaveStatus(false);
  renderLibrary();
  showToast("Persona saved to the local library.");
}

async function duplicateCard() {
  readForm();
  let current = editorCard();
  try {
    current = await loadFullImageForExport(current);
    if (state.draftCard && current !== state.draftCard) {
      state.draftCard.imageDataUrl = current.imageDataUrl || "";
      state.draftCard.imageLoaded = current.imageLoaded;
      current = state.draftCard;
    }
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      saveRecoverySnapshot();
      redirectToLogin();
      return;
    }
    console.error(error);
    showToast("Could not load the full image before duplicating.");
    return;
  }
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
  const isPersona = state.view === "persona-editor";
  const current = isPersona ? activePersona() : activeCard();
  if (!current) return;
  pendingDeleteId = current.id;
  elements.deleteConfirmMessage.textContent = `Delete "${isPersona ? current.name || "Untitled persona" : current.data.name || "Untitled"}"? This action cannot be undone.`;
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
  const isPersona = state.view === "persona-editor";
  const current = isPersona
    ? state.personas.find((persona) => persona.id === pendingDeleteId)
    : state.cards.find((card) => card.id === pendingDeleteId);
  if (!current) {
    closeDeleteConfirm();
    return;
  }

  if (isPersona) {
    state.personas = state.personas.filter((persona) => persona.id !== current.id);
    state.activePersonaId = state.personas[0]?.id || null;
    persistPersonas();
  } else {
    state.cards = state.cards.filter((card) => card.id !== current.id);
    state.activeId = state.cards[0]?.id || null;
    persistCards();
  }
  closeDeleteConfirm();
  showLibrary();
  showToast(isPersona ? "Persona deleted." : "Card deleted.");
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
  let card = editorCard();
  try {
    card = await loadFullImageForExport(card);
    if (state.draftCard && card !== state.draftCard) {
      state.draftCard.imageDataUrl = card.imageDataUrl || "";
      state.draftCard.imageLoaded = card.imageLoaded;
      card = state.draftCard;
    }
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      saveRecoverySnapshot();
      redirectToLogin();
      return;
    }
    console.error(error);
    showToast("Could not load the full image for export.");
    return;
  }
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

async function copyActivePersonaDescription() {
  readPersonaForm();
  const persona = editorPersona();
  if (!persona) return;
  const text = persona.description || "";
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      copyTextFallback(text);
    }
    showToast("Persona description copied.");
  } catch (error) {
    try {
      copyTextFallback(text);
      showToast("Persona description copied.");
    } catch (fallbackError) {
      console.error(error, fallbackError);
      showToast("Could not copy the persona description.");
    }
  }
}

async function downloadActivePersonaImage() {
  readPersonaForm();
  let persona = editorPersona();
  if (!persona?.hasImage && !persona?.imageDataUrl) {
    showToast("This persona has no image.");
    return;
  }
  try {
    persona = await loadFullPersonaImage(persona);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      redirectToLogin();
      return;
    }
    console.error(error);
    showToast("Could not load the persona image.");
    return;
  }
  if (!persona.imageDataUrl) {
    showToast("This persona has no image.");
    return;
  }
  const response = await fetch(persona.imageDataUrl);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
  anchor.href = url;
  anchor.download = `${slugify(persona.name || "persona-image")}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Persona image downloaded.");
}

async function importCard(file) {
  const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  if (isPng) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const json = readCardJsonFromPng(bytes);
    const card = normalizeImportedCard(json);
    card.imageDataUrl = await fileToDataUrl(file);
    card.imageThumbnailDataUrl = await createThumbnailDataUrl(card.imageDataUrl);
    card.hasImage = true;
    card.hasThumbnail = true;
    card.imageLoaded = true;
    card.thumbnailLoaded = true;
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
  card.imageThumbnailDataUrl = await createThumbnailDataUrl(card.imageDataUrl);
  card.hasImage = true;
  card.hasThumbnail = true;
  card.imageLoaded = true;
  card.thumbnailLoaded = true;
  setSaveStatus(true);
  updatePreview();
}

async function setPersonaImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const persona = editorPersona();
  if (!persona) return;
  persona.imageDataUrl = await fileToDataUrl(file);
  persona.imageThumbnailDataUrl = await createThumbnailDataUrl(persona.imageDataUrl);
  persona.hasImage = true;
  persona.hasThumbnail = true;
  persona.imageLoaded = true;
  persona.thumbnailLoaded = true;
  setPersonaSaveStatus(true);
  updatePersonaPreview();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function urlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    await redirectIfAuthRequired(response);
    throw new Error(`Could not load image: ${response.status}`);
  }
  const blob = await response.blob();
  return fileToDataUrl(blob);
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

async function createThumbnailDataUrl(dataUrl, maxSize = 384) {
  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.72);
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

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy command failed");
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

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
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
elements.personaForm.addEventListener("input", () => {
  updatePersonaPreview();
  setPersonaSaveStatus(true);
});
elements.form.addEventListener("click", (event) => {
  const button = event.target.closest?.(".expand-editor-button");
  if (!button) return;
  const textarea = button.closest(".textarea-shell")?.querySelector("textarea");
  if (textarea) openFullscreenEditor(textarea);
});
elements.personaForm.addEventListener("click", (event) => {
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
elements.personaForm.addEventListener("pointerover", (event) => {
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
elements.personaForm.addEventListener("pointerout", (event) => {
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
elements.personaForm.addEventListener("focusin", (event) => {
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
elements.personaForm.addEventListener("pointerdown", (event) => {
  const shell = event.target.closest?.(".textarea-shell");
  elements.personaForm
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
  elements.personaForm
    .querySelectorAll(".textarea-shell.is-active")
    .forEach((shell) => shell.classList.remove("is-active"));
});
elements.fullscreenEditorClose.addEventListener("click", closeFullscreenEditor);
elements.fullscreenEditorBack.addEventListener("click", () => closeFullscreenEditor({ applyChanges: false }));
elements.fullscreenMarkdownToggle.addEventListener("click", () => {
  setMarkdownPreviewActive(!isMarkdownPreviewActive);
});
elements.fullscreenEditorTextarea.addEventListener("input", () => {
  if (isMarkdownPreviewActive) setMarkdownPreviewActive(true);
});
elements.fullscreenEditor.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeFullscreenEditor();
});
elements.search.addEventListener("input", (event) => {
  state.search = event.target.value;
  resetActiveLibraryPage();
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
  resetActiveLibraryPage();
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
    resetActiveLibraryPage();
    renderLibrary();
  });
});
elements.viewModeButton.addEventListener("click", () => {
  state.viewMode = state.viewMode === "grid" ? "list" : "grid";
  renderLibrary();
});
elements.paginationPrev.addEventListener("click", () => {
  const pageKey = activeLibraryPageKey();
  state.libraryPages[pageKey] = Math.max(1, (state.libraryPages[pageKey] || 1) - 1);
  renderLibrary();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
elements.paginationNext.addEventListener("click", () => {
  const pageKey = activeLibraryPageKey();
  state.libraryPages[pageKey] = (state.libraryPages[pageKey] || 1) + 1;
  renderLibrary();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
elements.charactersTab.addEventListener("click", () => {
  state.activeLibraryType = "characters";
  state.selectedTags.clear();
  resetActiveLibraryPage();
  renderLibrary();
});
elements.personasTab.addEventListener("click", () => {
  state.activeLibraryType = "personas";
  state.selectedTags.clear();
  resetActiveLibraryPage();
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
elements.personaBackButton.addEventListener("click", showLibrary);
elements.saveButton.addEventListener("click", saveActiveCard);
elements.personaSaveButton.addEventListener("click", saveActivePersona);
elements.personaCopyButton.addEventListener("click", copyActivePersonaDescription);
elements.personaDownloadImageButton.addEventListener("click", downloadActivePersonaImage);
elements.exportButton.addEventListener("click", exportActiveCard);
elements.exportPngButton.addEventListener("click", exportActiveCardPng);
elements.duplicateButton.addEventListener("click", duplicateCard);
elements.deleteButton.addEventListener("click", requestDeleteCard);
elements.personaDeleteButton.addEventListener("click", requestDeleteCard);
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
elements.personaImageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    await setPersonaImage(file);
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
await loadPersonas();
enhanceTextareas(elements.form);
enhanceTextareas(elements.personaForm);
showLibrary();
queueThumbnailMigration();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Could not register service worker.", error);
    });
  });
}
