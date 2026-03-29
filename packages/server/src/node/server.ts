import { createServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { handleConnection, getRooms } from '../core/gameServer';
import { NodeSocket } from '../socket/NodeSocket';

const PORT = Number(process.env.PORT || 3001);
const WS_PATH = process.env.WS_PATH || '/ws';

const httpServer = createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', service: 'hanamikoji-server', transport: 'ws' }));
    return;
  }

  if (req.url === '/api/rooms') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ rooms: getRooms() }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not Found', wsPath: WS_PATH }));
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket) => {
  handleConnection(new NodeSocket(ws));
});

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url !== WS_PATH) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    wss.emit('connection', ws, req);
  });
});

httpServer.listen(PORT, () => {
  console.log('==========================================');
  console.log('  Multiplayer Boardgame Server Ready');
  console.log('==========================================');
  console.log(`  HTTP: http://localhost:${PORT}`);
  console.log(`  WS:   ws://localhost:${PORT}${WS_PATH}`);
  console.log('==========================================');
});
