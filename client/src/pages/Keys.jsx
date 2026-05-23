import { useEffect, useState } from 'react';
import api from '../api';

export default function Keys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/keys').then(r => setKeys(r.data)).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!confirm('Delete this key?')) return;
    await api.delete(`/keys/${id}`);
    setKeys(k => k.filter(x => x.id !== id));
  }

  return (
    <div>
      <div className="page-header">
        <h1>SSH Keys</h1>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      ) : keys.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
          <div>No SSH keys uploaded yet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keys.map(k => (
            <div key={k.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{k.name}</div>
                {k.fingerprint && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>
                    SHA256:{k.fingerprint}
                  </div>
                )}
              </div>
              <button className="btn btn-danger" onClick={() => handleDelete(k.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
