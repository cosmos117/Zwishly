# zwishly

Free chess game review. Stockfish 19 runs on the visitor's own device, so analysis costs nothing to serve.
A small Node server adds accounts, so players can link Chess.com and Lichess and find their games waiting.

## Features

- **Live engine analysis**: up to 3 lines, configurable depth, best-move arrows, eval bar
- **Game review**: labels every move — 👑 Glorious (winning sacrifice or only move), 📖 TextBook (named opening theory),
  ★ Best, ✓ Decent, ?! Inaccuracy, ✕ Overlook (missed advantage), ? Error, ?? Blunder —
  computes per-player accuracy, draws a clickable eval graph and shows the best alternative
- **Games**: link **Chess.com** or **Lichess** and browse recent games by **bullet, blitz and rapid**
- **Openings**: name, short guide and the next theory lines for your chosen side (White or Black) at any position
- **Import**: paste a PGN, a Lichess game link, or set up a FEN
- **Browser extension** (`extension/`): adds an “Analyze on Zwishly” button to Chess.com and Lichess game pages
- **Explore**: play moves on the board to create a variation; click any engine move to play the line
- **Great games**: the home page board replays the key moment of a random game from 40 classics in `public/great-games.json` (moves checked against the [PGN Mentor](https://www.pgnmentor.com/) archives)
- Copy FEN/PGN, share a position with `analyze#fen=<FEN>`, open a game with `analyze#import=<game link>`
- Keyboard: ← → Home End to navigate, F to flip; mouse wheel over the board steps through moves
- **Customize** (🎨 button): 4 minimal themes, 14 boards (incl. wood), 10 piece sets, 5 sound styles, toggles for coordinates, arrows, move icons and sound — saved in the browser
- Responsive layout for phones

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 (landing page), /analyze (the app)
```

## Deploy

```bash
npm run build
npm start          # serves dist/ and the API, default port 3000
```

The build also writes Brotli and gzip copies of every text file, which the server sends as they are. Hashed assets are cached for a year,
the engine and piece sets for a week, and pages are always revalidated. Responses carry a Content-Security-Policy, HSTS and related headers.

Needs Node 22.13 or newer and HTTPS in front of it, on a host that keeps files between restarts:
accounts live in a SQLite file. Hosts with a throwaway disk will lose every account on redeploy.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on |
| `DATABASE_PATH` | Where to keep the SQLite file (default `data/zwishly.db`); point it at the persistent disk |
| `TRUST_PROXY` | Number of reverse proxies in front of the app (usually `1`), so rate limits see real client IPs |
| `COOKIE_SECURE` | Set to `false` only for a private plain-HTTP deployment |

`dist/` also works on its own on a static host. Analysis and game lookup still work there; sign-in is hidden.

## Memory

Nearly all of the memory is the Stockfish worker, which reserves a fixed block regardless of its hash setting. It is shut down when idle for a minute, when switched off, and after 30 seconds in a background tab, and restarts on demand.

## Accounts

Sign up to save your theme, board, pieces and display options plus your Chess.com and Lichess usernames across devices.
Email and password, hashed with scrypt. Sessions are random tokens in an HttpOnly cookie, and only the token's hash
is stored. Sign-in is rate limited per IP. `password_hash` is nullable so a provider such as Google can be added later.

Not built yet: password reset and email verification (both need an email service). A linked username is not proven
to belong to the account holder; game data is public either way.

## How it works

| File | Purpose |
| --- | --- |
| `src/engine.js` | UCI wrapper around the Stockfish Web Worker |
| `src/analysis.js` | Win-probability, move classification and accuracy (Lichess-style formulas) |
| `src/tactics.js` | Sacrifice / forced-move / recapture detection for Glorious moves |
| `src/openings.js` + `public/openings.json` | Opening book ([lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0); regenerate with `npm run build-openings` |
| `src/importers.js` | Chess.com and Lichess clients, grouped into bullet, blitz and rapid |
| `extension/` | Chrome extension that sends the game on the current Chess.com or Lichess page to the site; see `extension/README.md` |
| `src/account.js` | Sign-in dialog and the Games tab |
| `server/` | Account API, sessions and database; `static.js` serves the built site with compression, caching and the security policy |
| `scripts/compress.js` | Runs after the build and writes the compressed copies |
| `src/main.js` | Wires the analysis page together |
| `src/app/` | The analysis page, one module per concern: game state, board, engine panel, moves, review, openings, customize |
| `scripts/copy-engine.js` | Copies the engine from `node_modules/stockfish` into `public/engine` |

## License

GPL-3.0 (Stockfish and chessground are GPL-3.0 licensed). Piece sets carry their own permissive licenses — see `public/pieces/LICENSES.md`.
