import { useEffect, useState } from 'react';
import api from '../api';

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState(null);

  useEffect(() => {
    api.get('/agents').then(r => setAgents(r.data)).finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    const name = prompt('Agent name (e.g. "Home Desktop"):');
    if (!name) return;
    const { data } = await api.post('/agents', { name });
    setAgents(a => [...a, { id: data.id, name: data.name }]);
    setNewToken({ name: data.name, token: data.token });
  }

  async function handleDelete(id) {
    if (!confirm('Delete this agent?')) return;
    await api.delete(`/agents/${id}`);
    setAgents(a => a.filter(x => x.id !== id));
  }

  return (
    <div>
      <div className="page-header">
        <h1>Agents</h1>
        <button className="btn btn-primary" onClick={handleAdd}>+ Add Agent</button>
      </div>

      {newToken && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--success)', background: 'rgba(46,204,113,.05)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Agent <em>{newToken.name}</em> created — save this token, it won't be shown again:</div>
          <code style={{ display: 'block', background: 'var(--bg)', padding: '10px 14px', borderRadius: 6, wordBreak: 'break-all', fontSize: 13 }}>
            {newToken.token}
          </code>
          <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}>
            Run: <code>mpcb-agent --server wss://ssh.mpcbstudio.com --token {newToken.token} --name "{newToken.name}"</code>
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setNewToken(null)}>Dismiss</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      ) : agents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>◈</div>
          <div>No agents registered. Add one to enable local tunnel management.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.map(a => (
            <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{a.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {a.platform && `${a.platform} · `}{a.hostname || 'Never connected'}
                </div>
              </div>
              <span className="badge badge-muted">Offline</span>
              <button className="btn btn-danger" onClick={() => handleDelete(a.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
