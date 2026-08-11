import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";

// 冇設 SITE_PASSWORD 就完全唔閂閘（本機開發 / 未決定要唔要密碼保護時預設關閂）。
const COOKIE_NAME = "site_gate";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 日內唔使再輸入

function tokenFor(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function gatePage(error?: string): string {
  return `<!doctype html>
<html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>行銷圖文工具</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0b0b0f;color:#eee;margin:0}
form{background:#16161d;padding:2rem;border-radius:12px;width:280px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
input{width:100%;padding:.6rem;margin:.5rem 0 1rem;border-radius:6px;border:1px solid #333;background:#0b0b0f;color:#eee;box-sizing:border-box;font-size:1rem}
button{width:100%;padding:.6rem;border-radius:6px;border:none;background:#4f7cff;color:#fff;cursor:pointer;font-size:1rem}
p.err{color:#ff6b6b;margin:0 0 .75rem;font-size:.9rem}
label{font-size:.9rem;color:#aaa}
</style></head>
<body>
<form method="POST">
${error ? `<p class="err">${error}</p>` : ""}
<label for="pw">密碼</label>
<input id="pw" type="password" name="password" autofocus required>
<button type="submit">進入</button>
</form>
</body></html>`;
}

export async function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const expected = tokenFor(password);
  if (request.cookies.get(COOKIE_NAME)?.value === expected) {
    return NextResponse.next();
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (request.method === "POST" && contentType.includes("form")) {
    const form = await request.formData();
    if (form.get("password") === password) {
      const res = NextResponse.redirect(request.url);
      res.cookies.set(COOKIE_NAME, expected, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: MAX_AGE,
        path: "/",
      });
      return res;
    }
    return new NextResponse(gatePage("密碼錯誤，請再試一次"), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new NextResponse(gatePage(), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
