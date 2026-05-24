import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatForward(t) {
  if (t.type === 'dynamic') return `SOCKS5 :${t.socks_port}`;
  if (t.type === 'remote')  return `remote :${t.remote_port} → ${t.local_host || 'localhost'}:${t.local_port}`;
  return `${t.local_host || 'localhost'}:${t.local_port} → ${t.remote_host}:${t.remote_port}`;
}

const EMPTY_FORM = {
  name: '', server_id: '', type: 'local',
  local_host: '127.0.0.1', local_port: '',
  remote_host: 'localhost', remote_port: '',
  socks_port: '', auto_start: false,
};

// ── Tunnel Form Modal ─────────────────────────────────────────────────────────
function TunnelModal({ open, onClose, onSave, initial, servers }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const editing = !!initial?.id;

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
      setError('');
    }
  }, [open, initial]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.server_id) return setError('Select a server');
    if (form.type !== 'dynamic' && (!form.local_port || !form.remote_port)) {
      return setError('Local port and remote port are required');
    }
    if (form.type === 'dynamic' && !form.socks_port) {
      return setError('SOCKS port is required');
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/tunnels/${initial.id}`, form);
        onSave({ ...initial, ...form });
      } else {
        const { data } = await api.post('/tunnels', form);
        onSave({ ...form, id: data.id, status: 'idle' });
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const F = ({ label, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );

  const inp = { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '5px 8px', fontSize: 13, fontFamily: 'var(--font-mono)', width: '100%' };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Tunnel' : 'New Tunnel'}
      foot={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '…' : editing ? 'Save' : 'Create'}
          </button>
        </div>
      }>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Name + Server */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Name">
              <input style={inp} value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Postgres dev" required />
            </F>
            <F label="Server">
              <select style={inp} value={form.server_id} onChange={e => set('server_id', e.target.value)} required>
                <option value="">— select —</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </F>
          </div>

          {/* Type selector */}
          <F label="Type">
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { v: 'local',   label: 'Local',   desc: 'Access remote service on local port' },
                { v: 'remote',  label: 'Remote',  desc: 'Expose local service via remote port' },
                { v: 'dynamic', label: 'Dynamic', desc: 'SOCKS5 proxy through server' },
              ].map(({ v, label, desc }) => (
                <button
                  key={v} type="button"
                  className={`btn sm ${form.type === v ? 'primary' : 'ghost'}`}
                  style={{ flex: 1, flexDirection: 'column', gap: 2, height: 'auto', padding: '6px 8px' }}
                  onClick={() => set('type', v)}
                >
                  <span>{label}</span>
                  <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{desc}</span>
                </button>
              ))}
            </div>
          </F>

          {/* Port fields — depends on type */}
          {form.type === 'local' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <F label="Local host">
                <input style={inp} value={form.local_host} onChange={e => set('local_host', e.target.value)} placeholder="127.0.0.1" />
              </F>
              <F label="Local port">
                <input style={inp} type="number" value={form.local_port} onChange={e => set('local_port', e.target.value)} placeholder="5432" required />
              </F>
              <F label="Remote host">
                <input style={inp} value={form.remote_host} onChange={e => set('remote_host', e.target.value)} placeholder="localhost" />
              </F>
            </div>
          )}
          {form.type === 'local' && (
            <F label="Remote port">
              <input style={{ ...inp, width: 'auto', maxWidth: 120 }} type="number" value={form.remote_port}
                onChange={e => set('remote_port', e.target.value)} placeholder="5432" required />
            </F>
          )}

          {form.type === 'remote' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <F label="Remote port (server)">
                <input style={inp} type="number" value={form.remote_port} onChange={e => set('remote_port', e.target.value)} placeholder="8080" required />
              </F>
              <F label="Local host">
                <input style={inp} value={form.local_host} onChange={e => set('local_host', e.target.value)} placeholder="127.0.0.1" />
              </F>
              <F label="Local port">
                <input style={inp} type="number" value={form.local_port} onChange={e => set('local_port', e.target.value)} placeholder="3000" required />
              </F>
            </div>
          )}

          {form.type === 'dynamic' && (
            <F label="SOCKS5 port (local)">
              <input style={{ ...inp, width: 'auto', maxWidth: 120 }} type="number" value={form.socks_port}
                onChange={e => set('socks_port', e.target.value)} placeholder="1080" required />
            </F>
          )}

          {/* Auto-start */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.auto_start} onChange={e => set('auto_start', e.target.checked)} />
            <span>Auto-start when server app restarts</span>
          </label>

          {error && <div style={{ color: '#f07178', fontSize: 13 }}>{error}</div>}
        </div>
      </form>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Tunnels() {
  const [tunnels,  setTunnels]  = useState([]);
  const [servers,  setServers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState({});
  const [modal,    setModal]    = useState(null); // null | { initial? }

  const load = useCallback(() =>
    api.get('/tunnels').then(r => setTunnels(r.data)).finally(() => setLoading(false)),
  []);

  useEffect(() => {
    load();
    api.get('/servers').then(r => setServers(r.data));
  }, [load]);

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

  function handleSaved(tunnel) {
    setTunnels(ts => {
      const exists = ts.find(t => t.id === tunnel.id);
      return exists ? ts.map(t => t.id === tunnel.id ? tunnel : t) : [...ts, tunnel];
    });
    // Reload to get server_name from backend
    load();
  }

  const running = tunnels.filter(t => t.status === 'active').length;

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Tunnels</div>
          <div className="page-sub">{running} active · port forwarding &amp; SOCKS proxies</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => setModal({})}>
          <Icon name="plus" /> New tunnel
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-faint)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : tunnels.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <Icon name="tunnel" className="ico" style={{ width: 32, height: 32, opacity: 0.3 }} />
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 12 }}>No tunnels configured yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>Create a tunnel to forward ports through SSH</div>
          <button className="btn primary" style={{ marginTop: 20 }} onClick={() => setModal({})}>
            <Icon name="plus" /> New tunnel
          </button>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Server</th>
                <th>Type</th>
                <th>Forward</th>
                <th>Status</th>
                <th style={{ width: 180 }}></th>
              </tr>
            </thead>
            <tbody>
              {tunnels.map(t => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td style={{ color: 'var(--text-2)' }}>{t.server_name || `#${t.server_id}`}</td>
                  <td><span className="badge">{t.type}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)', fontSize: 12 }}>
                    {formatForward(t)}
                  </td>
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
                      <button className="btn ghost sm" title="Edit"
                        onClick={() => setModal({ initial: t })}>
                        <Icon name="edit" />
                      </button>
                      <button className="btn ghost sm" title="Delete"
                        onClick={() => handleDelete(t.id)}>
                        <Icon name="trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TunnelModal
        open={modal !== null}
        onClose={() => setModal(null)}
        onSave={handleSaved}
        initial={modal?.initial ?? null}
        servers={servers}
      />
    </div>
  );
}
