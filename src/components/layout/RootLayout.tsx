import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/', label: '계획서 작성', icon: '📝', end: true },
  { to: '/labor-cost', label: '사업비 계산', icon: '🧮', end: false },
] as const;

export default function RootLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 좌측 사이드바 — 기능 탭 */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <div className="text-base font-semibold text-gray-900">
            Proposal Writer
          </div>
          <div className="mt-0.5 text-[11px] text-gray-400">사업계획서 도우미</div>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-4 py-3 text-[10px] text-gray-400">
          © {new Date().getFullYear()} Proposal Writer
        </div>
      </aside>

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
