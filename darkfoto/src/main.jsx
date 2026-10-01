import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(<App />);

if (import.meta.env.MODE === 'android-test') {
  import('./androidAcceptance.js').then(({ runAndroidAcceptance }) => {
    window.__darkfotoAndroidTest = runAndroidAcceptance;
  });
}
