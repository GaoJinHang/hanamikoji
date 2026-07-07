export type LobbyMode = 'online' | 'offline-p2p';

export interface InitialLobbyModeInput {
  isProduction: boolean;
  hasExplicitBackend: boolean;
  hasOfflineHash: boolean;
}

export interface OnlineBackendNoticeInput {
  isProduction: boolean;
  hasExplicitBackend: boolean;
  isConnected: boolean;
}

export function getInitialLobbyMode(input: InitialLobbyModeInput): LobbyMode {
  if (input.hasOfflineHash) return 'offline-p2p';
  if (input.isProduction && !input.hasExplicitBackend) return 'offline-p2p';
  return 'online';
}

export function getOnlineBackendNotice(input: OnlineBackendNoticeInput): string | null {
  if (input.isConnected) return null;

  if (input.isProduction && !input.hasExplicitBackend) {
    return '当前前端没有配置 VITE_SOCKET_URL / VITE_API_BASE_URL，因此在线服务器模式无法创建或加入房间。你仍然可以先测试离线 P2P：同一 Wi-Fi / 手机热点下优先使用；未部署后端时 relay 一次扫码不可用，会回退到复制 invite / answer 的纯离线流程。';
  }

  return '当前还没有连接到后端服务器。在线服务器模式需要后端 Socket 服务；如果只是想先测试离线 P2P，请切换到离线 P2P 模式。';
}
