import { gsap } from "gsap";
import {
  BarChart3,
  BadgeCheck,
  Cog,
  Crosshair,
  Gem,
  Menu,
  Play,
  Rocket,
  RotateCcw,
  Server,
  Target,
  Timer,
  Trophy,
  User,
  UserRound,
  Users,
  Zap,
  UsersRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedBackground from "./components/AnimatedBackground";
import GameBoard from "./components/GameBoard";
import HUD from "./components/HUD";
import ScreenShell from "./components/ScreenShell";
import { createAIMemory, forgetMatchedPair, pickAIMove, rememberCard } from "./core/ai";
import {
  BOARD_SPECS,
  canFlipCard,
  createInitialState,
  flipCard,
  getGameStats,
  resolvePendingTurn
} from "./core/gameEngine";
import type { AIDifficulty, BoardPreset, GameConfig, GameMode, GameState, Screen } from "./core/types";

const DEFAULT_MODE: GameMode = "solo";
const DEFAULT_AI: AIDifficulty = "medium";
const DEFAULT_BOARD: BoardPreset = "6x6";

const BOARD_LABELS: Record<BoardPreset, { title: string; subtitle: string }> = {
  "4x4": { title: "Recruit", subtitle: "4 X 4 GRID · 8 PAIRS" },
  "6x6": { title: "Veteran", subtitle: "6 X 6 GRID · 18 PAIRS" },
  "8x8": { title: "Elite", subtitle: "8 X 8 GRID · 32 PAIRS" }
};

const DIFFICULTY_COPY: Record<AIDifficulty, string> = {
  easy: "BOT CORE: EASY",
  medium: "BOT CORE: ADAPTIVE",
  hard: "BOT CORE: ELITE"
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function boardPreviewCells(board: BoardPreset): number {
  const { rows, cols } = BOARD_SPECS[board];
  return rows * cols;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<GameMode>(DEFAULT_MODE);
  const [difficulty, setDifficulty] = useState<AIDifficulty>(DEFAULT_AI);
  const [board, setBoard] = useState<BoardPreset>(DEFAULT_BOARD);
  const [game, setGame] = useState<GameState | null>(null);
  const [now, setNow] = useState(Date.now());

  const aiMemoryRef = useRef(createAIMemory());
  const resolveTimeoutRef = useRef<number | null>(null);
  const aiTimeoutsRef = useRef<number[]>([]);
  const aiActionTokenRef = useRef<string>("");

  const stats = useMemo(() => (game ? getGameStats(game) : null), [game, now]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearInterval(tick);
      if (resolveTimeoutRef.current) {
        window.clearTimeout(resolveTimeoutRef.current);
      }
      aiTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (!game) {
      return;
    }
    game.cards.forEach((card, index) => {
      if (card.state !== "hidden") {
        rememberCard(aiMemoryRef.current, index, card.pairId);
      }
      if (card.state === "matched") {
        forgetMatchedPair(aiMemoryRef.current, card.pairId);
      }
    });
  }, [game]);

  useEffect(() => {
    if (!game?.pendingOutcome) {
      return;
    }
    const delay = game.pendingOutcome.isMatch ? 380 : 1000;
    resolveTimeoutRef.current = window.setTimeout(() => {
      setGame((prev) => (prev ? resolvePendingTurn(prev) : prev));
    }, delay);

    return () => {
      if (resolveTimeoutRef.current) {
        window.clearTimeout(resolveTimeoutRef.current);
      }
    };
  }, [game?.pendingOutcome?.id]);

  useEffect(() => {
    if (!game || game.status !== "playing") {
      return;
    }
    const player = game.players[game.currentPlayer];
    if (!player?.isAI || game.isResolving || game.selected.length > 0) {
      return;
    }

    const token = `${game.currentPlayer}-${game.resolutionCounter}-${game.moves}`;
    if (aiActionTokenRef.current === token) {
      return;
    }
    aiActionTokenRef.current = token;

    const [first, second] = pickAIMove(game, aiMemoryRef.current, difficulty);
    const firstTimeout = window.setTimeout(() => {
      setGame((prev) => {
        if (!prev || !canFlipCard(prev, first)) {
          return prev;
        }
        return flipCard(prev, first);
      });
    }, 460);

    const secondTimeout = window.setTimeout(() => {
      setGame((prev) => {
        if (!prev || !canFlipCard(prev, second)) {
          return prev;
        }
        return flipCard(prev, second);
      });
    }, 940);

    aiTimeoutsRef.current = [firstTimeout, secondTimeout];

    return () => {
      window.clearTimeout(firstTimeout);
      window.clearTimeout(secondTimeout);
    };
  }, [difficulty, game]);

  useEffect(() => {
    if (!game || game.status !== "finished" || screen !== "game") {
      return;
    }
    const timeout = window.setTimeout(() => {
      setScreen("results");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [game, screen]);

  const startGame = () => {
    const config: GameConfig = { mode, board };
    if (resolveTimeoutRef.current) {
      window.clearTimeout(resolveTimeoutRef.current);
    }
    aiTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    aiMemoryRef.current = createAIMemory();
    aiActionTokenRef.current = "";
    setGame(createInitialState(config));
    setScreen("game");
  };

  const onCardClick = (index: number) => {
    setGame((prev) => {
      if (!prev || !canFlipCard(prev, index)) {
        return prev;
      }
      return flipCard(prev, index);
    });
  };

  const resetSetup = () => {
    setMode(DEFAULT_MODE);
    setDifficulty(DEFAULT_AI);
    setBoard(DEFAULT_BOARD);
  };

  const goHome = () => {
    if (resolveTimeoutRef.current) {
      window.clearTimeout(resolveTimeoutRef.current);
    }
    aiTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    setGame(null);
    resetSetup();
    setScreen("home");
  };

  useEffect(() => {
    gsap.to(".home-title-neon", {
      opacity: 0.62,
      duration: 1.3,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut"
    });
  }, []);

  return (
    <main className="app-root">
      <AnimatedBackground />
      <div className="app-shell">
        {screen === "home" && (
          <ScreenShell screenKey="home" className="home-screen">
            <header className="home-topbar">
              <div className="status-chip">
                <Server size={14} />
                <div>
                  <p>SYSTEM STATUS</p>
                  <strong>ONLINE // V2.0.4</strong>
                </div>
              </div>
              <div className="currency-pill">12,450 | 480</div>
            </header>

            <div className="home-center">
              <div className="home-side-left">
                <article className="home-stat-card"><span>GLOBAL RANK</span><strong>#1,242</strong></article>
                <article className="home-stat-card"><span>TOTAL WINS</span><strong>154</strong></article>
              </div>

              <section className="home-hero">
                <p className="home-hero-tag">ULTRA HD EXPERIENCE</p>
                <h1 className="home-title">
                  <span>NEON</span>
                  <em className="home-title-neon">MEMORY</em>
                </h1>
                <button className="play-now-btn" onClick={() => setScreen("factory")}>
                  <Play size={18} fill="currentColor" />
                  PLAY NOW
                </button>
                <div className="home-secondary-actions">
                  <button className="secondary-neon-btn"><BarChart3 size={16} />LEADERBOARD</button>
                  <button className="secondary-neon-btn"><Cog size={16} />SETTINGS</button>
                </div>
              </section>

              <div className="home-side-right">
                <article className="home-stat-card"><span>HIGH SCORE</span><strong>98,420</strong></article>
                <article className="home-stat-card"><span>CURRENT EVENT</span><strong>NEON SUMMER '24</strong></article>
              </div>
            </div>

            <footer className="home-footer">
              <p>PATCH NOTES</p>
              <p>SERVER: US-EAST2</p>
            </footer>
          </ScreenShell>
        )}

        {screen === "factory" && (
          <ScreenShell screenKey="factory" className="factory-screen glass-panel">
            <header className="factory-header">
              <div className="setup-title-wrap">
                <span className="setup-icon"><Crosshair size={19} /></span>
                <div>
                  <h2>FACTORY CORE</h2>
                  <p>SYSTEM BOOT // PRE-MISSION CHECKS</p>
                </div>
              </div>
              <button className="icon-square-btn" onClick={() => setScreen("home")}>
                <X size={20} />
              </button>
            </header>

            <section className="factory-grid">
              <article className="factory-card">
                <h3>Memory Engine</h3>
                <p>Card matrix generation, pair hashing, and anti-race turn locks are online.</p>
                <span>STATUS: STABLE</span>
              </article>
              <article className="factory-card">
                <h3>Animation Core</h3>
                <p>GSAP timelines calibrated for 60 FPS on desktop and constrained mobile GPUs.</p>
                <span>STATUS: OPTIMIZED</span>
              </article>
              <article className="factory-card">
                <h3>AI Neural Bot</h3>
                <p>Difficulty presets loaded with memory retention variance and weighted randomness.</p>
                <span>STATUS: ARMED</span>
              </article>
            </section>

            <footer className="factory-actions">
              <button className="ghost-btn" onClick={() => setScreen("home")}>Abort</button>
              <button className="primary-btn" onClick={() => setScreen("mode")}>
                Enter Configuration
              </button>
            </footer>
          </ScreenShell>
        )}

        {screen === "mode" && (
          <ScreenShell screenKey="mode" className="setup-screen glass-panel">
            <header className="setup-header">
              <div className="setup-title-wrap">
                <span className="setup-icon"><BarChart3 size={19} /></span>
                <div>
                  <h2>GAME CONFIGURATION</h2>
                  <p>SYSTEM READY // MODE SELECTION</p>
                </div>
              </div>
              <button className="icon-square-btn" onClick={() => setScreen("factory")}>
                <X size={20} />
              </button>
            </header>

            <section>
              <h3 className="setup-label">1. SELECT MISSION TYPE</h3>
              <div className="mission-grid">
                <button className={`mission-card ${mode === "solo" ? "selected" : ""}`} onClick={() => setMode("solo")}>
                  <span className="mission-icon"><User size={20} /></span>
                  <strong>Solo Mission</strong>
                  <p>Single Player Mode</p>
                  <small>ACTIVE</small>
                </button>
                <button className={`mission-card ${mode === "local2" ? "selected" : ""}`} onClick={() => setMode("local2")}>
                  <span className="mission-icon"><Users size={20} /></span>
                  <strong>Duo Duel</strong>
                  <p>2 Players Local</p>
                  <small>{mode === "local2" ? "ACTIVE" : "STANDBY"}</small>
                </button>
                <button className={`mission-card ${mode === "local4" ? "selected" : ""}`} onClick={() => setMode("local4")}>
                  <span className="mission-icon"><UsersRound size={20} /></span>
                  <strong>Squad Clash</strong>
                  <p>4 Players Local</p>
                  <small>{mode === "local4" ? "ACTIVE" : "STANDBY"}</small>
                </button>
              </div>
            </section>

            <section className="setup-split">
              <div>
                <h3 className="setup-label">2. COMPLEXITY LEVEL</h3>
                <div className="level-list">
                  {(Object.keys(BOARD_SPECS) as BoardPreset[]).map((preset) => (
                    <button
                      key={preset}
                      className={`level-row ${board === preset ? "selected" : ""}`}
                      onClick={() => setBoard(preset)}
                    >
                      <span className="radio-dot" />
                      <div>
                        <strong>{BOARD_LABELS[preset].title}</strong>
                        <p>{BOARD_LABELS[preset].subtitle}</p>
                      </div>
                      <span className="edge-notch" />
                    </button>
                  ))}
                </div>
                {mode === "solo" && (
                  <div className="bot-difficulty-row">
                    {(["easy", "medium", "hard"] as AIDifficulty[]).map((level) => (
                      <button
                        key={level}
                        className={`bot-btn ${difficulty === level ? "selected" : ""}`}
                        onClick={() => setDifficulty(level)}
                      >
                        {level.toUpperCase()}
                      </button>
                    ))}
                    <span>{DIFFICULTY_COPY[difficulty]}</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="setup-label">3. BOARD LAYOUT</h3>
                <div className="board-preview-box">
                  <div className={`board-preview-grid grid-${board.replace("x", "-")}`}>
                    {Array.from({ length: boardPreviewCells(board) }).map((_, i) => (
                      <span key={i} className={`preview-cell ${i % 7 === 0 ? "active" : ""}`} />
                    ))}
                  </div>
                  <p>PREVIEW MODE: ACTIVE</p>
                </div>
              </div>
            </section>

            <footer className="setup-footer">
              <button className="initialize-btn" onClick={startGame}>
                INITIALIZE GAME <Rocket size={18} />
              </button>
              <button className="reset-btn" onClick={resetSetup}>RESET</button>
            </footer>
          </ScreenShell>
        )}

        {screen === "ai" && <div />}
        {screen === "board" && <div />}

        {screen === "game" && game && (
          <ScreenShell screenKey="game" className="arena-screen">
            <HUD players={game.players} currentPlayer={game.currentPlayer} />

            <section className="arena-board-stage">
              <GameBoard state={game} onCardClick={onCardClick} />
            </section>

            <footer className="arena-footer-bar">
              <div className="arena-metric">
                <span>SESSION TIME</span>
                <strong>{formatDuration(stats?.elapsedMs ?? 0)}</strong>
              </div>
              <div className="arena-metric">
                <span>TOTAL MOVES</span>
                <strong>{stats?.moves ?? 0}</strong>
              </div>
              <button className="footer-control-btn" onClick={() => setScreen("mode")}>
                <Cog size={16} /> Settings
              </button>
              <button className="footer-main-btn" onClick={startGame}>
                <RotateCcw size={16} /> RESTART GAME
              </button>
            </footer>
          </ScreenShell>
        )}

        {screen === "results" && game && stats && (
          <ScreenShell screenKey="results" className="victory-screen">
            <header className="victory-topbar">
              <div className="victory-brand">
                <span className="victory-brand-icon"><Trophy size={15} /></span>
                <strong>Memory Match</strong>
              </div>
              <div className="victory-top-actions">
                <button className="icon-square-btn"><Cog size={17} /></button>
                <div className="rank-pill">
                  <span>RANK</span>
                  <strong>Grandmaster</strong>
                </div>
                <span className="rank-avatar"><UserRound size={14} /></span>
              </div>
            </header>

            <section className="victory-hero">
              <p>MISSION ACCOMPLISHED</p>
              <h2>VICTORY</h2>
            </section>

            <section className="victory-main-grid">
              <article className="winner-panel glass-panel">
                <div className="winner-avatar-ring">
                  <div className="winner-avatar-core">{game.players[stats.winnerIds[0] ?? 0]?.name.slice(0, 1) ?? "P"}</div>
                  <span className="winner-badge">MVP</span>
                </div>
                <h3>{stats.winnerIds.length === 1 ? game.players[stats.winnerIds[0]].name : "Draw Match"}</h3>
                <p>GLOBAL LEADERBOARD #{1200 + Math.max(1, stats.moves)}</p>
                <div className="xp-panel">
                  <div className="xp-row">
                    <span>XP EARNED</span>
                    <strong>+{Math.max(850, Math.round((stats.accuracy + 30) * 22))} XP</strong>
                  </div>
                  <div className="xp-bar"><span style={{ width: `${Math.min(96, Math.round(stats.accuracy))}%` }} /></div>
                  <small>LEVEL 42 · 450 XP TO LEVEL 43</small>
                </div>
              </article>

              <div className="victory-right">
                <div className="victory-stats-grid">
                  <article className="victory-stat-card glass-panel">
                    <p><Zap size={13} /> MOVES</p>
                    <strong>{stats.moves}</strong>
                    <small>BEST: {Math.max(8, stats.moves - 3)}</small>
                  </article>
                  <article className="victory-stat-card glass-panel">
                    <p><Timer size={13} /> TIME</p>
                    <strong>{formatDuration(stats.elapsedMs)}</strong>
                    <small>AVG: 01:55</small>
                  </article>
                  <article className="victory-stat-card glass-panel">
                    <p><Target size={13} /> ACCURACY</p>
                    <strong>{Math.round(stats.accuracy)}%</strong>
                    <small>WORLD AVG: 78%</small>
                  </article>
                </div>

                <article className="rewards-panel glass-panel">
                  <h4>MATCH REWARDS</h4>
                  <div className="reward-row">
                    <span className="reward-icon"><BadgeCheck size={17} /></span>
                    <div>
                      <strong>Speed Demon Badge</strong>
                      <p>Finish in under 02:00 minutes</p>
                    </div>
                    <BadgeCheck className="reward-check" size={22} />
                  </div>
                  <div className="reward-row">
                    <span className="reward-icon"><Gem size={17} /></span>
                    <div>
                      <strong>50 Crystals</strong>
                      <p>Reward for Perfect Accuracy streak</p>
                    </div>
                    <BadgeCheck className="reward-check" size={22} />
                  </div>
                </article>

                <div className="victory-ctas">
                  <button className="victory-play-btn" onClick={startGame}>
                    <RotateCcw size={17} /> PLAY AGAIN
                  </button>
                  <button className="victory-menu-btn" onClick={goHome}>
                    <Menu size={17} /> BACK TO MENU
                  </button>
                </div>
              </div>
            </section>
          </ScreenShell>
        )}
      </div>
    </main>
  );
}
