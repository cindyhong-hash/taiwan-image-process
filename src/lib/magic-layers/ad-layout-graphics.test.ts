import assert from "node:assert/strict";
import test from "node:test";
import { BENEFIT_ICON_REGISTRY, matchBenefitGraphic, parseBenefits } from "./ad-layout-graphics.ts";
test("maps every confirmed semantic category through the exported registry",()=>{
 const cases = [
  ["雙重保濕", "water-drop"], ["吸震設計", "spring"], ["五刀片", "blade"],
  ["防護屏障", "shield"], ["自然亮澤", "sparkle"], ["植物萃取", "leaf"],
  ["日間防曬", "sun"], ["深層潔淨", "clean"], ["夜間修護", "repair"], ["柔滑質地", "texture"],
 ] as const;
 assert.equal(BENEFIT_ICON_REGISTRY.length, cases.length);
 for (const [text, icon] of cases) assert.equal(matchBenefitGraphic({id:text,text}).icon, icon);
});
test("does not invent graphics for negated or unknown claims",()=>{
 assert.equal(matchBenefitGraphic({id:"4",text:"不保濕"}).icon,null);
 assert.equal(matchBenefitGraphic({id:"5",text:"無防護效果"}).icon,null);
 assert.equal(matchBenefitGraphic({id:"6",text:"不溫和配方"}).icon,null);
 assert.equal(matchBenefitGraphic({id:"5",text:"優雅設計"}).icon,null);
 assert.throws(()=>parseBenefits(["a","b","c","d"]));
 assert.throws(()=>parseBenefits(["長".repeat(41)]));
});
test("maps common gentle skincare and sensory claims without treating 不刺激 as negation",()=>{
 const cases = [
  ["溫和不刺激", "shield"], ["親膚配方", "shield"], ["低刺激呵護", "shield"],
  ["柔嫩觸感", "texture"], ["舒緩修護", "repair"],
 ] as const;
 for (const [text, icon] of cases) assert.equal(matchBenefitGraphic({id:text,text}).icon, icon);
});
test("extracts only a number already present in confirmed benefit copy",()=>{
 assert.equal(matchBenefitGraphic({id:"1",text:"24小時長效保濕"}).number,"24小時");
 assert.equal(matchBenefitGraphic({id:"2",text:"提升 99% 光澤"}).number,"99%");
 assert.equal(matchBenefitGraphic({id:"3",text:"柔滑質地"}).number,null);
});
