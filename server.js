const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

loadDotEnv();

const port = Number(process.env.PORT || 4173);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const assetsDir = path.join(dataDir, "assets");
const cardsFile = path.join(dataDir, "cards.json");
const personasFile = path.join(dataDir, "personas.json");
const authUser = process.env.ST_EDITOR_USER || "";
const authPassword = process.env.ST_EDITOR_PASSWORD || "";
const sessionSecret = process.env.SESSION_SECRET || "";
const authEnabled = Boolean(authUser && authPassword && sessionSecret);
const authPartiallyConfigured = !authEnabled && Boolean(authUser || authPassword || sessionSecret);
const sessionCookieName = "st_editor_session";
const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;
const sessionMaxAgeMs = sessionMaxAgeSeconds * 1000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ttf": "font/ttf"
};

if (authPartiallyConfigured) {
  throw new Error(
    "Incomplete auth configuration: ST_EDITOR_USER, ST_EDITOR_PASSWORD, and SESSION_SECRET must all be set together."
  );
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function sendWithHeaders(response, status, body, contentType, headers) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(body);
}

function sendAsset(response, status, body, contentType) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=31536000, immutable"
  });
  response.end(body);
}

function acceptsGzip(request) {
  return String(request.headers["accept-encoding"] || "")
    .split(",")
    .some((encoding) => encoding.trim().toLowerCase().startsWith("gzip"));
}

function sendJson(request, response, status, body) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  if (!acceptsGzip(request)) {
    send(response, status, payload, mimeTypes[".json"]);
    return;
  }

  zlib.gzip(payload, (error, compressed) => {
    if (error) {
      send(response, status, payload, mimeTypes[".json"]);
      return;
    }
    sendWithHeaders(response, status, compressed, mimeTypes[".json"], {
      "Content-Encoding": "gzip",
      Vary: "Accept-Encoding"
    });
  });
}

function parseCookies(request) {
  const cookies = {};
  for (const part of (request.headers.cookie || "").split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name) continue;
    const rawValue = valueParts.join("=");
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

function signSession(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSessionCookie() {
  const createdAt = String(Date.now());
  const user = Buffer.from(authUser, "utf8").toString("base64url");
  const payload = `${user}.${createdAt}`;
  const signature = signSession(payload);
  return `${payload}.${signature}`;
}

function isAuthenticated(request) {
  if (!authEnabled) return true;
  const cookie = parseCookies(request)[sessionCookieName];
  if (!cookie) return false;
  const parts = cookie.split(".");
  if (parts.length !== 3) return false;
  let user;
  const createdAt = Number(parts[1]);
  try {
    user = Buffer.from(parts[0], "base64url").toString("utf8");
  } catch {
    return false;
  }
  const payload = `${parts[0]}.${parts[1]}`;
  if (user !== authUser) return false;
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > sessionMaxAgeMs) return false;
  const expected = signSession(payload);
  try {
    return crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected));
  } catch {
    return false;
  }
}

function loginPage(errorMessage = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ST Editor Login</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="login-page">
    <main class="login-card">
      <div class="mark">ST</div>
      <h1>ST Editor</h1>
      <p>Sign in to open your local library.</p>
      ${errorMessage ? `<p class="login-error">${escapeHtml(errorMessage)}</p>` : ""}
      <form method="post" action="/login">
        <label>
          <span>Username</span>
          <input name="username" autocomplete="username" required />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button class="primary" type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function redirect(response, location, headers = {}) {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...headers
  });
  response.end();
}

