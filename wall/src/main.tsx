import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { App } from './App';
import { Dashboard } from './Dashboard';

const isDashboard = getCurrentWindow().label === 'dashboard';
if (isDashboard) document.documentElement.classList.add('dashboard');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDashboard ? <Dashboard /> : <App />}
  </React.StrictMode>,
);
