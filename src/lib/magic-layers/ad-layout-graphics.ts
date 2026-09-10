import { graphemes } from "./editable-text.ts";
export type BenefitInput = { id:string; text:string };
export type BenefitIcon = "water-drop"|"spring"|"blade"|"shield"|"sparkle"|"leaf";
export type BenefitGraphic = { benefitId:string; icon:BenefitIcon|null };
export function parseBenefits(value:unknown):BenefitInput[] {
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>3)throw new Error("賣點最多三條");
 return value.map((text,i)=>{if(typeof text!=="string"||!text.trim()||graphemes(text).length>40)throw new Error("每條賣點請填寫 1–40 字");return {id:`benefit-${i+1}`,text:text.trim()};});
}
export function matchBenefitGraphic(benefit:BenefitInput):BenefitGraphic {
 const text=benefit.text;
 if(/不|無|未|沒有|not|without|no\s/i.test(text))return {benefitId:benefit.id,icon:null};
 const rules:[RegExp,BenefitIcon][]=[[/保濕|補水|hydrat|moistur/i,"water-drop"],[/吸震|緩震|shock|spring/i,"spring"],[/刀片|blade/i,"blade"],[/防護|保護|protect/i,"shield"],[/光澤|亮澤|sparkle/i,"sparkle"],[/植物|葉|leaf|botanic/i,"leaf"]];
 return {benefitId:benefit.id,icon:rules.find(([r])=>r.test(text))?.[1]??null};
}
