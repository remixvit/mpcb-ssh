import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api';

const COLORS = ['#e94560', '#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e74c3c'];

const EMPTY = { name: '', host: '', port: '22', username: 'root', key_id: '', password: '', tags: '', color: '', jump_server_id: '' };

export default function ServerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [keys, setKeys] = useState([]);
  const [servers, setServers] = useState([]);
  const [authMode, setAuthMode] = useState('key'); // 'key' | 'password'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/keys').then(r => setKeys(r.data));
    api.get('/servers').then(r => setServers(r.data.filter(s => !isEdit || String(s.id) !== id)));

    if (isEdit) {
      api.get(`/servers/${id}`).then(r => {
        const s = r.data;
        setForm({
          name: s.name || '',
          host: s.host || '',
          port: String(s.port || 22),
          username: s.username || '',
          key_id: s.key_id ? String(s.key_id) : '',
          password: '',
          tags: (s.tags || []).join(', '),
          color: s.color || '',
          jump_server_id: s.jump_server_id ? String(s.jump_server_id) : '',
        });
        setAuthMode(s.key_id ? 'key' : 'password');
      });
    }
  }, [id]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const decryptionKey = sessionStorage.getItem('decryptionKey');

    const payload = {
      name: form.name,
      host: form.host,
      port: parseInt(form.port) || 22,
      username: form.username,
      key_id: authMode === 'key' && form.key_id ? parseInt(form.key_id) : null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      color: form.color || null,
      jump_server_id: form.jump_server_id ? parseInt(form.jump_server_id) : null,
    };

    if (authMode === 'password' && form.password) {
      payload.password = form.password;
      payload.decryptionKey = decryptionKey;
    }

    try {
      if (isEdit) {
        await api.put(`/servers/${id}`, payload);
      } else {
        await api.post('/servers', payload);
      }
      navigate('/servers');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="page-header">
        <h1>{isEdit ? 'Edit Server' : 'Add Server'}</h1>
        <button className="btn btn-ghost" onClick={() => navigate('/servers')}>← Back</button>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Name */}
        <Field label="Name">
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="My VPS" required />
        </Field>

        {/* Host + Port */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
          <Field label="Host">
            <input value={form.host} onChange={e => set('host', e.target.value)} placeholder="192.168.1.1 or example.com" required />
          </Field>
          <Field label="Port">
            <input type="number" value={form.port} onChange={e => set('port', e.target.value)} min={1} max={65535} required />
          </Field>
        </div>

        {/* Username */}
        <Field label="Username">
          <input value={form.username} onChange={e => set('username', e.target.value)} placeholder="root" required />
        </Field>

        {/* Auth mode */}
        <div>
          <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-muted)', fontSize: 13 }}>Authentication</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" className={`btn ${authMode === 'key' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAuthMode('key')}>
              SSH Key
            </button>
            <button type="button" className={`btn ${authMode === 'password' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAuthMode('password')}>
              Password
            </button>
          </div>

          {authMode === 'key' ? (
            <select value={form.key_id} onChange={e => set('key_id', e.target.value)}>
              <option value="">— Select SSH key —</option>
              {keys.map(k => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder={isEdit ? 'Leave blank to keep current' : 'SSH password'}
            />
          )}
        </div>

        {/* Jump server */}
        <Field label="Jump Server (ProxyJump)" hint="Optional — connect through a bastion host">
          <select value={form.jump_server_id} onChange={e => set('jump_server_id', e.target.value)}>
            <option value="">— None —</option>
            {servers.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
            ))}
          </select>
        </Field>

        {/* Tags */}
        <Field label="Tags" hint="Comma separated: production, web, db">
          <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="production, web" />
        </Field>

        {/* Color */}
        <div>
          <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-muted)', fontSize: 13 }}>Color label</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div
              onClick={() => set('color', '')}
              style={{
                width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                background: 'var(--bg)', border: `2px solid ${!form.color ? 'var(--accent)' : 'var(--border)'}`,
              }}
            />
            {COLORS.map(c => (
              <div key={c} onClick={() => set('color', c)} style={{
                width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                background: c, border: `2px solid ${form.color === c ? '#fff' : 'transparent'}`,
                transition: 'border 0.15s',
              }} />
            ))}
          </div>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 12px', background: 'rgba(231,76,60,.1)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/servers')}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Server'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: 13 }}>
        {label}
        {hint && <span style={{ marginLeft: 8, fontWeight: 400, opacity: 0.7 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}
