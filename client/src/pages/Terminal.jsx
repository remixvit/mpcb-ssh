import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAuthStore } from '../store/auth';
import Icon from '../components/Icon';
import api from '../api';

const THEME = {
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
const uid = () => ++_counter;

export default function Terminal() {
  const { id: initialId } = useParams();
  const navigate           = useNavigate();
  const location           = useLocation();
  const { token }          = useAuthStore();

  /* ── Tab state ── */
  const firstTabId = useRef(uid());
  const [tabs, setTabs]               = useState([{
    tabId:      firstTabId.current,
    serverId:   String(initialId),
    serverName: location.state?.serverName || `#${initialId}`,
  }]);
  const [activeTabId, setActiveTabId] = useState(firstTabId.current);
  const [statuses,    setStatuses]    = useState({});   // tabId → 'connecting'|'connected'|'disconnected'
  const [servers,     setServers]     = useState([]);
  const [showPicker,  setShowPicker]  = useState(false);

  /* ── Per-tab references (never trigger re-render) ── */
  const containers = useRef({});   // tabId → DOM div
  const xtermRefs  = useRef({});   // tabId → { term, fit, ws, sessionId }

  /* ── Load server list for picker + name resolution ── */
  useEffect(() => {
    api.get('/servers').then(r => {
      setServers(r.data);
      setTabs(prev => prev.map(t => {
        const s = r.data.find(s => String(s.id) === String(t.serverId));
        return s ? { ...t, serverName: s.name } : t;
      }));
    }).catch(() => {});
  }, []);

  /* ── Close picker on outside click ── */
  useEffect(() => {
    if (!showPicker) return;
    const h = e => { if (!e.target.closest('.term-picker')) setShowPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showPicker]);

  /* ── Window resize → refit active tab ── */
  useEffect(() => {
    const fn = () => refit(activeTabId);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [activeTabId]);

  /* ── Initialize xterm for each tab once its container is in the DOM ── */
  useEffect(() => {
    tabs.forEach(tab => {
      if (xtermRefs.current[tab.tabId]) return;   // already initialised
      const el = containers.current[tab.tabId];
      if (!el) return;                             // container not mounted yet

      const term = new XTerm({
        theme: THEME,
        fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
        fontSize: 13, lineHeight: 1.4, cursorBlink: true, scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(el);
      fit.fit();

      xtermRefs.current[tab.tabId] = { term, fit, ws: null, sessionId: null };

      // copy on select
      term.onSelectionChange(() => {
        const sel = term.getSelection();
        if (sel) navigator.clipboard.writeText(sel).catch(() => {});
      });

      // paste on right-click
      el.addEventListener('contextmenu', async e => {
        e.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          const r = xtermRefs.current[tab.tabId];
          if (text && r?.ws?.readyState === WebSocket.OPEN && r.sessionId)
            r.ws.send(JSON.stringify({ type: 'terminal:input', sessionId: r.sessionId, data: text }));
        } catch {}
      });

      term.onData(data => {
        const r = xtermRefs.current[tab.tabId];
        if (r?.ws?.readyState === WebSocket.OPEN && r.sessionId)
          r.ws.send(JSON.stringify({ type: 'terminal:input', sessionId: r.sessionId, data }));
      });

      openWS(tab.tabId, tab.serverId, term);
    });
  });  // runs after every render — cheap because of the early-return guard

  /* ── Cleanup all on unmount ── */
  useEffect(() => () => {
    Object.values(xtermRefs.current).forEach(closeRefs);
  }, []);

  /* ── Helpers ── */
  function closeRefs(r) {
    if (!r) return;
    try {
      if (r.sessionId && r.ws?.readyState === WebSocket.OPEN)
        r.ws.send(JSON.stringify({ type: 'terminal:close', sessionId: r.sessionId }));
    } catch {}
    r.ws?.close();
    r.term?.dispose();
  }

  function refit(tabId) {
    const r = xtermRefs.current[tabId];
    if (!r?.fit) return;
    r.fit.fit();
    if (r.ws?.readyState === WebSocket.OPEN && r.sessionId)
      r.ws.send(JSON.stringify({ type: 'terminal:resize', sessionId: r.sessionId, cols: r.term.cols, rows: r.term.rows }));
  }

  function openWS(tabId, serverId, term) {
    const r = xtermRefs.current[tabId];
    if (!r) return;
    setStatuses(p => ({ ...p, [tabId]: 'connecting' }));
    r.sessionId = null;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws    = new WebSocket(`${proto}//${location.host}/ws`);
    r.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({
      type: 'terminal:open', serverId: parseInt(serverId), token,
      decryptionKey: sessionStorage.getItem('decryptionKey'),
      cols: term.cols, rows: term.rows,
    }));

    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'terminal:opened') {
        r.sessionId = msg.sessionId;
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

  /* ── Tab actions ── */
  function activateTab(tabId) {
    setActiveTabId(tabId);
    setTimeout(() => refit(tabId), 20);
  }

  function addTab(server) {
    const tabId = uid();
    setTabs(p => [...p, { tabId, serverId: String(server.id), serverName: server.name }]);
    setActiveTabId(tabId);
    setShowPicker(false);
  }

  function closeTab(e, tabId) {
    e.stopPropagation();
    closeRefs(xtermRefs.current[tabId]);
    delete xtermRefs.current[tabId];
    delete containers.current[tabId];

    setTabs(prev => {
      const next = prev.filter(t => t.tabId !== tabId);
      if (next.length === 0) { navigate('/servers'); return prev; }
      if (activeTabId === tabId) {
        const idx = prev.findIndex(t => t.tabId === tabId);
        const nb  = next[Math.min(idx, next.length - 1)];
        setActiveTabId(nb.tabId);
        setTimeout(() => refit(nb.tabId), 20);
      }
      return next;
    });
  }

  function reconnect(tabId, serverId) {
    const r = xtermRefs.current[tabId];
    if (!r) return;
    r.ws?.close();
    r.term.write('\r\n\x1b[90m--- Reconnecting... ---\x1b[0m\r\n');
    openWS(tabId, serverId, r.term);
  }

  const activeTab    = tabs.find(t => t.tabId === activeTabId);
  const activeStatus = statuses[activeTabId];

  /* ── Render ── */
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', margin: '-28px -32px -40px', background: '#0d1518' }}>

      {/* Tab bar */}
      <div className="term-tabs" style={{ flexShrink: 0, position: 'relative' }}>
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

        {/* New tab button */}
        <div className="term-tab-add term-picker" title="New tab" onClick={() => setShowPicker(p => !p)}>+</div>

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

        {activeStatus === 'disconnected' ? (
          <button className="btn ghost sm"
            style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12, color: '#c3e88d', borderColor: '#c3e88d33' }}
            onClick={() => activeTab && reconnect(activeTab.tabId, activeTab.serverId)}>
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

      {/* Terminal containers — all stay in DOM, inactive hidden via visibility */}
      {tabs.map(tab => (
        <div key={tab.tabId}
          style={{ flex: 1, padding: 4, minHeight: 0, display: tab.tabId === activeTabId ? '' : 'none' }}
          ref={el => { if (el) containers.current[tab.tabId] = el; }}
        />
      ))}
    </div>
  );
}
