import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAuthStore } from '../store/auth';
import Icon from '../components/Icon';
import api from '../api';

const XTERM_THEME = {
  background: '#0d1518', foreground: '#eeffff',
  cursor: '#80cbc4', cursorAccent: '#0d1518',
  selectionBackground: 'rgba(128,203,196,0.25)',
  black: '#263238', red: '#f07178', green: '#c3e88d', yellow: '#ffcb6b',
  blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#eeffff',
  brightBlack: '#546e7a', brightRed: '#f07178', brightGreen: '#c3e88d',
  brightYellow: '#ffcb6b', brightBlue: '#82aaff', brightMagenta: '#c792ea',
  brightCyan: '#89ddff', brightWhite: '#ffffff',
};

let _counter = 0;
const newId = () => ++_counter;

export default function Terminal() {
  const { id: initialServerId } = useParams();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { token } = useAuthStore();

  const [tabs, setTabs]         = useState(() => [{
    tabId: newId(),
    serverId: String(initialServerId),
    serverName: location.state?.serverName || `#${initialServerId}`,
  }]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].tabId);
  const [statuses, setStatuses]       = useState({});
  const [servers, setServers]         = useState([]);
  const [showPicker, setShowPicker]   = useState(false);

  const tabRefs = useRef({});      // tabId → { container, term, fit, ws, sessionId }
  const inited  = useRef(new Set());

  // ── Fetch server list for picker + name resolution ─────────────────────────
  useEffect(() => {
    api.get('/servers').then(r => {
      setServers(r.data);
      setTabs(prev => prev.map(t => {
        const s = r.data.find(s => String(s.id) === String(t.serverId));
        return s ? { ...t, serverName: s.name } : t;
      }));
    }).catch(() => {});
  }, []);

  // ── Close picker on outside click ─────────────────────────────────────────
  useEffect(() => {
    if (!showPicker) return;
    const h = (e) => { if (!e.target.closest('.term-picker')) setShowPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showPicker]);

  // ── Resize → refit active tab ──────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => refitTab(activeTabId);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeTabId]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const refs of Object.values(tabRefs.current)) destroyRefs(refs);
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function destroyRefs(refs) {
    if (!refs) return;
    try {
      if (refs.sessionId && refs.ws?.readyState === WebSocket.OPEN)
        refs.ws.send(JSON.stringify({ type: 'terminal:close', sessionId: refs.sessionId }));
    } catch {}
    refs.ws?.close();
    refs.term?.dispose();
  }

  function refitTab(tabId) {
    const r = tabRefs.current[tabId];
    if (!r?.fit) return;
    r.fit.fit();
    if (r.ws?.readyState === WebSocket.OPEN && r.sessionId) {
      r.ws.send(JSON.stringify({
        type: 'terminal:resize', sessionId: r.sessionId,
        cols: r.term.cols, rows: r.term.rows,
      }));
    }
  }

  function connectTab(tabId, serverId) {
    const refs = tabRefs.current[tabId];
    if (!refs?.term) return;
    const { term } = refs;

    setStatuses(p => ({ ...p, [tabId]: 'connecting' }));
    refs.sessionId = null;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    refs.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({
      type: 'terminal:open',
      serverId: parseInt(serverId), token,
      decryptionKey: sessionStorage.getItem('decryptionKey'),
      cols: term.cols, rows: term.rows,
    }));

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'terminal:opened') {
        refs.sessionId = msg.sessionId;
        setStatuses(p => ({ ...p, [tabId]: 'connected' }));
      } else if (msg.type === 'terminal:data') {
        const bin = atob(msg.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        term.write(bytes);
      } else if (msg.type === 'terminal:error') {
        term.write(`\r\n\x1b[31mError: ${msg.error}\x1b[0m\r\n`);
        setStatuses(p => ({ ...p, [tabId]: 'disconnected' }));
      }
    };

    ws.onclose = () => {
      term.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
      setStatuses(p => ({ ...p, [tabId]: 'disconnected' }));
    };

    ws.onerror = () => setStatuses(p => ({ ...p, [tabId]: 'disconnected' }));
  }

  function initTab(tabId, serverId, container) {
    if (inited.current.has(tabId) || !container) return;
    inited.current.add(tabId);

    const term = new XTerm({
      theme: XTERM_THEME,
      fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
      fontSize: 13, lineHeight: 1.4, cursorBlink: true, scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    // ← Set refs BEFORE open/connect so connectTab can find them
    tabRefs.current[tabId] = { container, term, fit, ws: null, sessionId: null };

    term.open(container);
    fit.fit();

    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });

    container.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        const r = tabRefs.current[tabId];
        if (text && r?.ws?.readyState === WebSocket.OPEN && r.sessionId)
          r.ws.send(JSON.stringify({ type: 'terminal:input', sessionId: r.sessionId, data: text }));
      } catch {}
    });

    term.onData(data => {
      const r = tabRefs.current[tabId];
      if (r?.ws?.readyState === WebSocket.OPEN && r.sessionId)
        r.ws.send(JSON.stringify({ type: 'terminal:input', sessionId: r.sessionId, data }));
    });

    connectTab(tabId, serverId);
  }

  // ── Tab actions ────────────────────────────────────────────────────────────
  function handleActivate(tabId) {
    setActiveTabId(tabId);
    setTimeout(() => refitTab(tabId), 20);
  }

  function handleAddTab(server) {
    const tabId = newId();
    setTabs(p => [...p, { tabId, serverId: String(server.id), serverName: server.name }]);
    setActiveTabId(tabId);
    setShowPicker(false);
  }

  function handleCloseTab(e, tabId) {
    e.stopPropagation();
    destroyRefs(tabRefs.current[tabId]);
    delete tabRefs.current[tabId];
    inited.current.delete(tabId);

    setTabs(prev => {
      const next = prev.filter(t => t.tabId !== tabId);
      if (next.length === 0) { navigate('/servers'); return prev; }
      if (activeTabId === tabId) {
        const idx = prev.findIndex(t => t.tabId === tabId);
        const fallback = next[Math.min(idx, next.length - 1)];
        setActiveTabId(fallback.tabId);
        setTimeout(() => refitTab(fallback.tabId), 20);
      }
      return next;
    });
  }

  function handleReconnect(tabId, serverId) {
    const refs = tabRefs.current[tabId];
    if (!refs) return;
    refs.ws?.close();
    refs.term.write('\r\n\x1b[90m--- Reconnecting... ---\x1b[0m\r\n');
    connectTab(tabId, serverId);
  }

  const activeTab    = tabs.find(t => t.tabId === activeTabId);
  const activeStatus = statuses[activeTabId];

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      margin: '-28px -32px -40px', background: '#0d1518',
    }}>
      {/* ── Sticky tab bar ── */}
      <div className="term-tabs" style={{ flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, position: 'relative' }}>
        <button className="btn ghost sm"
          style={{ margin: '0 8px', padding: '4px 10px', fontSize: 12 }}
          onClick={() => navigate('/servers')}
        >
          <Icon name="arrowR" style={{ transform: 'rotate(180deg)' }} /> Back
        </button>

        {tabs.map(tab => {
          const st = statuses[tab.tabId];
          return (
            <div key={tab.tabId}
              className={`term-tab${tab.tabId === activeTabId ? ' active' : ''}`}
              onClick={() => handleActivate(tab.tabId)}
            >
              <span className="row-tag-dot" style={{
                background: st === 'disconnected' ? '#f07178' : 'var(--accent)',
                boxShadow:  st === 'disconnected' ? 'none' : 'var(--accent-glow)',
              }} />
              <span>{tab.serverName}</span>
              {tabs.length > 1 && (
                <span className="close" onClick={e => handleCloseTab(e, tab.tabId)}>×</span>
              )}
            </div>
          );
        })}

        <div className="term-tab-add term-picker" onClick={() => setShowPicker(p => !p)} title="New tab">+</div>

        {showPicker && (
          <div className="term-picker" style={{
            position: 'absolute', top: 38, left: 0, zIndex: 200,
            background: '#1a2226', border: '1px solid var(--border)',
            borderRadius: 8, padding: 6, minWidth: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ padding: '4px 10px 6px', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Open in new tab
            </div>
            {servers.length === 0
              ? <div style={{ padding: '8px 10px', color: 'var(--text-faint)', fontSize: 12 }}>No servers</div>
              : servers.map(s => (
                <div key={s.id} onClick={() => handleAddTab(s)} style={{
                  padding: '7px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                  color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between', gap: 12,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>{s.name}</span>
                  <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{s.host}</span>
                </div>
              ))
            }
          </div>
        )}

        {activeStatus === 'disconnected' ? (
          <button className="btn ghost sm"
            style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12, color: '#c3e88d', borderColor: '#c3e88d33' }}
            onClick={() => activeTab && handleReconnect(activeTab.tabId, activeTab.serverId)}
          >
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

      {/* ── Terminal containers — all in DOM, inactive hidden ── */}
      {tabs.map(tab => (
        <div key={tab.tabId}
          style={{
            flex: 1, padding: 4, minHeight: 0,
            display: tab.tabId === activeTabId ? 'flex' : 'none',
            flexDirection: 'column',
          }}
          ref={el => {
            if (el && !inited.current.has(tab.tabId)) initTab(tab.tabId, tab.serverId, el);
          }}
        />
      ))}
    </div>
  );
}
