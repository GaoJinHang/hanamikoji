export type LobbyMode = 'online' | 'offline-p2p';

export interface InitialLobbyModeInput {
  isProduction: boolean;
  hasExplicitBackend: boolean;
  hasOfflineHash: boolean;
  requestedMode?: LobbyMode | null;
}

export interface OnlineBackendNoticeInput {
  isProduction: boolean;
  hasExplicitBackend: boolean;
  isConnected: boolean;
}

/**
 * Keep the deployed lobby offline-first.
 *
 * First principles:
 * - Opening an offline invite must always enter offline P2P.
 * - A direct production login link should not surprise users by dropping them into
 *   the backend flow, even when a backend/relay URL is configured for optional use.
 * - Online server mode remains available through an explicit UI switch or URL mode.
 */
export function getInitialLobbyMode(input: InitialLobbyModeInput): LobbyMode {
  if (input.hasOfflineHash) return 'offline-p2p';
  if (input.requestedMode) return input.requestedMode;
  if (input.isProduction) return 'offline-p2p';
  return 'online';
}

export function getRequestedLobbyModeFromSearch(search: string): LobbyMode | null {
  const trimmed = search.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams(trimmed.startsWith('?') ? trimmed : `?${trimmed}`);
  const explicitMode = (params.get('mode') || params.get('lobbyMode') || '').toLowerCase();
  if (['offline', 'offline-p2p', 'p2p', 'peer'].includes(explicitMode)) return 'offline-p2p';
  if (['online', 'backend', 'server'].includes(explicitMode)) return 'online';

  const offlineFlag = (params.get('offline') || params.get('p2p') || '').toLowerCase();
  if (['1', 'true', 'yes'].includes(offlineFlag)) return 'offline-p2p';

  const onlineFlag = (params.get('online') || params.get('backend') || '').toLowerCase();
  if (['1', 'true', 'yes'].includes(onlineFlag)) return 'online';

  return null;
}

export function getOnlineBackendNotice(input: OnlineBackendNoticeInput): string | null {
  if (input.isConnected) return null;

  if (input.isProduction && !input.hasExplicitBackend) {
    return '当前前端没有配置 VITE_SOCKET_URL / VITE_API_BASE_URL，因此在线服务器模式无法创建或加入房间。你仍然可以使用离线 P2P：同一 Wi-Fi / 手机热点下优先使用；未部署后端时 relay 一次扫码不可用，会回退到复制 invite / answer 的纯离线流程。';
  }

  return '当前还没有连接到后端服务器。在线服务器模式需要后端 Socket 服务；如果只是想两台设备直接联机，请切换到离线 P2P 模式。';
}
