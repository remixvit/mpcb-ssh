import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';

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

    if (!form.pem.includes('PRIVATE KEY') && !form.pem.startsWith('PuTTY-User-Key-File')) {
      setError('File does not look like a private key (expected OpenSSH PEM or PuTTY .ppk format)');
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
    <div className="page-enter" style={{ maxWidth: 640 }}>
      <div className="page-head">
        <div>
          <div className="page-title">Upload SSH Key</div>
          <div className="page-sub">Keys are encrypted with AES-256-GCM before storage</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <button className="btn ghost" onClick={() => navigate('/keys')}>
          <Icon name="arrowR" style={{ transform: 'rotate(180deg)' }} /> Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 24 }}>
        <div style={{
          padding: '12px 16px',
          background: 'rgba(128,203,196,0.06)',
          borderRadius: 8,
          border: '1px solid rgba(128,203,196,0.2)',
          fontSize: 13,
          color: 'var(--text-dim)',
          lineHeight: 1.6,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <Icon name="shield" style={{ color: 'var(--accent)', flexShrink: 0 }} />
          Private key encrypted with AES-256-GCM using your login password — never stored in plain text.
        </div>

        <div className="field">
          <label>Key name</label>
          <input
            className="input"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="id_ed25519_main"
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label>Private key</label>
          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: '2px dashed var(--border-strong)',
              borderRadius: 8,
              padding: '20px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 12,
              color: 'var(--text-dim)',
              fontSize: 13,
              transition: 'border-color 0.15s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
          >
            <Icon name="upload" style={{ width: 24, height: 24, color: form.pem ? 'var(--accent)' : 'var(--text-faint)' }} />
            {form.pem
              ? <span style={{ color: 'var(--accent)' }}>File loaded — click to replace</span>
              : <span>Drop file or click to browse <span style={{ color: 'var(--text-faint)' }}>(id_rsa, id_ed25519, *.pem)</span></span>
            }
          </div>
          <input ref={fileRef} type="file" accept=".pem,.key,.rsa,.ed25519,*" style={{ display: 'none' }} onChange={handleFile} />

          <textarea
            className="input"
            value={form.pem}
            onChange={e => setForm(f => ({ ...f, pem: e.target.value }))}
            placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
            rows={8}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
            required
          />
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 12px', background: 'rgba(240,113,120,0.1)', borderRadius: 6 }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={() => navigate('/keys')}>Cancel</button>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? (
              <>
                <span className="activity-bar" style={{ marginRight: 4 }}><span/><span/><span/><span/></span>
                Encrypting & saving…
              </>
            ) : (
              <><Icon name="upload" />Upload key</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
