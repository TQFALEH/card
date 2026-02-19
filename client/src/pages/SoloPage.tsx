import { gsap } from "gsap";
import { Bot, Grid2X2, Menu, RotateCcw, Timer, UserRound } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MemoryCard from "../components/MemoryCard";
import ScreenShell from "../components/ScreenShell";
import { iconPool, tintPalette } from "../core/icons";
import { useSound } from "../contexts/SoundContext";

type BotLevel = "easy" | "medium" | "hard";
type Turn = "player" | "bot";

interface SoloCard {
  index: number;
  pair_id: string;
  icon_id: string;
  tint: string;
  state: "hidden" | "revealed" | "matched";
  owner: Turn | null;
}

interface SoloGame {
  rows: number;
  cols: number;
  cards: SoloCard[];
  selected: number[];
  current: Turn;
  scores: Record<Turn, number>;
  inputLocked: boolean;
  matchedPairs: number;
  totalPairs: number;
  attempts: number;
  moves: number;
  status: "playing" | "ended";
  startedAt: number;
  endedAt: number | null;
  pendingMismatch: [number, number] | null;
}

const boardMap: Record<string, { rows: number; cols: number }> = {
  "4x4": { rows: 4, cols: 4 },
  "6x6": { rows: 6, cols: 6 },
  "8x8": { rows: 8, cols: 8 }
};

