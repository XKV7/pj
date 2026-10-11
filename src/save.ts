// 기록 저장 (localStorage). 실패해도 게임은 동작한다.
export interface Records {
  runs: number;
  clears: number;
  bestZone: number; // 도달한 가장 깊은 구역 (0~5)
  bestClearFrames: number; // 0 = 없음
  totalKills: number;
  mostGold: number;
  history: { date: string; victory: boolean; zone: string; frames: number; kills: number }[];
}

const KEY = 'alchemic-abyss-records-v1';

export function defaultRecords(): Records {
  return { runs: 0, clears: 0, bestZone: -1, bestClearFrames: 0, totalKills: 0, mostGold: 0, history: [] };
}

export function loadRecords(): Records {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultRecords();
    const r = JSON.parse(raw) as Partial<Records>;
    return { ...defaultRecords(), ...r, history: Array.isArray(r.history) ? r.history.slice(0, 10) : [] };
  } catch {
    return defaultRecords();
  }
}

export function saveRecords(r: Records): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    // 저장 실패 (사생활 보호 모드 등) — 무시
  }
}

export function formatTime(frames: number): string {
  const s = Math.floor(frames / 60);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}
