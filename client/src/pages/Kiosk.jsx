import { useEffect, useState } from 'react';
import api from '../api';
import Icon from '../components/Icon';

export default function Kiosk() {
  const [tokens, setTokens]   = useState([]);
  const [name,   setName]     = useState('Display');
  const [newTok, setNewTok]   = useState(null); // shown once after creation
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  function load() {
    api.get('/kiosk/tokens').then(r => setTokens(r.data)).catch(() => {});
  }

  async function create() {
    setLoading(true);
    try {
      const r = await api.post('/kiosk/tokens', { name });
      setNewTok(r.data);
      setName('Display');
      load();
    } finally { setLoading(false); }
  }

  async function del(id) {
    await api.delete(`/kiosk/tokens/${id}`);
    load();
  }

  const boardUrl = (token) =>
    `${location.origin}/board?token=${token}`;

  const apiUrl = (token) =>
    `${location.origin}/api/kiosk/stats?token=${token}`;

  return (
    <div className="page-enter" style={{ maxWidth: 680 }}>
      <div className="page-head">
        <div>
          <div className="page-title">Kiosk</div>
          <div className="page-sub">Read-only tokens for dashboard displays and ESP32</div>
        </div>
      </div>

      {/* ── Create ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Token name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Display" />
        </div>
        <button className="btn primary" onClick={create} disabled={loading || !name}>
          <Icon name="plus" /> Generate token
        </button>
      </div>

      {/* ── Newly created token — shown once ── */}
      {newTok && (
        <div className="card" style={{ padding: 20, marginBottom: 20, border: '1px solid #c3e88d44', background: 'rgba(195,232,141,0.05)' }}>
          <div style={{ fontSize: 12, color: '#c3e88d', marginBottom: 10, fontWeight: 600 }}>
            ⚠ Save this token — it won't be shown again
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all', marginBottom: 14,
            background: '#0d1518', padding: '8px 12px', borderRadius: 6, color: 'var(--text)' }}>
            {newTok.token}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Pi kiosk URL:</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)',
              wordBreak: 'break-all', cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(boardUrl(newTok.token))}>
              {boardUrl(newTok.token)} <span style={{ color: 'var(--text-faint)' }}>(click to copy)</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>ESP32 API URL:</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)',
              wordBreak: 'break-all', cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(apiUrl(newTok.token))}>
              {apiUrl(newTok.token)} <span style={{ color: 'var(--text-faint)' }}>(click to copy)</span>
            </div>
          </div>
          <button className="btn ghost sm" style={{ marginTop: 14 }} onClick={() => setNewTok(null)}>
            Done, I saved it
          </button>
        </div>
      )}

      {/* ── Token list ── */}
      {tokens.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)' }}>
          No tokens yet — generate one above
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tokens.map(t => (
            <div key={t.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name="key" style={{ color: 'var(--text-faint)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>{t.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  Created {new Date(t.created_at * 1000).toLocaleDateString()}
                </div>
              </div>
              <button className="btn ghost sm" onClick={() => del(t.id)} style={{ color: 'var(--danger)' }}>
                <Icon name="trash" /> Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── ESP32 hint ── */}
      <div className="card" style={{ marginTop: 24, padding: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>ESP32 API response format</div>
        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)',
          background: '#0d1518', padding: '10px 14px', borderRadius: 6, overflow: 'auto', margin: 0 }}>
{`GET /api/kiosk/stats?token=YOUR_TOKEN

[
  {
    "id": 1,
    "name": "Work Server",
    "online": true,
    "cpu": 23.5,       // %
    "mem": 67.2,       // %
    "disk": 41.8,      // %
    "uptime": 86400,   // seconds
    "load1": 0.42,
    "rxBps": 1024,     // bytes/sec
    "txBps": 512
  }
]`}
        </pre>
      </div>
    </div>
  );
}
