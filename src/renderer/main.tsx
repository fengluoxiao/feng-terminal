import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import { App } from './ui/App';
import { DesktopPet } from './ui/DesktopPet';

const Root = window.location.hash === '#/pet' ? DesktopPet : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
