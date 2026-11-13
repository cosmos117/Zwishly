// Adds an "Analyze on Zwishly" button to Chess.com and Lichess game pages.
// The button floats over the page instead of being inserted into the site's own markup,
// so it keeps working when either site changes its layout.
(() => {
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  // Lichess pages whose address has the same shape as a game id.
  const LICHESS_PAGES = new Set(['analysis', 'practice', 'training', 'streamer', 'features', 'calendar', 'insights', 'timeline']);

  function currentGame() {
    const path = location.pathname;
    if (location.hostname === 'lichess.org') {
      const match = path.match(/^\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:\/(?:white|black))?\/?$/);
      return match && !LICHESS_PAGES.has(match[1]) ? { site: 'lichess', id: match[1] } : null;
    }
    const match = path.match(/^\/(?:analysis\/)?game\/(?:(live|daily)\/)?(\d+)/) || path.match(/^\/(live|daily)\/game\/(\d+)/);
    return match ? { site: 'chesscom', kinds: match[1] ? [match[1]] : ['live', 'daily'], id: match[2] } : null;
  }

  function zwishlyLink(gameUrl, hints = {}) {
    const params = new URLSearchParams({ import: gameUrl });
    for (const [key, value] of Object.entries(hints)) if (value != null && value !== '') params.set(key, value);
    return `${ZWISHLY_URL}#${params}`;
  }

  // Zwishly fetches Lichess games itself, and refuses the ones still being played.
  function lichessLink(game) {
    const flipped = document.querySelector('.cg-wrap')?.classList.contains('orientation-black');
    return zwishlyLink(`https://lichess.org/${game.id}`, { orientation: flipped ? 'black' : 'white' });
  }

  // Chess.com only serves a single game to its own pages, so the moves are read here and passed along.
  async function chessComLink(game) {
    for (const kind of game.kinds) {
      let data;
      try {
        const res = await fetch(`/callback/${kind}/game/${game.id}`, { credentials: 'same-origin' });
        if (!res.ok) continue;
        data = await res.json();
      } catch {
        continue;
      }
      const played = data?.game;
      if (!played) continue;
      // Reviewing a game that is still being played would be engine assistance.
      if (!played.isFinished) throw new Error('This game is still being played. Review it once it’s over.');
      if (played.type !== 'chess') throw new Error('Zwishly reviews standard chess only.');
      if (!played.moveList) continue;
      const headers = played.pgnHeaders ?? {};
      return zwishlyLink(`https://www.chess.com/game/${kind}/${game.id}`, {
        tcn: played.moveList,
        fen: headers.FEN && headers.FEN !== START_FEN ? headers.FEN : '',
        white: headers.White,
        black: headers.Black,
        whiteElo: headers.WhiteElo,
        blackElo: headers.BlackElo,
        result: headers.Result,
        date: headers.Date,
        orientation: data.players?.bottom?.color,
      });
    }
    throw new Error('We couldn’t read this game from Chess.com.');
  }

  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; position: fixed; right: 16px; bottom: 20px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; font: 600 14px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; }
    button { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid #3a3a3d; border-radius: 8px; background: #18181a; color: #f0efe9; font: inherit; cursor: pointer; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); }
    button::before { content: ''; width: 10px; height: 10px; border-radius: 2px; background: #e8683a; }
    button:hover { background: #242427; }
    button:focus-visible { outline: 2px solid #e8683a; outline-offset: 2px; }
    button:disabled { opacity: 0.6; cursor: progress; }
    p { margin: 0; max-width: 260px; padding: 8px 12px; border-radius: 8px; background: #f0efe9; color: #18181a; font-weight: 500; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); }
    [hidden] { display: none; }
  `;
  const note = document.createElement('p');
  note.setAttribute('role', 'status');
  note.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Analyze on Zwishly';
  button.hidden = true;
  root.append(style, note, button);

  let noteTimer;
  function notify(message) {
    note.textContent = message;
    note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note.hidden = true), 5000);
  }

  async function analyze() {
    const game = currentGame();
    if (!game) return notify('Open one of your finished games, then try again.');
    button.disabled = true;
    try {
      const url = game.site === 'lichess' ? lichessLink(game) : await chessComLink(game);
      await chrome.runtime.sendMessage({ type: 'open', url });
    } catch (error) {
      notify(error.message);
    } finally {
      button.disabled = false;
    }
  }

  // Both sites move between pages without reloading, so keep checking where we are.
  function refresh() {
    if (!host.isConnected) document.documentElement.append(host);
    button.hidden = !currentGame();
  }

  button.addEventListener('click', analyze);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'analyze') analyze();
  });
  refresh();
  setInterval(refresh, 1000);
})();
