import { Link, Outlet } from 'react-router-dom';

export default function RootLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold text-gray-900">
            Proposal Writer
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 text-sm text-gray-500">
          © {new Date().getFullYear()} Proposal Writer
        </div>
      </footer>
    </div>
  );
}
