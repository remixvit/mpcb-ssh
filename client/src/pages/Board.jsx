import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

function Bar({ value, warn = 70, crit = 90 }) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  const color = pct >= crit ? '#f07178' : pct >= warn ? '#ffcb6b' : '#c3e88d';
  return (
    <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color,
        borderRadius: 3, transition: 'width 0.6s ease' }} />
    </div>
  );
}

function fmt(v, unit = '%') {
  return v == null ? '—' : `${Math.round(v)}${unit}`;
}

function fmtUptime(sec) {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtBps(bps) {
  if (bps == null) return '—';
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
  if (bps >= 1_000)     return `${(bps / 1_000).toFixed(0)} KB/s`;
  return `${bps} B/s`;
}

function AgentCard({ a }) {
  return (
    <div style={{
      background: '#1a2226',
      border: `1px solid ${a.online ? 'rgba(128,203,196,0.2)' : 'rgba(240,113,120,0.2)'}`,
      borderRadius: 12,
      padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: a.online ? '#c3e88d' : '#f07178',
          boxShadow: a.online ? '0 0 6px #c3e88d' : 'none',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#eeffff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {a.name}
          </div>
          {(a.ip || a.hostname) && (
            <div style={{ fontSize: 10, color: 'rgba(238,255,255,0.35)',
              fontFamily: 'monospace', marginTop: 1 }}>
              {a.ip || a.hostname}
            </div>
          )}
        </div>
      </div>

      {!a.online ? (
        <div style={{ fontSize: 13, color: '#f07178', textAlign: 'center', padding: '8px 0' }}>Offline</div>
      ) : (
        <>
          {/* CPU */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(238,255,255,0.5)' }}>CPU</span>
              <span style={{ fontSize: 12, color: '#eeffff', fontFamily: 'monospace' }}>{fmt(a.cpu)}</span>
            </div>
            <Bar value={a.cpu} />
          </div>

          {/* RAM */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(238,255,255,0.5)' }}>RAM</span>
              <span style={{ fontSize: 12, color: '#eeffff', fontFamily: 'monospace' }}>{fmt(a.mem)}</span>
            </div>
            <Bar value={a.mem} warn={80} />
          </div>

          {/* Disk */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(238,255,255,0.5)' }}>Disk</span>
              <span style={{ fontSize: 12, color: '#eeffff', fontFamily: 'monospace' }}>{fmt(a.disk)}</span>
            </div>
            <Bar value={a.disk} warn={75} crit={90} />
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {[
              { label: 'Uptime', value: fmtUptime(a.uptime) },
              { label: 'Load',   value: a.load1 != null ? a.load1.toFixed(2) : '—' },
              { label: '↓',      value: fmtBps(a.rxBps) },
              { label: '↑',      value: fmtBps(a.txBps) },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, background: 'rgba(0,0,0,0.25)', borderRadius: 6,
                padding: '5px 6px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, color: 'rgba(238,255,255,0.4)', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: '#eeffff', fontFamily: 'monospace' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Board() {
  const [params]  = useSearchParams();
  const token     = params.get('token');
  const [agents,  setAgents]  = useState([]);
  const [error,   setError]   = useState('');
  const [lastUpd, setLastUpd] = useState(null);

  useEffect(() => {
    if (!token) { setError('No token in URL. Use /board?token=YOUR_TOKEN'); return; }

    async function fetch() {
      try {
        const r = await window.fetch(`/api/kiosk/stats?token=${encodeURIComponent(token)}`);
        if (!r.ok) { setError('Invalid token'); return; }
        setAgents(await r.json());
        setLastUpd(new Date());
        setError('');
      } catch { setError('Network error'); }
    }

    fetch();
    const id = setInterval(fetch, 5000);
    return () => clearInterval(id);
  }, [token]);

  return (
    <div style={{
      minHeight: '100vh', background: '#0d1518', color: '#eeffff',
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      padding: '20px 24px', boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#80cbc4', letterSpacing: '.1em' }}>
          MPCB SSH · STATUS BOARD
        </div>
        <div style={{ flex: 1 }} />
        {lastUpd && (
          <div style={{ fontSize: 10, color: 'rgba(238,255,255,0.3)' }}>
            updated {lastUpd.toLocaleTimeString()}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: error ? '#f07178' : '#c3e88d',
            boxShadow: error ? 'none' : '0 0 6px #c3e88d',
            display: 'inline-block',
          }} />
          <span style={{ fontSize: 10, color: 'rgba(238,255,255,0.4)' }}>
            {error || 'live'}
          </span>
        </div>
      </div>

      {error && !agents.length ? (
        <div style={{ textAlign: 'center', color: '#f07178', marginTop: 80, fontSize: 14 }}>{error}</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}>
          {agents.map(a => <AgentCard key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}
