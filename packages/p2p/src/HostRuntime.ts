import type { EngineAction, EngineState } from '@hanamikoji/engine';
import { createGameSetup, reducer } from '@hanamikoji/engine';
import { createPlayerView, type GameState, type PlayerId, type RoomPlayer } from '@hanamikoji/shared';
import { RuntimeEventEmitter } from './events';
import { hashEngineState, hashGameState } from './hash';
import type {
  ActionIntentMessage,
  JoinRequestMessage,
  LobbyReadyMessage,
  LobbyStateMessage,
  P2PActionIntentPayload,
  P2PEnvelope,
  P2PMessage,
  StartGameRejectedMessage,
  StartGameRequestMessage,
  StateViewMessage,
} from './protocol';
import { makeBase } from './protocol';
import type { TransportEndpoint } from './transport/types';

const PLAYER_IDS = ['p1', 'p2'] as const satisfies readonly PlayerId[];

export interface HostRuntimeOptions {
  endpoint: TransportEndpoint;
  roomId?: string;
  seed?: number;
  hostPeerId?: string;
  hostPlayerId?: PlayerId;
  firstPlayer?: PlayerId;
  snapshot?: HostRuntimeSnapshot | null;
}

interface PlayerSlot {
  peerId: string | null;
  playerId: PlayerId;
  name: string;
  reconnectToken: string;
  connected: boolean;
}

export interface HostRuntimePlayerSnapshot {
  playerId: PlayerId;
  name: string;
  reconnectToken: string;
}

export interface HostRuntimeSnapshot {
  roomId: string;
  seed: number;
  firstPlayer: PlayerId;
  hostPlayerId?: PlayerId;
  lobbyReady?: Partial<Record<PlayerId, boolean>>;
  stateVersion: number;
  engineState: EngineState | null;
  eventLog: AuthoritativeEventLogEntry[];
  players: HostRuntimePlayerSnapshot[];
}

export interface AuthoritativeEventLogEntry {
  sequence: number;
  actorId: PlayerId;
  requestId: string;
  intent: P2PActionIntentPayload;
  previousVersion: number;
  nextVersion: number;
  previousAuthoritativeStateHash: string;
  nextAuthoritativeStateHash: string;
  previousViewHash: string;
  nextViewHashes: Record<PlayerId, string>;
}

export interface HostRuntimeEvents {
  gameStarted: (state: EngineState) => void;
  stateAdvanced: (entry: AuthoritativeEventLogEntry, state: EngineState) => void;
  snapshotChanged: (snapshot: HostRuntimeSnapshot) => void;
  lobbyState: (message: LobbyStateMessage) => void;
  startGameRejected: (message: StartGameRejectedMessage, peerId: string) => void;
  actionRejected: (message: P2PMessage, peerId: string) => void;
  peerJoined: (player: RoomPlayer) => void;
  peerReconnected: (player: RoomPlayer) => void;
  peerDisconnected: (player: RoomPlayer) => void;
}

export class HostRuntime extends RuntimeEventEmitter<HostRuntimeEvents> {
  readonly roomId: string;
  readonly seed: number;

  private readonly endpoint: TransportEndpoint;
  private readonly firstPlayer: PlayerId;
  private readonly hostPlayerId: PlayerId;
  private readonly peersByPeerId = new Map<string, PlayerSlot>();
  private readonly playersByPlayerId = new Map<PlayerId, PlayerSlot>();
  private lobbyReady: Record<PlayerId, boolean> = createEmptyLobbyReady();
  private engineState: EngineState | null = null;
  private stateVersion = 0;
  private log: AuthoritativeEventLogEntry[] = [];
  private readonly unsubscribeMessage: () => void;
  private readonly unsubscribeDisconnect: () => void;
  private readonly unsubscribeReconnect: () => void;

