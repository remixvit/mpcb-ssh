import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import Icon, { ColorDot } from '../components/Icon';
import StatusBadge from '../components/StatusBadge';

export default function Servers() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/servers').then(r => setServers(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    servers.filter(s => !q || (s.name + s.host + (s.tags || '')).toLowerCase().includes(q.toLowerCase())),
    [q, servers]
  );

  async function handleDelete(id) {
    if (!confirm('Delete this server?')) return;
    await api.delete(`/servers/${id}`);
    setServers(s => s.filter(x => x.id !== id));
  }

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Servers</div>
          <div className="page-sub">{filtered.length} of {servers.length} · ready to connect</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <div className="input-icon" style={{ width: 260 }}>
          <Icon name="search" />
          <input className="input" placeholder="Search by name, host…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className="btn primary" onClick={() => navigate('/servers/new')}>
          <Icon name="plus" />Add server
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : servers.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div className="empty">
            <Icon name="server" className="ico" style={{ width: 32, height: 32 }} />
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 12 }}>No servers yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Add your first server to get started</div>
            <button className="btn primary" style={{ marginTop: 20 }} onClick={() => navigate('/servers/new')}>
              <Icon name="plus" />Add server
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr>
              <th>Name</th>
              <th>Host</th>
              <th>User</th>
              <th>Auth</th>
              <th>Status</th>
              <th style={{ width: 210 }}></th>
            </tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <span className="row-tag-dot" style={{ background: s.color || 'var(--accent)', boxShadow: `0 0 8px ${s.color || '#80cbc4'}66` }} />
                    <b>{s.name}</b>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{s.host}:{s.port}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{s.username}</td>
                  <td>
                    <span className="badge">
                      <Icon name={s.auth_type === 'key' ? 'key' : 'lock'} />
                      {s.auth_type === 'key' ? 'Key' : 'Password'}
                    </span>
                  </td>
                  <td><StatusBadge status="offline" /></td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn ghost sm" title="Edit" onClick={() => navigate(`/servers/${s.id}`)}>
                        <Icon name="edit" />
                      </button>
                      <button className="btn ghost sm" title="Delete" onClick={() => handleDelete(s.id)}>
                        <Icon name="trash" />
                      </button>
                      <button className="btn primary sm" onClick={() => navigate(`/terminal/${s.id}`, { state: { serverName: s.name } })}>
                        <Icon name="terminal" />Connect
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6">
                    <div className="empty"><Icon name="server" /><div>No servers match "{q}"</div></div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
