import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ClientsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-800">還沒有客戶</h1>
      <p className="text-gray-500">從左側新增你的第一個客戶資料夾</p>
      <Link href="/clients/new">
        <Button>＋ 新增客戶</Button>
      </Link>
    </div>
  );
}
