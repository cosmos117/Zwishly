// The engine holds a large fixed block of memory for as long as its worker exists, so
// the worker starts on demand and release() gives that memory back.

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

export class Engine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.readyWaiters = [];
    this.current = null;
    this.pending = null;
    this.multipv = 0;
  }

  get busy() {
    return !!(this.current || this.pending);
  }

  _boot() {
    if (this.worker) return;
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e) => this._onLine(String(e.data));
    this.ready = false;
    this.multipv = 0;
    this._send('uci');
  }

  release() {
    if (!this.worker) return false;
    const interrupted = this.busy;
    for (const job of [this.pending, this.current]) job?.resolve({ bestmove: null, lines: [], depth: 0, stopped: true });
    this.pending = null;
    this.current = null;
    this.worker.terminate();
    this.worker = null;
    this.ready = false;
    this.multipv = 0;
    this.readyWaiters.splice(0).forEach((resume) => resume());
    return interrupted;
  }

  _send(cmd) {
    this.worker?.postMessage(cmd);
  }

  _whenReady() {
    if (this.ready) return Promise.resolve();
    return new Promise((r) => this.readyWaiters.push(r));
  }

  _onLine(line) {
    if (line === 'uciok') {
      this._send('setoption name Hash value 32');
      this._send('isready');
      return;
    }
    if (line === 'readyok') {
      if (!this.ready) {
        this.ready = true;
        this.readyWaiters.forEach((r) => r());
        this.readyWaiters = [];
      }
      return;
    }
    const job = this.current;
    if (!job) return;

    if (line.startsWith('info') && line.includes(' pv ') && !job.stopped) {
      const info = parseInfo(line, job.turn);
      if (!info) return;
      job.lines[info.multipv - 1] = info;
      job.depth = info.depth;
      job.onInfo?.(job.lines.filter(Boolean), info.depth);
    } else if (line.startsWith('bestmove')) {
      const best = line.split(' ')[1];
      this.current = null;
      job.resolve({
        bestmove: best && best !== '(none)' ? best : null,
        lines: job.lines.filter(Boolean),
        depth: job.depth || 0,
        stopped: job.stopped,
      });
      this._startPending();
    }
  }

  analyze(fen, { depth = 18, multipv = 1, movetime, onInfo } = {}) {
    return new Promise((resolve) => {
      const job = { fen, depth, multipv, movetime, onInfo, resolve, lines: [], turn: fen.split(' ')[1], stopped: false };
      if (this.pending) {
        this.pending.resolve({ bestmove: null, lines: [], depth: 0, stopped: true });
      }
      this.pending = job;
      if (this.current) {
        this.current.stopped = true;
        this._send('stop');
      } else {
        this._startPending();
      }
    });
  }

  stop() {
    if (this.pending) {
      this.pending.resolve({ bestmove: null, lines: [], depth: 0, stopped: true });
      this.pending = null;
    }
    if (this.current) {
      this.current.stopped = true;
      this._send('stop');
    }
  }

  async _startPending() {
    const job = this.pending;
    if (!job) return;
    this.pending = null;
    this.current = job;
    this._boot();
    await this._whenReady();
    if (this.current !== job) return;
    if (job.stopped) {
      this.current = null;
      job.resolve({ bestmove: null, lines: [], depth: 0, stopped: true });
      this._startPending();
      return;
    }
    if (this.multipv !== job.multipv) {
      this._send(`setoption name MultiPV value ${job.multipv}`);
      this.multipv = job.multipv;
    }
    this._send(`position fen ${job.fen}`);
    this._send(job.movetime ? `go movetime ${job.movetime}` : `go depth ${job.depth}`);
  }

  newGame() {
    this._send('ucinewgame');
  }
}

function parseInfo(line, turn) {
  const t = line.split(' ');
  let depth = 0, multipv = 1, cp = null, mate = null, pv = [], bound = false, nodes = 0, nps = 0;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': depth = +t[++i]; break;
      case 'multipv': multipv = +t[++i]; break;
      case 'nodes': nodes = +t[++i]; break;
      case 'nps': nps = +t[++i]; break;
      case 'score':
        if (t[i + 1] === 'cp') cp = +t[i + 2];
        else if (t[i + 1] === 'mate') mate = +t[i + 2];
        i += 2;
        break;
      case 'lowerbound':
      case 'upperbound':
        bound = true;
        break;
      case 'pv':
        pv = t.slice(i + 1);
        i = t.length;
        break;
    }
  }
  if (bound || !pv.length) return null;
  const sign = turn === 'w' ? 1 : -1;
  return {
    depth,
    multipv,
    nodes,
    nps,
    cp: cp === null ? null : cp * sign,
    mate: mate === null ? null : mate * sign,
    pv,
  };
}
