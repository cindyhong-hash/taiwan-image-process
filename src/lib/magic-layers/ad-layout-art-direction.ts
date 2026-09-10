export type DirectionDecision={direction:"product-focus"|"editorial"|"scene-led";composition:"copy-left"|"copy-right"|"stacked";typography:"bold"|"balanced"|"quiet";density:"minimal"|"balanced";support:"none"|"detail"|"benefit";decoration:"none"|"one";accent:"primary"|"secondary";graphics:"none"|"benefit-group";backdrop:"none"|"light-fade"|"dark-fade";confidence:number};
export type ArtDirectionDecision={version:1;directions:DirectionDecision[]};
export const DECISION_OPTIONS={direction:["product-focus","editorial","scene-led"],composition:["copy-left","copy-right","stacked"],typography:["bold","balanced","quiet"],density:["minimal","balanced"],support:["none","detail","benefit"],decoration:["none","one"],accent:["primary","secondary"],graphics:["none","benefit-group"],backdrop:["none","light-fade","dark-fade"]} as const;
export function parseArtDirection(text:string):ArtDirectionDecision|null {
 if(text.length>16384)return null;
 try{
  const value=JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,"$1"));
  if(!value||value.version!==1||Object.keys(value).sort().join(",")!=="directions,version"||!Array.isArray(value.directions)||value.directions.length!==3)return null;
  const allowed=[...Object.keys(DECISION_OPTIONS),"confidence"].sort().join(",");
  for(const d of value.directions){
   if(!d||typeof d!=="object"||Object.keys(d).sort().join(",")!==allowed||typeof d.confidence!=="number"||!Number.isFinite(d.confidence)||d.confidence<0||d.confidence>1)return null;
   for(const [key,options] of Object.entries(DECISION_OPTIONS))if(!(options as readonly unknown[]).includes(d[key]))return null;
  }
  if(new Set(value.directions.map((d:DirectionDecision)=>d.direction)).size!==3)return null;
  return value;
 }catch{return null;}
}
export type ArtDirectionResult={source:"vision"|"fallback";decision:ArtDirectionDecision|null;reason?:"disabled"|"unavailable"|"timeout"|"invalid"};
