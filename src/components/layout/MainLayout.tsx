import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
