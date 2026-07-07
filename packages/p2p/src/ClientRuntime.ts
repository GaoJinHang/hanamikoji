import type { ActionType, GameState, PlayerId } from '@hanamikoji/shared';
import { RuntimeEventEmitter } from './events';
import type {
  ActionAcceptedMessage,
  ActionRejectedMessage,
  ErrorMessage,
  GameStartMessage,
  JoinAcceptMessage,
  JoinRejectMessage,
  LobbyStateMessage,
  P2PActionIntentPayload,
  P2PEnvelope,
  PlayerDisconnectedMessage,
  PlayerReconnectedMessage,
  StartGameRejectedMessage,
  StateViewMessage,
  SyncResponseMessage,
} from './protocol';
import { makeBase } from './protocol';
import type { TransportEndpoint } from './transport/types';

export interface ClientRuntimeResumeOptions {
  playerId: PlayerId;
  reconnectToken: string;
  stateVersion?: number;
  viewHash?: string | null;
}

export interface ClientRuntimeOptions {
  endpoint: TransportEndpoint;
  hostPeerId: string;
  playerName: string;
  resume?: ClientRuntimeResumeOptions | null;
}

export interface ClientJoinOptions {
  requestedRoomId?: string;
  requestedPlayerId?: PlayerId;
  reconnectToken?: string;
  lastStateVersion?: number;
  lastViewHash?: string;
}

export interface PlayActionIntentCommand {
  type: ActionType;
  cardIds: string[];
  grouping?: string[][];
}

export interface ClientRuntimeEvents {
  joined: (message: JoinAcceptMessage) => void;
  joinRejected: (message: JoinRejectMessage) => void;
  lobbyState: (message: LobbyStateMessage) => void;
  startGameRejected: (message: StartGameRejectedMessage) => void;
  gameStarted: (message: GameStartMessage) => void;
  stateView: (message: StateViewMessage | SyncResponseMessage) => void;
  actionAccepted: (message: ActionAcceptedMessage) => void;
  actionRejected: (message: ActionRejectedMessage) => void;
  playerDisconnected: (message: PlayerDisconnectedMessage) => void;
  playerReconnected: (message: PlayerReconnectedMessage) => void;
  syncRequested: (reason: string) => void;
  error: (message: ErrorMessage) => void;
}

export class ClientRuntime extends RuntimeEventEmitter<ClientRuntimeEvents> {
  readonly hostPeerId: string;
  readonly endpoint: TransportEndpoint;
  readonly playerName: string;

  roomId: string | null = null;
  playerId: PlayerId | null = null;
  gameState: GameState | null = null;
  lobbyState: LobbyStateMessage | null = null;
  stateVersion = -1;
  viewHash: string | null = null;
  reconnectToken: string | null = null;

  private requestCounter = 0;
  private readonly unsubscribeMessage: () => void;
  private readonly resume: ClientRuntimeResumeOptions | null;

  constructor(options: ClientRuntimeOptions) {
    super();
    this.endpoint = options.endpoint;
    this.hostPeerId = options.hostPeerId;
    this.playerName = options.playerName;
    this.resume = options.resume ?? null;
    if (this.resume) {
      this.playerId = this.resume.playerId;
      this.reconnectToken = this.resume.reconnectToken;
      this.stateVersion = this.resume.stateVersion ?? -1;
      this.viewHash = this.resume.viewHash ?? null;
    }
    this.unsubscribeMessage = this.endpoint.onMessage(envelope => this.handleEnvelope(envelope));
  }

  dispose(): void {
    this.unsubscribeMessage();
  }

  join(requestedRoomIdOrOptions?: string | ClientJoinOptions): void {
    const options: ClientJoinOptions = typeof requestedRoomIdOrOptions === 'string'
      ? { requestedRoomId: requestedRoomIdOrOptions }
      : (requestedRoomIdOrOptions ?? {});
    const resume = this.resume;
    this.endpoint.send(this.hostPeerId, {
      ...makeBase('JOIN_REQUEST'),
      clientName: this.playerName,
      requestedRoomId: options.requestedRoomId,
      requestedPlayerId: options.requestedPlayerId ?? resume?.playerId,
      reconnectToken: options.reconnectToken ?? resume?.reconnectToken,
      lastStateVersion: options.lastStateVersion ?? resume?.stateVersion,
      lastViewHash: options.lastViewHash ?? resume?.viewHash ?? undefined,
    });
  }

  setLobbyReady(ready: boolean): void {
    if (!this.playerId) throw new Error('ClientRuntime cannot set lobby ready before JOIN_ACCEPT');
    this.endpoint.send(this.hostPeerId, {
      ...makeBase('LOBBY_READY'),
      playerId: this.playerId,
      ready,
    });
  }

