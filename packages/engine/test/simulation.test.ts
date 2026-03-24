import test from 'node:test';
import assert from 'node:assert';
import * as engine from '../dist/index.js';
import { countCards } from '../dist/game/reducer.js';

import type { EngineAction, EngineState } from '../dist/game/types';
import type { GamePhase, PlayerId, RoomPlayer } from '@hanamikoji/shared';

// @ts-ignore: Node.js 全局变量
const MAX_STEPS_PER_GAME = 200;
// @ts-ignore: Node.js 全局变量
const SIMULATION_COUNT = process.env.SIM_COUNT ? parseInt(process.env.SIM_COUNT) : 100000; // 默认100000局，支持环境变量调整
const SIM_ROOM_ID = 'SIM_ROOM';
const SIM_FIRST_PLAYER: PlayerId = 'p1';

// DEBUG开关
// @ts-ignore: Node.js 全局变量
const DEBUG = process.env.DEBUG === '1';

// 调试日志函数
function debugLog(...args: any[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

// 错误日志函数（始终打印）
function errorLog(...args: any[]) {
  console.error(...args);
}

type Rng = () => number;
type CompetitionGrouping = [string[], string[]];

type SimulationFailureContext = {
  seed: number;
  step: number;
  phase: GamePhase;
  activePlayer: PlayerId;
  actions: EngineAction[];
};

// 合法阶段集合，做运行时校验用
const VALID_PHASES: GamePhase[] = [
  'lobby',
  'p1_draw',
  'p1_action',
  'p2_draw',
  'p2_action',
  'p1_select',
  'p2_select',
  'scoring',
  'game_over',
];

function createSimulationPlayers(): { p1: RoomPlayer; p2: RoomPlayer } {
  return {
    p1: { socketId: 's1', playerId: 'p1', name: 'SimP1' },
    p2: { socketId: 's2', playerId: 'p2', name: 'SimP2' },
  };
}

/**
 * 卡牌守恒断言函数
 * 检查游戏状态中的卡牌总数是否超过21张
 */
function assertTotalCards(state: EngineState): void {
  const s = state.publicState;
  
  // 计算所有区域的卡牌总数
  const total = 
    state.deck.length + 
    s.players.p1.hand.length + 
    s.players.p2.hand.length + 
    (s.discardPile?.length ?? 0) +
    (s.players.p1.secretCard ? 1 : 0) +
    (s.players.p2.secretCard ? 1 : 0);

  // 添加艺伎区域的卡牌
  let geishaCards = 0;
  for (const geisha of Object.values(s.geishas)) {
    geishaCards += geisha.items.p1.length + geisha.items.p2.length;
  }
  
  // 添加pendingAction中的卡牌
  let pendingCards = 0;
  if (s.pendingAction) {
    if (s.pendingAction.type === 'gift') {
      pendingCards = s.pendingAction.cards.length;
    } else if (s.pendingAction.type === 'competition') {
      pendingCards = s.pendingAction.cards.flat().length;
    }
  }

  const finalTotal = total + geishaCards + pendingCards;

  if (finalTotal > 21) {
    const details = {
      deck: state.deck.length,
      p1_hand: s.players.p1.hand.length,
      p2_hand: s.players.p2.hand.length,
      discardPile: s.discardPile?.length ?? 0,
      p1_secret: s.players.p1.secretCard ? 1 : 0,
      p2_secret: s.players.p2.secretCard ? 1 : 0,
      geishaCards,
      pendingCards
    };
    
    throw new Error(`💥 Card overflow: ${finalTotal} > 21, details: ${JSON.stringify(details)}`);
  }
}

/**
 * Seeded deterministic RNG.
 * Same seed => same random sequence.
 * Never touches Math.random().
 */
function createRng(seed: number): Rng {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(items: readonly T[], rng: Rng): T[] {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  return shuffled;
}

/**
 * 从数组中随机取一个元素（数组不为空）
 */
function randomChoice<T>(arr: readonly T[], rng: Rng): T {
  if (arr.length === 0) {
    throw new Error('randomChoice 不能用于空数组');
  }

  return arr[Math.floor(rng() * arr.length)]!;
}

/**
 * 4 张牌分为两组 2 张的全部合法分组：
 * AB|CD, AC|BD, AD|BC
 */
function generateCompetitionGroupings(cards: readonly string[]): CompetitionGrouping[] {
  if (cards.length !== 4) {
    return [];
  }

  const [a, b, c, d] = cards;
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

/**
 * Seed + action replay helper.
 * 便于直接复现 fuzz 过程中抛出的同一局面。
 * 
 * 注意：此函数仅用于回放已经执行过的动作，不应该再次执行 reducer
 * 因为动作已经在 simulateGame 中执行过了
 */
function replayGame(seed: number, actions: readonly EngineAction[]): EngineState {
  // 修复：真正执行reducer来复现游戏状态
  let state = engine.initGame(seed, SIM_ROOM_ID, createSimulationPlayers(), SIM_FIRST_PLAYER);
  
  debugLog('Replay actions (with actual reducer execution):');
  for (const action of actions) {
    debugLog('  ', action.type, 'playerId' in action ? action.playerId : 'N/A');
    
    // 真正执行reducer来更新状态
    state = engine.reducer(state, action);
    
    // 在replay中也进行卡牌守恒断言检查
    assertTotalCards(state);
  }
  
  return state;
}

function createSimulationFailure(
  context: SimulationFailureContext,
  cause: unknown
): Error & SimulationFailureContext & { cause?: unknown } {
  const errorMessage = cause instanceof Error ? cause.message : String(cause);
  const failure = new Error(
    `SIMULATION FAILED: ${JSON.stringify({ ...context, error: errorMessage }, null, 2)}`
  ) as Error & SimulationFailureContext & { cause?: unknown };

  failure.seed = context.seed;
  failure.step = context.step;
  failure.phase = context.phase;
  failure.activePlayer = context.activePlayer;
  failure.actions = context.actions;
  failure.cause = cause;

  return failure;
}

/**
 * 根据当前状态推导所有合法 EngineAction
 * 注意：这里只覆盖正常对局会遇到的几种 action，不包括 SET_CONNECTED 等调试用 action
 */
function getLegalActions(state: EngineState, rng: Rng): EngineAction[] {
  const s = state.publicState;
  const active: PlayerId = s.activePlayer;
  const phase = s.phase;

  // 抽牌阶段：只有一手动作
  if (phase === 'p1_draw' || phase === 'p2_draw') {
    return [{ type: 'DRAW_CARD', playerId: active }];
  }

  // 行动阶段：从剩余未使用行动中随机选择一类，并给出若干合法组合
  if (phase === 'p1_action' || phase === 'p2_action') {
    const player = s.players[active];
    const hand = [...player.hand];
    const actionsUsed = player.actionsUsed;

    const candidates: EngineAction[] = [];

    // 对 4 种行动，分别根据当前手牌数和已用状态构造至少 1 个合法 action
    (['secret', 'discard', 'gift', 'competition'] as const).forEach((actionType) => {
      if (actionsUsed[actionType]) return;

      const requiredCount: number = engine.getRequiredCardCount(actionType);
      if (hand.length < requiredCount) return;

      // 简单策略：用 seeded RNG 打乱手牌后，取前 requiredCount 张
      const chosen = shuffleWithRng(hand, rng).slice(0, requiredCount);

      if (actionType === 'competition') {
        if (chosen.length !== 4) return;

        for (const grouping of generateCompetitionGroupings(chosen)) {
          candidates.push({
            type: 'PLAY_ACTION',
            playerId: active,
            actionType,
            cardIds: chosen,
            grouping,
          });
        }

        return;
      }

      candidates.push({
        type: 'PLAY_ACTION',
        playerId: active,
        actionType,
        cardIds: chosen,
      });
    });

    return candidates;
  }

  // 选择阶段（赠予 / 竞争）：需要从 pendingAction.cards 长度范围内选择一个索引
  if (phase === 'p1_select' || phase === 'p2_select') {
    const pending = state.publicState.pendingAction;
    if (!pending) return [];

    const actions: EngineAction[] = [];

    if (pending.type === 'gift') {
      for (let i = 0; i < pending.cards.length; i++) {
        actions.push({ type: 'RESOLVE_ACTION', playerId: pending.chooser, selection: i });
      }
    } else if (pending.type === 'competition') {
      for (let i = 0; i < pending.cards.length; i++) {
        actions.push({ type: 'RESOLVE_ACTION', playerId: pending.chooser, selection: i });
      }
    }

    return actions;
  }

  // 计分阶段：如果需要新回合，则由模拟器充当“服务器”，发起 APPLY_ROUND_SETUP
  if (phase === 'scoring' && state.meta.needsRoundSetup) {
    const setup = engine.createRoundSetup(state.rngState);
    return [
      {
        type: 'APPLY_ROUND_SETUP',
        deck: setup.deck,
        hands: setup.hands,
      },
    ];
  }

  // lobby / game_over 下不再有动作
  return [];
}

/**
 * 对当前 EngineState 执行一系列基本合法性检查
 * 如有异常，抛出 Error
 */
function validateState(state: EngineState): void {
  const s = state.publicState;

  debugLog('[validateState] deck length:', state.deck.length, '| deck:', JSON.stringify(state.deck));
  debugLog('[validateState] p1_hand:', JSON.stringify(s.players.p1.hand));
  debugLog('[validateState] p2_hand:', JSON.stringify(s.players.p2.hand));
  debugLog('[validateState] discardPile:', JSON.stringify((s as typeof s & { discardPile?: string[] }).discardPile));

  // 阶段是否合法
  if (!VALID_PHASES.includes(s.phase)) {
    throw new Error(`非法游戏阶段: ${s.phase}`);
  }

  // 当前玩家是否合法
  if (s.activePlayer !== 'p1' && s.activePlayer !== 'p2') {
    throw new Error(`非法当前玩家: ${String(s.activePlayer)}`);
  }

  const allCardIds: string[] = [];
  const pushCards = (ids: string[]) => {
    for (const id of ids) {
      if (typeof id === 'string') allCardIds.push(id);
    }
  };

  // 牌堆 + 弃牌堆（后者通过类型断言访问，兼容尚未重新构建的 d.ts）
  pushCards(state.deck);
  const anyState = s as typeof s & { discardPile?: string[] };
  if (anyState.discardPile) {
    pushCards(anyState.discardPile);
  }

  // 手牌与密约牌
  (['p1', 'p2'] as PlayerId[]).forEach((pid) => {
    const p = s.players[pid];
    if (p.hand.length < 0) {
      throw new Error(`玩家 ${pid} 手牌数量为负数`);
    }
    pushCards(p.hand);
    
    // 在游戏结束阶段，密约牌已经移动到艺伎区，不应重复计数
    if (p.secretCard && s.phase !== 'game_over') {
      pushCards([p.secretCard]);
    }
  });

  // 艺妓区
  for (const geisha of Object.values(s.geishas)) {
    pushCards(geisha.items.p1);
    pushCards(geisha.items.p2);

    const p1Count = geisha.items.p1.length;
    const p2Count = geisha.items.p2.length;

    if (geisha.owner === 'p1' && !(p1Count > p2Count)) {
      throw new Error(`艺妓所有权非法（应为 p1 控制但计数不占优）: ${geisha.id}`);
    }
    if (geisha.owner === 'p2' && !(p2Count > p1Count)) {
      throw new Error(`艺妓所有权非法（应为 p2 控制但计数不占优）: ${geisha.id}`);
    }
  }

  // 待处理行动中的牌（赠予/竞争行动中的牌）
  if (s.pendingAction) {
    if (s.pendingAction.type === 'gift') {
      pushCards(s.pendingAction.cards);
    } else if (s.pendingAction.type === 'competition') {
      for (const group of s.pendingAction.cards) {
        pushCards(group);
      }
    }
  }

  // 牌总数不应超过牌堆总数（单局最多 21 张道具牌，隐藏牌未出现）
  const maxCards = engine.ITEM_CARDS.length;
  if (allCardIds.length > maxCards) {
    const countDetails: Record<string, number> = {
      deck: state.deck.length,
      discardPile: (s as typeof s & { discardPile?: string[] }).discardPile?.length ?? 0,
      p1_hand: s.players.p1.hand.length,
      p1_secret: s.players.p1.secretCard ? 1 : 0,
      p2_hand: s.players.p2.hand.length,
      p2_secret: s.players.p2.secretCard ? 1 : 0,
    };
    let geishaCount = 0;
    for (const g of Object.values(s.geishas)) {
      countDetails[`geisha_${geishaCount++}`] = g.items.p1.length + g.items.p2.length;
    }
    let pendingCount = 0;
    if (s.pendingAction) {
      if (s.pendingAction.type === 'gift') pendingCount = s.pendingAction.cards.length;
      else if (s.pendingAction.type === 'competition') pendingCount = s.pendingAction.cards.flat().length;
    }
    countDetails.pendingAction = pendingCount;

    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const id of allCardIds) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    throw new Error(`牌总数超出牌堆上限: ${allCardIds.length} > ${maxCards}, 详情: ${JSON.stringify(countDetails)}, 重复卡牌: ${JSON.stringify(duplicates)}`);
  }
}

/**
 * 模拟一整局游戏，返回步骤数 / 回合数和胜负结果。
 * 如果中途出现任何异常，会抛出包含 seed + action replay 信息的错误，方便复现。
 */
function simulateGame(seed: number): { winner: PlayerId | null; steps: number; rounds: number } {
  let state: EngineState = engine.initGame(
    seed,
    SIM_ROOM_ID,
    createSimulationPlayers(),
    SIM_FIRST_PLAYER
  );
  const rng = createRng(seed);

  let steps = 0;
  const history: EngineAction[] = [];

  try {
    while (state.publicState.phase !== 'game_over') {
      steps += 1;
      if (steps > MAX_STEPS_PER_GAME) {
        throw new Error(`检测到可能的死循环：steps 超过上限 ${MAX_STEPS_PER_GAME}`);
      }

      const legalActions = getLegalActions(state, rng);

      if (legalActions.length === 0) {
        throw new Error(
          `无合法动作但游戏未结束，可能是规则错误。phase=${state.publicState.phase}`
        );
      }

      const action = randomChoice(legalActions, rng);
      history.push(action);

      state = engine.reducer(state, action);
      
      // 卡牌守恒断言检查
      assertTotalCards(state);

      // 每步之后做状态合法性检查，只在出错时打印详细状态
      try {
        validateState(state);
      } catch (e) {
        errorLog('❌ ERROR STATE:', JSON.stringify(state, null, 2));
        errorLog('❌ CURRENT ACTION:', JSON.stringify(action, null, 2));
        throw e;
      }
    }
  } catch (err) {
    throw createSimulationFailure(
      {
        seed,
        step: steps,
        phase: state.publicState.phase,
        activePlayer: state.publicState.activePlayer,
        actions: history,
      },
      err
    );
  }

  const winner: PlayerId | null = state.publicState.winner;
  const rounds = state.publicState.round;
  return { winner, steps, rounds };
}

/**
 * 运行 Monte Carlo 模拟，统计整体数据
 */
function runSimulation(totalGames: number): void {
  let p1Wins = 0;
  let p2Wins = 0;
  let draws = 0;

  let totalSteps = 0;
  let minSteps = Number.POSITIVE_INFINITY;
  let maxSteps = 0;

  let totalRounds = 0;
  let minRounds = Number.POSITIVE_INFINITY;
  let maxRounds = 0;

  const start = process.hrtime.bigint();

  for (let i = 0; i < totalGames; i++) {
    // 为了简单，种子用自增 + 线性同余方式生成，且保证完全可复现
    const seed = Number((BigInt(i) * 1103515245n + 12345n) & 0xffffffffn);
    const { winner, steps, rounds } = simulateGame(seed);

    totalSteps += steps;
    if (steps < minSteps) minSteps = steps;
    if (steps > maxSteps) maxSteps = steps;

    totalRounds += rounds;
    if (rounds < minRounds) minRounds = rounds;
    if (rounds > maxRounds) maxRounds = rounds;

    if (winner === 'p1') p1Wins += 1;
    else if (winner === 'p2') p2Wins += 1;
    else draws += 1;
  }

  const end = process.hrtime.bigint();
  const durationSec = Number(end - start) / 1e9;

  const avgSteps = totalSteps / totalGames;
  const avgRounds = totalRounds / totalGames;
  const gamesPerSecond = totalGames / durationSec;

  // 结果输出
  // 使用 console.log，方便在 CI 或本地直接查看
  console.log('\nSIMULATION RESULT');
  console.log('-----------------');
  console.log(`games:       ${totalGames}`);
  console.log(`player1Wins: ${p1Wins}`);
  console.log(`player2Wins: ${p2Wins}`);
  console.log(`draws:       ${draws}`);
  console.log('');
  console.log(`avgSteps: ${avgSteps.toFixed(2)}`);
  console.log(`maxSteps: ${maxSteps}`);
  console.log(`minSteps: ${minSteps === Number.POSITIVE_INFINITY ? 0 : minSteps}`);
  console.log('');
  console.log(`avgRounds: ${avgRounds.toFixed(2)}`);
  console.log(`maxRounds: ${maxRounds}`);
  console.log(`minRounds: ${minRounds === Number.POSITIVE_INFINITY ? 0 : minRounds}`);
  console.log('');
  console.log(`runtime: ${durationSec.toFixed(3)}s`);
  console.log(`games/sec: ${gamesPerSecond.toFixed(0)}`);
}

// 将整个 Monte Carlo 过程挂到一个 node:test 用例下
test(`Monte Carlo simulation - ${SIMULATION_COUNT} games`, () => {
  runSimulation(SIMULATION_COUNT);
  // 只要不抛异常就视为通过
  assert.ok(true);
});

// 额外的小型 deterministic / replay 自检，便于本地调试 simulation.test.ts 本身
test('simulation helpers - deterministic replay for same seed + actions', () => {
  const seed = 123456789;
  const initial = engine.initGame(seed, SIM_ROOM_ID, createSimulationPlayers(), SIM_FIRST_PLAYER);
  const legalAfterDraw = getLegalActions(initial, createRng(seed));
  const drawAction = legalAfterDraw[0];

  if (!drawAction || drawAction.type !== 'DRAW_CARD') {
    throw new Error('预期第一步应为 DRAW_CARD');
  }

  const afterDraw = engine.reducer(initial, drawAction);
  const followUpActions = getLegalActions(afterDraw, createRng(seed + 1));
  const chosenAction = followUpActions.find((action) => action.type === 'PLAY_ACTION');

  if (!chosenAction) {
    throw new Error('预期抽牌后至少存在一个 PLAY_ACTION');
  }

  const actions: EngineAction[] = [drawAction, chosenAction];
  const replayed1 = replayGame(seed, actions);
  const replayed2 = replayGame(seed, actions);

  assert.deepStrictEqual(replayed1, replayed2);
});