  constructor(options: HostRuntimeOptions) {
    super();
    this.endpoint = options.endpoint;

    if (options.snapshot) {
      this.roomId = options.snapshot.roomId;
      this.seed = options.snapshot.seed;
      this.firstPlayer = options.snapshot.firstPlayer;
      this.hostPlayerId = options.snapshot.hostPlayerId ?? options.hostPlayerId ?? 'p1';
      this.lobbyReady = normalizeLobbyReady(options.snapshot.lobbyReady);
      this.stateVersion = options.snapshot.stateVersion;
      this.engineState = options.snapshot.engineState;
      this.log = options.snapshot.eventLog.map(cloneEventLogEntry);
      for (const player of options.snapshot.players) {
        this.playersByPlayerId.set(player.playerId, {
          peerId: null,
          playerId: player.playerId,
          name: player.name,
          reconnectToken: player.reconnectToken,
          connected: false,
        });
      }
    } else {
      this.seed = options.seed ?? createSeed();
      this.roomId = options.roomId ?? createRoomId(this.seed);
      this.firstPlayer = options.firstPlayer ?? 'p1';
      this.hostPlayerId = options.hostPlayerId ?? 'p1';
    }

    this.unsubscribeMessage = this.endpoint.onMessage(envelope => this.handleEnvelope(envelope));
    this.unsubscribeDisconnect = this.endpoint.onDisconnect(peerId => this.handlePeerDisconnected(peerId));
    this.unsubscribeReconnect = this.endpoint.onReconnect(peerId => this.handlePeerReconnected(peerId));
  }

  dispose(): void {
    this.unsubscribeMessage();
    this.unsubscribeDisconnect();
    this.unsubscribeReconnect();
  }

  getStateVersion(): number {
    return this.stateVersion;
  }

  getAuthoritativeState(): EngineState | null {
    return this.engineState;
  }

  getEventLog(): readonly AuthoritativeEventLogEntry[] {
    return this.log;
  }

  getLobbyState(): LobbyStateMessage {
    return this.createLobbyState();
  }

  getSnapshot(): HostRuntimeSnapshot {
    return {
      roomId: this.roomId,
      seed: this.seed,
      firstPlayer: this.firstPlayer,
      hostPlayerId: this.hostPlayerId,
      lobbyReady: cloneLobbyReady(this.lobbyReady),
      stateVersion: this.stateVersion,
      engineState: this.engineState,
      eventLog: this.log.map(cloneEventLogEntry),
      players: PLAYER_IDS
        .map(id => this.playersByPlayerId.get(id))
        .filter((slot): slot is PlayerSlot => Boolean(slot))
        .map(slot => ({
          playerId: slot.playerId,
          name: slot.name,
          reconnectToken: slot.reconnectToken,
        })),
    };
  }

  exportSnapshot(): HostRuntimeSnapshot {
    return this.getSnapshot();
  }

  getPlayerPeer(playerId: PlayerId): string | null {
    return this.playersByPlayerId.get(playerId)?.peerId ?? null;
  }

  private handleEnvelope(envelope: P2PEnvelope): void {
    const message = envelope.message;
    switch (message.type) {
      case 'HELLO':
        this.send(envelope.fromPeerId, { ...makeBase('HELLO'), clientName: message.clientName });
        return;
      case 'JOIN_REQUEST':
        this.handleJoinRequest(envelope);
        return;
      case 'LOBBY_READY':
        this.handleLobbyReady(envelope.fromPeerId, message);
        return;
      case 'START_GAME_REQUEST':
        this.handleStartGameRequest(envelope.fromPeerId, message);
        return;
      case 'ACTION_INTENT':
        this.handleActionIntent(envelope.fromPeerId, message);
        return;
      case 'SYNC_REQUEST':
        this.handleSyncRequest(envelope.fromPeerId, message.playerId);
        return;
      default:
        this.send(envelope.fromPeerId, {
          ...makeBase('ERROR'),
          code: 'UNSUPPORTED_MESSAGE',
          message: `Host cannot handle ${message.type}`,
          canSync: message.type === 'ACTION_REJECTED',
        });
    }
  }

