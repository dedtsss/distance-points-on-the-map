import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import 'leaflet/dist/leaflet.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
