import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import { App } from './ui/App';

document.documentElement.dataset.windowFocused = document.hasFocus() ? 'true' : 'false';

window.windowApi.onFocusState((focused) => {
  document.documentElement.dataset.windowFocused = focused ? 'true' : 'false';
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