  private handleJoinRequest(envelope: P2PEnvelope): void {
    const message = envelope.message;
    if (message.type !== 'JOIN_REQUEST') return;

    if (message.requestedRoomId && message.requestedRoomId !== this.roomId) {
      this.send(envelope.fromPeerId, {
        ...makeBase('JOIN_REJECT'),
        reason: '房间号不匹配，请确认导入的是当前离线房间的 offer。',
        canRetry: true,
      });
      return;
    }

    const existingByPeer = this.peersByPeerId.get(envelope.fromPeerId);
    if (existingByPeer) {
      this.sendJoinAccept(existingByPeer, Boolean(this.engineState));
      if (this.engineState) this.sendSyncResponse(existingByPeer);
      else this.sendLobbyState(existingByPeer);
      return;
    }

    const resumed = this.tryResumePeer(envelope.fromPeerId, message);
    if (resumed) return;

    if (this.engineState) {
      this.send(envelope.fromPeerId, {
        ...makeBase('JOIN_REJECT'),
        reason: '游戏已经开始。请使用该玩家的恢复令牌重新连接。',
        canRetry: true,
      });
      return;
    }

    const playerId = this.allocatePlayerId(message.requestedPlayerId);
    if (!playerId) {
      this.send(envelope.fromPeerId, { ...makeBase('JOIN_REJECT'), reason: '房间已满', canRetry: false });
      return;
    }

    const slot: PlayerSlot = {
      peerId: null,
      playerId,
      name: normalizePlayerName(message.clientName),
      reconnectToken: createReconnectToken(),
      connected: false,
    };
    this.playersByPlayerId.set(playerId, slot);
    this.lobbyReady[playerId] = false;
    this.bindPeer(slot, envelope.fromPeerId);

    this.emit('peerJoined', this.toRoomPlayer(slot));
    this.emitSnapshotChanged();
    this.sendJoinAccept(slot, false);
    this.broadcastLobbyState();
  }

  private tryResumePeer(peerId: string, message: JoinRequestMessage): boolean {
    if (!message.requestedPlayerId || !message.reconnectToken) return false;
    const slot = this.playersByPlayerId.get(message.requestedPlayerId);
    if (!slot || slot.reconnectToken !== message.reconnectToken) return false;

    slot.name = normalizePlayerName(message.clientName || slot.name);
    this.bindPeer(slot, peerId);
    this.sendJoinAccept(slot, true);
    if (this.engineState) this.sendSyncResponse(slot);
    else this.broadcastLobbyState();
    this.notifyOtherPlayers(slot, 'PLAYER_RECONNECTED');
    this.emit('peerReconnected', this.toRoomPlayer(slot));
    this.emitSnapshotChanged();
    return true;
  }

  private bindPeer(slot: PlayerSlot, peerId: string): void {
    if (slot.peerId && slot.peerId !== peerId) {
      this.peersByPeerId.delete(slot.peerId);
    }
    slot.peerId = peerId;
    slot.connected = true;
    this.peersByPeerId.set(peerId, slot);
  }

  private allocatePlayerId(requestedPlayerId?: PlayerId): PlayerId | null {
    if (requestedPlayerId && !this.playersByPlayerId.has(requestedPlayerId)) return requestedPlayerId;
    for (const id of PLAYER_IDS) {
      if (!this.playersByPlayerId.has(id)) return id;
    }
    return null;
  }

  private sendJoinAccept(slot: PlayerSlot, resumed: boolean): void {
    if (!slot.peerId) return;
    this.send(slot.peerId, {
      ...makeBase('JOIN_ACCEPT'),
      roomId: this.roomId,
      playerId: slot.playerId,
      reconnectToken: slot.reconnectToken,
      players: this.players(),
      resumed,
    });
  }

  private handleLobbyReady(peerId: string, message: LobbyReadyMessage): void {
    const slot = this.peersByPeerId.get(peerId);
    if (!slot) {
      this.send(peerId, {
        ...makeBase('ERROR'),
        code: 'LOBBY_READY_REJECTED',
        message: '尚未加入 P2P 房间',
        canSync: false,
      });
      return;
    }

    if (this.engineState) {
      this.send(peerId, {
        ...makeBase('ERROR'),
        code: 'LOBBY_CLOSED',
        message: '游戏已经开始，无法修改 Ready 状态。',
        canSync: false,
      });
      return;
    }

    if (slot.playerId !== message.playerId) {
      this.send(peerId, {
        ...makeBase('ERROR'),
        code: 'LOBBY_READY_ACTOR_MISMATCH',
        message: 'Ready 身份与连接身份不匹配',
        canSync: false,
      });
      return;
    }

    this.lobbyReady[slot.playerId] = message.ready;
    this.emitSnapshotChanged();
    this.broadcastLobbyState();
  }

  private handleStartGameRequest(peerId: string, message: StartGameRequestMessage): void {
    const slot = this.peersByPeerId.get(peerId);
    if (!slot) {
      this.rejectStartGame(peerId, '尚未加入 P2P 房间');
      return;
    }

    if (slot.playerId !== message.actorId) {
      this.rejectStartGame(peerId, '开始游戏身份与连接身份不匹配');
      return;
    }

    if (this.engineState) {
      this.rejectStartGame(peerId, '游戏已经开始');
      return;
    }

    if (message.actorId !== this.hostPlayerId) {
      this.rejectStartGame(peerId, '只有 Host 玩家可以开始游戏');
      return;
    }

    if (!this.hasBothPlayers()) {
      this.rejectStartGame(peerId, '需要两名玩家都加入后才能开始');
      return;
    }

    if (!this.areAllPlayersReady()) {
      this.rejectStartGame(peerId, '双方 Ready 后才能开始游戏');
      return;
    }

    this.startGame();
  }

