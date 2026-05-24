import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import Icon from '../components/Icon';

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const LINE_ENDINGS = { 'None': '', 'LF': '\n', 'CR': '\r', 'CRLF': '\r\n' };
const MAX_BUFFER_BYTES = 512 * 1024;   // 512 KB total pending queue
const MAX_BYTES_PER_FRAME = 8 * 1024; // 8 KB per animation frame

export default function Serial() {
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitRef = useRef(null);
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const writerRef = useRef(null);
  const abortRef = useRef(null);

  // RAF buffer
  const queueRef = useRef([]);         // Array of Uint8Array chunks
  const queueBytesRef = useRef(0);     // Total bytes in queue
  const rafRef = useRef(null);
  const pausedRef = useRef(false);
  const overflowRef = useRef(0);

  // Stats
  const bytesWindowRef = useRef([]);   // [{ts, count}] for rolling bytes/sec
  const totalBytesRef = useRef(0);

  const [connected, setConnected] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [lineEnding, setLineEnding] = useState('LF');
  const [paused, setPaused] = useState(false);
  const [sendText, setSendText] = useState('');
  const [stats, setStats] = useState({ bps: 0, total: 0, overflow: 0 });
  const [hexMode, setHexMode] = useState(false);
  const [error, setError] = useState('');
  const supported = !!navigator.serial;

  // ── xterm setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const term = new XTerm({
      theme: {
        background: '#0d1518', foreground: '#eeffff', cursor: '#80cbc4',
        cursorAccent: '#0d1518', selectionBackground: 'rgba(128,203,196,0.25)',
        black: '#263238', red: '#f07178', green: '#c3e88d', yellow: '#ffcb6b',
        blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#eeffff',
        brightBlack: '#546e7a', brightRed: '#f07178', brightGreen: '#c3e88d',
        brightYellow: '#ffcb6b', brightBlue: '#82aaff', brightMagenta: '#c792ea',
        brightCyan: '#89ddff', brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
      fontSize: 13, lineHeight: 1.4, cursorBlink: true, scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    // Copy on select
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });

    // Right-click → send to serial
    containerRef.current.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text && writerRef.current) {
          const enc = new TextEncoder();
          await writerRef.current.write(enc.encode(text));
        }
      } catch {}
    });

    xtermRef.current = term;
    fitRef.current = fit;

    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      term.dispose();
    };
  }, []);

  // ── RAF flush loop ────────────────────────────────────────────────────────────
  const scheduleFlush = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(flushBuffer);
  }, []);

  function flushBuffer() {
    rafRef.current = null;
    const term = xtermRef.current;
    if (!term) return;

    let taken = 0;
    const chunks = [];
    while (queueRef.current.length > 0 && taken < MAX_BYTES_PER_FRAME) {
      const chunk = queueRef.current.shift();
      queueBytesRef.current -= chunk.length;
      taken += chunk.length;
      chunks.push(chunk);
    }

    if (!pausedRef.current && chunks.length > 0) {
      // Merge chunks into one Uint8Array for efficient write
      const merged = new Uint8Array(taken);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      term.write(merged);
    }

    // Update stats
    const now = Date.now();
    bytesWindowRef.current.push({ ts: now, count: taken });
    bytesWindowRef.current = bytesWindowRef.current.filter(x => now - x.ts < 1000);
    const bps = bytesWindowRef.current.reduce((s, x) => s + x.count, 0);
    totalBytesRef.current += taken;
    setStats({ bps, total: totalBytesRef.current, overflow: overflowRef.current });

    if (queueRef.current.length > 0) {
      rafRef.current = requestAnimationFrame(flushBuffer);
    }
  }

  function enqueue(chunk) {
    if (queueBytesRef.current + chunk.length > MAX_BUFFER_BYTES) {
      // Drop oldest chunks until we have room
      while (queueRef.current.length > 0 && queueBytesRef.current + chunk.length > MAX_BUFFER_BYTES) {
        const dropped = queueRef.current.shift();
        queueBytesRef.current -= dropped.length;
        overflowRef.current++;
      }
    }
    queueRef.current.push(chunk);
    queueBytesRef.current += chunk.length;
    scheduleFlush();
  }

  // ── Connect / Disconnect ──────────────────────────────────────────────────────
  async function handleConnect() {
    setError('');
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: parseInt(baudRate) });
      portRef.current = port;

      const writer = port.writable.getWriter();
      writerRef.current = writer;

      const abortController = new AbortController();
      abortRef.current = abortController;

      // Reset stats
      queueRef.current = [];
      queueBytesRef.current = 0;
      overflowRef.current = 0;
      totalBytesRef.current = 0;
      bytesWindowRef.current = [];

      xtermRef.current?.writeln(`\x1b[32m● Connected at ${baudRate} baud\x1b[0m`);
      setConnected(true);

      // Read loop
      const reader = port.readable.getReader();
      readerRef.current = reader;

      ;(async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              if (hexMode) {
                const hex = Array.from(value).map(b => b.toString(16).padStart(2, '0')).join(' ');
                enqueue(new TextEncoder().encode(hex + '\r\n'));
              } else {
                enqueue(value);
              }
            }
          }
        } catch (err) {
          if (!abortController.signal.aborted) {
            xtermRef.current?.writeln(`\r\n\x1b[31m✖ Port closed: ${err.message}\x1b[0m`);
          }
        } finally {
          try { reader.releaseLock(); } catch {}
          setConnected(false);
        }
      })();

    } catch (err) {
      if (err.name !== 'NotFoundError') setError(err.message);
    }
  }

  async function handleDisconnect() {
    try { abortRef.current?.abort(); } catch {}
    try { readerRef.current?.cancel(); } catch {}
    try { writerRef.current?.releaseLock(); } catch {}
    try { await portRef.current?.close(); } catch {}
    portRef.current = null;
    writerRef.current = null;
    readerRef.current = null;
    xtermRef.current?.writeln('\r\n\x1b[33m○ Disconnected\x1b[0m');
    setConnected(false);
  }

  function handlePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(p => !p);
  }

  function handleClear() {
    queueRef.current = [];
    queueBytesRef.current = 0;
    xtermRef.current?.clear();
  }

  async function handleSend(e) {
    e?.preventDefault();
    if (!writerRef.current || !sendText) return;
    const suffix = LINE_ENDINGS[lineEnding];
    const enc = new TextEncoder();
    await writerRef.current.write(enc.encode(sendText + suffix));
    setSendText('');
  }

  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  if (!supported) return (
    <div className="page-enter">
      <div className="page-head"><div className="page-title">Serial Terminal</div></div>
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <Icon name="serial" style={{ width: 32, height: 32, opacity: 0.3 }} />
        <div style={{ marginTop: 12, color: 'var(--text-2)' }}>Web Serial API is not supported in this browser.</div>
        <div style={{ marginTop: 4, fontSize: 12 }}>Use Chrome or Edge 89+.</div>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', margin: '-28px -32px -40px', background: '#0d1518' }}>
      {/* Toolbar */}
      <div className="term-tabs" style={{ gap: 8, flexWrap: 'wrap', minHeight: 44 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px' }}>
          <Icon name="serial" style={{ color: connected ? '#c3e88d' : 'var(--text-faint)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Serial</span>
        </div>

        {/* Baud rate */}
        <select
          value={baudRate}
          onChange={e => setBaudRate(e.target.value)}
          disabled={connected}
          style={{ fontSize: 12, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}
        >
          {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* Connect / Disconnect */}
        {!connected ? (
          <button className="btn primary sm" style={{ fontSize: 12 }} onClick={handleConnect}>
            <Icon name="play" /> Connect
          </button>
        ) : (
          <button className="btn sm" style={{ fontSize: 12 }} onClick={handleDisconnect}>
            <Icon name="stop" /> Disconnect
          </button>
        )}

        {/* Pause */}
        {connected && (
          <button
            className="btn ghost sm"
            style={{ fontSize: 12, color: paused ? '#ffcb6b' : 'var(--text-2)' }}
            onClick={handlePause}
          >
            <Icon name={paused ? 'play' : 'pause'} /> {paused ? 'Resume' : 'Pause'}
          </button>
        )}

        {/* Clear */}
        <button className="btn ghost sm" style={{ fontSize: 12 }} onClick={handleClear}>
          <Icon name="trash" /> Clear
        </button>

        {/* HEX mode */}
        <button
          className="btn ghost sm"
          style={{ fontSize: 12, color: hexMode ? 'var(--accent)' : 'var(--text-2)' }}
          onClick={() => setHexMode(h => !h)}
        >
          HEX
        </button>

        {/* Stats */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', paddingRight: 12, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          {stats.overflow > 0 && (
            <span style={{ color: '#f07178' }}>⚠ {stats.overflow} overflow</span>
          )}
          {paused && <span style={{ color: '#ffcb6b' }}>⏸ PAUSED</span>}
          <span>{fmtBytes(stats.bps)}/s</span>
          <span>{fmtBytes(stats.total)} total</span>
          {connected && <span style={{ color: '#c3e88d' }}>● {baudRate}</span>}
        </div>
      </div>

      {error && (
        <div style={{ background: '#f0717820', color: '#f07178', padding: '6px 12px', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Terminal */}
      <div ref={containerRef} style={{ flex: 1, padding: 4, minHeight: 0 }} />

      {/* Send bar */}
      <form
        onSubmit={handleSend}
        style={{ display: 'flex', gap: 6, padding: '6px 8px', background: '#111a1e', borderTop: '1px solid var(--border)' }}
      >
        <input
          value={sendText}
          onChange={e => setSendText(e.target.value)}
          placeholder="Send data..."
          disabled={!connected}
          style={{
            flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--text)', padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)',
          }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(e); }}
        />
        <select
          value={lineEnding}
          onChange={e => setLineEnding(e.target.value)}
          style={{ fontSize: 12, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}
        >
          {Object.keys(LINE_ENDINGS).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <button type="submit" className="btn primary sm" disabled={!connected || !sendText} style={{ fontSize: 12 }}>
          <Icon name="arrow" /> Send
        </button>
      </form>
    </div>
  );
}
