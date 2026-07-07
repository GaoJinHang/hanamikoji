import type {
  ActionType,
  GameState,
  PlayerId,
  ServerToClientEvents,
} from '@hanamikoji/shared';

export type GameConnectionMode = 'online' | 'offline-p2p';

export interface PlayActionCommand {
  type: ActionType;
  cardIds: string[];
  grouping?: string[][];
}

export type GameConnectionEvents = Pick<
  ServerToClientEvents,
  'actionRequired' | 'choiceRequired' | 'gameOver' | 'phaseChanged' | 'error'
> & {
  stateChanged: (state: GameState) => void;
  opponentDisconnected: () => void;
  opponentReconnected: () => void;
};

export type GameConnectionUnsubscribe = () => void;

export interface GameConnection {
  readonly mode: GameConnectionMode;
  readonly playerId: PlayerId;
  readonly gameState: GameState;
  readonly isConnected: boolean;

  sendDrawCard(): void;
  sendPlayAction(command: PlayActionCommand): void;
  sendResolveAction(selection: number): void;
  leaveRoom(): void;

  on<EventName extends keyof GameConnectionEvents>(
    eventName: EventName,
    handler: GameConnectionEvents[EventName],
  ): GameConnectionUnsubscribe;
}
