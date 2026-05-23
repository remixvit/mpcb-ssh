import { useEffect, useState } from 'react';
import api from '../api';

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

  function formatForward(t) {
    if (t.type === 'dynamic') return `SOCKS5 :${t.socks_port}`;
    return `${t.local_host}:${t.local_port} → ${t.remote_host}:${t.remote_port}`;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Tunnels</h1>
        <button className="btn btn-primary">+ New Tunnel</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      ) : tunnels.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⇄</div>
          <div>No tunnels configured yet.</div>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Name</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px' }}>Forward</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {tunnels.map(t => (
              <tr key={t.id} className="card" style={{ display: 'table-row', borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px' }}>{t.name}</td>
                <td style={{ padding: '12px' }}><span className="badge badge-muted">{t.type}</span></td>
                <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 13 }}>{formatForward(t)}</td>
                <td style={{ padding: '12px' }}><span className="badge badge-muted">Idle</span></td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost">Start</button>
                    <button className="btn btn-danger" onClick={() => handleDelete(t.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
