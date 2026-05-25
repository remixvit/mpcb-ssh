import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAuthStore } from '../store/auth';
import Icon from '../components/Icon';
import api from '../api';

/* ─── Single tab session — mirrors the original Terminal exactly ─────────── */
function TabSession({ serverId, active, token, onStatus, onReady }) {
  const containerRef = useRef(null);
  const wsRef        = useRef(null);
  const sessionRef   = useRef(null);
  const termRef      = useRef(null);
  const fitRef       = useRef(null);

  /* expose refit + reconnect to parent */
  useEffect(() => {
    onReady({
      refit:     () => { fitRef.current?.fit(); },
      reconnect: () => {
        if (wsRef.current?.readyState !== WebSocket.CLOSED) wsRef.current?.close();
        termRef.current?.write('\r\n\x1b[90m--- Reconnecting... ---\x1b[0m\r\n');
        openWS();
      },
    });
  }, []);

  function openWS() {
    const term = termRef.current;
    const fit  = fitRef.current;
    if (!term || !fit) return;
    sessionRef.current = null;
    onStatus('connecting');

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws    = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({
      type: 'terminal:open',
      serverId: parseInt(serverId), token,
      decryptionKey: sessionStorage.getItem('decryptionKey'),
      cols: term.cols, rows: term.rows,
    }));

    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'terminal:opened') {
        sessionRef.current = msg.sessionId;
        onStatus('connected');
      } else if (msg.type === 'terminal:data') {
        const bin = atob(msg.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        term.write(bytes);
      } else if (msg.type === 'terminal:error') {
        term.write(`\r\n\x1b[31mError: ${msg.error}\x1b[0m\r\n`);
        onStatus('disconnected');
      }
    };

    ws.onclose = () => {
      term.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
      onStatus('disconnected');
    };

    ws.onerror = () => onStatus('disconnected');
  }

  useEffect(() => {
    const term = new XTerm({
      theme: {
        background: '#0d1518', foreground: '#eeffff',
        cursor: '#80cbc4', cursorAccent: '#0d1518',
        selectionBackground: 'rgba(128,203,196,0.25)',
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
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current  = fit;

    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });

    containerRef.current.addEventListener('contextmenu', async e => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text && wsRef.current?.readyState === WebSocket.OPEN && sessionRef.current)
          wsRef.current.send(JSON.stringify({ type: 'terminal:input', sessionId: sessionRef.current, data: text }));
      } catch {}
    });

    term.onData(data => {
      if (wsRef.current?.readyState === WebSocket.OPEN && sessionRef.current)
        wsRef.current.send(JSON.stringify({ type: 'terminal:input', sessionId: sessionRef.current, data }));
    });

    const onResize = () => {
      fit.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN && sessionRef.current)
        wsRef.current.send(JSON.stringify({ type: 'terminal:resize', sessionId: sessionRef.current, cols: term.cols, rows: term.rows }));
    };
    window.addEventListener('resize', onResize);

    openWS();

    return () => {
      window.removeEventListener('resize', onResize);
      if (sessionRef.current && wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: 'terminal:close', sessionId: sessionRef.current }));
      wsRef.current?.close();
      term.dispose();
    };
  }, [serverId]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, padding: 4, minHeight: 0, display: active ? '' : 'none' }}
    />
  );
}

/* ─── Tab counter ──────────────────────────────────────────────────────────── */
let _id = 0;
const uid = () => ++_id;