  private rejectStartGame(peerId: string, reason: string): void {
    const response: StartGameRejectedMessage = {
      ...makeBase('START_GAME_REJECTED'),
      reason,
    };
    this.send(peerId, response);
    this.emit('startGameRejected', response, peerId);
  }

  private startGame(): void {
    if (this.engineState) return;

    const p1 = this.playersByPlayerId.get('p1');
    const p2 = this.playersByPlayerId.get('p2');
    if (!p1 || !p2) throw new Error('Cannot start P2P game without both players');

    this.engineState = createGameSetup(
      this.roomId,
      { p1: this.toRoomPlayer(p1), p2: this.toRoomPlayer(p2) },
      this.firstPlayer,
      this.seed,
    );
    this.stateVersion = 0;
    this.emit('gameStarted', this.engineState);

    for (const playerId of PLAYER_IDS) {
      const slot = this.playersByPlayerId.get(playerId)!;
      if (!slot.peerId) continue;
      const stateView = this.createStateView(playerId);
      this.send(slot.peerId, {
        ...makeBase('GAME_START'),
        roomId: stateView.roomId,
        playerId: stateView.playerId,
        reconnectToken: slot.reconnectToken,
        players: this.players(),
        stateVersion: stateView.stateVersion,
        viewHash: stateView.viewHash,
        previousStateVersion: stateView.previousStateVersion,
        previousViewHash: stateView.previousViewHash,
        state: stateView.state,
      });
      this.send(slot.peerId, stateView);
    }
    this.emitSnapshotChanged();
  }

  private handleActionIntent(peerId: string, message: ActionIntentMessage): void {
    const slot = this.peersByPeerId.get(peerId);
    if (!slot) {
      this.reject(peerId, message, 'NOT_JOINED', '尚未加入 P2P 房间', true);
      return;
    }

    if (!this.engineState) {
      this.reject(peerId, message, 'GAME_NOT_STARTED', '游戏尚未开始', true);
      return;
    }

    if (slot.playerId !== message.actorId) {
      this.reject(peerId, message, 'ACTOR_MISMATCH', '行动身份与连接身份不匹配', false);
      return;
    }

    const expectedViewHash = this.createStateView(slot.playerId).viewHash;
    if (message.stateVersion !== this.stateVersion || message.previousViewHash !== expectedViewHash) {
      this.reject(peerId, message, 'STALE_STATE', '客户端状态已过期，请先同步', true, expectedViewHash);
      return;
    }

    const engineAction = this.toEngineAction(message.actorId, message.intent);
    const previousState = this.engineState;
    const previousHash = hashEngineState(previousState);
    const previousVersion = this.stateVersion;
    const previousViewHashes = this.createViewHashes(previousState.gameState);

    try {
      const next = reducer(previousState, engineAction);
      const nextHash = hashEngineState(next);
      const nextVersion = previousVersion + 1;
      this.engineState = next;
      this.stateVersion = nextVersion;

      const nextViewHashes = this.sendViewsToPlayers(previousVersion, previousViewHashes);
      const entry: AuthoritativeEventLogEntry = {
        sequence: this.log.length + 1,
        actorId: message.actorId,
        requestId: message.requestId,
        intent: cloneIntent(message.intent),
        previousVersion,
        nextVersion,
        previousAuthoritativeStateHash: previousHash,
        nextAuthoritativeStateHash: nextHash,
        previousViewHash: message.previousViewHash,
        nextViewHashes,
      };
      this.log.push(entry);
      this.send(peerId, {
        ...makeBase('ACTION_ACCEPTED'),
        requestId: message.requestId,
        actorId: message.actorId,
        previousStateVersion: previousVersion,
        stateVersion: nextVersion,
      });
      this.emit('stateAdvanced', entry, next);
      this.emitSnapshotChanged();
    } catch (error) {
      this.reject(peerId, message, 'INVALID_ACTION', error instanceof Error ? error.message : '行动执行失败', false);
    }
  }

