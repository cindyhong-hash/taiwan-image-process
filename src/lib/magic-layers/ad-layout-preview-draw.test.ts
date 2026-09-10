import assert from "node:assert/strict";
import test from "node:test";
import { previewLayers, fitPreviewText } from "./ad-layout-preview-draw.ts";
import type { LayerData } from "./types.ts";
test("preview retains all actual visible layers in painter order", () => {
 const layers = [{id:"logo",zIndex:8,meta:{}},{id:"sub",zIndex:7,meta:{}},{id:"panel",zIndex:3,meta:{}},{id:"hidden",zIndex:1,meta:{visible:false}}] as LayerData[];
 assert.deepEqual(previewLayers(layers).map(l=>l.id),["panel","sub","logo"]);
 assert.equal(layers[0].id,"logo");
});
test("browser metric correction preserves copy and produces editable corrected layers", () => {
 const layer={id:"title",type:"independent_text",width:200,height:120,meta:{style:{text:"每天保養好心情",fontSizePx:50,layout:{version:1,wrap:"word",lineHeight:1.25,letterSpacing:0}}}} as unknown as LayerData;
 const corrected=fitPreviewText([layer], (text,size)=>[...text].length*size);
 assert.ok((corrected[0].meta.style as {fontSizePx:number}).fontSizePx < 50);
 assert.equal((corrected[0].meta.style as {text:string}).text,"每天保養好心情");
 assert.equal((layer.meta.style as {fontSizePx:number}).fontSizePx,50);
});
