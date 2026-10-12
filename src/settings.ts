// 사용자 설정 (localStorage). 저장에 실패해도 기본값으로 동작한다.
export interface Settings {
  autoAim: boolean;
}

const KEY = 'alchemic-abyss-settings-v1';

export const settings: Settings = { autoAim: false };

export function loadSettings(): void {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as Partial<Settings>;
    if (typeof s.autoAim === 'boolean') settings.autoAim = s.autoAim;
  } catch {
    // 무시
  }
}

export function saveSettings(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 무시
  }
}
