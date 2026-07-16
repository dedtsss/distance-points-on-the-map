import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { default: App } = await server.ssrLoadModule('/src/app/App.jsx');
  const html = renderToString(React.createElement(App));

  assert.match(html, /GPS Checker Map Photo/);
  assert.match(html, /Загрузка и проверка/);
  assert.match(html, /Карта/);
  assert.match(html, /Результаты/);
  assert.match(html, /Настройки/);
  assert.match(html, /Выберите фотографии/);
} finally {
  await server.close();
}

console.log('UI render tests passed');
