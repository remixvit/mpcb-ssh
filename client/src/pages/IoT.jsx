import { useState, useRef } from 'react';
import Icon from '../components/Icon';

const PRESETS = [
  { label: 'ESP32/ESP8266 AP', url: 'http://192.168.4.1' },
  { label: 'Router default', url: 'http://192.168.1.1' },
  { label: 'Router alt', url: 'http://192.168.0.1' },
  { label: 'Tasmota', url: 'http://192.168.4.1' },
  { label: 'localhost', url: 'http://localhost' },
];

export default function IoT() {
  const [url, setUrl] = useState('http://192.168.4.1');
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState('');
  const [error, setError] = useState('');
  const iframeRef = useRef(null);

  function navigate(target) {
    setError('');
    setLoaded(false);
    let u = target.trim();
    if (u && !u.match(/^https?:\/\//)) u = 'http://' + u;
    setUrl(u);
    setActive(u);
  }

  function handleKey(e) {
    if (e.key === 'Enter') navigate(url);
  }

  function handleLoad() { setLoaded(true); }
  function handleError() {
    setLoaded(true);
    setError('Could not load. The device may be unreachable, or it blocks iframes (X-Frame-Options).');
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', margin: '-28px -32px -40px', background: 'var(--bg)' }}>
      {/* Address bar */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', alignItems: 'center', flexShrink: 0 }}>
        <button className="btn ghost sm" onClick={() => iframeRef.current?.contentWindow?.history?.back()} title="Back">
          <Icon name="arrowR" style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button className="btn ghost sm" onClick={() => iframeRef.current?.contentWindow?.location?.reload()} title="Reload">
          <Icon name="refresh" />
        </button>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={handleKey}
          placeholder="http://192.168.4.1"
          style={{
            flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text)', padding: '5px 10px', fontSize: 13, fontFamily: 'var(--font-mono)',
          }}
        />
        <button className="btn primary sm" onClick={() => navigate(url)}>Go</button>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PRESETS.map(p => (
            <button
              key={p.url + p.label}
              className="btn ghost sm"
              style={{ fontSize: 11, whiteSpace: 'nowrap', color: active === p.url ? 'var(--accent)' : 'var(--text-faint)' }}
              onClick={() => { setUrl(p.url); navigate(p.url); }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      {!active && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-dim)' }}>
          <Icon name="iot" style={{ width: 40, height: 40, opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>Enter a device address or pick a preset</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            Your machine must be connected to the device's WiFi network
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {PRESETS.slice(0, 3).map(p => (
              <button key={p.label} className="btn ghost" onClick={() => { setUrl(p.url); navigate(p.url); }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {active && error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: '#f07178', fontSize: 14 }}>{error}</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', maxWidth: 480, textAlign: 'center' }}>
            Some devices send <code>X-Frame-Options: DENY</code> which prevents embedding.
            Try opening <a href={active} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{active}</a> directly in a new tab.
          </div>
        </div>
      )}

      {active && !error && (
        <>
          {!loaded && (
            <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-faint)' }}>
              Connecting to {active}…
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={active}
            onLoad={handleLoad}
            onError={handleError}
            style={{ flex: 1, border: 'none', display: loaded ? 'block' : 'none', background: '#fff' }}
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
            title="IoT Device"
          />
        </>
      )}
    </div>
  );
}
