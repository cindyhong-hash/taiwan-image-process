import assert from "node:assert/strict";
import test from "node:test";
import { availableBrandPostReferences, selectDesignReferences } from "./ad-layout-references.ts";
test("accepts only explicitly selected same-brand references",()=>{
 assert.deepEqual(selectDesignReferences(["a","b"],[]),[]);
 assert.deepEqual(selectDesignReferences(["a","b"],["b"]),["b"]);
 assert.throws(()=>selectDesignReferences(["a"],["other-brand"]));
 assert.throws(()=>selectDesignReferences(["a"],["a","a"]));
 assert.throws(()=>selectDesignReferences(["a","b","c"],["a","b","c"]));
});

test("normalizes persisted brand-post URLs before users can select them", () => {
  assert.deepEqual(availableBrandPostReferences('[" /uploads/a.png ", "", 42, "/uploads/b.png"]'), ["/uploads/a.png", "/uploads/b.png"]);
  assert.deepEqual(availableBrandPostReferences("not-json"), []);
  assert.deepEqual(availableBrandPostReferences(["/uploads/a.png"]), ["/uploads/a.png"]);
});
