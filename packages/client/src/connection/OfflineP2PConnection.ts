import type { ClientRuntime, RuntimeUnsubscribe } from '@hanamikoji/p2p';
import type { GameOverPayload, GamePhase, GameState, PendingAction, PlayerId } from '@hanamikoji/shared';
import type { GameConnection, GameConnectionEvents, PlayActionCommand } from './GameConnection';

type Handler<EventName extends keyof GameConnectionEvents> = GameConnectionEvents[EventName];

export interface OfflineP2PConnectionOptions {
  onDispose?: () => void;
  onStateChanged?: () => void;
}

/**
 * Thin GameConnection adapter for the browser-side P2P ClientRuntime.
 * Game.tsx remains transport-agnostic: actions go through ClientRuntime, not WebRTC.
 */
export class OfflineP2PConnection implements GameConnection {
  readonly mode = 'offline-p2p' as const;

  private readonly handlers = new Map<keyof GameConnectionEvents, Set<GameConnectionEvents[keyof GameConnectionEvents]>>();
  private readonly unsubscribers: RuntimeUnsubscribe[];
  private disposed = false;

  constructor(
    private readonly runtime: ClientRuntime,
    private readonly options: OfflineP2PConnectionOptions = {},
  ) {
    this.unsubscribers = [
      this.runtime.on('gameStarted', message => this.handleState(message.state)),
      this.runtime.on('stateView', message => this.handleState(message.state)),
      this.runtime.on('actionRejected', message => this.emit('error', message.reason)),
      this.runtime.on('joinRejected', message => this.emit('error', message.reason)),
      this.runtime.on('error', message => this.emit('error', message.message)),
      this.runtime.on('playerDisconnected', () => this.emit('opponentDisconnected')),
      this.runtime.on('playerReconnected', () => this.emit('opponentReconnected')),
    ];
  }

  get playerId(): PlayerId {
    if (!this.runtime.playerId) throw new Error('OfflineP2PConnection is not joined yet');
    return this.runtime.playerId;
  }

  get gameState(): GameState {
    if (!this.runtime.gameState) throw new Error('OfflineP2PConnection has no game state yet');
    return this.runtime.gameState;
  }

  get isConnected(): boolean {
    return this.runtime.endpoint.isOnline;
  }

  sendDrawCard(): void {
    this.runtime.sendDrawCard();
  }

  sendPlayAction(command: PlayActionCommand): void {
    this.runtime.sendPlayAction(command);
  }

  sendResolveAction(selection: number): void {
    this.runtime.sendResolveAction(selection);
  }

  leaveRoom(): void {
    this.dispose();
    this.runtime.endpoint.disconnect();
    this.options.onDispose?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
  }

  on<EventName extends keyof GameConnectionEvents>(eventName: EventName, handler: Handler<EventName>): () => void {
    const listeners = this.handlers.get(eventName) ?? new Set<GameConnectionEvents[keyof GameConnectionEvents]>();
    listeners.add(handler as GameConnectionEvents[keyof GameConnectionEvents]);
    this.handlers.set(eventName, listeners);
    return () => {
      listeners.delete(handler as GameConnectionEvents[keyof GameConnectionEvents]);
    };
  }

  private emit<EventName extends keyof GameConnectionEvents>(
    eventName: EventName,
    ...args: Parameters<GameConnectionEvents[EventName]>
  ): void {
    const listeners = this.handlers.get(eventName);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      (listener as (...innerArgs: unknown[]) => void)(...args as unknown[]);
    }
  }

  private handleState(state: GameState): void {
    this.options.onStateChanged?.();
    this.emit('stateChanged', state);
    this.emitStateHints(state);
  }

  private emitStateHints(state: GameState): void {
    if (state.phase === 'game_over') {
      this.emit('gameOver', buildGameOverPayload(state));
      return;
    }

    if (state.pendingAction) {
      this.emit('choiceRequired', state.pendingAction as PendingAction);
      return;
    }

    this.emit('phaseChanged', state.phase as GamePhase, state.activePlayer);
  }
}

function buildGameOverPayload(state: GameState): GameOverPayload {
  return {
    winner: state.winner,
    isDraw: state.isDraw,
    reason: state.reason || '游戏结束',
    finalScores: {
      p1: { geishaCount: state.players.p1.geishaCount, totalCharm: state.players.p1.totalCharm },
      p2: { geishaCount: state.players.p2.geishaCount, totalCharm: state.players.p2.totalCharm },
    },
  };
}
