import React, { useEffect, useMemo, useState } from 'react';

export const QR_WARN_LENGTH = 1200;
export const QR_HARD_LIMIT = 2500;

export interface QRCodeBoxProps {
  title: string;
  value: string;
  copyLabel?: string;
  className?: string;
  onCopy?: (value: string) => void;
}

export interface QRCodeFallbackState {
  length: number;
  warning: boolean;
  hardLimitExceeded: boolean;
  message: string | null;
}

export const QRCodeBox: React.FC<QRCodeBoxProps> = ({ title, value, copyLabel = '复制文本', className = '', onCopy }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fallbackState = getQRCodeFallbackState(value);
  const preview = useMemo(() => value.length > 260 ? `${value.slice(0, 260)}...` : value, [value]);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);

    if (!value || fallbackState.hardLimitExceeded) return;

    import('qrcode')
      .then(module => module.toDataURL(value, { errorCorrectionLevel: 'M', margin: 1, width: 240 }))
      .then(url => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [value, fallbackState.hardLimitExceeded]);

  const copy = async () => {
    if (onCopy) {
      onCopy(value);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Manual text fallback remains visible below.
    }
  };

  const placeholder = fallbackState.hardLimitExceeded
    ? fallbackState.message
    : failed
      ? '二维码生成失败，请使用下面的手动复制文本。'
      : '正在生成二维码；如果长时间无响应，请使用下面的手动复制文本。';

  return (
    <div className={`rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-800">{title}</div>
          <div className="text-xs text-gray-500">长度：{fallbackState.length}</div>
        </div>
        <button type="button" onClick={copy} className="shrink-0 text-xs text-game-primary hover:underline">{copyLabel}</button>
      </div>

      {fallbackState.message && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${fallbackState.hardLimitExceeded ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {fallbackState.message}
        </div>
      )}

      {dataUrl && !failed && !fallbackState.hardLimitExceeded ? (
        <div className="flex justify-center rounded-lg bg-white p-2 sm:p-3">
          <img src={dataUrl} alt={title} className="h-44 w-44 sm:h-60 sm:w-60" />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-4 text-xs text-gray-600">
          {placeholder}
        </div>
      )}

      <textarea readOnly value={value} className="w-full h-16 sm:h-24 px-3 py-2 border border-gray-300 rounded-lg bg-white text-xs font-mono" />
      <div className="hidden sm:block text-xs text-gray-500 break-all">{preview}</div>
    </div>
  );
};

export function getQRCodeFallbackState(value: string): QRCodeFallbackState {
  const length = value.length;
  const hardLimitExceeded = length > QR_HARD_LIMIT;
  const warning = length > QR_WARN_LENGTH && !hardLimitExceeded;
  return {
    length,
    warning,
    hardLimitExceeded,
    message: hardLimitExceeded
      ? '内容过长，二维码可能无法可靠生成；请使用复制文本。'
      : warning
        ? '二维码内容较长，难扫时请复制文本。'
        : null,
  };
}