function forwardedProto(request) {
  return String(request.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

function isSecureRequest(request) {
  return forwardedProto(request) === "https";
}

function handleLogin(request, response) {
  if (!authEnabled) {
    redirect(response, "/");
    return;
  }

  if (request.method === "GET") {
    send(response, 200, loginPage(), mimeTypes[".html"]);
    return;
  }

  if (request.method === "POST") {
    readRequestBody(request, response, (body) => {
      const params = new URLSearchParams(body);
      const username = params.get("username") || "";
      const password = params.get("password") || "";
      if (username === authUser && password === authPassword) {
        const secure = isSecureRequest(request) ? "; Secure" : "";
        sendWithHeaders(response, 302, "", "text/plain; charset=utf-8", {
          Location: "/",
          "Set-Cookie": `${sessionCookieName}=${encodeURIComponent(createSessionCookie())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}${secure}`
        });
        return;
      }
      send(response, 401, loginPage("Wrong username or password."), mimeTypes[".html"]);
    });
    return;
  }

  send(response, 405, "Method not allowed");
}

function handleLogout(request, response) {
  if (request.method !== "POST") {
    send(response, 405, "Method not allowed");
    return;
  }

  redirect(response, "/login", {
    "Set-Cookie": `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  });
}

function isPublicAuthAsset(pathname) {
  return pathname === "/styles.css"
    || pathname === "/manifest.webmanifest"
    || pathname === "/sw.js"
    || pathname.startsWith("/fonts/")
    || pathname.startsWith("/icons/");
}

function sendAuthRequired(response) {
  send(
    response,
    401,
    JSON.stringify({ error: "Authentication required", code: "AUTH_REQUIRED" }),
    mimeTypes[".json"]
  );
}

function readRequestBody(request, response, callback) {
  const chunks = [];
  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > 50 * 1024 * 1024) {
      send(response, 413, JSON.stringify({ error: "Payload too large" }), mimeTypes[".json"]);
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => callback(Buffer.concat(chunks).toString("utf8")));
  request.on("error", () => {
    send(response, 400, JSON.stringify({ error: "Could not read request" }), mimeTypes[".json"]);
  });
}

function readJsonArray(file, callback) {
  fs.readFile(file, "utf8", (error, data) => {
    if (error && error.code === "ENOENT") {
      callback(null, []);
      return;
    }
    if (error) {
      callback(error);
      return;
    }
    try {
      const cards = JSON.parse((data || "[]").replace(/^\uFEFF/, ""));
      callback(null, Array.isArray(cards) ? cards : []);
    } catch (parseError) {
      callback(parseError);
    }
  });
}

function readCards(callback) {
  readJsonArray(cardsFile, callback);
}

function readPersonas(callback) {
  readJsonArray(personasFile, callback);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  try {
    return {
      mimeType,
      bytes: isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload))
    };
  } catch {
    return null;
  }
}

function imageExtension(mimeType) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/png") return ".png";
  return ".bin";
}

function safeAssetId(value) {
  return String(value || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96);
}

function assetUrlFor(collection, itemId, kind, updatedAt) {
  const version = encodeURIComponent(updatedAt || "");
  return `/api/${collection}/${encodeURIComponent(itemId)}/${kind}${version ? `?v=${version}` : ""}`;
}

function assetUrl(cardId, kind, updatedAt) {
  return assetUrlFor("cards", cardId, kind, updatedAt);
}

function writeDataUrlAsset(card, field, pathField, kind, callback) {
  const parsed = parseDataUrl(card[field]);
  if (!parsed) {
    callback(null, false);
    return;
  }

  fs.mkdir(assetsDir, { recursive: true }, (mkdirError) => {
    if (mkdirError) {
      callback(mkdirError);
      return;
    }

    const hash = crypto.createHash("sha256").update(parsed.bytes).digest("hex").slice(0, 16);
    const filename = `${safeAssetId(card.id)}-${kind}-${hash}${imageExtension(parsed.mimeType)}`;
    const relativePath = path.join("assets", filename);
    const targetPath = path.join(dataDir, relativePath);
    fs.writeFile(targetPath, parsed.bytes, (writeError) => {
      if (writeError) {
        callback(writeError);
        return;
      }
      card[pathField] = relativePath.replace(/\\/g, "/");
      delete card[field];
      callback(null, true);
    });
  });
}

function extractCardAssets(card, callback) {
  if (!isRecord(card)) {
    callback(null, false);
    return;
  }

  writeDataUrlAsset(card, "imageDataUrl", "imagePath", "image", (imageError, imageChanged) => {
    if (imageError) {
      callback(imageError);
      return;
    }
    writeDataUrlAsset(
      card,
      "imageThumbnailDataUrl",
      "thumbnailPath",
      "thumbnail",
      (thumbnailError, thumbnailChanged) => {
        if (thumbnailError) {
          callback(thumbnailError);
          return;
        }
        callback(null, Boolean(imageChanged || thumbnailChanged));
      }
    );
  });
}

function extractAssets(cards, callback) {
  const normalizedCards = cards.map((card) => (isRecord(card) ? { ...card } : card));
  let index = 0;
  let changed = false;

  function next(error) {
    if (error) {
      callback(error);
      return;
    }
    if (index >= normalizedCards.length) {
      callback(null, normalizedCards, changed);
      return;
    }
    extractCardAssets(normalizedCards[index], (assetError, cardChanged) => {
      changed = changed || cardChanged;
      index += 1;
      next(assetError);
    });
  }

  next();
}

function writeJsonArray(file, items, callback) {
  fs.mkdir(dataDir, { recursive: true }, (mkdirError) => {
    if (mkdirError) {
      callback(mkdirError);
      return;
    }

    const tempFile = `${file}.tmp`;
    fs.writeFile(tempFile, JSON.stringify(items, null, 2), "utf8", (writeError) => {
      if (writeError) {
        callback(writeError);
        return;
      }
      fs.rename(tempFile, file, callback);
    });
  });
}

function writeCards(cards, callback) {
  writeJsonArray(cardsFile, cards, callback);
}

function writePersonas(personas, callback) {
  writeJsonArray(personasFile, personas, callback);
}

function readMigratedCards(callback) {
  readCards((readError, cards = []) => {
    if (readError) {
      callback(readError);
      return;
    }
    extractAssets(cards, (assetError, migratedCards, changed) => {
      if (assetError) {
        callback(assetError);
        return;
      }
      if (!changed) {
        callback(null, migratedCards);
        return;
      }
      writeCards(migratedCards, (writeError) => {
        if (writeError) {
          callback(writeError);
          return;
        }
        callback(null, migratedCards);
      });
    });
  });
}

function readMigratedPersonas(callback) {
  readPersonas((readError, personas = []) => {
    if (readError) {
      callback(readError);
      return;
    }
    extractAssets(personas, (assetError, migratedPersonas, changed) => {
      if (assetError) {
        callback(assetError);
        return;
      }
      if (!changed) {
        callback(null, migratedPersonas);
        return;
      }
      writePersonas(migratedPersonas, (writeError) => {
        if (writeError) {
          callback(writeError);
          return;
        }
        callback(null, migratedPersonas);
      });
    });
  });
}

function lightCard(card) {
  if (!isRecord(card)) return {};
  const { imageDataUrl, imageThumbnailDataUrl, imagePath, thumbnailPath, ...summary } = card;
  const hasImage = Boolean(imageDataUrl || card.imagePath || imageThumbnailDataUrl || card.thumbnailPath);
  const hasThumbnail = Boolean(imageThumbnailDataUrl || card.thumbnailPath);
  return {
    ...summary,
    hasImage,
    hasThumbnail,
    imageUrl: hasImage ? assetUrl(card.id, "image", card.updatedAt) : "",
    thumbnailUrl: hasThumbnail ? assetUrl(card.id, "thumbnail", card.updatedAt) : ""
  };
}

function lightPersona(persona) {
  if (!isRecord(persona)) return {};
  const { imageDataUrl, imageThumbnailDataUrl, imagePath, thumbnailPath, ...summary } = persona;
  const hasImage = Boolean(imageDataUrl || persona.imagePath || imageThumbnailDataUrl || persona.thumbnailPath);
  const hasThumbnail = Boolean(imageThumbnailDataUrl || persona.thumbnailPath);
  return {
    ...summary,
    hasImage,
    hasThumbnail,
    imageUrl: hasImage ? assetUrlFor("personas", persona.id, "image", persona.updatedAt) : "",
    thumbnailUrl: hasThumbnail ? assetUrlFor("personas", persona.id, "thumbnail", persona.updatedAt) : ""
  };
}

function mergeStoredImages(cards, callback) {
  readMigratedCards((error, storedCards = []) => {
    if (error) {
      callback(cards);
      return;
    }
    const storedImages = new Map(
      storedCards
        .filter((card) => card && card.id && card.imagePath)
        .map((card) => [card.id, card.imagePath])
    );
    const storedThumbnails = new Map(
      storedCards
        .filter((card) => card && card.id && card.thumbnailPath)
        .map((card) => [card.id, card.thumbnailPath])
    );
    callback(
      cards.map((card) => {
        if (!isRecord(card)) return card;
        return {
          ...card,
          imagePath: card.imagePath || storedImages.get(card.id) || "",
          thumbnailPath: card.thumbnailPath || storedThumbnails.get(card.id) || ""
        };
      })
    );
  });
}

function mergeStoredPersonaImages(personas, callback) {
  readMigratedPersonas((error, storedPersonas = []) => {
    if (error) {
      callback(personas);
      return;
    }
    const storedImages = new Map(
      storedPersonas
        .filter((persona) => persona && persona.id && persona.imagePath)
        .map((persona) => [persona.id, persona.imagePath])
    );
    const storedThumbnails = new Map(
      storedPersonas
        .filter((persona) => persona && persona.id && persona.thumbnailPath)
        .map((persona) => [persona.id, persona.thumbnailPath])
    );
    callback(
      personas.map((persona) => {
        if (!isRecord(persona)) return persona;
        return {
          ...persona,
          imagePath: persona.imagePath || storedImages.get(persona.id) || "",
          thumbnailPath: persona.thumbnailPath || storedThumbnails.get(persona.id) || ""
        };
      })
    );
  });
}

function safeAssetPath(relativePath) {
  if (!relativePath) return "";
  const normalized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]/, "");
  const filePath = path.join(dataDir, normalized);
  const relativeToAssets = path.relative(assetsDir, filePath);
  if (relativeToAssets.startsWith("..") || path.isAbsolute(relativeToAssets)) return "";
  return filePath;
}

function sendCardAsset(request, response, cardId, kind) {
  readMigratedCards((error, cards = []) => {
    if (error) {
      sendJson(request, response, 500, { error: "Could not read cards" });
      return;
    }
    const card = cards.find((item) => isRecord(item) && item.id === cardId);
    if (!card) {
      sendJson(request, response, 404, { error: "Card not found" });
      return;
    }

    const relativePath = kind === "thumbnail" ? card.thumbnailPath : card.imagePath;
    const filePath = safeAssetPath(relativePath);
    if (!filePath) {
      sendJson(request, response, 404, { error: "Image not found" });
      return;
    }

    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        sendJson(request, response, 404, { error: "Image not found" });
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      sendAsset(response, 200, data, mimeTypes[extension] || "application/octet-stream");
    });
  });
}

function sendPersonaAsset(request, response, personaId, kind) {
  readMigratedPersonas((error, personas = []) => {
    if (error) {
      sendJson(request, response, 500, { error: "Could not read personas" });
      return;
    }
    const persona = personas.find((item) => isRecord(item) && item.id === personaId);
    if (!persona) {
      sendJson(request, response, 404, { error: "Persona not found" });
      return;
    }

    const relativePath = kind === "thumbnail" ? persona.thumbnailPath : persona.imagePath;
    const filePath = safeAssetPath(relativePath);
    if (!filePath) {
      sendJson(request, response, 404, { error: "Image not found" });
      return;
    }

    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        sendJson(request, response, 404, { error: "Image not found" });
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      sendAsset(response, 200, data, mimeTypes[extension] || "application/octet-stream");
    });
  });
}

function handleCardsApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/cards/summary") {
    readMigratedCards((error, cards = []) => {
      if (error) {
        sendJson(request, response, 500, { error: "Could not read cards" });
        return;
      }
      sendJson(request, response, 200, cards.filter(isRecord).map(lightCard));
    });
    return;
  }

  const assetMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/(thumbnail|image)$/);
  if (request.method === "GET" && assetMatch) {
    sendCardAsset(request, response, decodeURIComponent(assetMatch[1]), assetMatch[2]);
    return;
  }

  const singleCardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)$/);
  if (request.method === "GET" && singleCardMatch) {
    const cardId = decodeURIComponent(singleCardMatch[1]);
    readMigratedCards((error, cards = []) => {
      if (error) {
        sendJson(request, response, 500, { error: "Could not read cards" });
        return;
      }
      const card = cards.find((item) => isRecord(item) && item.id === cardId);
      if (!card) {
        sendJson(request, response, 404, { error: "Card not found" });
        return;
      }
      sendJson(request, response, 200, lightCard(card));
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/cards") {
    readMigratedCards((error, cards = []) => {
      if (error) {
        sendJson(request, response, 500, { error: "Could not read cards" });
        return;
      }
      sendJson(request, response, 200, cards);
    });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/cards") {
    readRequestBody(request, response, (body) => {
      let cards;
      try {
        cards = JSON.parse(body);
      } catch {
        sendJson(request, response, 400, { error: "Invalid JSON" });
        return;
      }
      if (!Array.isArray(cards)) {
        sendJson(request, response, 400, { error: "Cards payload must be an array" });
        return;
      }
      if (!cards.every(isRecord)) {
        sendJson(request, response, 400, { error: "Cards payload entries must be objects" });
        return;
      }

      mergeStoredImages(cards, (cardsToMerge) => {
        extractAssets(cardsToMerge, (assetError, cardsToSave) => {
          if (assetError) {
            sendJson(request, response, 500, { error: "Could not save images" });
            return;
          }
          writeCards(cardsToSave, (writeError) => {
            if (writeError) {
              sendJson(request, response, 500, { error: "Could not save cards" });
              return;
            }
            sendJson(request, response, 200, { ok: true });
          });
        });
      });
    });
    return;
  }

  send(response, 405, JSON.stringify({ error: "Method not allowed" }), mimeTypes[".json"]);
}

function handlePersonasApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/personas/summary") {
    readMigratedPersonas((error, personas = []) => {
      if (error) {
        sendJson(request, response, 500, { error: "Could not read personas" });
        return;
      }
      sendJson(request, response, 200, personas.filter(isRecord).map(lightPersona));
    });
    return;
  }

  const assetMatch = url.pathname.match(/^\/api\/personas\/([^/]+)\/(thumbnail|image)$/);
  if (request.method === "GET" && assetMatch) {
    sendPersonaAsset(request, response, decodeURIComponent(assetMatch[1]), assetMatch[2]);
    return;
  }

  const singlePersonaMatch = url.pathname.match(/^\/api\/personas\/([^/]+)$/);
  if (request.method === "GET" && singlePersonaMatch) {
    const personaId = decodeURIComponent(singlePersonaMatch[1]);
    readMigratedPersonas((error, personas = []) => {
      if (error) {
        sendJson(request, response, 500, { error: "Could not read personas" });
        return;
      }
      const persona = personas.find((item) => isRecord(item) && item.id === personaId);
      if (!persona) {
        sendJson(request, response, 404, { error: "Persona not found" });
        return;
      }
      sendJson(request, response, 200, lightPersona(persona));
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/personas") {
    readMigratedPersonas((error, personas = []) => {
      if (error) {
        sendJson(request, response, 500, { error: "Could not read personas" });
        return;
      }
      sendJson(request, response, 200, personas);
    });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/personas") {
    readRequestBody(request, response, (body) => {
      let personas;
      try {
        personas = JSON.parse(body);
      } catch {
        sendJson(request, response, 400, { error: "Invalid JSON" });
        return;
      }
      if (!Array.isArray(personas)) {
        sendJson(request, response, 400, { error: "Personas payload must be an array" });
        return;
      }
      if (!personas.every(isRecord)) {
        sendJson(request, response, 400, { error: "Personas payload entries must be objects" });
        return;
      }

      mergeStoredPersonaImages(personas, (personasToMerge) => {
        extractAssets(personasToMerge, (assetError, personasToSave) => {
          if (assetError) {
            sendJson(request, response, 500, { error: "Could not save images" });
            return;
          }
          writePersonas(personasToSave, (writeError) => {
            if (writeError) {
              sendJson(request, response, 500, { error: "Could not save personas" });
              return;
            }
            sendJson(request, response, 200, { ok: true });
          });
        });
      });
    });
    return;
  }

  send(response, 405, JSON.stringify({ error: "Method not allowed" }), mimeTypes[".json"]);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/login") {
    handleLogin(request, response);
    return;
  }

  if (url.pathname === "/logout") {
    handleLogout(request, response);
    return;
  }

  if (!isAuthenticated(request)) {
    if (isPublicAuthAsset(url.pathname)) {
      // Let the login page load its CSS and font assets.
    } else if (url.pathname.startsWith("/api/")) {
      sendAuthRequired(response);
      return;
    } else {
      redirect(response, "/login");
      return;
    }
  }

  if (url.pathname === "/api/cards" || url.pathname.startsWith("/api/cards/")) {
    handleCardsApi(request, response, url);
    return;
  }

  if (url.pathname === "/api/personas" || url.pathname.startsWith("/api/personas/")) {
    handlePersonasApi(request, response, url);
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path
    .normalize(decodeURIComponent(requestedPath))
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    send(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(response, 404, "Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    send(response, 200, data, mimeTypes[extension] || "application/octet-stream");
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`ST Editor running at http://localhost:${port}`);
  console.log("Use your computer's local IP with the same port to open it on Android.");
  if (!authEnabled) {
    console.log("Authentication is disabled. Set ST_EDITOR_USER, ST_EDITOR_PASSWORD, and SESSION_SECRET in .env to enable it.");
  }
});
