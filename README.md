# zwishly

Free chess game review. Stockfish 19 runs on the visitor's own device, so analysis costs nothing to serve.
No accounts: a player types their Chess.com or Lichess username once, and from then on opening the site shows their latest game, already being reviewed.

## Features

- **Your last game, reviewed**: enter a Chess.com or Lichess username on the home page and the newest finished game opens with the review running.
  The username is remembered in the browser, so later visits go straight to the latest game (across both sites if both are saved)
- **Live engine analysis**: up to 3 lines, configurable depth, best-move arrows, eval bar
- **Game review**: labels every move — 👑 Glorious (winning sacrifice or only move), 📖 TextBook (named opening theory),
  ★ Best, ✓ Decent, ?! Inaccuracy, ✕ Overlook (missed advantage), ? Error, ?? Blunder —
  computes per-player accuracy, draws a clickable eval graph and shows the best alternative
- **Games**: browse recent **Chess.com** or **Lichess** games by **bullet, blitz and rapid**; remembered usernames load automatically
- **Openings**: name, short guide and the next theory lines for your chosen side (White or Black) at any position
- **Import**: paste a PGN or set up a FEN
- **Browser extension** (`extension/`): adds an “Analyze on Zwishly” button to Chess.com and Lichess game pages
- **Explore**: play moves on the board to create a variation; click any engine move to play the line
- **Great games**: the home page board replays the key moment of a random game from 40 classics in `public/great-games.json` (moves checked against the [PGN Mentor](https://www.pgnmentor.com/) archives)
- Copy FEN/PGN, share a position with `analyze#fen=<FEN>`, open a game with `analyze#import=<game link>`, the latest game with `analyze#latest`
- Keyboard: ← → Home End to navigate, F to flip; mouse wheel over the board steps through moves
- **Customize**: 4 minimal themes, 14 boards (incl. wood), 10 piece sets, 5 sound styles, toggles for coordinates, arrows, move icons and sound — saved in the browser
- **Installable**: "Add to Home Screen" on a phone gives an app icon that opens on the latest game (`public/manifest.webmanifest`)
- Responsive layout for phones

Everything a player saves (usernames, theme, settings) stays in their own browser. Nothing is stored on a server.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 (landing page), /analyze (the app)
```

## Deploy

```bash
npm run build
npm start          # serves dist/, default port 3000
```

The build also writes Brotli and gzip copies of every text file, which the server sends as they are. Hashed assets are cached for a year,
the engine and piece sets for a week, and pages are always revalidated. Responses carry a Content-Security-Policy, HSTS and related headers.

Needs Node 22.13 or newer and HTTPS in front of it. The only setting is `PORT`. On [Render](https://render.com), choose **New > Blueprint**
and pick this repository; `render.yaml` sets the build and start commands.

`dist/` also works on its own on any static host, since the server holds no data.

## Staying on free plans

- **Sleeping**: Render's free service stops after 15 minutes without traffic and takes about a minute to wake. To keep it awake, add a free
  uptime monitor (for example UptimeRobot) that requests `https://<your-site>/healthz` every 5 minutes. One service running all month
  uses about 744 of Render's 750 free hours, so keep this the only free service in that Render workspace.
- **Bandwidth**: a first visit downloads about 1.3–1.5 MB, mostly the engine; returning visitors use their cache. Check the host's monthly
  allowance as the site grows.
- **Analysis costs nothing to serve**: Stockfish runs in each visitor's browser, and game lookups go from the browser straight to Chess.com and Lichess.

## Memory

Nearly all of the memory is the Stockfish worker, which reserves a fixed block regardless of its hash setting. It is shut down when idle for a minute, when switched off, and after 30 seconds in a background tab, and restarts on demand.

## How it works

| File | Purpose |
| --- | --- |
| `src/engine.js` | UCI wrapper around the Stockfish Web Worker |
| `src/analysis.js` | Win-probability, move classification and accuracy (Lichess-style formulas) |
| `src/tactics.js` | Sacrifice / forced-move / recapture detection for Glorious moves |
| `src/openings.js` + `public/openings.json` | Opening book ([lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0); regenerate with `npm run build-openings` |
| `src/importers.js` | Chess.com and Lichess clients: recent games by time control, the latest game, single games by link |
| `src/player.js` | The remembered Chess.com and Lichess usernames (browser storage) |
| `src/games.js` | The Games tab |
| `src/landing.js` | Home page: username box and the great-games replay |
| `extension/` | Chrome extension that sends the game on the current Chess.com or Lichess page to the site; see `extension/README.md` |
| `server/` | Serves the built site; `static.js` adds compression, caching and the security policy |
| `scripts/compress.js` | Runs after the build and writes the compressed copies |
| `src/main.js` | Wires the analysis page together |
| `src/app/` | The analysis page, one module per concern: game state, board, engine panel, moves, review, openings, customize |
| `scripts/copy-engine.js` | Copies the engine from `node_modules/stockfish` into `public/engine` |

## License

GPL-3.0 (Stockfish and chessground are GPL-3.0 licensed). Piece sets carry their own permissive licenses — see `public/pieces/LICENSES.md`.
