import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuthStore } from '../store/auth';
import MatrixRain from '../components/MatrixRain';
import Icon, { BrandMark } from '../components/Icon';

export default function Login() {
  const [form, setForm] = useState({ username: 'admin', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.password) { setError('Password required'); return; }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(form.password), 'PBKDF2', false, ['deriveBits']);
      const saltRes = await api.get(`/auth/encryption-salt?username=${encodeURIComponent(form.username)}`);
      const saltHex = saltRes.data.salt;
      const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
      const keyBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
      );
      const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(keyBits)));
      sessionStorage.setItem('decryptionKey', keyBase64);
      login(data.accessToken, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <MatrixRain density={1} hue={175} />
      <div className="login-vignette"></div>
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <BrandMark size={36} />
          <div>
            <h1>MPCB SSH</h1>
            <small>SELF-HOSTED · v1.0.0</small>
          </div>
        </div>

        <div className="login-fields">
          <div className="field">
            <label>Username</label>
            <div className="input-icon">
              <Icon name="user" />
              <input
                className="input"
                autoFocus
                value={form.username}
                onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setError(''); }}
                placeholder="admin"
              />
            </div>
          </div>
          <div className="field">
            <label>Password</label>
            <div className="input-icon">
              <Icon name="lock" />
              <input
                className="input"
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setError(''); }}
                placeholder="••••••••"
              />
              <button type="button" className="btn ghost sm" style={{
                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: '4px 6px'
              }} onClick={() => setShowPass(s => !s)} tabIndex={-1}>
                <Icon name="eye" />
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              ⚠ {error}
            </div>
          )}

          <button type="submit" className="btn primary" style={{ justifyContent: 'center', marginTop: 8 }} disabled={loading}>
            {loading ? (
              <>
                <span className="activity-bar" style={{ marginRight: 4 }}>
                  <span/><span/><span/><span/>
                </span>
                Authenticating…
              </>
            ) : (
              <>Sign in <Icon name="arrow" /></>
            )}
          </button>
        </div>

        <div className="login-foot">MPCB · ENCRYPTED SESSION · TLS 1.3</div>
      </form>
    </div>
  );
}