  requestStartGame(): void {
    if (!this.playerId) throw new Error('ClientRuntime cannot request start before JOIN_ACCEPT');
    this.endpoint.send(this.hostPeerId, {
      ...makeBase('START_GAME_REQUEST'),
      actorId: this.playerId,
    });
  }

  sendDrawCard(requestId = this.nextRequestId()): string {
    return this.sendActionIntent({ type: 'DRAW_CARD' }, requestId);
  }

  sendPlayAction(command: PlayActionIntentCommand, requestId = this.nextRequestId()): string {
    return this.sendActionIntent({
      type: 'PLAY_ACTION',
      actionType: command.type,
      cardIds: [...command.cardIds],
      grouping: command.grouping?.map(group => [...group]),
    }, requestId);
  }

  sendResolveAction(selection: number, requestId = this.nextRequestId()): string {
    return this.sendActionIntent({ type: 'RESOLVE_ACTION', selection }, requestId);
  }

  sendActionIntent(intent: P2PActionIntentPayload, requestId = this.nextRequestId()): string {
    if (!this.playerId || !this.viewHash) throw new Error('ClientRuntime cannot send an action before GAME_START/STATE_VIEW');

    this.endpoint.send(this.hostPeerId, {
      ...makeBase('ACTION_INTENT'),
      requestId,
      actorId: this.playerId,
      stateVersion: this.stateVersion,
      previousViewHash: this.viewHash,
      intent,
    });
    return requestId;
  }

  requestSync(): void {
    if (!this.playerId) throw new Error('ClientRuntime cannot sync before JOIN_ACCEPT');
    this.endpoint.send(this.hostPeerId, {
      ...makeBase('SYNC_REQUEST'),
      playerId: this.playerId,
      stateVersion: this.stateVersion >= 0 ? this.stateVersion : undefined,
      previousViewHash: this.viewHash ?? undefined,
    });
    this.emit('syncRequested', 'manual');
  }

  private handleEnvelope(envelope: P2PEnvelope): void {
    if (envelope.fromPeerId !== this.hostPeerId) return;
    const message = envelope.message;
    switch (message.type) {
      case 'JOIN_ACCEPT':
        this.roomId = message.roomId;
        this.playerId = message.playerId;
        this.reconnectToken = message.reconnectToken;
        this.emit('joined', message);
        return;
      case 'JOIN_REJECT':
        this.emit('joinRejected', message);
        return;
      case 'LOBBY_STATE':
        this.roomId = message.roomId;
        this.lobbyState = message;
        this.emit('lobbyState', message);
        return;
      case 'START_GAME_REJECTED':
        this.emit('startGameRejected', message);
        return;
      case 'GAME_START':
        this.applyState(message);
        this.emit('gameStarted', message);
        return;
      case 'STATE_VIEW': {
        const accepted = this.applyState(message);
        if (accepted) this.emit('stateView', message);
        return;
      }
      case 'SYNC_RESPONSE':
        this.applyState(message, true);
        this.emit('stateView', message);
        return;
      case 'ACTION_ACCEPTED':
        this.emit('actionAccepted', message);
        return;
      case 'ACTION_REJECTED':
        this.emit('actionRejected', message);
        if (message.canSync) this.requestSync();
        return;
      case 'PLAYER_DISCONNECTED':
        this.emit('playerDisconnected', message);
        return;
      case 'PLAYER_RECONNECTED':
        this.emit('playerReconnected', message);
        return;
      case 'ERROR':
        this.emit('error', message);
        return;
      case 'HELLO':
        return;
      default:
        this.emit('error', {
          ...makeBase('ERROR'),
          code: 'UNSUPPORTED_MESSAGE',
          message: `Client cannot handle ${message.type}`,
        });
    }
  }

  private applyState(message: GameStartMessage | StateViewMessage | SyncResponseMessage, force = false): boolean {
    const isSync = message.type === 'SYNC_RESPONSE' || force;
    if (!isSync && this.viewHash && this.stateVersion >= 0) {
      const stateIsContinuous = message.previousStateVersion === undefined || message.previousStateVersion === this.stateVersion;
      const hashIsContinuous = message.previousViewHash === undefined || message.previousViewHash === this.viewHash;
      if (!stateIsContinuous || !hashIsContinuous) {
        this.requestSync();
        this.emit('syncRequested', 'state view continuity mismatch');
        return false;
      }
    }

    this.roomId = message.roomId;
    this.playerId = message.playerId;
    if ('reconnectToken' in message) this.reconnectToken = message.reconnectToken;
    this.gameState = message.state;
    this.stateVersion = message.stateVersion;
    this.viewHash = message.viewHash;
    return true;
  }

  private nextRequestId(): string {
    this.requestCounter += 1;
    return `${this.endpoint.peerId}:${this.requestCounter}`;
  }
}