  private reject(
    peerId: string,
    message: Pick<ActionIntentMessage, 'requestId' | 'actorId'>,
    code: 'NOT_JOINED' | 'ACTOR_MISMATCH' | 'STALE_STATE' | 'INVALID_ACTION' | 'GAME_NOT_STARTED' | 'UNKNOWN',
    reason: string,
    canSync: boolean,
    expectedPreviousViewHash?: string,
  ): void {
    const response = {
      ...makeBase('ACTION_REJECTED'),
      requestId: message.requestId,
      actorId: message.actorId,
      code,
      reason,
      canSync,
      expectedStateVersion: this.stateVersion,
      expectedPreviousViewHash,
    };
    this.send(peerId, response);
    this.emit('actionRejected', response, peerId);
  }

  private handleSyncRequest(peerId: string, requestedPlayerId: PlayerId): void {
    const slot = this.peersByPeerId.get(peerId);
    if (!slot || slot.playerId !== requestedPlayerId || !this.engineState) {
      this.send(peerId, {
        ...makeBase('ERROR'),
        code: 'SYNC_REJECTED',
        message: '无法同步该玩家视图',
        canSync: false,
      });
      return;
    }

    this.sendSyncResponse(slot);
  }

  private sendSyncResponse(slot: PlayerSlot): void {
    if (!slot.peerId || !this.engineState) return;
    const view = this.createStateView(slot.playerId);
    this.send(slot.peerId, {
      ...makeBase('SYNC_RESPONSE'),
      roomId: view.roomId,
      playerId: view.playerId,
      stateVersion: view.stateVersion,
      viewHash: view.viewHash,
      previousStateVersion: view.previousStateVersion,
      previousViewHash: view.previousViewHash,
      state: view.state,
    });
  }

  private handlePeerDisconnected(peerId: string): void {
    const slot = this.peersByPeerId.get(peerId);
    if (!slot) return;
    slot.connected = false;
    this.notifyOtherPlayers(slot, 'PLAYER_DISCONNECTED');
    if (!this.engineState) this.broadcastLobbyState();
    this.emit('peerDisconnected', this.toRoomPlayer(slot));
    this.emitSnapshotChanged();
  }

  private handlePeerReconnected(peerId: string): void {
    const slot = this.peersByPeerId.get(peerId);
    if (!slot) return;
    slot.connected = true;
    this.notifyOtherPlayers(slot, 'PLAYER_RECONNECTED');
    if (this.engineState) this.sendSyncResponse(slot);
    else this.broadcastLobbyState();
    this.emit('peerReconnected', this.toRoomPlayer(slot));
    this.emitSnapshotChanged();
  }

  private notifyOtherPlayers(slot: PlayerSlot, type: 'PLAYER_DISCONNECTED' | 'PLAYER_RECONNECTED'): void {
    for (const other of this.playersByPlayerId.values()) {
      if (!other.peerId || other.playerId === slot.playerId || !other.connected) continue;
      this.send(other.peerId, { ...makeBase(type), playerId: slot.playerId });
    }
  }

  private sendViewsToPlayers(previousStateVersion?: number, previousViewHashes?: Record<PlayerId, string>): Record<PlayerId, string> {
    const hashes = {} as Record<PlayerId, string>;
    for (const playerId of PLAYER_IDS) {
      const slot = this.playersByPlayerId.get(playerId);
      const view = this.createStateView(playerId, previousStateVersion, previousViewHashes?.[playerId]);
      hashes[playerId] = view.viewHash;
      if (!slot?.peerId || !slot.connected) continue;
      this.send(slot.peerId, view);
    }
    return hashes;
  }

  private createStateView(playerId: PlayerId, previousStateVersion?: number, previousViewHash?: string): StateViewMessage {
    if (!this.engineState) throw new Error('Cannot create state view before game start');
    const state = createPlayerView(this.engineState.gameState, playerId);
    return {
      ...makeBase('STATE_VIEW'),
      roomId: this.roomId,
      playerId,
      stateVersion: this.stateVersion,
      previousStateVersion,
      previousViewHash,
      viewHash: hashGameState(state),
      state,
    };
  }

  private createLobbyState(): LobbyStateMessage {
    return {
      ...makeBase('LOBBY_STATE'),
      roomId: this.roomId,
      players: this.players(),
      ready: cloneLobbyReady(this.lobbyReady),
      canStart: !this.engineState && this.hasBothPlayers() && this.areAllPlayersReady(),
      hostPlayerId: this.hostPlayerId,
    };
  }

