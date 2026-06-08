import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import ServerForm from './pages/ServerForm';
import Terminal from './pages/Terminal';
import Keys from './pages/Keys';
import KeyUpload from './pages/KeyUpload';
import Tunnels from './pages/Tunnels';
import Agents from './pages/Agents';
import Serial from './pages/Serial';
import Bluetooth from './pages/Bluetooth';
import IoT from './pages/IoT';
import Kiosk from './pages/Kiosk';
import Board from './pages/Board';
import Alerts from './pages/Alerts';

function PrivateRoute({ children }) {
  const { token, logout } = useAuthStore();

  // JWT lives in localStorage (persists across browser restarts) but
  // decryptionKey is in sessionStorage (cleared when all tabs close).
  // When they go out of sync, force re-login so the key gets re-derived.
  useEffect(() => {
    if (token && !sessionStorage.getItem('decryptionKey')) logout();
  }, [token, logout]);

  if (!token) return <Navigate to="/login" replace />;
  if (!sessionStorage.getItem('decryptionKey')) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/board" element={<Board />} />
      <Route path="/*" element={
        <PrivateRoute>
          <Layout>
            <Routes>
              <Route path="/"            element={<Dashboard />} />
              <Route path="/servers"       element={<Servers />} />
              <Route path="/servers/new"   element={<ServerForm />} />
              <Route path="/servers/:id"   element={<ServerForm />} />
              <Route path="/terminal/:id"  element={<Terminal />} />
              <Route path="/keys"          element={<Keys />} />
              <Route path="/keys/upload"   element={<KeyUpload />} />
              <Route path="/tunnels"     element={<Tunnels />} />
              <Route path="/agents"      element={<Agents />} />
              <Route path="/serial"      element={<Serial />} />
              <Route path="/bluetooth"   element={<Bluetooth />} />
              <Route path="/iot"         element={<IoT />} />
              <Route path="/kiosk"       element={<Kiosk />} />
              <Route path="/alerts"      element={<Alerts />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />
    </Routes>
  );
}
