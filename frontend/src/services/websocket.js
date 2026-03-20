// services/websocket.js
import { store } from '../store/store';
import { updatePosition, upsertFlight } from '../store/flightSlice';
import { addAlert, dismissAlert } from '../store/alertSlice';
import { setWsStatus, addNotification } from '../store/uiSlice';

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`;
// Only attempt WS if explicitly configured (not the default fallback)
const WS_ENABLED = !!import.meta.env.VITE_WS_URL;

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export const connectWS = (token) => {
  if (!WS_ENABLED) {
    console.info('[WS] WebSocket disabled — set VITE_WS_URL to enable');
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(`${WS_URL}?token=${token}`);
  store.dispatch(setWsStatus('CONNECTING'));

  ws.onopen = () => {
    store.dispatch(setWsStatus('CONNECTED'));
    reconnectAttempts = 0;
    clearTimeout(reconnectTimer);
    console.log('[WS] Connected to AVIONIX gateway');
  };

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      handleMessage(msg);
    } catch (e) {
      console.error('[WS] Parse error', e);
    }
  };

  ws.onclose = () => {
    store.dispatch(setWsStatus('DISCONNECTED'));
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      scheduleReconnect(token);
    }
  };

  ws.onerror = () => {
    store.dispatch(setWsStatus('ERROR'));
  };
};

const handleMessage = (msg) => {
  switch (msg.type) {
    case 'POSITION_UPDATE':
      store.dispatch(updatePosition(msg.data));
      break;
    case 'FLIGHT_UPDATE':
    case 'FLIGHT_FILED':
    case 'FLIGHT_ACTIVATED':
      store.dispatch(upsertFlight(msg.data));
      break;
    case 'ALERT':
    case 'STCA':
    case 'MSAW': {
      store.dispatch(addAlert(msg.data));
      if (msg.data.severity === 'CRITICAL' || msg.data.severity === 'HIGH') {
        store.dispatch(addNotification({
          type: 'alert',
          severity: msg.data.severity,
          message: `${msg.data.alert_type}: ${msg.data.callsign_primary}${msg.data.callsign_secondary ? ` vs ${msg.data.callsign_secondary}` : ''}`,
        }));
        playAlertSound(msg.data.severity);
      }
      break;
    }
    case 'ALERT_DISMISSED':
      store.dispatch(dismissAlert(msg.data.id));
      break;
    case 'HANDOFF':
      store.dispatch(addNotification({ type: 'handoff', message: `Handoff: ${msg.data.callsign} to ${msg.data.to_sector}` }));
      break;
    default:
      break;
  }
};

const playAlertSound = (severity) => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = severity === 'CRITICAL' ? 880 : 660;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (_) {}
};

const scheduleReconnect = (token) => {
  reconnectAttempts++;
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
  console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  reconnectTimer = setTimeout(() => connectWS(token), delay);
};

export const disconnectWS = () => {
  clearTimeout(reconnectTimer);
  if (ws) { ws.close(); ws = null; }
};

export const sendWS = (type, data) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
};
