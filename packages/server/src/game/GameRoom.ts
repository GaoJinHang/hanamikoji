import { GameState } from '@hanamikoji/shared';
import { EngineAction, EngineState, reducer as dispatch } from '@hanamikoji/engine';

export class GameRoom {
  constructor(public state: EngineState, private broadcast: (s: GameState) => void) {}
  dispatch(action: EngineAction): EngineState {
    this.state = dispatch(this.state, action);
    this.broadcast(this.state.publicState);
    return this.state;
  }
  getState(): GameState { return this.state.publicState; }
}
