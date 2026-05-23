import { useEffect, useState } from 'react';
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

  useEffect(() => {
    api.get('/tunnels').then(r => setTunnels(r.data)).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!confirm('Delete this tunnel?')) return;
    await api.delete(`/tunnels/${id}`);
    setTunnels(t => t.filter(x => x.id !== id));
  }

  const running = tunnels.filter(t => t.status === 'running').length;

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Tunnels</div>
          <div className="page-sub">{running} running · port forwarding &amp; SOCKS proxies</div>
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
              <th>Type</th>
              <th>Forward</th>
              <th>Status</th>
              <th style={{ width: 200 }}></th>
            </tr></thead>
            <tbody>
              {tunnels.map(t => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td><span className="badge">{t.type}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{formatForward(t)}</td>
                  <td><StatusBadge status={t.status || 'stopped'} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {t.status === 'running' ? (
                        <button className="btn sm"><Icon name="stop" />Stop</button>
                      ) : (
                        <button className="btn primary sm"><Icon name="play" />Start</button>
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
