import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import type { ChildEnv } from './config';
import { get, sleep } from './http';
import type { Sandbox } from './sandbox';

const nextBin = (sbx: Sandbox): string => join(sbx.dir, 'node_modules', 'next', 'dist', 'bin', 'next');

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}

export interface BuildResult { code: number | null; output: string; ms: number; logFile: string }

/** `next build` — shell YOK, npx YOK, kurulum YOK: doğrudan node + next/dist/bin/next. */
export function runBuild(sbx: Sandbox, env: ChildEnv, logFile: string): Promise<BuildResult> {
  mkdirSync(dirname(logFile), { recursive: true });
  const t0 = Date.now();
  return new Promise((resolve) => {
    const out: string[] = [];
    const child = spawn(process.execPath, [nextBin(sbx), 'build'], { cwd: sbx.dir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const log = createWriteStream(logFile);
    const onData = (d: Buffer) => { out.push(d.toString()); log.write(d); };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('close', (code) => { log.end(); resolve({ code, output: out.join(''), ms: Date.now() - t0, logFile }); });
  });
}

export interface AppInstance {
  baseUrl: string;
  port: number;
  pid: number;
  stop(): Promise<void>;
  logFile: string;
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGKILL');
}

/**
 * `next start` hazır olmadan çıktı. Çıkış kodu ve günlük metni taşır: çağıran (M08) bunun DOĞRULANMIŞ bir başlatma reddi
 * (beklenen kod + beklenen çıkış kodu + port kapalı) olup olmadığını kendisi sınıflar; yalnızca "erken çıktı" PASS sayılmaz.
 */
export class AppExitedEarly extends Error {
  constructor(public readonly label: string, public readonly exitCode: number | null, public readonly logFile: string, public readonly logText: string, public readonly port: number) {
    super(`next start erken çıktı (${label}); çıkış kodu ${exitCode ?? 'yok'}; günlük: ${logFile}`);
    this.name = 'AppExitedEarly';
  }
}

/** `next start` (yalnızca 127.0.0.1). Hazır olana kadar statik, Supabase'e dokunmayan bir uç noktayı yoklar. */
export async function startApp(sbx: Sandbox, env: ChildEnv, label: string, logDir: string, guardLog: string): Promise<AppInstance> {
  const port = await freePort();
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `${label}.log`);
  const log = createWriteStream(logFile);
  const child = spawn(process.execPath, [nextBin(sbx), 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: sbx.dir, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout?.on('data', (d: Buffer) => log.write(d));
  child.stderr?.on('data', (d: Buffer) => log.write(d));
  let exited = false;
  let exitCode: number | null = null;
  child.on('exit', (c) => { exited = true; exitCode = c; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  for (;;) {
    if (exited) {
      await new Promise<void>((resolve) => { child.stdout?.once('close', () => resolve()); setTimeout(resolve, 1500).unref(); });
      await new Promise<void>((resolve) => log.end(resolve));
      throw new AppExitedEarly(label, exitCode, logFile, existsSync(logFile) ? readFileSync(logFile, 'utf8') : '', port);
    }
    const r = await get(`${baseUrl}/manifest.webmanifest`, 3000);
    if (r.status === 200) break;
    if (Date.now() - t0 > 90000) { killTree(child); throw new Error(`next start hazır olmadı (${label})`); }
    await sleep(500);
  }
  const pid = child.pid ?? -1;
  // Guard bu süreçte gerçekten yüklendi mi? (yüklenmediyse ölçüm GEÇERSİZ)
  if (!guardLoadedFor(guardLog, pid)) { killTree(child); throw new Error(`GUARD YÜKLENMEDİ (pid ${pid}, ${label}): ölçüm durduruldu`); }
  return {
    baseUrl, port, pid, logFile,
    async stop() {
      if (!exited) {
        child.kill('SIGTERM');
        for (let i = 0; i < 20 && !exited; i++) await sleep(250);
        if (!exited) killTree(child);
      }
      log.end();
    },
  };
}

export interface GuardRecord { t: string; pid: number; kind: string; via?: string; host?: string; port?: number | null; stack?: string }
export function readGuardLog(file: string): GuardRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as GuardRecord);
}
export const guardLoadedFor = (file: string, pid: number): boolean => readGuardLog(file).some((r) => r.kind === 'guard-loaded' && r.pid === pid);
export const blockedRecords = (file: string): GuardRecord[] => readGuardLog(file).filter((r) => r.kind === 'blocked');
export const appendGuardNote = (file: string, rec: Record<string, unknown>): void => appendFileSync(file, JSON.stringify(rec) + '\n');
