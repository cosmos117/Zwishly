# Zwishly browser extension

Adds an **Analyze on Zwishly** button to Chess.com and Lichess game pages. One click opens the game on the
Zwishly analysis page, ready to review. Clicking the toolbar icon does the same.

It only works on finished games: reviewing a game that is still being played would be engine assistance.

## Set the site address

`config.js` holds the address of the analysis page. It points at the local dev server by default:

```js
const ZWISHLY_URL = 'http://localhost:5173/analyze.html';
```

Change it to the deployed site before publishing.

## Try it locally

1. Run the site: `npm run dev` in the project root.
2. Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and pick this `extension/` folder.
3. Open a finished game on Chess.com or Lichess and press **Analyze on Zwishly** (bottom right).

After editing a file here, press the reload arrow on the extension's card and refresh the game page.

## How it works

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3. No permissions: the content script runs only on `chess.com` and `lichess.org` |
| `content.js` | Spots game pages, shows the button and builds the link to Zwishly |
| `background.js` | Opens the Zwishly tab and handles the toolbar icon |
| `config.js` | The site address |
| `icons/` | Rendered from `public/favicon.svg` |

The link has the form `analyze.html#import=<game link>`, plus a few hints:

- **Lichess**: only the game link and the board side. The site fetches the game from the Lichess API.
- **Chess.com**: Chess.com serves a single game only to its own pages, so the content script reads the moves
  (in Chess.com's compact `tcn` format), player names, ratings and result there and adds them to the link.
  `src/importers.js` turns them back into a PGN.

Everything travels in the part of the address after `#`, which browsers never send to a server.

## Publish

Zip the contents of this folder and upload it in the
[Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time registration fee).
