import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold">Không tìm thấy trang</h1>
        <p className="mt-3 text-[var(--muted-foreground)]">Không tìm thấy quán, bàn hoặc trang bạn đang mở.</p>
        <Link className="mt-6 inline-flex" href="/">
          <Button>Về trang chủ</Button>
        </Link>
      </div>
    </main>
  );
}
