import { redirect } from "next/navigation";

// wireframe v2：素材庫已併入品牌工作區嘅「風格組件」tab（/clients/[id]/components），
// 無獨立全域「全部」素材庫頁。舊 /library 連結一律導去品牌清單。
export default function LibraryRedirect() {
  redirect("/clients");
}
