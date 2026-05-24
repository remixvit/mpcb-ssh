import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import Icon, { LABEL_COLORS } from '../components/Icon';

const EMPTY = { name: '', host: '', port: '22', username: 'root', key_id: '', password: '', tags: '', color: '', jump_server_id: '', proxy_agent_id: '' };

export default function ServerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [keys, setKeys] = useState([]);
  const [servers, setServers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [authMode, setAuthMode] = useState('key');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/keys').then(r => setKeys(r.data));
    api.get('/servers').then(r => setServers(r.data.filter(s => !isEdit || String(s.id) !== id)));
    api.get('/agents').then(r => setAgents(r.data));

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
          proxy_agent_id: s.proxy_agent_id ? String(s.proxy_agent_id) : '',
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
      proxy_agent_id: form.proxy_agent_id ? parseInt(form.proxy_agent_id) : null,
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
    <div className="page-enter" style={{ maxWidth: 640 }}>
      <div className="page-head">
        <div>
          <div className="page-title">{isEdit ? 'Edit Server' : 'Add Server'}</div>
          <div className="page-sub">{isEdit ? 'Update connection details' : 'Configure a new SSH connection'}</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <button className="btn ghost" onClick={() => navigate('/servers')}>
          <Icon name="arrowR" style={{ transform: 'rotate(180deg)' }} /> Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 24 }}>

        <div className="field">
          <label>Display name</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="prod-api-01" required autoFocus />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
          <div className="field">
            <label>Host / IP</label>
            <input className="input mono" value={form.host} onChange={e => set('host', e.target.value)} placeholder="192.168.1.1" required />
          </div>
          <div className="field">
            <label>Port</label>
            <input className="input mono" type="number" value={form.port} onChange={e => set('port', e.target.value)} min={1} max={65535} required />
          </div>
        </div>

        <div className="field">
          <label>Username</label>
          <input className="input mono" value={form.username} onChange={e => set('username', e.target.value)} placeholder="root" required />
        </div>

        <div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Authentication</label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" className={`btn sm ${authMode === 'key' ? 'primary' : ''}`} onClick={() => setAuthMode('key')}>
              <Icon name="key" />SSH Key
            </button>
            <button type="button" className={`btn sm ${authMode === 'password' ? 'primary' : ''}`} onClick={() => setAuthMode('password')}>
              <Icon name="lock" />Password
            </button>
          </div>

          {authMode === 'key' ? (
            <select className="select" value={form.key_id} onChange={e => set('key_id', e.target.value)}>
              <option value="">— Select SSH key —</option>
              {keys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          ) : (
            <input
              className="input mono"
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder={isEdit ? 'Leave blank to keep current' : 'SSH password'}
            />
          )}
        </div>

        <div className="field">
          <label>Proxy via Agent <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-faint)' }}>(route SSH through agent — optional)</span></label>
          <select className="select" value={form.proxy_agent_id} onChange={e => { set('proxy_agent_id', e.target.value); if (e.target.value) set('jump_server_id', ''); }}>
            <option value="">— None —</option>
            {agents.map(a => (
              <option key={a.id} value={a.id} disabled={!a.online}>
                {a.name} {a.online ? '● online' : '○ offline'}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Jump server <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-faint)' }}>(ProxyJump — optional)</span></label>
          <select className="select" value={form.jump_server_id} onChange={e => { set('jump_server_id', e.target.value); if (e.target.value) set('proxy_agent_id', ''); }}>
            <option value="">— None —</option>
            {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
          </select>
        </div>

        <div className="field">
          <label>Tags <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-faint)' }}>(comma separated)</span></label>
          <input className="input" value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="production, web, db" />
        </div>

        <div className="field">
          <label>Color label</label>
          <div className="color-row">
            <div
              onClick={() => set('color', '')}
              style={{
                width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                background: 'var(--panel)', border: `2px solid ${!form.color ? 'var(--accent)' : 'var(--border)'}`,
                boxShadow: !form.color ? 'var(--accent-glow)' : 'none',
              }}
            />
            {LABEL_COLORS.map(c => (
              <div
                key={c.value}
                className={`color-swatch${form.color === c.value ? ' active' : ''}`}
                style={{
                  background: c.value,
                  boxShadow: form.color === c.value ? `0 0 12px ${c.value}88` : '',
                }}
                onClick={() => set('color', c.value)}
              />
            ))}
          </div>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 12px', background: 'rgba(240,113,120,0.1)', borderRadius: 6 }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={() => navigate('/servers')}>Cancel</button>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? (
              <>
                <span className="activity-bar" style={{ marginRight: 4 }}><span/><span/><span/><span/></span>
                Saving…
              </>
            ) : (
              <><Icon name={isEdit ? 'check' : 'plus'} />{isEdit ? 'Save changes' : 'Add server'}</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
