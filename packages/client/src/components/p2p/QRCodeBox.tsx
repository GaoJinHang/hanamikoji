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
  const [isOpen, setIsOpen] = useState(false);
  const fallbackState = getQRCodeFallbackState(value);
  const preview = useMemo(() => compactPreview(value), [value]);

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
      // Manual text fallback remains available in the full-content dialog.
    }
  };

  const qrDataUrl = dataUrl && !failed && !fallbackState.hardLimitExceeded ? dataUrl : null;
  const placeholder = fallbackState.hardLimitExceeded
    ? fallbackState.message
    : failed
      ? '二维码生成失败，请打开完整内容后手动复制文本。'
      : '正在生成二维码；如果长时间无响应，请打开完整内容复制文本。';

  return (
    <>
      <div className={`rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3 ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
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

        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex min-h-40 items-center justify-center rounded-lg bg-white p-2 text-left text-xs text-gray-600 ring-1 ring-gray-100"
            aria-label={`打开${title}完整内容`}
          >
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={title} className="h-36 w-36 sm:h-40 sm:w-40" />
            ) : (
              <span>{placeholder}</span>
            )}
          </button>
          <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-gray-600">内容预览</div>
            <div className="max-h-16 overflow-hidden break-all font-mono text-xs leading-relaxed text-gray-700">{preview}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={copy} className="rounded-lg border border-game-primary/30 px-3 py-2 text-xs font-medium text-game-primary">{copyLabel}</button>
              <button type="button" onClick={() => setIsOpen(true)} className="rounded-lg bg-game-primary px-3 py-2 text-xs font-medium text-white">查看完整内容</button>
            </div>
          </div>
        </div>
      </div>

      {isOpen && (
        <SignalContentModal
          title={title}
          value={value}
          copyLabel={copyLabel}
          qrDataUrl={qrDataUrl}
          fallbackMessage={fallbackState.message}
          onCopy={copy}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

const SignalContentModal: React.FC<{
  title: string;
  value: string;
  copyLabel: string;
  qrDataUrl: string | null;
  fallbackMessage: string | null;
  onCopy: () => void;
  onClose: () => void;
}> = ({ title, value, copyLabel, qrDataUrl, fallbackMessage, onCopy, onClose }) => {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${title}完整内容`} onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">{title}</div>
            <div className="text-xs text-gray-500">长度：{value.length}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm text-gray-500 hover:bg-gray-100">关闭</button>
        </div>

        {fallbackMessage && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{fallbackMessage}</div>
        )}

        {qrDataUrl && (
          <div className="mt-4 flex justify-center rounded-xl bg-gray-50 p-3">
            <img src={qrDataUrl} alt={title} className="h-auto w-full max-w-xs" />
          </div>
        )}

        <div className="mt-4">
          <div className="mb-2 text-sm font-medium text-gray-700">完整文本</div>
          <textarea
            readOnly
            value={value}
            onFocus={event => event.currentTarget.select()}
            className="h-64 max-h-[45dvh] w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-game-primary"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCopy} className="rounded-xl bg-game-primary py-3 text-sm font-medium text-white">{copyLabel}</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700">完成</button>
        </div>
      </div>
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

function compactPreview(value: string): string {
  return value.length > 360 ? `${value.slice(0, 360)}...` : value;
}
