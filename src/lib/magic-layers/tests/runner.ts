/* Zero-dependency test runner (TS). Run: `node src/lib/magic-layers/tests/run.ts` (Node 23+). */
type Fn = () => void;
interface Suite { name: string; tests: { name: string; fn: Fn }[] }
const suites: Suite[] = [];
let current: Suite | null = null;

export function describe(name: string, fn: Fn) { current = { name, tests: [] }; suites.push(current); fn(); current = null; }
export function it(name: string, fn: Fn) {
  if (!current) { current = { name: "(root)", tests: [] }; suites.push(current); }
  current.tests.push({ name, fn });
}
export function expect(actual: unknown) {
  return {
    toBe(e: unknown) { if (actual !== e) fail(`expected ${fmt(e)} but got ${fmt(actual)}`); },
    toEqual(e: unknown) { if (JSON.stringify(actual) !== JSON.stringify(e)) fail(`expected ${fmt(e)} but got ${fmt(actual)}`); },
    toBeNull() { if (actual !== null) fail(`expected null but got ${fmt(actual)}`); },
    toBeTruthy() { if (!actual) fail(`expected truthy but got ${fmt(actual)}`); },
    toBeFalsy() { if (actual) fail(`expected falsy but got ${fmt(actual)}`); },
    toBeGreaterThan(e: number) { if (!((actual as number) > e)) fail(`expected > ${e} but got ${fmt(actual)}`); },
    toHaveLength(e: number) { if ((actual as { length: number }).length !== e) fail(`expected length ${e} but got ${(actual as { length: number }).length}`); },
  };
}
function fail(msg: string): never { throw new Error(msg); }
function fmt(v: unknown) { try { return typeof v === "string" ? `"${v}"` : JSON.stringify(v); } catch { return String(v); } }

export function run() {
  const C = { g: "\x1b[32m", r: "\x1b[31m", dim: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
  let passed = 0, total = 0; const fails: string[] = [];
  for (const s of suites) {
    console.log(`\n${C.b}${s.name}${C.x}`);
    for (const t of s.tests) {
      total++;
      try { t.fn(); passed++; console.log(`  ${C.g}✓${C.x} ${C.dim}${t.name}${C.x}`); }
      catch (e) { fails.push(`${s.name} › ${t.name}`); console.log(`  ${C.r}✗ ${t.name}${C.x}\n      ${C.r}${(e as Error).message}${C.x}`); }
    }
  }
  console.log(`\n${fails.length ? C.r : C.g}${C.b}${passed}/${total} passed${C.x}`);
  if (fails.length && typeof process !== "undefined") process.exitCode = 1;
}
