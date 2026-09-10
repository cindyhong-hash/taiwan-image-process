import assert from "node:assert/strict";
import test from "node:test";
import { selectDesignReferences } from "./ad-layout-references.ts";
test("accepts only explicitly selected same-brand references",()=>{
 assert.deepEqual(selectDesignReferences(["a","b"],[]),[]);
 assert.deepEqual(selectDesignReferences(["a","b"],["b"]),["b"]);
 assert.throws(()=>selectDesignReferences(["a"],["other-brand"]));
 assert.throws(()=>selectDesignReferences(["a"],["a","a"]));
 assert.throws(()=>selectDesignReferences(["a","b","c"],["a","b","c"]));
});
