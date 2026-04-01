import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const DEFAULT_USERS = ["user1", "user2", "user3", "user4", "user5"];

const PRIZES = [
  { name: "1등", count: 1 },
  { name: "2등", count: 3 },
  { name: "3등", count: 6 },
  { name: "4등", count: 20 },
  { name: "5등", count: 30 },
];

const RESULT_STYLE = {
  "1등": { bg: "linear-gradient(135deg, #fff3a6 0%, #ffc84a 100%)", color: "#7a4300", border: "2px solid #e4a100" },
  "2등": { bg: "linear-gradient(135deg, #eef5ff 0%, #bfd8ff 100%)", color: "#194dbb", border: "2px solid #7da9ff" },
  "3등": { bg: "linear-gradient(135deg, #ffe9dc 0%, #ffc39f 100%)", color: "#9e4d1b", border: "2px solid #ff9c61" },
  "4등": { bg: "linear-gradient(135deg, #f2ecff 0%, #d8c7ff 100%)", color: "#6a41c8", border: "2px solid #b797ff" },
  "5등": { bg: "linear-gradient(135deg, #e8fff3 0%, #b2efd0 100%)", color: "#0f7b4f", border: "2px solid #71d7aa" },
  "빈칸": { bg: "linear-gradient(135deg, #f7f8fb 0%, #eceef6 100%)", color: "#6b7280", border: "2px solid #d1d5db" },
};

function buildStarPath() {
  return "M50 5 L61 35 L95 35 L67 55 L78 88 L50 68 L22 88 L33 55 L5 35 L39 35 Z";
}

function resultDisplay(result) {
  return result || "빈칸";
}

async function api(path, options = {}) {
  const token = localStorage.getItem("drawboard_token");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "요청 실패");
  }
  return res.json();
}

function compactTime(value) {
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return value;
  }
}

