import type { GameState } from '@hanamikoji/shared';
import { type EngineAction, type EngineState, reducer } from '@hanamikoji/engine';

export class GameRoom {
  constructor(private engineState: EngineState, private readonly broadcast: (state: GameState) => void) {}

  dispatch(action: EngineAction): EngineState {
    this.engineState = reducer(this.engineState, action);
    this.broadcast(this.engineState.gameState);
    return this.engineState;
  }

  get engine(): EngineState {
    return this.engineState;
  }

  getState(): GameState {
    return this.engineState.gameState;
  }
}
