# ST Editor

Local editor for creating, organizing, importing, and exporting SillyTavern character cards as JSON and PNG.

## How to Run

1. Open a terminal in this folder.
2. Install dependencies:

```powershell
npm install
```

3. Run:

```powershell
npm start
```

4. Open this URL in your browser:

```text
http://localhost:4173
```

To open it on Android, your phone needs to be on the same network as your PC. Use your PC's local IP instead of `localhost`, keeping the same port:

```text
http://YOUR-LOCAL-IP:4173
```

## Current Features

- Manage character cards from a dedicated library screen.
- Create and edit character cards in JSON V2 format.
- Save a local library in the app folder.
- Import `.json` and `.png` character cards.
- Export `.json` and `.png` character cards ready to use in SillyTavern.
- Offline token counting using the GPT-3.5/Turbo tokenizer.
- No login, no AI, and no direct integration with ST folders.

## Local Data

Cards are saved in `data/cards.json` inside this app folder. That file is ignored by Git so personal cards do not get committed by accident.

The repository keeps `data/.gitkeep` so the folder exists after cloning. The app creates `data/cards.json` automatically when cards are saved.

Exporting JSON/PNG and keeping backups is still a good idea.

## VPS Notes

For a simple VPS setup:

```bash
git clone <repo-url>
cd ST-Editor
npm install
npm start
```

For a persistent process, use a process manager such as PM2:

```bash
npm install -g pm2
pm2 start server.js --name st-editor
pm2 save
```

Before exposing the app publicly, add authentication or put it behind a protected reverse proxy.
