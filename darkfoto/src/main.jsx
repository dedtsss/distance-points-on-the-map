import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { setupIonicReact } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import './style.css';

setupIonicReact({ mode: 'md' });
createRoot(document.getElementById('root')).render(<App />);

if (import.meta.env.MODE === 'android-test') {
  import('./androidAcceptance.js').then(({ runAndroidAcceptance }) => {
    window.__darkfotoAndroidTest = runAndroidAcceptance;
  });
}
