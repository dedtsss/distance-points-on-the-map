import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import DashboardPilot from './pilot/DashboardPilot.jsx';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const isPilot = window.location.pathname.startsWith('/pilot/dashboard-')
  || new URLSearchParams(window.location.search).get('pilot')?.startsWith('dashboard-');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isPilot ? <DashboardPilot /> : <App />}
  </React.StrictMode>,
);
