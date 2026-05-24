import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';

function formatForward(t) {
  if (t.type === 'dynamic') return `SOCKS5 :${t.socks_port}`;
  if (t.type === 'remote') return `${t.remote_host}:${t.remote_port} → localhost:${t.local_port}`;
  return `${t.local_host || 'localhost'}:${t.local_port} → ${t.remote_host}:${t.remote_port}`;
}

export default function Tunnels() {
  const [tunnels, setTunnels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({}); // tunnelId → true

  const load = useCallback(() => {
    api.get('/tunnels').then(r => setTunnels(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleStart(id) {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      const decryptionKey = sessionStorage.getItem('decryptionKey');
      await api.post(`/tunnels/${id}/start`, { decryptionKey });
      setTunnels(ts => ts.map(t => t.id === id ? { ...t, status: 'active' } : t));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start tunnel');
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  }

  async function handleStop(id) {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await api.post(`/tunnels/${id}/stop`);
      setTunnels(ts => ts.map(t => t.id === id ? { ...t, status: 'idle' } : t));
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this tunnel?')) return;
    await api.delete(`/tunnels/${id}`);
    setTunnels(t => t.filter(x => x.id !== id));
  }

  const running = tunnels.filter(t => t.status === 'active').length;

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Tunnels</div>
          <div className="page-sub">{running} active · port forwarding &amp; SOCKS proxies</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <button className="btn primary">
          <Icon name="plus" />New tunnel
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : tunnels.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div className="empty">
            <Icon name="tunnel" className="ico" style={{ width: 32, height: 32 }} />
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 12 }}>No tunnels configured yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Create a tunnel to forward ports through SSH</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr>
              <th>Name</th>
              <th>Server</th>
              <th>Type</th>
              <th>Forward</th>
              <th>Status</th>
              <th style={{ width: 200 }}></th>
            </tr></thead>
            <tbody>
              {tunnels.map(t => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td style={{ color: 'var(--text-2)' }}>{t.server_name || `#${t.server_id}`}</td>
                  <td><span className="badge">{t.type}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)', fontSize: 12 }}>{formatForward(t)}</td>
                  <td><StatusBadge status={t.status === 'active' ? 'running' : 'stopped'} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {t.status === 'active' ? (
                        <button className="btn sm" disabled={busy[t.id]} onClick={() => handleStop(t.id)}>
                          <Icon name="stop" />{busy[t.id] ? '…' : 'Stop'}
                        </button>
                      ) : (
                        <button className="btn primary sm" disabled={busy[t.id]} onClick={() => handleStart(t.id)}>
                          <Icon name="play" />{busy[t.id] ? '…' : 'Start'}
                        </button>
                      )}
                      <button className="btn ghost sm"><Icon name="edit" /></button>
                      <button className="btn ghost sm" onClick={() => handleDelete(t.id)}><Icon name="trash" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
