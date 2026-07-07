import type { GameState, PlayerId } from '@hanamikoji/shared';
import type { TypedSocket } from '../context/socket';
import type { GameConnection, GameConnectionEvents, PlayActionCommand } from './GameConnection';

export interface OnlineSocketConnectionSnapshot {
  playerId: PlayerId;
  gameState: GameState;
  isConnected: boolean;
}

type GameConnectionEventTarget = {
  on<EventName extends keyof GameConnectionEvents>(
    eventName: EventName,
    handler: GameConnectionEvents[EventName],
  ): void;
  off<EventName extends keyof GameConnectionEvents>(
    eventName: EventName,
    handler: GameConnectionEvents[EventName],
  ): void;
};

export class OnlineSocketConnection implements GameConnection {
  readonly mode = 'online' as const;
  readonly playerId: PlayerId;
  readonly gameState: GameState;
  readonly isConnected: boolean;

  private readonly gameEvents: GameConnectionEventTarget;

  constructor(
    private readonly socket: TypedSocket,
    snapshot: OnlineSocketConnectionSnapshot,
  ) {
    this.playerId = snapshot.playerId;
    this.gameState = snapshot.gameState;
    this.isConnected = snapshot.isConnected;
    this.gameEvents = socket as unknown as GameConnectionEventTarget;
  }

  sendDrawCard(): void {
    this.socket.emit('drawCard');
  }

  sendPlayAction(command: PlayActionCommand): void {
    this.socket.emit('playAction', command);
  }

  sendResolveAction(selection: number): void {
    this.socket.emit('resolveAction', selection);
  }

  leaveRoom(): void {
    this.socket.emit('leaveRoom');
  }

  on<EventName extends keyof GameConnectionEvents>(
    eventName: EventName,
    handler: GameConnectionEvents[EventName],
  ): () => void {
    this.gameEvents.on(eventName, handler);
    return () => {
      this.gameEvents.off(eventName, handler);
    };
  }
}