/* ─── Main Terminal page ───────────────────────────────────────────────────── */
export default function Terminal() {
  const { id: initialId } = useParams();
  const navigate           = useNavigate();
  const location           = useLocation();
  const { token }          = useAuthStore();

  const [tabs, setTabs]               = useState([{
    tabId:      uid(),
    serverId:   String(initialId),
    serverName: location.state?.serverName || `#${initialId}`,
  }]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].tabId);
  const [statuses,    setStatuses]    = useState({});
  const [servers,     setServers]     = useState([]);
  const [showPicker,  setShowPicker]  = useState(false);

  /* per-tab controls exposed by TabSession */
  const tabControls = useRef({});  // tabId → { refit, reconnect }

  useEffect(() => {
    api.get('/servers').then(r => {
      setServers(r.data);
      setTabs(prev => prev.map(t => {
        const s = r.data.find(s => String(s.id) === String(t.serverId));
        return s ? { ...t, serverName: s.name } : t;
      }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!showPicker) return;
    const h = e => { if (!e.target.closest('.term-picker')) setShowPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showPicker]);

  /* switch tab + refit */
  function activateTab(tabId) {
    setActiveTabId(tabId);
    setTimeout(() => tabControls.current[tabId]?.refit(), 20);
  }

  function addTab(server) {
    const tabId = uid();
    setTabs(p => [...p, { tabId, serverId: String(server.id), serverName: server.name }]);
    setActiveTabId(tabId);
    setShowPicker(false);
  }

  function closeTab(e, tabId) {
    e.stopPropagation();
    delete tabControls.current[tabId];
    setTabs(prev => {
      const next = prev.filter(t => t.tabId !== tabId);
      if (next.length === 0) { navigate('/servers'); return prev; }
      if (activeTabId === tabId) {
        const idx = prev.findIndex(t => t.tabId === tabId);
        const nb  = next[Math.min(idx, next.length - 1)];
        setActiveTabId(nb.tabId);
        setTimeout(() => tabControls.current[nb.tabId]?.refit(), 20);
      }
      return next;
    });
  }

  const activeStatus = statuses[activeTabId];
  const activeTab    = tabs.find(t => t.tabId === activeTabId);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: '-28px -32px -40px', background: '#0d1518', position: 'relative' }}>

      {/* ── Tab bar ── */}
      <div className="term-tabs" style={{ flexShrink: 0 }}>
        <button className="btn ghost sm" style={{ margin: '0 8px', padding: '4px 10px', fontSize: 12 }}
          onClick={() => navigate('/servers')}>
          <Icon name="arrowR" style={{ transform: 'rotate(180deg)' }} /> Back
        </button>

        {tabs.map(tab => (
          <div key={tab.tabId}
            className={`term-tab${tab.tabId === activeTabId ? ' active' : ''}`}
            onClick={() => activateTab(tab.tabId)}
          >
            <span className="row-tag-dot" style={{
              background: statuses[tab.tabId] === 'disconnected' ? '#f07178' : 'var(--accent)',
              boxShadow:  statuses[tab.tabId] === 'disconnected' ? 'none' : 'var(--accent-glow)',
            }} />
            <span>{tab.serverName}</span>
            {tabs.length > 1 && (
              <span className="close" onClick={e => closeTab(e, tab.tabId)}>×</span>
            )}
          </div>
        ))}

        <div className="term-tab-add term-picker" title="New tab" onClick={() => setShowPicker(p => !p)}>+</div>

        {activeStatus === 'disconnected' ? (
          <button className="btn ghost sm"
            style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12, color: '#c3e88d', borderColor: '#c3e88d33' }}
            onClick={() => tabControls.current[activeTabId]?.reconnect()}>
            <Icon name="refresh" /> Reconnect
          </button>
        ) : (
          <div className="term-status">
            <span className="dot pulse"></span>
            <span>SSH-2.0</span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span>chacha20-poly1305</span>
          </div>
        )}
      </div>

      {/* ── Server picker — sibling of tab bar so term-tabs overflow-x doesn't clip it ── */}
      {showPicker && (
        <div className="term-picker" style={{
          position: 'absolute', top: 38, left: 0, zIndex: 200,
          background: '#1a2226', border: '1px solid var(--border)',
          borderRadius: 8, padding: 6, minWidth: 220,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '4px 10px 6px', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Open in new tab
          </div>
          {servers.length === 0
            ? <div style={{ padding: '8px 10px', color: 'var(--text-faint)', fontSize: 12 }}>No servers</div>
            : servers.map(s => (
              <div key={s.id} onClick={() => addTab(s)} style={{
                padding: '7px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between', gap: 12,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>{s.name}</span>
                <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{s.host}</span>
              </div>
            ))
          }
        </div>
      )}

      {/* ── One TabSession per tab — stays mounted, hidden when inactive ── */}
      {tabs.map(tab => (
        <TabSession
          key={tab.tabId}
          serverId={tab.serverId}
          active={tab.tabId === activeTabId}
          token={token}
          onStatus={status => setStatuses(p => ({ ...p, [tab.tabId]: status }))}
          onReady={controls => { tabControls.current[tab.tabId] = controls; }}
        />
      ))}
    </div>
  );
}
