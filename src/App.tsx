import { gsap } from "gsap";
import {
  BarChart3,
  BadgeCheck,
  Cog,
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
type Language = "en" | "ar";

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

const COPY = {
  en: {
    home: {
      systemStatus: "SYSTEM STATUS",
      online: "ONLINE // V2.0.4",
      ultra: "ULTRA HD EXPERIENCE",
      playNow: "PLAY NOW",
      leaderboard: "LEADERBOARD",
      settings: "SETTINGS",
      globalRank: "GLOBAL RANK",
      totalWins: "TOTAL WINS",
      highScore: "HIGH SCORE",
      currentEvent: "CURRENT EVENT",
      patchNotes: "PATCH NOTES",
      server: "SERVER: US-EAST2"
    },
    victory: {
      rank: "RANK",
      grandmaster: "Grandmaster",
      mission: "MISSION ACCOMPLISHED",
      victory: "VICTORY",
      mvp: "MVP",
      leaderboard: "GLOBAL LEADERBOARD",
      xpEarned: "XP EARNED",
      levelText: "LEVEL 42 · 450 XP TO LEVEL 43",
      moves: "MOVES",
      time: "TIME",
      accuracy: "ACCURACY",
      best: "BEST",
      avg: "AVG",
      worldAvg: "WORLD AVG: 78%",
      rewards: "MATCH REWARDS",
      speedBadge: "Speed Demon Badge",
      speedBadgeDesc: "Finish in under 02:00 minutes",
      crystals: "50 Crystals",
      crystalsDesc: "Reward for Perfect Accuracy streak",
      playAgain: "PLAY AGAIN",
      backToMenu: "BACK TO MENU"
    },
    setup: {
      title: "GAME CONFIGURATION",
      subtitle: "SYSTEM READY // MODE SELECTION",
      missionType: "1. SELECT MISSION TYPE",
      solo: "Solo Mission",
      soloDesc: "Single Player Mode",
      duo: "Duo Duel",
      duoDesc: "2 Players Local",
      squad: "Squad Clash",
      squadDesc: "4 Players Local",
      active: "ACTIVE",
      standby: "STANDBY",
      complexity: "2. COMPLEXITY LEVEL",
      boardLayout: "3. BOARD LAYOUT",
      preview: "PREVIEW MODE: ACTIVE",
      initialize: "INITIALIZE GAME",
      reset: "RESET",
      recruit: "Recruit",
      veteran: "Veteran",
      elite: "Elite",
      recruitSub: "4 X 4 GRID · 8 PAIRS",
      veteranSub: "6 X 6 GRID · 18 PAIRS",
      eliteSub: "8 X 8 GRID · 32 PAIRS",
      botEasy: "BOT CORE: EASY",
      botMedium: "BOT CORE: ADAPTIVE",
      botHard: "BOT CORE: ELITE"
    },
    game: {
      title: "MEMORY MATCH",
      currentTurn: "CURRENT TURN",
      sessionTime: "SESSION TIME",
      totalMoves: "TOTAL MOVES",
      settings: "Settings",
      restart: "RESTART GAME"
    }
  },
  ar: {
    home: {
      systemStatus: "حالة النظام",
      online: "متصل // V2.0.4",
      ultra: "تجربة فائقة الدقة",
      playNow: "ابدأ الآن",
      leaderboard: "لوحة الصدارة",
      settings: "الإعدادات",
      globalRank: "الترتيب العالمي",
      totalWins: "إجمالي الانتصارات",
      highScore: "أعلى نتيجة",
      currentEvent: "الحدث الحالي",
      patchNotes: "ملاحظات التحديث",
      server: "الخادم: US-EAST2"
    },
    victory: {
      rank: "الرتبة",
      grandmaster: "جراند ماستر",
      mission: "تم إنجاز المهمة",
      victory: "انتصار",
      mvp: "الأفضل",
      leaderboard: "الترتيب العالمي",
      xpEarned: "الخبرة المكتسبة",
      levelText: "المستوى 42 · يتبقى 450 خبرة للمستوى 43",
      moves: "الحركات",
      time: "الوقت",
      accuracy: "الدقة",
      best: "الأفضل",
      avg: "المتوسط",
      worldAvg: "متوسط العالم: 78%",
      rewards: "مكافآت المباراة",
      speedBadge: "شارة السرعة",
      speedBadgeDesc: "أنهِ المباراة خلال أقل من دقيقتين",
      crystals: "50 كريستالة",
      crystalsDesc: "مكافأة لسلسلة دقة مثالية",
      playAgain: "العب مرة أخرى",
      backToMenu: "العودة للقائمة"
    },
    setup: {
      title: "إعدادات اللعبة",
      subtitle: "النظام جاهز // اختيار النمط",
      missionType: "1. اختر نوع المهمة",
      solo: "مهمة فردية",
      soloDesc: "نمط لاعب واحد",
      duo: "مواجهة ثنائية",
      duoDesc: "لاعبان محليًا",
      squad: "صدام رباعي",
      squadDesc: "أربعة لاعبين محليًا",
      active: "نشط",
      standby: "استعداد",
      complexity: "2. مستوى الصعوبة",
      boardLayout: "3. تخطيط اللوحة",
      preview: "وضع المعاينة: نشط",
      initialize: "تشغيل اللعبة",
      reset: "إعادة ضبط",
      recruit: "مبتدئ",
      veteran: "محترف",
      elite: "نخبة",
      recruitSub: "شبكة 4 × 4 · 8 أزواج",
      veteranSub: "شبكة 6 × 6 · 18 زوجًا",
      eliteSub: "شبكة 8 × 8 · 32 زوجًا",
      botEasy: "ذكاء اصطناعي: سهل",
      botMedium: "ذكاء اصطناعي: متوسط",
      botHard: "ذكاء اصطناعي: صعب"
    },
    game: {
      title: "لعبة الذاكرة",
      currentTurn: "الدور الحالي",
      sessionTime: "وقت الجلسة",
      totalMoves: "إجمالي الحركات",
      settings: "الإعدادات",
      restart: "إعادة بدء اللعبة"
    }
  }
} as const;

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
  const [language, setLanguage] = useState<Language>("en");
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
  const t = COPY[language];
  const isArabic = language === "ar";
  const boardLabels: Record<BoardPreset, { title: string; subtitle: string }> = {
    "4x4": { title: t.setup.recruit, subtitle: t.setup.recruitSub },
    "6x6": { title: t.setup.veteran, subtitle: t.setup.veteranSub },
    "8x8": { title: t.setup.elite, subtitle: t.setup.eliteSub }
  };
  const difficultyCopy: Record<AIDifficulty, string> = {
    easy: t.setup.botEasy,
    medium: t.setup.botMedium,
    hard: t.setup.botHard
  };

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
    <main className={`app-root ${isArabic ? "rtl" : ""}`} dir={isArabic ? "rtl" : "ltr"} lang={language}>
      <AnimatedBackground />
      <div className="app-shell">
        <div className="lang-switcher glass-panel">
          <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
          <button className={language === "ar" ? "active" : ""} onClick={() => setLanguage("ar")}>AR</button>
        </div>
        {screen === "home" && (
          <ScreenShell screenKey="home" className="home-screen">
            <header className="home-topbar">
              <div className="status-chip">
                <Server size={14} />
                <div>
                  <p>{t.home.systemStatus}</p>
                  <strong>{t.home.online}</strong>
                </div>
              </div>
              <div className="currency-pill">12,450 | 480</div>
            </header>

            <div className="home-center">
              <div className="home-side-left">
                <article className="home-stat-card"><span>{t.home.globalRank}</span><strong>#1,242</strong></article>
                <article className="home-stat-card"><span>{t.home.totalWins}</span><strong>154</strong></article>
              </div>

              <section className="home-hero">
                <p className="home-hero-tag">{t.home.ultra}</p>
                <h1 className="home-title">
                  <span>NEON</span>
                  <em className="home-title-neon">{isArabic ? "الذاكرة" : "MEMORY"}</em>
                </h1>
                <button className="play-now-btn" onClick={() => setScreen("factory")}>
                  <Play size={18} fill="currentColor" />
                  {t.home.playNow}
                </button>
                <div className="home-secondary-actions">
                  <button className="secondary-neon-btn"><BarChart3 size={16} />{t.home.leaderboard}</button>
                  <button className="secondary-neon-btn"><Cog size={16} />{t.home.settings}</button>
                </div>
              </section>

              <div className="home-side-right">
                <article className="home-stat-card"><span>{t.home.highScore}</span><strong>98,420</strong></article>
                <article className="home-stat-card"><span>{t.home.currentEvent}</span><strong>NEON SUMMER '24</strong></article>
              </div>
            </div>

            <footer className="home-footer">
              <p>{t.home.patchNotes}</p>
              <p>{t.home.server}</p>
            </footer>
          </ScreenShell>
        )}

        {screen === "factory" && (
          <ScreenShell screenKey="factory" className="victory-screen">
            <header className="victory-topbar">
              <div className="victory-brand">
                <span className="victory-brand-icon"><Trophy size={15} /></span>
                <strong>Memory Match</strong>
              </div>
              <div className="victory-top-actions">
                <button className="icon-square-btn"><Cog size={17} /></button>
                <div className="rank-pill">
                  <span>{t.victory.rank}</span>
                  <strong>{t.victory.grandmaster}</strong>
                </div>
                <span className="rank-avatar"><UserRound size={14} /></span>
              </div>
            </header>

            <section className="victory-hero">
              <p>{t.victory.mission}</p>
              <h2>{t.victory.victory}</h2>
            </section>

            <section className="victory-main-grid">
              <article className="winner-panel glass-panel">
                <div className="winner-avatar-ring">
                  <div className="winner-avatar-core">A</div>
                  <span className="winner-badge">{t.victory.mvp}</span>
                </div>
                <h3>Alex Phoenix</h3>
                <p>{t.victory.leaderboard} #14</p>
                <div className="xp-panel">
                  <div className="xp-row">
                    <span>{t.victory.xpEarned}</span>
                    <strong>+2,450 XP</strong>
                  </div>
                  <div className="xp-bar"><span style={{ width: "86%" }} /></div>
                  <small>{t.victory.levelText}</small>
                </div>
              </article>

              <div className="victory-right">
                <div className="victory-stats-grid">
                  <article className="victory-stat-card glass-panel">
                    <p><Zap size={13} /> {t.victory.moves}</p>
                    <strong>18</strong>
                    <small>{t.victory.best}: 15</small>
                  </article>
                  <article className="victory-stat-card glass-panel">
                    <p><Timer size={13} /> {t.victory.time}</p>
                    <strong>01:42</strong>
                    <small>{t.victory.avg}: 01:55</small>
                  </article>
                  <article className="victory-stat-card glass-panel">
                    <p><Target size={13} /> {t.victory.accuracy}</p>
                    <strong>92%</strong>
                    <small>{t.victory.worldAvg}</small>
                  </article>
                </div>

                <article className="rewards-panel glass-panel">
                  <h4>{t.victory.rewards}</h4>
                  <div className="reward-row">
                    <span className="reward-icon"><BadgeCheck size={17} /></span>
                    <div>
                      <strong>{t.victory.speedBadge}</strong>
                      <p>{t.victory.speedBadgeDesc}</p>
                    </div>
                    <BadgeCheck className="reward-check" size={22} />
                  </div>
                  <div className="reward-row">
                    <span className="reward-icon"><Gem size={17} /></span>
                    <div>
                      <strong>{t.victory.crystals}</strong>
                      <p>{t.victory.crystalsDesc}</p>
                    </div>
                    <BadgeCheck className="reward-check" size={22} />
                  </div>
                </article>

                <div className="victory-ctas">
                  <button className="victory-play-btn" onClick={() => setScreen("mode")}>
                    <RotateCcw size={17} /> {t.victory.playAgain}
                  </button>
                  <button className="victory-menu-btn" onClick={() => setScreen("home")}>
                    <Menu size={17} /> {t.victory.backToMenu}
                  </button>
                </div>
              </div>
            </section>
          </ScreenShell>
        )}

        {screen === "mode" && (
          <ScreenShell screenKey="mode" className="setup-screen glass-panel">
            <header className="setup-header">
              <div className="setup-title-wrap">
                <span className="setup-icon"><BarChart3 size={19} /></span>
                <div>
                  <h2>{t.setup.title}</h2>
                  <p>{t.setup.subtitle}</p>
                </div>
              </div>
              <button className="icon-square-btn" onClick={() => setScreen("factory")}>
                <X size={20} />
              </button>
            </header>

            <section>
              <h3 className="setup-label">{t.setup.missionType}</h3>
              <div className="mission-grid">
                <button className={`mission-card ${mode === "solo" ? "selected" : ""}`} onClick={() => setMode("solo")}>
                  <span className="mission-icon"><User size={20} /></span>
                  <strong>{t.setup.solo}</strong>
                  <p>{t.setup.soloDesc}</p>
                  <small>{t.setup.active}</small>
                </button>
                <button className={`mission-card ${mode === "local2" ? "selected" : ""}`} onClick={() => setMode("local2")}>
                  <span className="mission-icon"><Users size={20} /></span>
                  <strong>{t.setup.duo}</strong>
                  <p>{t.setup.duoDesc}</p>
                  <small>{mode === "local2" ? t.setup.active : t.setup.standby}</small>
                </button>
                <button className={`mission-card ${mode === "local4" ? "selected" : ""}`} onClick={() => setMode("local4")}>
                  <span className="mission-icon"><UsersRound size={20} /></span>
                  <strong>{t.setup.squad}</strong>
                  <p>{t.setup.squadDesc}</p>
                  <small>{mode === "local4" ? t.setup.active : t.setup.standby}</small>
                </button>
              </div>
            </section>

            <section className="setup-split">
              <div>
                <h3 className="setup-label">{t.setup.complexity}</h3>
                <div className="level-list">
                  {(Object.keys(BOARD_SPECS) as BoardPreset[]).map((preset) => (
                    <button
                      key={preset}
                      className={`level-row ${board === preset ? "selected" : ""}`}
                      onClick={() => setBoard(preset)}
                    >
                      <span className="radio-dot" />
                      <div>
                        <strong>{boardLabels[preset].title}</strong>
                        <p>{boardLabels[preset].subtitle}</p>
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
                    <span>{difficultyCopy[difficulty]}</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="setup-label">{t.setup.boardLayout}</h3>
                <div className="board-preview-box">
                  <div className={`board-preview-grid grid-${board.replace("x", "-")}`}>
                    {Array.from({ length: boardPreviewCells(board) }).map((_, i) => (
                      <span key={i} className={`preview-cell ${i % 7 === 0 ? "active" : ""}`} />
                    ))}
                  </div>
                  <p>{t.setup.preview}</p>
                </div>
              </div>
            </section>

            <footer className="setup-footer">
              <button className="initialize-btn" onClick={startGame}>
                {t.setup.initialize} <Rocket size={18} />
              </button>
              <button className="reset-btn" onClick={resetSetup}>{t.setup.reset}</button>
            </footer>
          </ScreenShell>
        )}

        {screen === "ai" && <div />}
        {screen === "board" && <div />}

        {screen === "game" && game && (
          <ScreenShell screenKey="game" className="arena-screen">
            <HUD
              players={game.players}
              currentPlayer={game.currentPlayer}
              title={t.game.title}
              currentTurnLabel={t.game.currentTurn}
            />

            <section className="arena-board-stage">
              <GameBoard state={game} onCardClick={onCardClick} />
            </section>

            <footer className="arena-footer-bar">
              <div className="arena-metric">
                <span>{t.game.sessionTime}</span>
                <strong>{formatDuration(stats?.elapsedMs ?? 0)}</strong>
              </div>
              <div className="arena-metric">
                <span>{t.game.totalMoves}</span>
                <strong>{stats?.moves ?? 0}</strong>
              </div>
              <button className="footer-control-btn" onClick={() => setScreen("mode")}>
                <Cog size={16} /> {t.game.settings}
              </button>
              <button className="footer-main-btn" onClick={startGame}>
                <RotateCcw size={16} /> {t.game.restart}
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
                  <span>{t.victory.rank}</span>
                  <strong>{t.victory.grandmaster}</strong>
                </div>
                <span className="rank-avatar"><UserRound size={14} /></span>
              </div>
            </header>

            <section className="victory-hero">
              <p>{t.victory.mission}</p>
              <h2>{t.victory.victory}</h2>
            </section>

            <section className="victory-main-grid">
              <article className="winner-panel glass-panel">
                <div className="winner-avatar-ring">
                  <div className="winner-avatar-core">{game.players[stats.winnerIds[0] ?? 0]?.name.slice(0, 1) ?? "P"}</div>
                  <span className="winner-badge">{t.victory.mvp}</span>
                </div>
                <h3>{stats.winnerIds.length === 1 ? game.players[stats.winnerIds[0]].name : (isArabic ? "تعادل" : "Draw Match")}</h3>
                <p>{t.victory.leaderboard} #{1200 + Math.max(1, stats.moves)}</p>
                <div className="xp-panel">
                  <div className="xp-row">
                    <span>{t.victory.xpEarned}</span>
                    <strong>+{Math.max(850, Math.round((stats.accuracy + 30) * 22))} XP</strong>
                  </div>
                  <div className="xp-bar"><span style={{ width: `${Math.min(96, Math.round(stats.accuracy))}%` }} /></div>
                  <small>{t.victory.levelText}</small>
                </div>
              </article>

              <div className="victory-right">
                <div className="victory-stats-grid">
                  <article className="victory-stat-card glass-panel">
                    <p><Zap size={13} /> {t.victory.moves}</p>
                    <strong>{stats.moves}</strong>
                    <small>{t.victory.best}: {Math.max(8, stats.moves - 3)}</small>
                  </article>
                  <article className="victory-stat-card glass-panel">
                    <p><Timer size={13} /> {t.victory.time}</p>
                    <strong>{formatDuration(stats.elapsedMs)}</strong>
                    <small>{t.victory.avg}: 01:55</small>
                  </article>
                  <article className="victory-stat-card glass-panel">
                    <p><Target size={13} /> {t.victory.accuracy}</p>
                    <strong>{Math.round(stats.accuracy)}%</strong>
                    <small>{t.victory.worldAvg}</small>
                  </article>
                </div>

                <article className="rewards-panel glass-panel">
                  <h4>{t.victory.rewards}</h4>
                  <div className="reward-row">
                    <span className="reward-icon"><BadgeCheck size={17} /></span>
                    <div>
                      <strong>{t.victory.speedBadge}</strong>
                      <p>{t.victory.speedBadgeDesc}</p>
                    </div>
                    <BadgeCheck className="reward-check" size={22} />
                  </div>
                  <div className="reward-row">
                    <span className="reward-icon"><Gem size={17} /></span>
                    <div>
                      <strong>{t.victory.crystals}</strong>
                      <p>{t.victory.crystalsDesc}</p>
                    </div>
                    <BadgeCheck className="reward-check" size={22} />
                  </div>
                </article>

                <div className="victory-ctas">
                  <button className="victory-play-btn" onClick={startGame}>
                    <RotateCcw size={17} /> {t.victory.playAgain}
                  </button>
                  <button className="victory-menu-btn" onClick={goHome}>
                    <Menu size={17} /> {t.victory.backToMenu}
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
