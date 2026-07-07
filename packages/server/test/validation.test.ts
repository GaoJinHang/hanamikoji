import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJoinRoom, validatePlayAction, validateResolveAction, validateResumeGame } from '../src/socket/validation';

test('validateJoinRoom normalizes room id and trims player name', () => {
  const result = validateJoinRoom('ab12ef', '  Alice  ');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, { roomId: 'AB12EF', playerName: 'Alice' });
});

test('validateJoinRoom rejects malformed input', () => {
  assert.equal(validateJoinRoom('room-1', 'Alice').ok, false);
  assert.equal(validateJoinRoom(null, 'A very very long player name').ok, false);
});

test('validatePlayAction rejects duplicate cards and invalid grouping', () => {
  assert.equal(validatePlayAction({ type: 'discard', cardIds: ['c1', 'c1'] }).ok, false);
  assert.equal(validatePlayAction({ type: 'competition', cardIds: ['c1', 'c2', 'c3', 'c4'], grouping: [['c1'], ['c1']] }).ok, false);
});

test('validateResolveAction accepts only small integer selections', () => {
  assert.equal(validateResolveAction(0).ok, true);
  assert.equal(validateResolveAction(2).ok, true);
  assert.equal(validateResolveAction(3).ok, false);
  assert.equal(validateResolveAction(1.5).ok, false);
});

test('validateResumeGame requires room id, player id and token shape', () => {
  const token = 'a'.repeat(64);
  assert.equal(validateResumeGame('ABC123', 'p1', token).ok, true);
  assert.equal(validateResumeGame('ABC123', 'p3', token).ok, false);
  assert.equal(validateResumeGame('ABC123', 'p1', 'bad').ok, false);
});
