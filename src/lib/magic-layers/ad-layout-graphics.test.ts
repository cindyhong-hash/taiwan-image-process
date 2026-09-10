import assert from "node:assert/strict";
import test from "node:test";
import { matchBenefitGraphic, parseBenefits } from "./ad-layout-graphics.ts";
test("maps confirmed benefits without inventing unsupported or negated claims",()=>{
 assert.equal(matchBenefitGraphic({id:"1",text:"雙重保濕"}).icon,"water-drop");
 assert.equal(matchBenefitGraphic({id:"2",text:"吸震設計"}).icon,"spring");
 assert.equal(matchBenefitGraphic({id:"3",text:"五刀片"}).icon,"blade");
 assert.equal(matchBenefitGraphic({id:"4",text:"不保濕"}).icon,null);
 assert.equal(matchBenefitGraphic({id:"5",text:"優雅設計"}).icon,null);
 assert.throws(()=>parseBenefits(["a","b","c","d"]));
 assert.throws(()=>parseBenefits(["長".repeat(41)]));
});
