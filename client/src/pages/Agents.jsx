import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtUptime(sec) {
  if (!sec) return null;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `up ${d}d ${h}h`;
  if (h > 0) return `up ${h}h ${m}m`;
  return `up ${m}m`;
}

function fmtBps(bps) {
  if (bps == null) return '—';
  if (bps < 1024)        return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1048576).toFixed(1)} MB/s`;
}

// ── Meter bar ─────────────────────────────────────────────────────────────────
function Meter({ label, value, online }) {
  const pct   = online && value != null ? value : 0;
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

// ── Agent card ────────────────────────────────────────────────────────────────
function AgentCard({ agent, onDelete }) {
  const ago    = agent.last_seen ? new Date(agent.last_seen * 1000).toLocaleString() : null;
  const uptime = fmtUptime(agent.uptime);
  const hasLoad = agent.load1 != null;
  const hasNet  = agent.rxBps != null || agent.txBps != null;

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

      {/* Metric bars */}
      {agent.online && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
          <Meter label="CPU"  value={agent.cpu}  online={agent.online} />
          <Meter label="Mem"  value={agent.mem}  online={agent.online} />
          <Meter label="Disk" value={agent.disk} online={agent.online} />
        </div>
      )}

      {/* Network row */}
      {agent.online && hasNet && (
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
          <span>↓ <span style={{ color: '#c3e88d' }}>{fmtBps(agent.rxBps)}</span></span>
          <span>↑ <span style={{ color: '#89ddff' }}>{fmtBps(agent.txBps)}</span></span>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12, fontSize: 11, color: 'var(--text-faint)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{agent.platform || '—'}</span>
          {agent.online && uptime && <span style={{ color: '#89ddff' }}>{uptime}</span>}
          {agent.online && hasLoad && (
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              load {agent.load1} {agent.load5} {agent.load15}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {ago ? `${agent.online ? 'seen' : 'last'} ${new Date(agent.last_seen * 1000).toLocaleString()}` : 'Never connected'}
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

// ── Install / auto-start modal ────────────────────────────────────────────────
function CmdBlock({ prefix, children, onCopy, copied }) {
  return (
    <div style={{ position: 'relative', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-2)' }}>
      {prefix && <span style={{ color: 'var(--text-faint)', userSelect: 'none' }}>{prefix} </span>}
      {children}
      <button className={`btn sm ${copied ? '' : 'ghost'}`} style={{ position: 'absolute', top: 8, right: 8 }} onClick={onCopy}>
        <Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function TokenModal({ open, onClose, agentId, agentName, token }) {
  const [tab,    setTab]    = useState('linux');
  const [copied, setCopied] = useState('');
  const srv = window.location.origin;

  const installUrl = `${srv}/api/agents/install?id=${agentId}&token=${encodeURIComponent(token)}&server=${encodeURIComponent(srv)}`;

  function copy(key, text) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  }

  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => { setTab(id); setCopied(''); }}
      style={{
        padding: '4px 14px', fontSize: 12, cursor: 'pointer', borderRadius: 4,
        background: tab === id ? 'var(--bg-3)' : 'transparent',
        color: tab === id ? 'var(--text)' : 'var(--text-faint)',
        border: tab === id ? '1px solid var(--border)' : '1px solid transparent',
      }}
    >{label}</button>
  );

  // ── Linux content
  const linuxInstall = `curl -fsSL '${installUrl}' | sudo bash`;

  // ── macOS content
  const macInstall = [
    `sudo mkdir -p /opt/mpcb-agent && cd /opt/mpcb-agent`,
    `sudo curl -fsSL '${srv}/api/agents/download' -o index.js`,
    `echo '{"name":"mpcb-agent","main":"index.js","dependencies":{"ws":"^8.18.0"}}' | sudo tee package.json`,
    `sudo npm install --omit=dev --quiet`,
  ].join('\n');
  const macPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.mpcb.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/opt/mpcb-agent/index.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>MPCB_SERVER</key><string>${srv}</string>
    <key>MPCB_ID</key><string>${agentId}</string>
    <key>MPCB_TOKEN</key><string>${token}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/mpcb-agent.log</string>
  <key>StandardErrorPath</key><string>/tmp/mpcb-agent.log</string>
</dict></plist>`;
  const macAutoStart = [
    `sudo tee /etc/mpcb-agent.plist <<'EOF'\n${macPlist}\nEOF`,
    `sudo cp /etc/mpcb-agent.plist /Library/LaunchDaemons/com.mpcb.agent.plist`,
    `sudo launchctl load -w /Library/LaunchDaemons/com.mpcb.agent.plist`,
  ].join('\n');

  // ── Windows content
  const winInstall = [
    `cd $env:USERPROFILE`,
    `mkdir mpcb-agent -ErrorAction SilentlyContinue; cd mpcb-agent`,
    `Invoke-WebRequest '${srv}/api/agents/download' -OutFile index.js`,
    `'{"name":"mpcb-agent","main":"index.js","dependencies":{"ws":"^8.18.0"}}' | Out-File package.json -Encoding utf8`,
    `npm install --omit=dev --quiet`,
    `$env:MPCB_SERVER='${srv}'; $env:MPCB_ID='${agentId}'; $env:MPCB_TOKEN='${token}'; node index.js`,
  ].join('\n');
  const winAutoStart = [
    `# Save start script`,
    `@"`,
    `@echo off`,
    `set MPCB_SERVER=${srv}`,
    `set MPCB_ID=${agentId}`,
    `set MPCB_TOKEN=${token}`,
    `node "%USERPROFILE%\\mpcb-agent\\index.js"`,
    `"@ | Out-File "$env:USERPROFILE\\mpcb-agent\\start.bat" -Encoding ascii`,
    ``,
    `# Register Task Scheduler (runs at logon, restarts on failure)`,
    `$a = New-ScheduledTaskAction -Execute "$env:USERPROFILE\\mpcb-agent\\start.bat"`,
    `$t = New-ScheduledTaskTrigger -AtLogon`,
    `$s = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Seconds 30)`,
    `Register-ScheduledTask -TaskName "MPCB Agent" -Action $a -Trigger $t -Settings $s -RunLevel Highest -Force`,
    `Start-ScheduledTask -TaskName "MPCB Agent"`,
  ].join('\n');

  return (
    <Modal open={open} onClose={onClose} title={`Enroll agent — ${agentName}`} wide
      foot={<button className="btn primary" onClick={onClose}>Done</button>}>

      <p style={{ color: 'var(--text-2)', marginBottom: 12, fontSize: 13 }}>
        Run the commands on the target machine. Token shown <b>once only</b>.
      </p>

      {/* OS tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {tabBtn('linux', '🐧 Linux')}
        {tabBtn('mac',   '🍎 macOS')}
        {tabBtn('win',   '🪟 Windows')}
      </div>

      {/* ── Linux ── */}
      {tab === 'linux' && (<>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>
          One-liner — downloads, installs dependencies, creates <b>systemd</b> service automatically.
        </p>
        <CmdBlock prefix="$" onCopy={() => copy('linux', linuxInstall)} copied={copied === 'linux'}>
          {linuxInstall}
        </CmdBlock>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-faint)' }}>
          ✓ Auto-start on boot via systemd is included.<br />
          Check status: <code>systemctl status mpcb-agent</code> · Logs: <code>journalctl -u mpcb-agent -f</code>
        </div>
      </>)}

      {/* ── macOS ── */}
      {tab === 'mac' && (<>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>Step 1 — install:</p>
        <CmdBlock prefix="$" onCopy={() => copy('mac-install', macInstall)} copied={copied === 'mac-install'}>
          {macInstall}
        </CmdBlock>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '12px 0 6px' }}>Step 2 — auto-start via <b>launchd</b> (runs as daemon, survives reboot):</p>
        <CmdBlock prefix="$" onCopy={() => copy('mac-auto', macAutoStart)} copied={copied === 'mac-auto'}>
          {macAutoStart}
        </CmdBlock>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-faint)' }}>
          Logs: <code>tail -f /tmp/mpcb-agent.log</code>
        </div>
      </>)}

      {/* ── Windows ── */}
      {tab === 'win' && (<>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>Step 1 — install &amp; test (PowerShell):</p>
        <CmdBlock prefix="PS>" onCopy={() => copy('win-install', winInstall)} copied={copied === 'win-install'}>
          {winInstall}
        </CmdBlock>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '12px 0 6px' }}>Step 2 — auto-start via <b>Task Scheduler</b> (starts at logon, restarts on crash):</p>
        <CmdBlock prefix="PS>" onCopy={() => copy('win-auto', winAutoStart)} copied={copied === 'win-auto'}>
          {winAutoStart}
        </CmdBlock>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-faint)' }}>
          Requires Node.js 16+ · <a href="https://nodejs.org" target="_blank" rel="noreferrer" style={{ color: '#89ddff' }}>nodejs.org</a>
        </div>
      </>)}

      <p style={{ marginTop: 14, fontSize: 12, color: 'var(--text-faint)' }}>
        Agent appears online within ~30 seconds. Revoke anytime by deleting it.
      </p>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Agents() {
  const [agents,   setAgents]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newAgent, setNewAgent] = useState(null);

  const load = useCallback(() =>
    api.get('/agents').then(r => setAgents(r.data)).finally(() => setLoading(false)),
  []);

  useEffect(() => {
    load();
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
          <div className="page-sub">{online} of {agents.length} online · helper daemons on managed machines</div>
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
            Add an agent to monitor CPU, RAM, disk and network on remote machines
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
