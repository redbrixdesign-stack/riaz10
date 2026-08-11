#!/usr/bin/env node
/* ============================================
   ADVISOROS — MOCK AI PROXY FOR BROWSER TESTS
   Serves the same contract as api/claude.mjs so
   tests/browser/ai.html can run the real client
   service against a local stand-in.
     POST /claude  -> ok responses (ping/ocr/draft)
     POST /fail    -> 502 with a message
     POST /slow    -> never responds (client timeout)
   ============================================ */

'use strict';

const http = require('http');

const PORT = 8001;

const USAGE = { input_tokens: 20, output_tokens: 8, cost: 0.00001 };

http.createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, x-ai-key');
  res.setHeader('content-type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (path === '/slow') return; // never respond — exercises the client timeout

    if (path === '/claude') {
      const p = JSON.parse(body || '{}');
      const reply = p.type === 'ping' ? { text: 'pong', model: 'claude-haiku-4-5' }
        : p.type === 'ocr' ? { text: '{"name":"Alice Smith"}', model: p.model }
        : p.type === 'draft' ? { text: 'Hi Bob!', model: p.model }
        : null;
      if (reply) {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, ...reply, type: p.type, usage: USAGE }));
        return;
      }
    }

    if (path === '/fail') {
      res.writeHead(502);
      res.end(JSON.stringify({ ok: false, error: 'mock', message: 'mock: fail' }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: 'not_found', message: 'mock: unknown path' }));
  });
}).listen(PORT, () => console.log('mock AI proxy listening on :' + PORT));
