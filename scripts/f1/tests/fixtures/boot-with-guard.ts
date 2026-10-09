/**
 * Sunucu başlangıcının MİNİ taklidi: önce GERÇEK src/instrumentation-node.ts → runBuildSourceGuard() çalışır, ardından bir HTTP sunucusu dinlemeye başlar.
 * Kontrol süreci durdurursa "LISTENING" HİÇ yazılmaz. (Next'in kendisi değildir; Next altındaki davranış F0 M08 ile ölçülür.)
 */
import http from 'node:http';
import { runBuildSourceGuard } from '../../../../src/instrumentation-node';

runBuildSourceGuard();
const server = http.createServer((_req, res) => { res.end('ok'); });
server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  console.log(`PORT ${port}`);
  console.log(`LISTENING ${port}`);
});
