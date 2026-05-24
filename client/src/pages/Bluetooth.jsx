import { useState, useRef } from 'react';
import Icon from '../components/Icon';

// Common BLE service UUIDs — covers most devices without knowing specifics upfront
const COMMON_SERVICES = [
  'generic_access', 'generic_attribute', 'device_information', 'battery_service',
  'heart_rate', 'health_thermometer', 'human_interface_device', 'current_time',
  'environmental_sensing', 'fitness_machine', 'cycling_power',
  'running_speed_and_cadence', 'cycling_speed_and_cadence',
  // HM-10, HC-08, AT-09 (very common in IoT/Arduino)
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  // Nordic UART Service (NUS) — ESP32, nRF52
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  // Common custom ranges
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000fff1-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ff01-0000-1000-8000-00805f9b34fb',
];

// Full BLE SIG 16-bit service UUIDs (0x1800–0x183E) + vendor range (0xFF00–0xFFFF)
// Used only for "Full Scan" — slow but finds everything
const FULL_SERVICES = [
  ...COMMON_SERVICES,
  ...Array.from({ length: 0x183E - 0x1800 + 1 }, (_, i) => 0x1800 + i),
  ...Array.from({ length: 0x100 }, (_, i) => 0xFF00 + i),
];

const LS_KEY = (id) => `ble_services_${id}`;

