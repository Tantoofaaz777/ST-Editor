const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 4173);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const cardsFile = path.join(dataDir, "cards.json");

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

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(body);
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

function handleCardsApi(request, response) {
  if (request.method === "GET") {
    fs.readFile(cardsFile, "utf8", (error, data) => {
      if (error && error.code === "ENOENT") {
        send(response, 200, "[]", mimeTypes[".json"]);
        return;
      }
      if (error) {
        send(response, 500, JSON.stringify({ error: "Could not read cards" }), mimeTypes[".json"]);
        return;
      }
      send(response, 200, data || "[]", mimeTypes[".json"]);
    });
    return;
  }

  if (request.method === "PUT") {
    readRequestBody(request, response, (body) => {
      let cards;
      try {
        cards = JSON.parse(body);
      } catch {
        send(response, 400, JSON.stringify({ error: "Invalid JSON" }), mimeTypes[".json"]);
        return;
      }
      if (!Array.isArray(cards)) {
        send(response, 400, JSON.stringify({ error: "Cards payload must be an array" }), mimeTypes[".json"]);
        return;
      }

      fs.mkdir(dataDir, { recursive: true }, (mkdirError) => {
        if (mkdirError) {
          send(response, 500, JSON.stringify({ error: "Could not create data folder" }), mimeTypes[".json"]);
          return;
        }

        const tempFile = `${cardsFile}.tmp`;
        fs.writeFile(tempFile, JSON.stringify(cards, null, 2), "utf8", (writeError) => {
          if (writeError) {
            send(response, 500, JSON.stringify({ error: "Could not save cards" }), mimeTypes[".json"]);
            return;
          }
          fs.rename(tempFile, cardsFile, (renameError) => {
            if (renameError) {
              send(response, 500, JSON.stringify({ error: "Could not finish saving cards" }), mimeTypes[".json"]);
              return;
            }
            send(response, 200, JSON.stringify({ ok: true }), mimeTypes[".json"]);
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

  if (url.pathname === "/api/cards") {
    handleCardsApi(request, response);
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
});
