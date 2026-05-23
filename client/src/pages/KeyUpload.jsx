import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function KeyUpload() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', pem: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setForm(f => ({
        ...f,
        pem: ev.target.result,
        name: f.name || file.name.replace(/\.(pem|key|rsa|ed25519)$/i, ''),
      }));
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.pem.includes('PRIVATE KEY')) {
      setError('File does not look like a private key (missing "PRIVATE KEY" header)');
      return;
    }

    const decryptionKey = sessionStorage.getItem('decryptionKey');
    if (!decryptionKey) {
      setError('Encryption key not found — please log out and log in again');
      return;
    }

    setLoading(true);
    try {
      await api.post('/keys', { name: form.name, pem: form.pem, encryptionKey: decryptionKey });
      navigate('/keys');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload key');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="page-header">
        <h1>Upload SSH Key</h1>
        <button className="btn btn-ghost" onClick={() => navigate('/keys')}>← Back</button>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ padding: '12px 16px', background: 'rgba(46,204,113,.08)', borderRadius: 8, border: '1px solid rgba(46,204,113,.2)', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          🔒 Private key is encrypted with AES-256-GCM using your login password before storing. It never leaves the server in plain text.
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: 13 }}>Key name</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="My SSH Key"
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: 13 }}>Private key</label>
          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: '2px dashed var(--border)', borderRadius: 8, padding: '20px',
              textAlign: 'center', cursor: 'pointer', marginBottom: 12,
              color: 'var(--text-muted)', fontSize: 13, transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            {form.pem ? '✓ File loaded — or click to replace' : '📁 Click to load key file (id_rsa, id_ed25519, *.pem)'}
          </div>
          <input ref={fileRef} type="file" accept=".pem,.key,.rsa,.ed25519,*" style={{ display: 'none' }} onChange={handleFile} />

          <textarea
            value={form.pem}
            onChange={e => setForm(f => ({ ...f, pem: e.target.value }))}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
            rows={8}
            style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
            required
          />
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 12px', background: 'rgba(231,76,60,.1)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/keys')}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Encrypting & saving...' : 'Upload Key'}
          </button>
        </div>
      </form>
    </div>
  );
}