export default function Bluetooth() {
  const [device, setDevice] = useState(null);
  const [server, setServer] = useState(null);
  const [services, setServices] = useState([]);
  const [selected, setSelected] = useState(null); // { service, chars }
  const [log, setLog] = useState([]);
  const [sendValue, setSendValue] = useState('');
  const [hexMode, setHexMode] = useState(false);
  const [extraUUIDs, setExtraUUIDs] = useState(''); // user-added UUIDs
  const [cachedDevice, setCachedDevice] = useState(null); // id of device with cached services
  const notifyRefs = useRef({});
  const supported = !!navigator.bluetooth;

  function addLog(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString();
    setLog(l => [...l.slice(-500), { ts, msg, type }]);
  }

  async function handleScan(fullScan = false) {
    const extra = extraUUIDs.split(/[\s,;]+/).filter(s => s.length > 0);
    const optionalServices = fullScan
      ? [...FULL_SERVICES, ...extra]
      : [...COMMON_SERVICES, ...extra];
    try {
      const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
      setDevice(dev);
      // Check if we have cached services for this device
      const cached = localStorage.getItem(LS_KEY(dev.id));
      setCachedDevice(cached ? dev.id : null);
      addLog(`Found: ${dev.name || dev.id}${cached ? ' (cached services)' : ''}${fullScan ? ' (full scan mode)' : ''}`, 'success');
      dev.addEventListener('gattserverdisconnected', () => {
        setServer(null); setServices([]); setSelected(null);
        addLog('Device disconnected', 'warn');
      });
    } catch (err) {
      if (err.name !== 'NotFoundError') addLog(err.message, 'error');
    }
  }

  async function handleConnect() {
    try {
      addLog('Connecting to GATT server…');
      const gatt = await device.gatt.connect();
      setServer(gatt);
      const svcs = await gatt.getPrimaryServices();
      setServices(svcs);
      // Cache discovered service UUIDs for this device
      if (svcs.length > 0) {
        const uuids = svcs.map(s => s.uuid);
        localStorage.setItem(LS_KEY(device.id), JSON.stringify(uuids));
        setCachedDevice(device.id);
      }
      addLog(`Connected. ${svcs.length} service(s) found.`, 'success');
    } catch (err) {
      addLog(err.message, 'error');
    }
  }

  async function handleDisconnect() {
    for (const [uuid, char] of Object.entries(notifyRefs.current)) {
      try { await char.stopNotifications(); } catch {}
    }
    notifyRefs.current = {};
    device?.gatt?.disconnect();
    setServer(null); setServices([]); setSelected(null);
    addLog('Disconnected');
  }

  async function selectService(svc) {
    try {
      const chars = await svc.getCharacteristics();
      setSelected({ service: svc, chars });
      addLog(`Service ${svc.uuid}: ${chars.length} characteristic(s)`);
    } catch (err) { addLog(err.message, 'error'); }
  }

  async function handleRead(char) {
    try {
      const val = await char.readValue();
      const bytes = new Uint8Array(val.buffer);
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const text = new TextDecoder().decode(bytes);
      addLog(`← [${char.uuid.slice(0, 8)}] HEX: ${hex}  TEXT: "${text}"`, 'data');
    } catch (err) { addLog(err.message, 'error'); }
  }

  async function handleNotify(char) {
    if (notifyRefs.current[char.uuid]) {
      await char.stopNotifications();
      char.removeEventListener('characteristicvaluechanged', notifyRefs.current[char.uuid]);
      delete notifyRefs.current[char.uuid];
      addLog(`Unsubscribed from ${char.uuid.slice(0, 8)}`);
      return;
    }
    try {
      await char.startNotifications();
      const handler = (e) => {
        const bytes = new Uint8Array(e.target.value.buffer);
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const text = new TextDecoder().decode(bytes);
        addLog(`◎ [${char.uuid.slice(0, 8)}] ${hexMode ? hex : `"${text}" (${hex})`}`, 'data');
      };
      char.addEventListener('characteristicvaluechanged', handler);
      notifyRefs.current[char.uuid] = handler;
      addLog(`Subscribed to ${char.uuid.slice(0, 8)}`, 'success');
    } catch (err) { addLog(err.message, 'error'); }
  }

  async function handleWrite(char) {
    if (!sendValue) return;
    try {
      let data;
      if (sendValue.match(/^([0-9a-fA-F]{2}\s*)+$/)) {
        data = new Uint8Array(sendValue.trim().split(/\s+/).map(h => parseInt(h, 16)));
      } else {
        data = new TextEncoder().encode(sendValue);
      }
      await char.writeValue(data);
      addLog(`→ [${char.uuid.slice(0, 8)}] ${sendValue}`, 'sent');
      setSendValue('');
    } catch (err) { addLog(err.message, 'error'); }
  }

  function getProps(char) {
    const p = char.properties;
    return [p.read && 'read', p.write && 'write', p.writeWithoutResponse && 'writeNoResp', p.notify && 'notify', p.indicate && 'indicate'].filter(Boolean);
  }

  const logColors = { info: 'var(--text-2)', success: '#c3e88d', error: '#f07178', warn: '#ffcb6b', data: '#89ddff', sent: '#c792ea' };

  if (!supported) return (
    <div className="page-enter">
      <div className="page-head"><div className="page-title">Bluetooth</div></div>
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ marginTop: 12, color: 'var(--text-2)' }}>Web Bluetooth API is not supported in this browser.</div>
        <div style={{ marginTop: 4, fontSize: 12 }}>Use Chrome or Edge 56+. Requires HTTPS.</div>
      </div>
    </div>
  );

  return (
    <div className="page-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Bluetooth</div>
          <div className="page-sub">BLE device inspector &amp; console</div>
        </div>
        <div style={{ flex: 1 }} />
        {!device ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={extraUUIDs}
              onChange={e => setExtraUUIDs(e.target.value)}
              placeholder="Extra service UUIDs (optional, space/comma separated)"
              style={{ width: 280, fontSize: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '4px 8px', fontFamily: 'var(--font-mono)' }}
            />
            <button className="btn primary" onClick={() => handleScan(false)}><Icon name="bluetooth" /> Scan</button>
            <button
              className="btn ghost"
              onClick={() => handleScan(true)}
              title="Scans all Bluetooth SIG 16-bit UUIDs + vendor range. Slower but finds any device."
            ><Icon name="bluetooth" /> Full Scan</button>
          </div>
        ) : !server ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{device.name || device.id}</span>
            {cachedDevice === device.id && (
              <span
                style={{ fontSize: 11, color: '#89ddff', background: 'rgba(137,221,255,0.1)', border: '1px solid rgba(137,221,255,0.3)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}
                title="Cached service UUIDs will be used. Click to clear."
                onClick={() => { localStorage.removeItem(LS_KEY(device.id)); setCachedDevice(null); addLog('Cache cleared for this device', 'warn'); }}
              >⚡ cached</span>
            )}
            <button className="btn primary" onClick={handleConnect}>Connect</button>
            <button className="btn ghost" onClick={() => { setDevice(null); setCachedDevice(null); }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#c3e88d', fontSize: 13 }}>● {device.name || device.id}</span>
            <button className="btn ghost sm" onClick={handleDisconnect}>Disconnect</button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: server ? '240px 1fr' : '1fr', gap: 16 }}>
        {/* Services panel */}
        {server && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Services</div>
            {services.map(svc => (
              <div
                key={svc.uuid}
                onClick={() => selectService(svc)}
                style={{
                  padding: '8px 14px', cursor: 'pointer', fontSize: 12,
                  background: selected?.service?.uuid === svc.uuid ? 'var(--bg-3)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)', color: 'var(--text-2)',
                }}
              >
                {svc.uuid}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Characteristics */}
          {selected && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Characteristics — {selected.service.uuid}
              </div>
              <table className="table">
                <thead><tr><th>UUID</th><th>Properties</th><th style={{ width: 200 }}></th></tr></thead>
                <tbody>
                  {selected.chars.map(char => {
                    const props = getProps(char);
                    const isNotifying = !!notifyRefs.current[char.uuid];
                    return (
                      <tr key={char.uuid}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{char.uuid}</td>
                        <td>{props.map(p => <span key={p} className="badge" style={{ marginRight: 4 }}>{p}</span>)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {props.includes('read') && (
                              <button className="btn ghost sm" onClick={() => handleRead(char)}>Read</button>
                            )}
                            {(props.includes('write') || props.includes('writeNoResp')) && (
                              <button className="btn ghost sm" onClick={() => handleWrite(char)}>Write</button>
                            )}
                            {props.includes('notify') && (
                              <button className={`btn sm ${isNotifying ? '' : 'ghost'}`} onClick={() => handleNotify(char)}>
                                {isNotifying ? '◎ Stop' : 'Notify'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Write input */}
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <input
                  value={sendValue}
                  onChange={e => setSendValue(e.target.value)}
                  placeholder="Value (text or hex: AA BB CC)"
                  style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>
          )}

          {/* Log */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Console</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={hexMode} onChange={e => setHexMode(e.target.checked)} /> HEX
                </label>
                <button className="btn ghost sm" style={{ fontSize: 11 }} onClick={() => setLog([])}>Clear</button>
              </div>
            </div>
            <div style={{ height: 300, overflowY: 'auto', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {log.length === 0 ? (
                <div style={{ color: 'var(--text-faint)', padding: '20px 0', textAlign: 'center' }}>No data yet</div>
              ) : log.map((entry, i) => (
                <div key={i} style={{ color: logColors[entry.type], marginBottom: 2 }}>
                  <span style={{ color: 'var(--text-faint)', marginRight: 8 }}>{entry.ts}</span>
                  {entry.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
