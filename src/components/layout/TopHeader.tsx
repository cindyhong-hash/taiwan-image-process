import { HelpCircle, Bell } from "lucide-react";

export function TopHeader() {
  return (
    <header className="flex h-16 items-center justify-end gap-4 border-b border-gray-100 bg-white px-8">
      <button type="button" className="text-gray-400 hover:text-gray-600"><HelpCircle className="h-5 w-5" /></button>
      <button type="button" className="relative text-gray-400 hover:text-gray-600">
        <Bell className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">3</span>
      </button>
    </header>
  );
}
