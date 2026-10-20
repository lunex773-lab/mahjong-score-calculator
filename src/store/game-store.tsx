import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { replay, type GameEvent, type GameState } from '../domain/round/game';
import type { RuleProfile } from '../domain/rules';
import type { RuleError } from '../domain/errors';
import { loadCurrentId, loadDefaultRules, loadGames, saveCurrentId, saveDefaultRules, saveGames } from '../infrastructure/storage';
import { emptyDraft, type HandDraft, type Players, type SavedGame } from './types';

/**
 * 画面横断の状態。点数計算そのものは持たず、ドメイン層（replay / calculateHandScore）を呼び出す。
 */

const HISTORY_LIMIT = 100;

interface StoreState {
  games: SavedGame[];
  currentId: string | null;
  defaultRules: RuleProfile;
  past: HandDraft[];
  future: HandDraft[];
  notices: string[];
}

type Action =
  | { type: 'draft'; draft: HandDraft }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'commitEvent'; event: GameEvent; keepDraft?: boolean }
  | { type: 'popEvent' }
  | { type: 'newGame'; players: Players; rules: RuleProfile }
  | { type: 'selectGame'; id: string }
  | { type: 'deleteGame'; id: string }
  | { type: 'renamePlayers'; players: Players }
  | { type: 'setDefaultRules'; rules: RuleProfile }
  | { type: 'notice'; message: string }
  | { type: 'dismissNotice' };

const now = () => new Date().toISOString();
const newId = () => `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function updateCurrent(state: StoreState, fn: (g: SavedGame) => SavedGame): StoreState {
  return {
    ...state,
    games: state.games.map((g) => (g.id === state.currentId ? { ...fn(g), updatedAt: now() } : g)),
  };
}

function current(state: StoreState): SavedGame | undefined {
  return state.games.find((g) => g.id === state.currentId);
}

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'draft': {
      const game = current(state);
      if (!game) return state;
      return {
        ...updateCurrent(state, (g) => ({ ...g, draft: action.draft })),
        past: [...state.past, game.draft].slice(-HISTORY_LIMIT),
        future: [],
      };
    }
    case 'undo': {
      const game = current(state);
      const prev = state.past[state.past.length - 1];
      if (!game || !prev) return state;
      return {
        ...updateCurrent(state, (g) => ({ ...g, draft: prev })),
        past: state.past.slice(0, -1),
        future: [game.draft, ...state.future],
      };
    }
    case 'redo': {
      const game = current(state);
      const next = state.future[0];
      if (!game || !next) return state;
      return {
        ...updateCurrent(state, (g) => ({ ...g, draft: next })),
        past: [...state.past, game.draft],
        future: state.future.slice(1),
      };
    }
    case 'commitEvent':
      return {
        ...updateCurrent(state, (g) => ({
          ...g,
          events: [...g.events, action.event],
          draft: action.keepDraft ? g.draft : emptyDraft(),
        })),
        past: [],
        future: [],
      };
    case 'popEvent':
      return { ...updateCurrent(state, (g) => ({ ...g, events: g.events.slice(0, -1) })), past: [], future: [] };
    case 'newGame': {
      const game: SavedGame = {
        schemaVersion: 1,
        id: newId(),
        createdAt: now(),
        updatedAt: now(),
        rules: action.rules,
        players: action.players,
        events: [],
        draft: emptyDraft(),
      };
      return { ...state, games: [game, ...state.games], currentId: game.id, past: [], future: [] };
    }
    case 'selectGame':
      return { ...state, currentId: action.id, past: [], future: [] };
    case 'deleteGame': {
      const games = state.games.filter((g) => g.id !== action.id);
      return { ...state, games, currentId: state.currentId === action.id ? (games[0]?.id ?? null) : state.currentId };
    }
    case 'renamePlayers':
      return updateCurrent(state, (g) => ({ ...g, players: action.players }));
    case 'setDefaultRules':
      return { ...state, defaultRules: action.rules };
    case 'notice':
      return { ...state, notices: [...state.notices, action.message] };
    case 'dismissNotice':
      return { ...state, notices: state.notices.slice(1) };
  }
}

function init(): StoreState {
  const games = loadGames();
  const rules = loadDefaultRules();
  const id = loadCurrentId();
  return {
    games: games.value,
    currentId: games.value.some((g) => g.id === id) ? id : (games.value[0]?.id ?? null),
    defaultRules: rules.value,
    past: [],
    future: [],
    notices: [...games.warnings, ...rules.warnings],
  };
}

interface Store {
  state: StoreState;
  game: SavedGame | undefined;
  /** イベント列から再生した現在の対局状態 */
  gameState: GameState | null;
  replayErrors: RuleError[];
  dispatch: (a: Action) => void;
  canUndo: boolean;
  canRedo: boolean;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children, initialState }: { children: ReactNode; initialState?: StoreState }) {
  const [state, dispatch] = useReducer(reducer, initialState ?? null, (s) => s ?? init());
  const game = current(state);

  const replayed = useMemo(() => (game ? replay(game.rules, game.players, game.events) : null), [game?.rules, game?.players, game?.events]);

  useEffect(() => {
    const err = saveGames(state.games);
    if (err) dispatch({ type: 'notice', message: err });
  }, [state.games]);
  useEffect(() => saveCurrentId(state.currentId), [state.currentId]);
  useEffect(() => {
    const err = saveDefaultRules(state.defaultRules);
    if (err) dispatch({ type: 'notice', message: err });
  }, [state.defaultRules]);

  const stableDispatch = useCallback((a: Action) => dispatch(a), []);
  const value = useMemo<Store>(
    () => ({
      state,
      game,
      gameState: replayed?.state ?? null,
      replayErrors: replayed?.errors ?? [],
      dispatch: stableDispatch,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state, game, replayed, stableDispatch],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreProvider がありません');
  return s;
}

export type { StoreState, Action };
