import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAuthStore } from '../store/auth';
import Icon from '../components/Icon';

export default function Terminal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    const term = new XTerm({
      theme: {
        background: '#0d1518',
        foreground: '#eeffff',
        cursor: '#80cbc4',
        cursorAccent: '#0d1518',
        selectionBackground: 'rgba(128,203,196,0.25)',
        black: '#263238', red: '#f07178', green: '#c3e88d', yellow: '#ffcb6b',
        blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#eeffff',
        brightBlack: '#546e7a', brightRed: '#f07178', brightGreen: '#c3e88d',
        brightYellow: '#ffcb6b', brightBlue: '#82aaff', brightMagenta: '#c792ea',
        brightCyan: '#89ddff', brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();

    // Copy selection to clipboard on mouse-up (xterm v5 doesn't have copyOnSelect)
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });

    containerRef.current.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text && wsRef.current?.readyState === WebSocket.OPEN && sessionRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'terminal:input', sessionId: sessionRef.current, data: text }));
        }
      } catch {}
    });

    xtermRef.current = term;
    fitRef.current = fit;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      const decryptionKey = sessionStorage.getItem('decryptionKey');
      ws.send(JSON.stringify({
        type: 'terminal:open',
        serverId: parseInt(id),
        token,
        decryptionKey,
        cols: term.cols,
        rows: term.rows,
      }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'terminal:opened') {
        sessionRef.current = msg.sessionId;
      } else if (msg.type === 'terminal:data') {
        // Decode base64 → Uint8Array so xterm renders binary data correctly
        const bin = atob(msg.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        term.write(bytes);
      } else if (msg.type === 'terminal:error') {
        term.write(`\r\n\x1b[31mError: ${msg.error}\x1b[0m\r\n`);
      }
    };

    ws.onclose = () => term.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN && sessionRef.current) {
        ws.send(JSON.stringify({ type: 'terminal:input', sessionId: sessionRef.current, data }));
      }
    });

    const onResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN && sessionRef.current) {
        ws.send(JSON.stringify({
          type: 'terminal:resize',
          sessionId: sessionRef.current,
          cols: term.cols,
          rows: term.rows,
        }));
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (sessionRef.current && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal:close', sessionId: sessionRef.current }));
      }
      ws.close();
      term.dispose();
    };
  }, [id]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', margin: '-28px -32px -40px', background: '#0d1518' }}>
      <div className="term-tabs" style={{ flexShrink: 0 }}>
        <button className="btn ghost sm" style={{ margin: '0 8px', padding: '4px 10px', fontSize: 12 }} onClick={() => navigate('/servers')}>
          <Icon name="arrowR" style={{ transform: 'rotate(180deg)' }} /> Back
        </button>
        <div className="term-tab active">
          <span className="row-tag-dot" style={{ background: 'var(--accent)', boxShadow: 'var(--accent-glow)' }} />
          <span>Server #{id}</span>
        </div>
        <div className="term-status">
          <span className="dot pulse"></span>
          <span>SSH-2.0</span>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span>chacha20-poly1305</span>
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, padding: 4, minHeight: 0 }} />
    </div>
  );
}
