import assert from "node:assert/strict";
import test from "node:test";
import { parseArtDirection, type DirectionDecision } from "./ad-layout-art-direction.ts";
export const decision:DirectionDecision={direction:"product-focus",composition:"copy-left",typography:"bold",density:"minimal",support:"none",decoration:"one",accent:"primary",graphics:"none",backdrop:"none",confidence:0.9};
test("accepts only three distinct bounded design directions",()=>{
 const valid={version:1,directions:[decision,{...decision,direction:"editorial"},{...decision,direction:"scene-led"}]};
 assert.ok(parseArtDirection(JSON.stringify(valid)));
 assert.equal(parseArtDirection(JSON.stringify({...valid,url:"injected"})),null);
 assert.equal(parseArtDirection(JSON.stringify({...valid,directions:[decision,decision,decision]})),null);
 for(const patch of [{x:123},{confidence:2},{composition:"arbitrary"},{url:"https://example.com"}])assert.equal(parseArtDirection(JSON.stringify({...valid,directions:[{...decision,...patch},...valid.directions.slice(1)]})),null);
 assert.equal(parseArtDirection("x".repeat(17000)),null);
});
