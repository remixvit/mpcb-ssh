import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import Icon from '../components/Icon';

const BAUD_RATES  = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const DATA_BITS   = [7, 8];
const STOP_BITS   = [1, 2];
const PARITY_OPTS = ['none', 'even', 'odd'];
const FLOW_OPTS   = ['none', 'hardware'];
const LINE_ENDINGS = { None: '', LF: '\n', CR: '\r', CRLF: '\r\n' };

const MAX_BUFFER_BYTES   = 512 * 1024;  // 512 KB ring buffer
const MAX_BYTES_PER_FRAME = 8 * 1024;  // 8 KB flushed per animation frame

export default function Serial() {
  const containerRef = useRef(null);
  const xtermRef     = useRef(null);
  const fitRef       = useRef(null);
  const portRef      = useRef(null);
  const readerRef    = useRef(null);
  const writerRef    = useRef(null);
  const queueRef     = useRef([]);
  const queueBytesRef = useRef(0);
  const rafRef       = useRef(null);
  const pausedRef    = useRef(false);
  const overflowRef  = useRef(0);
  const bpsWindowRef = useRef([]);
  const totalBytesRef = useRef(0);

  const [knownPorts, setKnownPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState(null); // null = request new
  const [connected, setConnected]   = useState(false);
  const [baudRate,  setBaudRate]    = useState(115200);
  const [dataBits,  setDataBits]    = useState(8);
  const [stopBits,  setStopBits]    = useState(1);
  const [parity,    setParity]      = useState('none');
  const [flowCtrl,  setFlowCtrl]    = useState('none');
  const [lineEnding, setLineEnding] = useState('LF');
  const [paused,    setPaused]      = useState(false);
  const [sendText,  setSendText]    = useState('');
  const [hexMode,   setHexMode]     = useState(false);
  const [stats,     setStats]       = useState({ bps: 0, total: 0, overflow: 0 });
  const [error,     setError]       = useState('');

  const supported = !!navigator.serial;

  // Load previously granted ports
  useEffect(() => {
    if (!supported) return;
    navigator.serial.getPorts().then(ports => setKnownPorts(ports));
    const handler = () => navigator.serial.getPorts().then(ports => setKnownPorts(ports));
    navigator.serial.addEventListener('connect', handler);
    navigator.serial.addEventListener('disconnect', handler);
    return () => {
      navigator.serial.removeEventListener('connect', handler);
      navigator.serial.removeEventListener('disconnect', handler);
    };
  }, [supported]);

  // xterm init
  useEffect(() => {
    const term = new XTerm({
      theme: {
        background: '#0d1518', foreground: '#eeffff', cursor: '#80cbc4',
        cursorAccent: '#0d1518', selectionBackground: 'rgba(128,203,196,0.25)',
        black:'#263238', red:'#f07178', green:'#c3e88d', yellow:'#ffcb6b',
        blue:'#82aaff', magenta:'#c792ea', cyan:'#89ddff', white:'#eeffff',
        brightBlack:'#546e7a', brightRed:'#f07178', brightGreen:'#c3e88d',
        brightYellow:'#ffcb6b', brightBlue:'#82aaff', brightMagenta:'#c792ea',
        brightCyan:'#89ddff', brightWhite:'#ffffff',
      },
      fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
      fontSize: 13, lineHeight: 1.4, cursorBlink: true, scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });
    containerRef.current.addEventListener('contextmenu', async e => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text && writerRef.current) writerRef.current.write(new TextEncoder().encode(text));
      } catch {}
    });
    xtermRef.current = term;
    fitRef.current   = fit;
    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(rafRef.current); term.dispose(); };
  }, []);

  // RAF flush — prevents UI freeze regardless of data rate
  const scheduleFlush = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(flush);
  }, []);

  function flush() {
    rafRef.current = null;
    const term = xtermRef.current;
    if (!term) return;

    let taken = 0;
    const chunks = [];
    while (queueRef.current.length && taken < MAX_BYTES_PER_FRAME) {
      const chunk = queueRef.current.shift();
      queueBytesRef.current -= chunk.length;
      taken += chunk.length;
      chunks.push(chunk);
    }

    if (!pausedRef.current && taken) {
      const merged = new Uint8Array(taken);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      term.write(merged);
    }

    const now = Date.now();
    bpsWindowRef.current.push({ ts: now, count: taken });
    bpsWindowRef.current = bpsWindowRef.current.filter(x => now - x.ts < 1000);
    totalBytesRef.current += taken;
    setStats({
      bps: bpsWindowRef.current.reduce((s, x) => s + x.count, 0),
      total: totalBytesRef.current,
      overflow: overflowRef.current,
    });

    if (queueRef.current.length) rafRef.current = requestAnimationFrame(flush);
  }

  function enqueue(raw) {
    // Drop oldest if buffer would exceed limit
    while (queueRef.current.length && queueBytesRef.current + raw.length > MAX_BUFFER_BYTES) {
      const dropped = queueRef.current.shift();
      queueBytesRef.current -= dropped.length;
      overflowRef.current++;
    }
    queueRef.current.push(raw);
    queueBytesRef.current += raw.length;
    scheduleFlush();
  }

  function portLabel(port, idx) {
    const info = port.getInfo?.() || {};
    const vid = info.usbVendorId?.toString(16).padStart(4, '0');
    const pid = info.usbProductId?.toString(16).padStart(4, '0');
    return vid ? `Port ${idx + 1}  [${vid}:${pid}]` : `Port ${idx + 1}`;
  }

  async function handleConnect() {
    setError('');
    let port = selectedPort;
    try {
      if (!port) port = await navigator.serial.requestPort();
      await port.open({ baudRate: +baudRate, dataBits: +dataBits, stopBits: +stopBits, parity, flowControl: flowCtrl });
      portRef.current  = port;
      writerRef.current = port.writable.getWriter();

      queueRef.current = []; queueBytesRef.current = 0;
      overflowRef.current = 0; totalBytesRef.current = 0; bpsWindowRef.current = [];

      const info = portLabel(port, knownPorts.indexOf(port));
      xtermRef.current?.writeln(`\x1b[32m● Connected  ${info}  ${baudRate} ${dataBits}${parity[0].toUpperCase()}${stopBits}\x1b[0m`);
      setConnected(true);

      const reader = port.readable.getReader();
      readerRef.current = reader;
      ;(async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value?.length) continue;
            if (hexMode) {
              const hex = Array.from(value).map(b => b.toString(16).padStart(2, '0')).join(' ') + '\r\n';
              enqueue(new TextEncoder().encode(hex));
            } else {
              enqueue(value);
            }
          }
        } catch (err) {
          xtermRef.current?.writeln(`\r\n\x1b[31m✖ ${err.message}\x1b[0m`);
        } finally {
          try { reader.releaseLock(); } catch {}
          setConnected(false);
        }
      })();

      // Refresh known ports list
      navigator.serial.getPorts().then(setKnownPorts);
    } catch (err) {
      if (err.name !== 'NotFoundError') setError(err.message);
    }
  }

  async function handleDisconnect() {
    try { await readerRef.current?.cancel(); } catch {}
    try { writerRef.current?.releaseLock(); } catch {}
    try { await portRef.current?.close(); } catch {}
    portRef.current = writerRef.current = readerRef.current = null;
    xtermRef.current?.writeln('\r\n\x1b[33m○ Disconnected\x1b[0m');
    setConnected(false);
  }

  function togglePause() { pausedRef.current = !pausedRef.current; setPaused(p => !p); }
  function handleClear()  { queueRef.current = []; queueBytesRef.current = 0; xtermRef.current?.clear(); }

  async function handleSend(e) {
    e?.preventDefault();
    if (!writerRef.current || !sendText) return;
    await writerRef.current.write(new TextEncoder().encode(sendText + LINE_ENDINGS[lineEnding]));
    setSendText('');
  }

  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
    return `${(n/1048576).toFixed(2)} MB`;
  }

  if (!supported) return (
    <div className="page-enter">
      <div className="page-head"><div className="page-title">Serial Terminal</div></div>
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>
        Web Serial API is not supported.<br /><small>Use Chrome or Edge 89+</small>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', margin: '-28px -32px -40px', background: '#0d1518' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#111a1e', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>

        {/* Port selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="serial" style={{ color: connected ? '#c3e88d' : 'var(--text-faint)' }} />
          {knownPorts.length > 0 ? (
            <select
              value={knownPorts.indexOf(selectedPort)}
              onChange={e => setSelectedPort(+e.target.value === -1 ? null : knownPorts[+e.target.value])}
              disabled={connected}
              style={sel}
            >
              <option value={-1}>⊕ Request new port…</option>
              {knownPorts.map((p, i) => <option key={i} value={i}>{portLabel(p, i)}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>No ports granted yet</span>
          )}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Protocol settings */}
        <label style={lbl}>Baud
          <select value={baudRate} onChange={e => setBaudRate(e.target.value)} disabled={connected} style={sel}>
            {BAUD_RATES.map(b => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label style={lbl}>Data
          <select value={dataBits} onChange={e => setDataBits(e.target.value)} disabled={connected} style={sel}>
            {DATA_BITS.map(b => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label style={lbl}>Stop
          <select value={stopBits} onChange={e => setStopBits(e.target.value)} disabled={connected} style={sel}>
            {STOP_BITS.map(b => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label style={lbl}>Parity
          <select value={parity} onChange={e => setParity(e.target.value)} disabled={connected} style={sel}>
            {PARITY_OPTS.map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label style={lbl}>Flow
          <select value={flowCtrl} onChange={e => setFlowCtrl(e.target.value)} disabled={connected} style={sel}>
            {FLOW_OPTS.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Connect / Disconnect */}
        {!connected
          ? <button className="btn primary sm" onClick={handleConnect}><Icon name="play" /> Connect</button>
          : <button className="btn sm" onClick={handleDisconnect}><Icon name="stop" /> Disconnect</button>
        }
        {connected && (
          <button className="btn ghost sm" style={{ color: paused ? '#ffcb6b' : 'var(--text-2)' }} onClick={togglePause}>
            <Icon name={paused ? 'play' : 'pause'} /> {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        <button className="btn ghost sm" onClick={handleClear}><Icon name="trash" /> Clear</button>
        <button
          className="btn ghost sm"
          style={{ color: hexMode ? 'var(--accent)' : 'var(--text-2)' }}
          onClick={() => setHexMode(h => !h)}
        >HEX</button>

        {/* Stats */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          {stats.overflow > 0 && <span style={{ color: '#f07178' }}>⚠ {stats.overflow} overflow</span>}
          {paused && <span style={{ color: '#ffcb6b' }}>⏸ PAUSED</span>}
          <span>{fmtBytes(stats.bps)}/s</span>
          <span>{fmtBytes(stats.total)}</span>
          {connected && <span style={{ color: '#c3e88d' }}>● {baudRate} {dataBits}{parity[0].toUpperCase()}{stopBits}</span>}
        </div>
      </div>

      {error && <div style={{ background: '#f0717820', color: '#f07178', padding: '5px 12px', fontSize: 12 }}>{error}</div>}

      {/* Terminal */}
      <div ref={containerRef} style={{ flex: 1, padding: 4, minHeight: 0 }} />

      {/* Send bar */}
      <form onSubmit={handleSend} style={{ display: 'flex', gap: 6, padding: '6px 8px', background: '#111a1e', borderTop: '1px solid var(--border)' }}>
        <input
          value={sendText}
          onChange={e => setSendText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend(e)}
          placeholder="Send data… (right-click terminal = paste from clipboard)"
          disabled={!connected}
          style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)' }}
        />
        <select value={lineEnding} onChange={e => setLineEnding(e.target.value)} style={sel}>
          {Object.keys(LINE_ENDINGS).map(k => <option key={k}>{k}</option>)}
        </select>
        <button type="submit" className="btn primary sm" disabled={!connected || !sendText}><Icon name="arrow" /> Send</button>
      </form>
    </div>
  );
}

// Shared styles
const sel = { fontSize: 12, background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' };
const lbl = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)' };
