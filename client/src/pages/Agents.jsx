import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

// ── Meter bar ─────────────────────────────────────────────────────────────────
function Meter({ label, value, online }) {
  const pct = online && value != null ? value : 0;
  const color = pct > 85 ? '#f07178' : pct > 65 ? '#ffcb6b' : '#c3e88d';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{online && value != null ? `${value}%` : '—'}</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 99 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 600ms' }} />
      </div>
    </div>
  );
}

function fmtUptime(sec) {
  if (!sec) return null;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `up ${d}d ${h}h`;
  if (h > 0) return `up ${h}h ${m}m`;
  return `up ${m}m`;
}

// ── Agent card ────────────────────────────────────────────────────────────────
function AgentCard({ agent, onDelete }) {
  const ago    = agent.last_seen ? new Date(agent.last_seen * 1000).toLocaleString() : null;
  const uptime = fmtUptime(agent.uptime);
  const hasLoad = agent.load1 != null;

  return (
    <div className="card" style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="tile-ico" style={{
          width: 36, height: 36,
          background: agent.online ? 'rgba(195,232,141,0.10)' : 'rgba(255,255,255,0.04)',
          borderColor: agent.online ? 'rgba(195,232,141,0.25)' : 'var(--border)',
        }}>
          <Icon name="cpu" style={{ color: agent.online ? '#c3e88d' : 'var(--text-faint)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>{agent.name}</b>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {agent.hostname || '—'}
          </div>
        </div>
        <StatusBadge status={agent.online ? 'online' : 'offline'} />
      </div>

      {/* Metrics bars */}
      {agent.online && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
          <Meter label="CPU" value={agent.cpu} online={agent.online} />
          <Meter label="Mem" value={agent.mem} online={agent.online} />
          <Meter label="Disk" value={agent.disk} online={agent.online} />
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 11, color: 'var(--text-faint)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{agent.platform || '—'}</span>
          {agent.online && uptime && <span style={{ color: '#89ddff' }}>{uptime}</span>}
          {agent.online && hasLoad && (
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              load {agent.load1} {agent.load5} {agent.load15}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
          {ago ? `${agent.online ? 'seen' : 'last'} ${ago}` : 'Never connected'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" style={{ color: '#f07178' }} onClick={onDelete}>
          <Icon name="power" /> Revoke
        </button>
      </div>
    </div>
  );
}

// ── Token / install modal ─────────────────────────────────────────────────────
function TokenModal({ open, onClose, agentId, agentName, token }) {
  const [tab,    setTab]    = useState('linux');
  const [copied, setCopied] = useState(false);
  const serverUrl = window.location.origin;

  const installUrl = `${serverUrl}/api/agents/install?id=${agentId}&token=${encodeURIComponent(token)}&server=${encodeURIComponent(serverUrl)}`;

  const cmds = {
    linux: `curl -fsSL '${installUrl}' | sudo bash`,
    win:   [
      `cd $env:USERPROFILE`,
      `mkdir mpcb-agent -ErrorAction SilentlyContinue; cd mpcb-agent`,
      `Invoke-WebRequest '${serverUrl}/api/agents/download' -OutFile index.js`,
      `'{"name":"mpcb-agent","main":"index.js","dependencies":{"ws":"^8.18.0"}}' | Out-File package.json -Encoding utf8`,
      `npm install --omit=dev --quiet`,
      `$env:MPCB_SERVER='${serverUrl}'; $env:MPCB_ID='${agentId}'; $env:MPCB_TOKEN='${token}'; node index.js`,
    ].join('\n'),
  };

  const cmd = cmds[tab];

  function copy() {
    navigator.clipboard?.writeText(cmd).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // Reset copied when switching tabs
  function switchTab(t) { setTab(t); setCopied(false); }

  const tabStyle = (t) => ({
    padding: '4px 14px', fontSize: 12, cursor: 'pointer', borderRadius: 4,
    background: tab === t ? 'var(--bg-3)' : 'transparent',
    color: tab === t ? 'var(--text)' : 'var(--text-faint)',
    border: tab === t ? '1px solid var(--border)' : '1px solid transparent',
  });

  return (
    <Modal open={open} onClose={onClose} title={`Enroll agent — ${agentName}`} wide
      foot={<button className="btn primary" onClick={onClose}>Done</button>}>

      <p style={{ color: 'var(--text-2)', marginBottom: 12, fontSize: 13 }}>
        Run the following command on the target machine. The token is shown <b>once only</b>.
      </p>

      {/* OS tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <button style={tabStyle('linux')} onClick={() => switchTab('linux')}>🐧 Linux / macOS</button>
        <button style={tabStyle('win')}   onClick={() => switchTab('win')}>🪟 Windows (PowerShell)</button>
      </div>

      {/* Command block */}
      <div style={{ position: 'relative', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-2)' }}>
        <span style={{ color: 'var(--text-faint)', userSelect: 'none' }}>{tab === 'win' ? 'PS> ' : '$ '}</span>{cmd}
        <button
          className={`btn sm ${copied ? '' : 'ghost'}`}
          style={{ position: 'absolute', top: 8, right: 8 }}
          onClick={copy}
        >
          <Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Notes per OS */}
      {tab === 'linux' && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(137,221,255,0.05)', border: '1px solid rgba(137,221,255,0.15)', borderRadius: 6, fontSize: 12, color: 'var(--text-2)' }}>
          <b style={{ color: '#89ddff' }}>Requirements</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Linux (systemd preferred) or macOS</li>
            <li>Node.js 16+ — installed automatically on Debian/Ubuntu if missing</li>
            <li>Root privileges (for systemd service)</li>
          </ul>
        </div>
      )}
      {tab === 'win' && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,203,107,0.05)', border: '1px solid rgba(255,203,107,0.15)', borderRadius: 6, fontSize: 12, color: 'var(--text-2)' }}>
          <b style={{ color: '#ffcb6b' }}>Requirements</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Node.js 16+ — <a href="https://nodejs.org" target="_blank" rel="noreferrer" style={{ color: '#89ddff' }}>nodejs.org</a></li>
            <li>PowerShell 5+ (built into Windows 10/11)</li>
            <li>Runs in the current terminal — close window to stop</li>
          </ul>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-faint)' }}>
        The agent will appear online within ~30 seconds. Revoke anytime by deleting the agent.
      </p>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Agents() {
  const [agents,   setAgents]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newAgent, setNewAgent] = useState(null); // { id, name, token }

  const load = useCallback(() =>
    api.get('/agents').then(r => setAgents(r.data)).finally(() => setLoading(false)),
  []);

  useEffect(() => {
    load();
    // Poll for live online/stats status every 10 s
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function handleAdd() {
    const name = prompt('Agent name (e.g. "Home Desktop", "VPS-1"):');
    if (!name?.trim()) return;
    const { data } = await api.post('/agents', { name: name.trim() });
    setAgents(a => [...a, { id: data.id, name: data.name, online: false }]);
    setNewAgent({ id: data.id, name: data.name, token: data.token });
  }

  async function handleDelete(id) {
    if (!confirm('Revoke this agent? The daemon on the remote machine will stop connecting.')) return;
    await api.delete(`/agents/${id}`);
    setAgents(a => a.filter(x => x.id !== id));
  }

  const online = agents.filter(a => a.online).length;

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Agents</div>
          <div className="page-sub">
            {online} of {agents.length} online · helper daemons on managed machines
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={handleAdd}>
          <Icon name="bolt" /> Add agent
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-faint)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : agents.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <Icon name="agent" className="ico" style={{ width: 32, height: 32, opacity: 0.3 }} />
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 12 }}>No agents registered</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
            Add an agent to see real-time CPU/mem from remote machines
          </div>
          <button className="btn primary" style={{ marginTop: 20 }} onClick={handleAdd}>
            <Icon name="bolt" /> Add agent
          </button>
        </div>
      ) : (
        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {agents.map(a => (
            <AgentCard key={a.id} agent={a} onDelete={() => handleDelete(a.id)} />
          ))}
        </div>
      )}

      {newAgent && (
        <TokenModal
          open
          onClose={() => setNewAgent(null)}
          agentId={newAgent.id}
          agentName={newAgent.name}
          token={newAgent.token}
        />
      )}
    </div>
  );
}
