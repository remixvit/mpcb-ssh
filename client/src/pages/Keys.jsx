import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';

function KeyCard({ k, onRemove }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div className="tile-ico" style={{ width: 40, height: 40 }}>
          <Icon name="key" style={{ width: 20, height: 20 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 14 }}>{k.name}</b>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            Added {k.created_at ? new Date(k.created_at).toLocaleDateString() : '—'}
          </div>
        </div>
        <button className="btn ghost sm" title="Delete" onClick={onRemove}><Icon name="trash" /></button>
      </div>
      {k.fingerprint && (
        <div className="code-block" style={{ marginTop: 12 }}>SHA256:{k.fingerprint}</div>
      )}
    </div>
  );
}

export default function Keys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/keys').then(r => setKeys(r.data)).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!confirm('Delete this key?')) return;
    await api.delete(`/keys/${id}`);
    setKeys(k => k.filter(x => x.id !== id));
  }

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <div className="page-title">SSH Keys</div>
          <div className="page-sub">{keys.length} keys · stored encrypted (AES-256-GCM)</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <button className="btn primary" onClick={() => navigate('/keys/upload')}>
          <Icon name="plus" />Add key
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : keys.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div className="empty">
            <Icon name="key" className="ico" style={{ width: 32, height: 32 }} />
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 12 }}>No SSH keys uploaded yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Keys are encrypted with AES-256-GCM before storage</div>
            <button className="btn primary" style={{ marginTop: 20 }} onClick={() => navigate('/keys/upload')}>
              <Icon name="upload" />Upload key
            </button>
          </div>
        </div>
      ) : (
        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 14 }}>
          {keys.map(k => (
            <KeyCard key={k.id} k={k} onRemove={() => handleDelete(k.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
