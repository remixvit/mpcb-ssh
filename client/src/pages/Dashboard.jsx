import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuthStore } from '../store/auth';
import Icon, { ColorDot } from '../components/Icon';
import StatusBadge from '../components/StatusBadge';

function useMouseGlow() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    el.addEventListener('mousemove', move);
    return () => el.removeEventListener('mousemove', move);
  }, []);
  return ref;
}

function Tile({ stat, onClick }) {
  const ref = useMouseGlow();
  return (
    <div ref={ref} className="tile" onClick={onClick}>
      <div className="tile-head">
        <div className="tile-ico"><Icon name={stat.icon} /></div>
        <div className="tile-name">{stat.name}</div>
        <Icon name="arrowR" className="ico tile-arrow" />
      </div>
      <div className="tile-value">{stat.value}</div>
      <div className="tile-meta">
        <span className="dot pulse"></span>{stat.meta}
      </div>
    </div>
  );
}

function SysStat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{value}</span>
    </div>
  );
}

function ActivityChart() {
  const bars = [4,6,3,8,12,9,14,11,7,5,4,3,5,8,11,15,18,22,17,13,9,7,5,4];
  const max = Math.max(...bars);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, padding: '4px 0' }}>
      {bars.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${v/max*100}%`,
          background: 'linear-gradient(180deg, var(--accent) 0%, rgba(128,203,196,0.2) 100%)',
          borderRadius: '2px 2px 0 0',
          opacity: 0.4 + (v/max)*0.6,
          boxShadow: v === max ? 'var(--accent-glow)' : 'none',
        }}></div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [data, setData] = useState({ servers: [], keys: [], tunnels: [], agents: [] });

  useEffect(() => {
    Promise.all([
      api.get('/servers'),
      api.get('/keys'),
      api.get('/tunnels'),
      api.get('/agents'),
    ]).then(([s, k, t, a]) => setData({
      servers: s.data,
      keys: k.data,
      tunnels: t.data,
      agents: a.data,
    })).catch(() => {});
  }, []);

  const tiles = [
    { icon: 'server',  name: 'Servers',  value: data.servers.length, meta: `${data.servers.length} configured`,      to: '/servers' },
    { icon: 'key',     name: 'SSH Keys', value: data.keys.length,    meta: 'stored encrypted',                        to: '/keys' },
    { icon: 'tunnel',  name: 'Tunnels',  value: data.tunnels.length, meta: `${data.tunnels.filter(t=>t.status==='running').length} running`, to: '/tunnels' },
    { icon: 'agent',   name: 'Agents',   value: data.agents.length,  meta: `${data.agents.filter(a=>a.online).length} online`,    to: '/agents' },
  ];

  const recent = data.servers.slice(0, 4);

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Welcome back, {user?.username || 'admin'}</div>
          <div className="page-sub">{new Date().toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <button className="btn" onClick={() => window.location.reload()}><Icon name="refresh" />Refresh</button>
        <button className="btn primary" onClick={() => navigate('/servers/new')}><Icon name="plus" />New server</button>
      </div>

      <div className="tile-grid stagger">
        {tiles.map(s => <Tile key={s.to} stat={s} onClick={() => navigate(s.to)} />)}
      </div>

      {recent.length > 0 && (
        <div className="section" style={{ marginTop: 28 }}>
          <div className="section-head">
            <h3>Servers</h3>
            <span className="hint">{data.servers.length} configured</span>
            <div style={{ flex: 1 }}></div>
            <button className="btn ghost sm" onClick={() => navigate('/servers')} style={{ color: 'var(--text-2)' }}>
              View all <Icon name="arrowR" />
            </button>
          </div>
          <div className="card">
            <table className="table">
              <thead><tr>
                <th>Server</th><th>Host</th><th>Status</th><th style={{ width: 130 }}></th>
              </tr></thead>
              <tbody>
                {recent.map(s => (
                  <tr key={s.id}>
                    <td>
                      <span className="row-tag-dot" style={{ background: s.color || 'var(--accent)', boxShadow: `0 0 8px ${s.color || '#80cbc4'}66` }} />
                      <b>{s.name}</b>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{s.username}@{s.host}:{s.port}</td>
                    <td><StatusBadge status="offline" /></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn primary sm" onClick={() => navigate(`/terminal/${s.id}`)}>
                        <Icon name="terminal" />Connect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 28 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="section-head" style={{ marginBottom: 14 }}>
            <h3>Activity (24h)</h3>
            <span className="hint">SSH sessions opened</span>
          </div>
          <ActivityChart />
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="section-head" style={{ marginBottom: 14 }}>
            <h3>System</h3>
            <span className="hint">mpcb-ssh</span>
          </div>
          <SysStat label="Servers" value={data.servers.length} />
          <SysStat label="SSH Keys" value={data.keys.length} />
          <SysStat label="Agents online" value={`${data.agents.filter(a=>a.online).length}/${data.agents.length}`} />
          <SysStat label="Daemon" value={<span><span className="dot pulse" style={{ display:'inline-block', marginRight:6, verticalAlign:'middle' }}></span>healthy</span>} />
        </div>
      </div>
    </div>
  );
}
