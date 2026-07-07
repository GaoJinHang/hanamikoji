import React from 'react';

export const QRScanner: React.FC = () => (
  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-600">
    摄像头扫码器将在后续版本接入。当前版本请在 Host 页面粘贴 Player answer，避免丢失本页内存中的 RTCPeerConnection。
  </div>
);
