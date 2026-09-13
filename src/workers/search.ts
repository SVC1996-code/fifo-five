import {
  chooseMove,
  type Algorithm,
  type Budget,
  type Diagnostics,
} from "../ai";
import type { State } from "../core";
export interface SearchRequest {
  gameId: number;
  requestId: number;
  state: State;
  budget: Budget;
  algorithm: Algorithm;
}
export interface SearchResponse {
  gameId: number;
  requestId: number;
  result?: Diagnostics;
  error?: string;
}
self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const { gameId, requestId, state, budget, algorithm } = event.data;
  try {
    self.postMessage({
      gameId,
      requestId,
      result: chooseMove(state, budget, algorithm),
    } satisfies SearchResponse);
  } catch (e) {
    self.postMessage({
      gameId,
      requestId,
      error: String(e),
    } satisfies SearchResponse);
  }
};
