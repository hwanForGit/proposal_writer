import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-gray-500">404</p>
      <h1 className="text-2xl font-semibold text-gray-900">
        페이지를 찾을 수 없습니다
      </h1>
      <Link to="/" className="text-blue-600 hover:underline">
        홈으로 돌아가기
      </Link>
    </div>
  );
}
