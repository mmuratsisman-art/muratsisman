/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS ön yükleme dosyası (node --require) */
'use strict';
/**
 * FAZ 3B-F0 — süreç içi egress guard (ön yükleme: NODE_OPTIONS="--require .../egress-guard.cjs").
 * Amaç: bu süreçten (ve NODE_OPTIONS'ı miras alan alt süreçlerden) LOOPBACK dışına çıkan her ağ girişimini ENGELLEMEK ve JSONL günlüğe yazmak.
 * Kapsam: net.Socket#connect (undici/fetch, http, https, http2 bunun üzerinden gider), tls.connect, dns.lookup/resolve*, dns.promises.*.
 * Kapsam DIŞI (README-F0.md "Kapsam dışı yollar"): child_process ile başlatılan harici programlar (curl vb.), yerel eklentiler (native addon),
 * dgram (UDP), Unix soket / adlandırılmış boru (yerel IPC; "local-ipc" olarak günlüğe yazılır, engellenmez), işletim sistemi düzeyi yalıtım.
 */
const fs = require('node:fs');
const net = require('node:net');
const tls = require('node:tls');
const dns = require('node:dns');

const STATE_KEY = Symbol.for('muratlab.f0.egressGuard');

function isLoopbackHost(h) {
  if (typeof h !== 'string' || h === '') return true; // host verilmemişse Node 'localhost' kullanır
  const x = h.toLowerCase().replace(/^\[|\]$/g, '');
  if (x === 'localhost' || x === '::1' || x === '0:0:0:0:0:0:0:1') return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(x)) return true;
  if (/^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(x)) return true;
  return false;
}

function install(logPath) {
  if (globalThis[STATE_KEY]) return globalThis[STATE_KEY];
  const state = { logPath: logPath || null, blocked: 0, installed: true };
  globalThis[STATE_KEY] = state;

  const write = (rec) => {
    const line = JSON.stringify({ t: new Date().toISOString(), pid: process.pid, ...rec }) + '\n';
    if (state.logPath) {
      try { fs.appendFileSync(state.logPath, line); } catch { /* günlük yazılamazsa yine de engelle */ }
    }
  };
  const block = (kind, host, port) => {
    state.blocked += 1;
    const stack = (new Error().stack || '').split('\n').slice(2, 6).map((s) => s.trim()).join(' | ');
    write({ kind: 'blocked', via: kind, host: String(host), port: port === undefined ? null : Number(port), stack });
    const err = new Error('F0_EGRESS_BLOCKED: ' + kind + ' -> ' + String(host) + (port === undefined ? '' : ':' + port));
    err.code = 'F0_EGRESS_BLOCKED';
    return err;
  };

  // --- net.Socket#connect: (options) | (port[, host]) | (path)
  const origConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    let a0 = args[0];
    if (Array.isArray(a0)) a0 = a0[0]; // net'in iç normalize edilmiş biçimi: [options, cb]
    let host; let port; let path;
    if (a0 && typeof a0 === 'object') { host = a0.host; port = a0.port; path = a0.path; }
    else if (typeof a0 === 'number' || (typeof a0 === 'string' && /^\d+$/.test(a0))) { port = a0; host = typeof args[1] === 'string' ? args[1] : undefined; }
    else if (typeof a0 === 'string') { path = a0; }
    if (path !== undefined && port === undefined) { write({ kind: 'local-ipc', path: 'redacted' }); return origConnect.apply(this, args); }
    if (!isLoopbackHost(host)) throw block('net.connect', host, port);
    return origConnect.apply(this, args);
  };

  // --- tls.connect
  const origTls = tls.connect;
  tls.connect = function (...args) {
    const o = args[0] && typeof args[0] === 'object' ? args[0] : { port: args[0], host: typeof args[1] === 'string' ? args[1] : undefined };
    const target = o.host || o.servername;
    if (o.socket === undefined && !isLoopbackHost(target)) throw block('tls.connect', target, o.port);
    return origTls.apply(this, args);
  };

  // --- DNS (geri çağrı ve promise API'leri)
  const wrapLookup = (orig, name) => function (hostname, ...rest) {
    if (!isLoopbackHost(hostname)) {
      const err = block(name, hostname);
      const cb = rest.find((x) => typeof x === 'function');
      if (cb) { process.nextTick(cb, err); return {}; }
      throw err;
    }
    return orig.call(this, hostname, ...rest);
  };
  dns.lookup = wrapLookup(dns.lookup, 'dns.lookup');
  for (const m of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveMx', 'resolveNs', 'resolveSrv', 'resolveTxt', 'reverse']) {
    if (typeof dns[m] === 'function') dns[m] = wrapLookup(dns[m], 'dns.' + m);
  }
  const dp = dns.promises;
  if (dp) {
    const origPl = dp.lookup;
    dp.lookup = async function (hostname, ...rest) {
      if (!isLoopbackHost(hostname)) throw block('dns.promises.lookup', hostname);
      return origPl.call(this, hostname, ...rest);
    };
    for (const m of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveMx', 'resolveNs', 'resolveSrv', 'resolveTxt', 'reverse']) {
      if (typeof dp[m] === 'function') {
        const o = dp[m];
        dp[m] = async function (hostname, ...rest) {
          if (!isLoopbackHost(hostname)) throw block('dns.promises.' + m, hostname);
          return o.call(this, hostname, ...rest);
        };
      }
    }
  }

  write({ kind: 'guard-loaded', argv0: process.argv[1] ? 'script' : 'repl' });
  return state;
}

// NODE_OPTIONS ile yüklendiğinde otomatik kurulur; günlük yolu env'den gelir.
if (process.env.F0_GUARD_LOG) install(process.env.F0_GUARD_LOG);

module.exports = { install, isLoopbackHost };