const iconById = new Map<string, (typeof iconPool)[number]["component"]>(iconPool.map((i) => [i.id, i.component]));

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createGame(size: string): SoloGame {
  const dims = boardMap[size] ?? boardMap["6x6"];
  const totalPairs = (dims.rows * dims.cols) / 2;

  const pairs = Array.from({ length: totalPairs }).map((_, i) => {
    const icon = iconPool[i % iconPool.length].id;
    return {
      pair_id: `${icon}-${Math.floor(i / iconPool.length)}`,
      icon_id: icon,
      tint: tintPalette[i % tintPalette.length]
    };
  });

  const cards = shuffle(
    pairs.flatMap((p) => [
      { ...p },
      { ...p }
    ])
  ).map((c, i) => ({
    index: i,
    pair_id: c.pair_id,
    icon_id: c.icon_id,
    tint: c.tint,
    state: "hidden" as const,
    owner: null
  }));

  return {
    rows: dims.rows,
    cols: dims.cols,
    cards,
    selected: [],
    current: "player",
    scores: { player: 0, bot: 0 },
    inputLocked: false,
    matchedPairs: 0,
    totalPairs,
    attempts: 0,
    moves: 0,
    status: "playing",
    startedAt: Date.now(),
    endedAt: null,
    pendingMismatch: null
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function SoloPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boardSize = params.get("size") ?? "6x6";
  const botLevel = ((params.get("bot") ?? "medium").toLowerCase() as BotLevel);

  const gameRef = useRef<SoloGame>(createGame(boardSize));
  const [game, setGame] = useState<SoloGame>(gameRef.current);
  const [tick, setTick] = useState(0);
  const [botThinking, setBotThinking] = useState(false);
  const seenByIndexRef = useRef<Map<number, string>>(new Map());
  const seenOrderRef = useRef<number[]>([]);
  const botPlannedPairRef = useRef<[number, number] | null>(null);
  const resolveTimerRef = useRef<number | null>(null);
  const botStepTimerRef = useRef<number | null>(null);
  const { play, setMusicMode } = useSound();
  const shellRef = useRef<HTMLDivElement | null>(null);

  const elapsed = game.status === "ended" && game.endedAt ? game.endedAt - game.startedAt : Date.now() - game.startedAt;

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  useLayoutEffect(() => {
    if (!shellRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".arena-screen, .victory-screen", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out" });
    }, shellRef);
    return () => ctx.revert();
  }, [game.status]);

  useEffect(() => {
    if (game.status !== "playing" || game.current !== "bot" || game.inputLocked) return;
    runBotTurn();
  }, [game.current, game.status, game.inputLocked, tick]);

  useEffect(() => {
    setMusicMode(game.status === "ended" ? "victory" : "game");
  }, [game.status, setMusicMode]);

  useEffect(() => {
    return () => {
      if (resolveTimerRef.current) window.clearTimeout(resolveTimerRef.current);
      if (botStepTimerRef.current) window.clearTimeout(botStepTimerRef.current);
    };
  }, []);

  const rememberCard = (index: number, pairId: string) => {
    const chance = botLevel === "hard" ? 1 : botLevel === "medium" ? 0.78 : 0.32;
    if (Math.random() > chance) return;

    if (!seenByIndexRef.current.has(index)) seenOrderRef.current.push(index);
    seenByIndexRef.current.set(index, pairId);

    const limit = botLevel === "hard" ? 999 : botLevel === "medium" ? 24 : 10;
    while (seenOrderRef.current.length > limit) {
      const rm = seenOrderRef.current.shift();
      if (typeof rm === "number") seenByIndexRef.current.delete(rm);
    }
  };

  const hiddenIndices = (g: SoloGame) => g.cards.filter((c) => c.state === "hidden").map((c) => c.index);

  const findKnownPair = (g: SoloGame): [number, number] | null => {
    const hidden = new Set(hiddenIndices(g));
    const byPair = new Map<string, number[]>();
    seenByIndexRef.current.forEach((pair, idx) => {
      if (!hidden.has(idx)) return;
      const arr = byPair.get(pair) ?? [];
      arr.push(idx);
      byPair.set(pair, arr);
    });
    for (const arr of byPair.values()) {
      if (arr.length >= 2) return [arr[0], arr[1]];
    }
    return null;
  };

  const pickRandomHidden = (g: SoloGame, except: number[] = []): number | null => {
    const hidden = hiddenIndices(g).filter((i) => !except.includes(i));
    if (!hidden.length) return null;
    return hidden[Math.floor(Math.random() * hidden.length)];
  };

  const commit = (next: SoloGame) => {
    gameRef.current = next;
    setGame(next);
  };

  const resolveSelected = () => {
    const g = gameRef.current;
    if (g.selected.length !== 2 || g.status !== "playing") return;

    const [a, b] = g.selected;
    const next: SoloGame = {
      ...g,
      cards: g.cards.map((c) => ({ ...c })),
      selected: [],
      pendingMismatch: null,
      inputLocked: false,
      attempts: g.attempts + 1,
      moves: g.moves + 1
    };

    const ca = next.cards[a];
    const cb = next.cards[b];
    const matched = ca.pair_id === cb.pair_id;

    if (matched) {
      ca.state = "matched";
      cb.state = "matched";
      ca.owner = g.current;
      cb.owner = g.current;
      next.scores = { ...next.scores, [g.current]: next.scores[g.current] + 1 };
      next.matchedPairs += 1;
      play("match");

      if (next.matchedPairs >= next.totalPairs) {
        next.status = "ended";
        next.endedAt = Date.now();
        next.inputLocked = true;
        play("victory", 0.9);
      }
    } else {
      ca.state = "hidden";
      cb.state = "hidden";
      next.current = g.current === "player" ? "bot" : "player";
      next.pendingMismatch = [a, b];
      play("mismatch");
    }

    commit(next);

    if (!matched) {
      window.setTimeout(() => {
        const curr = gameRef.current;
        if (!curr.pendingMismatch) return;
        commit({ ...curr, pendingMismatch: null });
      }, 220);
    }
  };

  const reveal = (index: number): boolean => {
    const g = gameRef.current;
    if (g.status !== "playing" || g.inputLocked) return false;
    const card = g.cards[index];
    if (!card || card.state !== "hidden") return false;

    const next: SoloGame = {
      ...g,
      cards: g.cards.map((c) => ({ ...c })),
      selected: [...g.selected, index]
    };
    next.cards[index].state = "revealed";

    rememberCard(index, next.cards[index].pair_id);
    play("flip", g.current === "bot" ? 0.85 : 1);

    if (next.selected.length === 2) {
      next.inputLocked = true;
      resolveTimerRef.current = window.setTimeout(resolveSelected, 1000);
    }

    commit(next);
    return true;
  };

  const runBotTurn = () => {
    if (botThinking) return;
    setBotThinking(true);

    const g = gameRef.current;
    const preferKnown = botLevel === "hard" ? 1 : botLevel === "medium" ? 0.65 : 0.2;
    const known = findKnownPair(g);

    let first: number | null = null;
    let secondPlan: number | null = null;

    if (known && Math.random() < preferKnown) {
      [first, secondPlan] = known;
    } else {
      first = pickRandomHidden(g);
    }

    if (first === null) {
      setBotThinking(false);
      return;
    }

    botStepTimerRef.current = window.setTimeout(() => {
      reveal(first!);

      botStepTimerRef.current = window.setTimeout(() => {
        const curr = gameRef.current;
        const revealed = curr.selected[0];
        const revealedPair = curr.cards[revealed]?.pair_id;

        let second: number | null = secondPlan;
        if (second === null) {
          const hidden = new Set(hiddenIndices(curr));
          let knownMatch: number | null = null;
          seenByIndexRef.current.forEach((pair, idx) => {
            if (knownMatch !== null) return;
            if (pair === revealedPair && idx !== revealed && hidden.has(idx)) knownMatch = idx;
          });

          const p = botLevel === "hard" ? 1 : botLevel === "medium" ? 0.8 : 0.25;
          if (knownMatch !== null && Math.random() < p) {
            second = knownMatch;
          } else {
            second = pickRandomHidden(curr, [revealed]);
          }
        }

        if (second !== null) reveal(second);
        setBotThinking(false);
      }, 520);
    }, 560);
  };

  const onPlayerClick = (index: number) => {
    const g = gameRef.current;
    if (g.current !== "player" || g.inputLocked || g.status !== "playing") return;
    reveal(index);
  };

  const resetGame = () => {
    if (resolveTimerRef.current) window.clearTimeout(resolveTimerRef.current);
    if (botStepTimerRef.current) window.clearTimeout(botStepTimerRef.current);
    seenByIndexRef.current.clear();
    seenOrderRef.current = [];
    botPlannedPairRef.current = null;
    setBotThinking(false);
    play("start", 0.9);
    commit(createGame(boardSize));
  };

  const winner = game.scores.player === game.scores.bot ? "Draw" : game.scores.player > game.scores.bot ? "You" : "Bot";

  return (
    <ScreenShell screenKey={`solo-${game.status}`} className="room-screen">
      <div ref={shellRef}>
        {game.status === "playing" && (
          <section className="arena-screen">
            <header className="match-hud-frame">
              <div className="match-hud-main">
                <article className={`match-player-card ${game.current === "player" ? "active" : ""}`}>
                  <div className="match-player-meta"><UserRound size={13} /><span>YOU</span></div>
                  <strong>{game.scores.player}</strong>
                </article>
                <div className="match-hud-center">
                  <div className="match-hud-titleblock"><Bot size={14} /><span>SOLO VS BOT ({botLevel.toUpperCase()})</span></div>
                  <div className="turn-pill">{game.current === "player" ? "YOUR TURN" : botThinking ? "BOT THINKING..." : "BOT TURN"}</div>
                </div>
                <article className={`match-player-card ${game.current === "bot" ? "active" : ""}`}>
                  <div className="match-player-meta"><Bot size={13} /><span>BOT</span></div>
                  <strong>{game.scores.bot}</strong>
                </article>
              </div>
            </header>

            <section className="arena-board-stage">
              <div className="board-grid" style={{ gridTemplateColumns: `repeat(${game.cols}, minmax(0,1fr))` }}>
                {game.cards.map((card, idx) => {
                  const Icon = iconById.get(card.icon_id) ?? iconPool[0].component;
                  return (
                    <MemoryCard
                      key={card.index}
                      icon={Icon}
                      tint={card.tint}
                      faceUp={card.state !== "hidden"}
                      matched={card.state === "matched"}
                      disabled={game.current !== "player" || game.inputLocked || card.state !== "hidden"}
                      onClick={() => onPlayerClick(idx)}
                      matchToken={card.state === "matched" ? 1 : 0}
                      mismatchToken={game.pendingMismatch?.includes(idx as any) ? 1 : 0}
                    />
                  );
                })}
              </div>
            </section>

            <footer className="arena-footer-bar">
              <div className="arena-metric"><span>SESSION TIME</span><strong>{formatDuration(elapsed)}</strong></div>
              <div className="arena-metric"><span>TOTAL MOVES</span><strong><Grid2X2 size={14} /> {game.moves}</strong></div>
              <button className="footer-control-btn" onClick={resetGame}><RotateCcw size={16} /> Restart</button>
              <button className="footer-main-btn" onClick={() => navigate("/")}><Menu size={16} /> Exit</button>
            </footer>
          </section>
        )}

        {game.status === "ended" && (
          <section className="victory-screen">
            <section className="victory-hero">
              <p>MISSION ACCOMPLISHED</p>
              <h2>{winner === "You" ? "VICTORY" : winner === "Bot" ? "DEFEAT" : "DRAW"}</h2>
            </section>
            <section className="victory-main-grid">
              <article className="winner-panel glass-panel">
                <h3>{winner}</h3>
                <p>YOU {game.scores.player} : {game.scores.bot} BOT</p>
                <div className="xp-panel">
                  <div className="xp-row"><span>MATCH TIME</span><strong>{formatDuration(elapsed)}</strong></div>
                  <small>MOVES: {game.moves} · ATTEMPTS: {game.attempts}</small>
                </div>
              </article>
              <div className="victory-right">
                <div className="victory-ctas">
                  <button className="victory-play-btn" onClick={resetGame}><RotateCcw size={17} /> PLAY AGAIN</button>
                  <button className="victory-menu-btn" onClick={() => navigate("/")}><Menu size={17} /> BACK TO HOME</button>
                </div>
              </div>
            </section>
          </section>
        )}
      </div>
    </ScreenShell>
  );
}
