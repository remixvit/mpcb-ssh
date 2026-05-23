import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Servers() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/servers').then(r => setServers(r.data)).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!confirm('Delete this server?')) return;
    await api.delete(`/servers/${id}`);
    setServers(s => s.filter(x => x.id !== id));
  }

  return (
    <div>
      <div className="page-header">
        <h1>Servers</h1>
        <button className="btn btn-primary" onClick={() => navigate('/servers/new')}>+ Add Server</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      ) : servers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🖥</div>
          <div>No servers yet. Add your first server to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {servers.map(s => (
            <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color || 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{s.username}@{s.host}:{s.port}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => navigate(`/terminal/${s.id}`)}>Connect</button>
                <button className="btn btn-ghost" onClick={() => navigate(`/servers/${s.id}`)}>Edit</button>
                <button className="btn btn-danger" onClick={() => handleDelete(s.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