export default function App() {
  const boardRef = useRef(null);
  const audioRef = useRef(null);

  const [loginId, setLoginId] = useState(DEFAULT_USERS[0]);
  const [password, setPassword] = useState("1234");
  const [me, setMe] = useState(null);
  const [board, setBoard] = useState([]);
  const [history, setHistory] = useState([]);
  const [lastOpened, setLastOpened] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showJackpot, setShowJackpot] = useState(false);

  const stats = useMemo(() => {
    const summary = {};
    PRIZES.forEach((prize) => {
      summary[prize.name] = { total: prize.count, opened: 0, remain: 0 };
    });
    board.forEach((cell) => {
      if (!cell.result) return;
      const key = resultDisplay(cell.result);
      if (!summary[key]) return;
      if (cell.opened) summary[key].opened += 1;
      else summary[key].remain += 1;
    });
    return {
      opened: board.filter((cell) => cell.opened).length,
      remain: board.filter((cell) => !cell.opened).length,
      summary,
    };
  }, [board]);

  const beep = (freq, delay = 0, duration = 0.08, type = "square", gainValue = 0.03) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioRef.current) audioRef.current = new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {}
  };

  const playClick = () => {
    beep(440, 0, 0.05, "square", 0.02);
    beep(560, 0.03, 0.05, "square", 0.018);
  };

  const playWin = (rank) => {
    const map = {
      "1등": [880, 1046, 1318, 1568],
      "2등": [784, 988, 1174],
      "3등": [660, 784, 988],
      "4등": [587, 740, 880],
      "5등": [523, 659, 784],
    };
    (map[rank] || []).forEach((freq, i) => beep(freq, i * 0.08, 0.16, "triangle", 0.04));
  };

  async function loadState() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/board");
      setBoard(data.board || []);
      setHistory(data.history || []);
      setLastOpened(data.lastOpened || null);
      setMe(data.user || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("drawboard_token");
    if (token) loadState();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ username: loginId, password }),
      });
      localStorage.setItem("drawboard_token", data.token);
      setMe(data.user);
      await loadState();
    } catch (e2) {
      setError(String(e2.message || e2));
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("drawboard_token");
    setMe(null);
    setBoard([]);
    setHistory([]);
    setLastOpened(null);
  }

  async function saveState(payload) {
    await api("/api/board", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async function openCell(slot) {
    const hit = board.find((cell) => cell.slot === slot);
    if (!hit || hit.opened) return;

    playClick();
    const nextBoard = board.map((cell) => cell.slot === slot ? { ...cell, opened: true } : cell);
    const nextLast = { slot: hit.slot, result: resultDisplay(hit.result) };
    const nextHistory = [
      { slot: hit.slot, result: resultDisplay(hit.result), createdAt: new Date().toISOString() },
      ...history,
    ].slice(0, 12);

    setBoard(nextBoard);
    setLastOpened(nextLast);
    setHistory(nextHistory);

    try {
      await saveState({ board: nextBoard, lastOpened: nextLast, history: nextHistory });
    } catch (e) {
      setError(String(e.message || e));
    }

    if (hit.result) {
      setTimeout(() => playWin(hit.result), 70);
      if (hit.result === "1등") {
        setShowJackpot(true);
        setTimeout(() => setShowJackpot(false), 2200);
      }
    }
  }

  async function randomOpen() {
    const remaining = board.filter((cell) => !cell.opened);
    if (!remaining.length) return;
    const target = remaining[Math.floor(Math.random() * remaining.length)];
    await openCell(target.slot);
    const targetRow = Math.floor((target.slot - 1) / 20);
    const rowHeight = 31;
    if (boardRef.current) {
      boardRef.current.scrollTo({ top: Math.max(0, targetRow * rowHeight - 60), behavior: "smooth" });
    }
  }

  async function resetBoard() {
    const ok = window.confirm("초기화 하시겠습니까?");
    if (!ok) return;
    const nextBoard = board.map((cell) => ({ ...cell, opened: false }));
    setBoard(nextBoard);
    setLastOpened(null);
    setHistory([]);
    try {
      await saveState({ board: nextBoard, lastOpened: null, history: [] });
    } catch (e) {
      setError(String(e.message || e));
    }
    if (boardRef.current) boardRef.current.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remakeBoard() {
    const ok = window.confirm("새판으로 변경 하시겠습니까?");
    if (!ok) return;
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/board/new", { method: "POST" });
      setBoard(data.board || []);
      setHistory([]);
      setLastOpened(null);
      if (boardRef.current) boardRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  if (!me) {
    return (
      <div style={loginPageStyle}>
        <div style={loginCardStyle}>
          <div style={loginHeaderStyle}>뽑기판 로그인</div>
          <form onSubmit={handleLogin} style={loginFormStyle}>
            <label style={fieldLabelStyle}>아이디</label>
            <select value={loginId} onChange={(e) => setLoginId(e.target.value)} style={inputStyle}>
              {DEFAULT_USERS.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>

            <label style={fieldLabelStyle}>비밀번호</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" style={inputStyle} />

            <button type="submit" style={loginButtonStyle} disabled={loading}>
              {loading ? "접속 중..." : "접속하기"}
            </button>

            <div style={loginHintStyle}>기본 계정: user1 ~ user5 / 비밀번호: 1234</div>
            {error ? <div style={errorStyle}>{error}</div> : null}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <AnimatePresence>
        {showJackpot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={jackpotOverlayStyle}>
            <motion.div
              initial={{ scale: 0.72, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.84, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 16 }}
              style={jackpotCardStyle}
            >
              <div style={jackpotTopStyle}>🎉 1등 당첨 🎉</div>
              <div style={jackpotBottomStyle}>{lastOpened ? `${lastOpened.slot}번` : ""}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={shellStyle}>
        <div style={headerStyle}>
          <div style={titleBoxStyle}>
            <div style={titleBadgeStyle}>★</div>
            <div style={titleTextStyle}>뽑기판</div>
          </div>

          <div style={buttonRowStyle}>
            <button onClick={randomOpen} style={primaryButtonStyle}>랜덤</button>
            <button onClick={resetBoard} style={subButtonStyle}>초기화</button>
            <button onClick={remakeBoard} style={subButtonStyle}>새판</button>
            <button onClick={logout} style={subButtonStyle}>로그아웃</button>
          </div>

          <div style={miniStatWrapStyle}>
            <div style={miniStatStyle}><span>사용자</span><strong>{me.username}</strong></div>
            <div style={miniStatStyle}><span>오픈</span><strong>{stats.opened}</strong></div>
            <div style={miniStatStyle}><span>남음</span><strong>{stats.remain}</strong></div>
          </div>
        </div>

        {error ? <div style={errorBannerStyle}>{error}</div> : null}

        <div style={contentStyle}>
          <div style={sidePanelStyle}>
            <div style={panelTitleStyle}>최근 결과</div>
            {lastOpened ? (
              <div style={{ ...resultCardStyle, ...(RESULT_STYLE[lastOpened.result] || RESULT_STYLE["빈칸"]) }}>
                <div style={{ fontSize: 10, opacity: 0.75 }}>최근 오픈</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{lastOpened.slot}번</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{lastOpened.result}</div>
              </div>
            ) : (
              <div style={emptyBoxStyle}>아직 결과 없음</div>
            )}

            <div style={historyWrapStyle}>
              {history.length === 0 ? (
                <div style={historyEmptyStyle}>히스토리 없음</div>
              ) : (
                history.map((item, idx) => (
                  <div key={`${item.slot}-${idx}`} style={historyRowStyle}>
                    <span style={historyTimeStyle}>{compactTime(item.createdAt)}</span>
                    <span style={historySlotStyle}>{item.slot}번</span>
                    <span style={{ ...historyResultStyle, color: RESULT_STYLE[item.result]?.color || "#555" }}>
                      {item.result}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={boardFrameStyle}>
            <div ref={boardRef} style={boardScrollStyle}>
              <div style={boardInnerStyle}>
                <div style={boardGridStyle}>
                  {board.map((cell) => {
                    const result = resultDisplay(cell.result);
                    const style = cell.opened ? (RESULT_STYLE[result] || RESULT_STYLE["빈칸"]) : null;
                    return (
                      <button
                        key={cell.slot}
                        onClick={() => openCell(cell.slot)}
                        style={{
                          ...cellStyle,
                          background: style ? style.bg : "#0a55b0",
                          color: style ? style.color : "#ffea44",
                          border: style ? style.border : "2px solid #ffe84d",
                          boxShadow: style ? "0 6px 12px rgba(0,0,0,0.08)" : "inset 0 1px 0 rgba(255,255,255,0.2)",
                        }}
                      >
                        {cell.opened ? (
                          <div style={{ fontSize: result === "빈칸" ? 10 : 9, fontWeight: 900, lineHeight: 1.05 }}>{result}</div>
                        ) : (
                          <svg viewBox="0 0 100 100" style={{ width: 20, height: 20, display: "block" }}>
                            <path d={buildStarPath()} fill="#ffea44" stroke="#f7d708" strokeWidth="4" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div style={rankPanelStyle}>
            <div style={panelTitleStyle}>등수표</div>
            <div style={rankListStyle}>
              {PRIZES.map((prize) => (
                <div key={prize.name} style={{ ...rankItemStyle, background: RESULT_STYLE[prize.name].bg, border: RESULT_STYLE[prize.name].border }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: RESULT_STYLE[prize.name].color, fontSize: 12 }}>{prize.name}</strong>
                    <strong style={{ color: RESULT_STYLE[prize.name].color, fontSize: 12 }}>{prize.count}</strong>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 10, color: "#555" }}>
                    남음 {stats.summary[prize.name].remain} / 공개 {stats.summary[prize.name].opened}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const loginPageStyle = { minHeight: "100vh", background: "linear-gradient(180deg, #edf3ff 0%, #fff8dc 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const loginCardStyle = { width: 360, background: "#ffffff", borderRadius: 20, overflow: "hidden", border: "3px solid #ffd400", boxShadow: "0 20px 48px rgba(0,0,0,0.14)" };
const loginHeaderStyle = { background: "linear-gradient(180deg, #0a55b0 0%, #093d8f 100%)", color: "#ffea44", fontSize: 22, fontWeight: 900, textAlign: "center", padding: "16px 12px" };
const loginFormStyle = { display: "grid", gap: 10, padding: 18 };
const fieldLabelStyle = { fontSize: 13, fontWeight: 800, color: "#234" };
const inputStyle = { width: "100%", border: "1px solid #cfd8e3", borderRadius: 12, padding: "10px 12px", fontSize: 14 };
const loginButtonStyle = { border: "none", borderRadius: 12, padding: "12px 12px", background: "linear-gradient(180deg, #0a55b0 0%, #093d8f 100%)", color: "#ffea44", fontWeight: 900, fontSize: 15, cursor: "pointer" };
const loginHintStyle = { fontSize: 12, color: "#667085" };
const errorStyle = { fontSize: 12, color: "#b42318", fontWeight: 700 };
const pageStyle = { minHeight: "100vh", background: "linear-gradient(180deg, #f0f4fb 0%, #f7f8fa 100%)", padding: 8, fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif' };
const shellStyle = { maxWidth: 1560, margin: "0 auto" };
const headerStyle = { display: "grid", gridTemplateColumns: "190px 1fr 240px", gap: 6, marginBottom: 6, alignItems: "center" };
const titleBoxStyle = { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(180deg, #0a55b0 0%, #093d8f 100%)", border: "3px solid #ffe84d", borderRadius: 14, padding: "6px 8px" };
const titleBadgeStyle = { width: 24, height: 24, borderRadius: 8, background: "#ffea44", color: "#0a55b0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 };
const titleTextStyle = { fontSize: 13, fontWeight: 900, color: "#ffea44" };
const buttonRowStyle = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 };
const primaryButtonStyle = { border: "2px solid #ffe84d", borderRadius: 10, padding: "7px 4px", background: "linear-gradient(180deg, #0a55b0 0%, #093d8f 100%)", color: "#ffea44", fontWeight: 900, fontSize: 11, cursor: "pointer" };
const subButtonStyle = { border: "2px solid #ffd43b", borderRadius: 10, padding: "7px 4px", background: "#ffffff", color: "#394150", fontWeight: 800, fontSize: 11, cursor: "pointer" };
const miniStatWrapStyle = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 };
const miniStatStyle = { background: "#ffffff", border: "2px solid #d9e0ea", borderRadius: 12, padding: "5px 4px", textAlign: "center", display: "grid", gap: 1, color: "#334155", fontSize: 10 };
const errorBannerStyle = { background: "#fff1f1", border: "1px solid #ef4444", color: "#b91c1c", borderRadius: 10, padding: "8px 10px", fontSize: 12, fontWeight: 800, marginBottom: 6 };
const contentStyle = { display: "grid", gridTemplateColumns: "220px 1fr 180px", gap: 6, alignItems: "start" };
const sidePanelStyle = { background: "#ffffff", border: "2px solid #dbe3ee", borderRadius: 16, padding: 8 };
const rankPanelStyle = { background: "#ffffff", border: "2px solid #dbe3ee", borderRadius: 16, padding: 8 };
const panelTitleStyle = { fontSize: 12, fontWeight: 900, marginBottom: 6, color: "#334155" };
const resultCardStyle = { borderRadius: 14, padding: 10, textAlign: "center", minHeight: 95, display: "flex", flexDirection: "column", justifyContent: "center" };
const emptyBoxStyle = { border: "1px dashed #d4dbe5", borderRadius: 12, padding: 10, color: "#667085", fontSize: 11, background: "#fffdfb", minHeight: 95, display: "flex", alignItems: "center", justifyContent: "center" };
const historyWrapStyle = { marginTop: 6, display: "grid", gap: 4, maxHeight: 230, overflow: "auto" };
const historyEmptyStyle = { color: "#7c6f82", fontSize: 11 };
const historyRowStyle = { display: "flex", justifyContent: "space-between", gap: 5, borderBottom: "1px solid #edf1f5", paddingBottom: 4 };
const historyTimeStyle = { fontSize: 9, color: "#887d8d" };
const historySlotStyle = { fontWeight: 700, fontSize: 11 };
const historyResultStyle = { fontWeight: 900, fontSize: 11 };
const boardFrameStyle = { background: "linear-gradient(180deg, #ffe84d 0%, #ffd400 100%)", borderRadius: 20, padding: 6, boxShadow: "0 8px 20px rgba(182,47,47,0.08)" };
const boardScrollStyle = { maxHeight: "calc(100vh - 78px)", overflowY: "auto", overflowX: "hidden", borderRadius: 16 };
const boardInnerStyle = { background: "linear-gradient(180deg, #0a55b0 0%, #093d8f 100%)", borderRadius: 16, padding: 6, border: "2px solid rgba(255,255,255,0.25)" };
const boardGridStyle = { display: "grid", gridTemplateColumns: "repeat(20, 1fr)", gap: 3 };
const cellStyle = { aspectRatio: "1 / 1", minHeight: 24, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 1 };
const rankListStyle = { display: "grid", gap: 5 };
const rankItemStyle = { borderRadius: 10, padding: 6 };
const jackpotOverlayStyle = { position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 9999, background: "radial-gradient(circle, rgba(255,225,120,0.20) 0%, rgba(255,225,120,0.04) 32%, rgba(255,225,120,0) 68%)" };
const jackpotCardStyle = { minWidth: 280, padding: "20px 28px", borderRadius: 24, background: "linear-gradient(135deg, rgba(255,247,192,0.96) 0%, rgba(255,206,87,0.96) 100%)", color: "#7a4200", textAlign: "center", boxShadow: "0 0 0 4px rgba(255,215,0,0.18), 0 20px 50px rgba(255,193,7,0.34)", border: "2px solid rgba(255,184,0,0.65)" };
const jackpotTopStyle = { fontSize: 32, fontWeight: 900 };
const jackpotBottomStyle = { fontSize: 26, fontWeight: 900, marginTop: 10 };
