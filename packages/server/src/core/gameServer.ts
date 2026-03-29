import type { EngineState } from '@hanamikoji/engine';
import type { JoinRoomResponse, PlayerId } from '@hanamikoji/shared';
import { applyDrawCard, applyPlayAction, applyResolveAction, createNewGame, updateConnectionState } from '../adapters/engineAdapter';
import type { ISocket } from '../socket/ISocket';
import type { ClientMessage } from './protocol';
import { RoomManager } from './roomManager';
import type { BroadcastTarget, ConnectionContext } from './types';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class GameServer {
  private readonly roomManager = new RoomManager<EngineState>(2);
  private readonly connections = new WeakMap<ISocket, ConnectionContext>();

  handleConnection = (socket: ISocket): void => {
    const connection: ConnectionContext = {
      connectionId: randomId(),
      socket,
      roomId: null,
      playerId: null,
      clientPlayerId: null,
      playerName: null,
    };

    this.connections.set(socket, connection);
    console.log(`[server] connected ${connection.connectionId}`);

    socket.onMessage((message) => this.handleMessage(connection, message));
    socket.onClose(() => this.handleDisconnect(connection, false));
  };

  getRooms(): Array<{ roomId: string; playerCount: number; hasGame: boolean }> {
    return this.roomManager.listRooms();
  }

  private handleMessage(connection: ConnectionContext, message: ClientMessage): void {
    console.log(`[server] ${connection.connectionId} -> ${message.type}`);

    try {
      switch (message.type) {
        case 'ping':
          connection.socket.send({ type: 'pong' });
          return;
        case 'joinRoom':
          this.handleJoinRoom(connection, message.payload.roomId, message.payload.playerId, message.payload.name);
          return;
        case 'leaveRoom':
          this.handleDisconnect(connection, false);
          return;
        case 'drawCard':
          this.withGame(connection, (roomId, playerId, state) => {
            const transition = applyDrawCard(state, playerId);
            this.roomManager.setGameState(roomId, transition.state);
            this.dispatchTargets(roomId, transition.messages);
          });
          return;
        case 'playAction':
          this.withGame(connection, (roomId, playerId, state) => {
            const transition = applyPlayAction(state, playerId, message.payload);
            this.roomManager.setGameState(roomId, transition.state);
            this.dispatchTargets(roomId, transition.messages);
          });
          return;
        case 'resolveAction':
          this.withGame(connection, (roomId, playerId, state) => {
            const transition = applyResolveAction(state, playerId, message.payload.selection);
            this.roomManager.setGameState(roomId, transition.state);
            this.dispatchTargets(roomId, transition.messages);
          });
          return;
        default:
          connection.socket.send({ type: 'error', payload: { message: '不支持的消息类型' } });
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '服务器处理失败';
      console.error(`[server] error on ${message.type}: ${messageText}`);
      if (message.type === 'joinRoom') {
        connection.socket.send({ type: 'roomJoined', payload: { success: false, message: messageText } });
      } else {
        connection.socket.send({ type: 'error', payload: { message: messageText } });
      }
    }
  }

  private handleJoinRoom(connection: ConnectionContext, roomId: string, clientPlayerId: string, name: string): void {
    const result = this.roomManager.joinRoom({
      roomId,
      socket: connection.socket,
      connectionId: connection.connectionId,
      clientPlayerId: clientPlayerId || connection.connectionId,
      name,
    });

    connection.roomId = result.room.roomId;
    connection.playerId = result.seat.player.playerId;
    connection.clientPlayerId = result.seat.clientPlayerId;
    connection.playerName = name;

    const response: JoinRoomResponse & { playerId: PlayerId; players: ReturnType<RoomManager<EngineState>['getPlayers']> } = {
      success: true,
      roomId: result.room.roomId,
      playerId: result.seat.player.playerId,
      players: this.roomManager.getPlayers(result.room.roomId),
    };

    connection.socket.send({ type: 'roomJoined', payload: response });

    if (result.reconnected) {
      console.log(`[server] ${name} reconnected to ${result.room.roomId} as ${result.seat.player.playerId}`);
      if (result.room.gameState) {
        const transition = updateConnectionState(result.room.gameState, result.seat.player.playerId, true, connection.connectionId);
        this.roomManager.setGameState(result.room.roomId, transition.state);
        this.dispatchTargets(result.room.roomId, transition.messages);
      }
      return;
    }

    this.roomManager.broadcast(
      result.room.roomId,
      { type: 'playerJoined', payload: result.seat.player },
      connection.socket,
    );

    console.log(`[server] ${name} joined ${result.room.roomId} as ${result.seat.player.playerId}`);

    if (this.roomManager.isRoomFull(result.room.roomId) && !result.room.gameState) {
      const players = this.roomManager.getPlayers(result.room.roomId);
      const p1 = players.find(player => player.playerId === 'p1');
      const p2 = players.find(player => player.playerId === 'p2');
      if (!p1 || !p2) {
        throw new Error('房间玩家信息不完整');
      }
      const transition = createNewGame(result.room.roomId, { p1, p2 });
      this.roomManager.setGameState(result.room.roomId, transition.state);
      this.dispatchTargets(result.room.roomId, transition.messages);
      console.log(`[server] game started in room ${result.room.roomId}`);
    }
  }

  private handleDisconnect(connection: ConnectionContext, closeSocket = true): void {
    const roomId = connection.roomId;
    const playerId = connection.playerId;

    if (!roomId || !playerId) {
      if (closeSocket) {
        connection.socket.close();
      }
      return;
    }

    const { room, seat, roomDeleted } = this.roomManager.removeSocket(connection.socket);
    console.log(`[server] disconnected ${connection.connectionId} from ${roomId}`);

    if (room?.gameState) {
      const transition = updateConnectionState(room.gameState, playerId, false);
      this.roomManager.setGameState(roomId, transition.state);
      this.dispatchTargets(roomId, transition.messages);
    } else if (seat && !roomDeleted) {
      this.roomManager.broadcast(roomId, { type: 'playerLeft', payload: { playerId: seat.player.playerId } }, connection.socket);
    }

    connection.roomId = null;
    connection.playerId = null;

    if (closeSocket) {
      connection.socket.close();
    }
  }

  private withGame(
    connection: ConnectionContext,
    handler: (roomId: string, playerId: PlayerId, state: EngineState) => void,
  ): void {
    if (!connection.roomId || !connection.playerId) {
      throw new Error('尚未加入房间');
    }

    const room = this.roomManager.getRoom(connection.roomId);
    if (!room?.gameState) {
      throw new Error('游戏尚未开始');
    }

    handler(connection.roomId, connection.playerId, room.gameState);
  }

  private dispatchTargets(roomId: string, targets: BroadcastTarget[]): void {
    for (const target of targets) {
      if (target.kind === 'broadcast') {
        this.roomManager.broadcast(roomId, target.message);
        continue;
      }

      if (!target.playerId) {
        continue;
      }
      this.roomManager.sendToPlayer(roomId, target.playerId, target.message);
    }
  }
}

const defaultGameServer = new GameServer();

export const handleConnection = defaultGameServer.handleConnection;
export const getRooms = (): Array<{ roomId: string; playerCount: number; hasGame: boolean }> => defaultGameServer.getRooms();
export { defaultGameServer };