  private sendLobbyState(slot: PlayerSlot): void {
    if (!slot.peerId || !slot.connected) return;
    this.send(slot.peerId, this.createLobbyState());
  }

  private broadcastLobbyState(): void {
    const state = this.createLobbyState();
    for (const slot of this.playersByPlayerId.values()) {
      if (!slot.peerId || !slot.connected) continue;
      this.send(slot.peerId, state);
    }
    this.emit('lobbyState', state);
  }

  private hasBothPlayers(): boolean {
    return PLAYER_IDS.every(playerId => this.playersByPlayerId.has(playerId));
  }

  private areAllPlayersReady(): boolean {
    return PLAYER_IDS.every(playerId => this.playersByPlayerId.has(playerId) && this.lobbyReady[playerId]);
  }

  private createViewHashes(state: GameState): Record<PlayerId, string> {
    return {
      p1: hashGameState(createPlayerView(state, 'p1')),
      p2: hashGameState(createPlayerView(state, 'p2')),
    };
  }

  private toEngineAction(actorId: PlayerId, intent: P2PActionIntentPayload): EngineAction {
    switch (intent.type) {
      case 'DRAW_CARD':
        return { type: 'DRAW_CARD', playerId: actorId };
      case 'PLAY_ACTION':
        return {
          type: 'PLAY_ACTION',
          playerId: actorId,
          actionType: intent.actionType,
          cardIds: [...intent.cardIds],
          grouping: intent.grouping?.map(group => [...group]),
        };
      case 'RESOLVE_ACTION':
        return { type: 'RESOLVE_ACTION', playerId: actorId, selection: intent.selection };
    }
  }

  private players(): RoomPlayer[] {
    return PLAYER_IDS
      .map(id => this.playersByPlayerId.get(id))
      .filter((slot): slot is PlayerSlot => Boolean(slot))
      .map(slot => this.toRoomPlayer(slot));
  }

  private toRoomPlayer(slot: PlayerSlot): RoomPlayer {
    return {
      socketId: `p2p:${slot.playerId}`,
      playerId: slot.playerId,
      name: slot.name,
    };
  }

  private emitSnapshotChanged(): void {
    this.emit('snapshotChanged', this.getSnapshot());
  }

  private send(toPeerId: string, message: P2PMessage): void {
    try {
      this.endpoint.send(toPeerId, message);
    } catch {
      // Offline transports can be physically closed while the authoritative state is still valid.
      // Recovery is handled through a later JOIN_REQUEST carrying the reconnectToken.
    }
  }
}

function normalizePlayerName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 12) : 'Player';
}

function createSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function createRoomId(seed: number): string {
  const base = (seed || createSeed()).toString(16).toUpperCase().padStart(6, '0');
  return base.slice(-6);
}

function createReconnectToken(): string {
  const random = Math.floor(Math.random() * 0xffffffff).toString(36);
  const time = Date.now().toString(36);
  return `${time}-${random}`;
}

function createEmptyLobbyReady(): Record<PlayerId, boolean> {
  return { p1: false, p2: false };
}

function normalizeLobbyReady(ready?: Partial<Record<PlayerId, boolean>>): Record<PlayerId, boolean> {
  return {
    p1: Boolean(ready?.p1),
    p2: Boolean(ready?.p2),
  };
}

function cloneLobbyReady(ready: Record<PlayerId, boolean>): Record<PlayerId, boolean> {
  return { p1: ready.p1, p2: ready.p2 };
}

function cloneIntent(intent: P2PActionIntentPayload): P2PActionIntentPayload {
  switch (intent.type) {
    case 'DRAW_CARD':
      return { type: 'DRAW_CARD' };
    case 'RESOLVE_ACTION':
      return { type: 'RESOLVE_ACTION', selection: intent.selection };
    case 'PLAY_ACTION':
      return {
        type: 'PLAY_ACTION',
        actionType: intent.actionType,
        cardIds: [...intent.cardIds],
        grouping: intent.grouping?.map(group => [...group]),
      };
  }
}

function cloneEventLogEntry(entry: AuthoritativeEventLogEntry): AuthoritativeEventLogEntry {
  return {
    ...entry,
    intent: cloneIntent(entry.intent),
    nextViewHashes: { ...entry.nextViewHashes },
  };
}
