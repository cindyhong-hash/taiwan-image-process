export function parseReferenceList(value:unknown):string[]{
 try{const list=typeof value==="string"?JSON.parse(value):value;return Array.isArray(list)?list.filter((s):s is string=>typeof s==="string"&&s.length>0):[];}catch{return [];}
}
export function selectDesignReferences(available:string[],selected:unknown):string[]{
 if(selected===undefined)return [];
 if(!Array.isArray(selected)||selected.length>2||new Set(selected).size!==selected.length||selected.some(s=>typeof s!=="string"||!available.includes(s)))throw new Error("請重新選擇同品牌參考貼文，最多兩張");
 return selected;
}
