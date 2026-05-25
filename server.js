const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

loadDotEnv();

const port = Number(process.env.PORT || 4173);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const cardsFile = path.join(dataDir, "cards.json");
const authUser = process.env.ST_EDITOR_USER || "";
const authPassword = process.env.ST_EDITOR_PASSWORD || "";
const sessionSecret = process.env.SESSION_SECRET || "";
const authEnabled = Boolean(authUser && authPassword && sessionSecret);
const sessionCookieName = "st_editor_session";
const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;
const sessionMaxAgeMs = sessionMaxAgeSeconds * 1000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

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
  return pathname === "/styles.css" || pathname.startsWith("/fonts/");
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

function readCards(callback) {
  fs.readFile(cardsFile, "utf8", (error, data) => {
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

function lightCard(card) {
  const { imageDataUrl, ...summary } = card;
  return {
    ...summary,
    hasImage: Boolean(imageDataUrl)
  };
}

function mergeStoredImages(cards, callback) {
  readCards((error, storedCards = []) => {
    if (error) {
      callback(cards);
      return;
    }
    const storedImages = new Map(
      storedCards
        .filter((card) => card && card.id && card.imageDataUrl)
        .map((card) => [card.id, card.imageDataUrl])
    );
    callback(
      cards.map((card) => ({
        ...card,
        imageDataUrl: card.imageDataUrl || storedImages.get(card.id) || ""
      }))
    );
  });
}

function handleCardsApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/cards/summary") {
    readCards((error, cards = []) => {
      if (error) {
        sendJson(request, response, 500, { error: "Could not read cards" });
        return;
      }
      sendJson(request, response, 200, cards.map(lightCard));
    });
    return;
  }

  const singleCardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)$/);
  if (request.method === "GET" && singleCardMatch) {
    const cardId = decodeURIComponent(singleCardMatch[1]);
    readCards((error, cards = []) => {
      if (error) {
        sendJson(request, response, 500, { error: "Could not read cards" });
        return;
      }
      const card = cards.find((item) => item.id === cardId);
      if (!card) {
        sendJson(request, response, 404, { error: "Card not found" });
        return;
      }
      sendJson(request, response, 200, card);
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/cards") {
    fs.readFile(cardsFile, "utf8", (error, data) => {
      if (error && error.code === "ENOENT") {
        sendJson(request, response, 200, "[]");
        return;
      }
      if (error) {
        sendJson(request, response, 500, { error: "Could not read cards" });
        return;
      }
      sendJson(request, response, 200, data || "[]");
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

      fs.mkdir(dataDir, { recursive: true }, (mkdirError) => {
        if (mkdirError) {
          sendJson(request, response, 500, { error: "Could not create data folder" });
          return;
        }

        const tempFile = `${cardsFile}.tmp`;
        mergeStoredImages(cards, (cardsToSave) => {
          fs.writeFile(tempFile, JSON.stringify(cardsToSave, null, 2), "utf8", (writeError) => {
            if (writeError) {
              sendJson(request, response, 500, { error: "Could not save cards" });
              return;
            }
            fs.rename(tempFile, cardsFile, (renameError) => {
              if (renameError) {
                sendJson(request, response, 500, { error: "Could not finish saving cards" });
                return;
              }
              sendJson(request, response, 200, { ok: true });
            });
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
