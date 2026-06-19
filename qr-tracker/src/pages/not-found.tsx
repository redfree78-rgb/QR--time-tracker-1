import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <div className="text-6xl font-bold text-muted-foreground/20 mb-4">404</div>
      <h2 className="text-xl font-semibold text-foreground mb-2">페이지를 찾을 수 없습니다</h2>
      <p className="text-sm text-muted-foreground mb-6">요청하신 페이지가 존재하지 않습니다</p>
      <Link href="/" className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90">
        대시보드로 돌아가기
      </Link>
    </div>
  );
}
