import assert from "node:assert/strict";
import test from "node:test";
import { planArtDirection } from "./ad-layout-art-direction-provider.ts";
import { withVisionDeadline } from "./ad-layout-vision-transport.ts";
const context={product:{id:"p",name:"test",profile:null},brand:{primaryColor:"#123456",tones:[],palette:[]},inventory:{byRole:{hero:{role:"hero" as const,imageUrl:"hero",identityCritical:true,sourceRole:"hero"}}}};
test("disabled vision does not call provider",async()=>{
 let calls=0;const r=await planArtDirection(context,{},[],{enabled:false,complete:async()=>{calls++;return "";}});assert.equal(calls,0);assert.equal(r.reason,"disabled");
});
test("deadline bounds a loader that ignores AbortSignal",async()=>{
 const start=Date.now();const r=await planArtDirection(context,{},[],{enabled:true,apiKey:"test",timeoutMs:30,load:()=>new Promise(()=>{}),complete:async()=>""});
 assert.equal(r.reason,"timeout");assert.ok(Date.now()-start<1000);
});
test("invalid output falls back without exposing provider details",async()=>{
 const r=await planArtDirection(context,{},[],{enabled:true,load:async()=>"data:fixture",complete:async()=>"bad"});assert.equal(r.reason,"invalid");
});
test("parent abort interrupts ignored signals",async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(withVisionDeadline(()=>new Promise(()=>{}),100,controller.signal));
});
