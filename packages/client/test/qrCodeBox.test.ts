import test from 'node:test';
import assert from 'node:assert/strict';
import { getQRCodeFallbackState, QR_HARD_LIMIT, QR_WARN_LENGTH } from '../src/components/p2p/QRCodeBox';

test('QRCode fallback state is normal below warning length', () => {
  const state = getQRCodeFallbackState('x'.repeat(QR_WARN_LENGTH - 1));

  assert.equal(state.length, 1199);
  assert.equal(state.warning, false);
  assert.equal(state.hardLimitExceeded, false);
  assert.equal(state.message, null);
});

test('QRCode fallback state warns above warning length', () => {
  const state = getQRCodeFallbackState('x'.repeat(QR_WARN_LENGTH + 1));

  assert.equal(state.length, 1201);
  assert.equal(state.warning, true);
  assert.equal(state.hardLimitExceeded, false);
  assert.match(state.message ?? '', /可能难扫/);
});

test('QRCode fallback state blocks single QR above hard limit', () => {
  const state = getQRCodeFallbackState('x'.repeat(QR_HARD_LIMIT + 1));

  assert.equal(state.length, 2501);
  assert.equal(state.warning, false);
  assert.equal(state.hardLimitExceeded, true);
  assert.equal(state.message, '内容过长，已停止生成单个二维码。请使用复制文本，或优先使用 relay 一次扫码加入。');
});
