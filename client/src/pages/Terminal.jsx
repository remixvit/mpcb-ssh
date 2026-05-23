import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAuthStore } from '../store/auth';

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
      theme: { background: '#0d0d1a', foreground: '#eaeaea', cursor: '#e94560' },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      copyOnSelect: true,
      scrollback: 5000,
      rightClickSelectsWord: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();

    // Right click → paste from clipboard
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
        term.write(msg.data);
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
          cols: term.cols, rows: term.rows,
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', margin: '-28px -32px', background: '#0d0d1a' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
        background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
      }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => navigate('/servers')}>
          ← Back
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Server #{id}</span>
      </div>
      <div ref={containerRef} style={{ flex: 1, padding: 4 }} />
    </div>
  );
}
