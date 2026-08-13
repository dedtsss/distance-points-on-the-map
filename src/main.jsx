import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import App from './app/App.jsx';
import 'leaflet/dist/leaflet.css';
import 'antd/dist/reset.css';
import './styles.css';
import { darkCatTheme } from './theme/darkCatTheme.js';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={darkCatTheme}><App /></ConfigProvider>
  </React.StrictMode>,
);
