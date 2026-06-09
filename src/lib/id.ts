// crypto.randomUUID()는 **secure context에서만** 노출된다.
// http://localhost 는 secure context로 취급되지만, 사내망 호스트명 접속
// (예: http://hsh:5174, Tailscale MagicDNS)은 비-secure context라
// crypto.randomUUID가 undefined → 호출 시 throw → 파일 첨부 등이 실패한다.
// 어느 컨텍스트에서도 안전하게 고유 ID를 만든다.
export function genId(prefix = 'id'): string {
  try {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
  } catch {
    // 비-secure context 등 — 폴백으로 진행
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
