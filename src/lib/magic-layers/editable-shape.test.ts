import assert from "node:assert/strict";
import test from "node:test";
import { normalizeShape } from "./editable-shape.ts";
import { savedToLayerData, type SavedLayer } from "./saved-layer.ts";
test("keeps valid gradient/softness through saved layers and rejects invalid values", () => {
 const shape = normalizeShape({kind:"ellipse",fill:"#112233",stroke:"none",strokeWidth:0,softness:0.7,gradient:{axis:"vertical",from:"#ffffff",to:"#ffffff00"}})!;
 assert.equal(shape.softness,0.7);
 const layer = savedToLayerData({ id:"shadow",type:"object",name:"shadow",x:0,y:0,w:100,h:20,rotation:0,zIndex:0,visible:true,locked:false,opacity:0.3,shape } as SavedLayer);
 assert.deepEqual(layer.meta.shape,shape);
 assert.equal(normalizeShape({...shape,softness:Infinity}),null);
 assert.equal(normalizeShape({...shape,gradient:{axis:"diagonal",from:"red",to:"blue"}}),null);
});
