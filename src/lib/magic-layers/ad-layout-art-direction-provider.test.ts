import assert from "node:assert/strict";
import test from "node:test";
import { planArtDirection } from "./ad-layout-art-direction-provider.ts";
import { completeDesignVision, withVisionDeadline } from "./ad-layout-vision-transport.ts";
const context={product:{id:"p",name:"test",profile:null},brand:{primaryColor:"#123456",tones:[],palette:[]},inventory:{byRole:{hero:{role:"hero" as const,imageUrl:"hero",identityCritical:true,sourceRole:"hero"}}}};
const validDecision=JSON.stringify({version:1,directions:[
 {direction:"product-focus",composition:"stacked",typography:"balanced",density:"minimal",support:"none",decoration:"none",accent:"primary",graphics:"none",backdrop:"none",confidence:0.9},
 {direction:"editorial",composition:"copy-right",typography:"quiet",density:"balanced",support:"none",decoration:"none",accent:"primary",graphics:"none",backdrop:"light-fade",confidence:0.9},
 {direction:"scene-led",composition:"copy-left",typography:"bold",density:"minimal",support:"none",decoration:"none",accent:"primary",graphics:"none",backdrop:"none",confidence:0.9},
]});
test("disabled vision does not call provider",async()=>{
 let calls=0;const r=await planArtDirection(context,{},[],{enabled:false,complete:async()=>{calls++;return "";}});assert.equal(calls,0);assert.equal(r.reason,"disabled");
});
test("deadline bounds a loader that ignores AbortSignal",async(t)=>{
 const originalWarn=console.warn;console.warn=()=>{};t.after(()=>{console.warn=originalWarn;});
 const start=Date.now();const r=await planArtDirection(context,{},[],{enabled:true,apiKey:"test",timeoutMs:30,load:()=>new Promise(()=>{}),complete:async()=>""});
 assert.equal(r.reason,"timeout");assert.ok(Date.now()-start<1000);
});
test("invalid output logs and returns a safe fallback reason",async(t)=>{
 const warnings:string[]=[];const originalWarn=console.warn;console.warn=(...args:unknown[])=>warnings.push(args.map(String).join(" "));t.after(()=>{console.warn=originalWarn;});
 const r=await planArtDirection(context,{},[],{enabled:true,load:async()=>"data:fixture",complete:async()=>"bad"});assert.equal(r.reason,"invalid");
 assert.equal(warnings.length,1);assert.match(warnings[0]??"",/invalid/);assert.doesNotMatch(warnings[0]??"",/\bbad\b/);
});
test("sends a single-value decision example instead of enum arrays",async()=>{
 let prompt="";const r=await planArtDirection(context,{},[],{enabled:true,load:async()=>"data:fixture",complete:async(system)=>{prompt=system;return validDecision;}});
 assert.equal(r.source,"vision");assert.match(prompt,/"direction":"product-focus","composition":"stacked"/);assert.doesNotMatch(prompt,/"composition"\s*:\s*\[/);
});
test("uses deterministic sampling for art-direction completion",async(t)=>{
 let body:Record<string,unknown>={};const originalFetch=globalThis.fetch;
 globalThis.fetch=async(_input,init)=>{body=JSON.parse(String(init?.body)) as Record<string,unknown>;return new Response(JSON.stringify({choices:[{message:{content:validDecision}}]}),{status:200,headers:{"Content-Type":"application/json"}});};
 t.after(()=>{globalThis.fetch=originalFetch;});
 const raw=await completeDesignVision("system",{},[],new AbortController().signal,"key","model");assert.equal(raw,validDecision);assert.equal(body.temperature,0);
});
test("parent abort interrupts ignored signals",async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(withVisionDeadline(()=>new Promise(()=>{}),100,controller.signal));
});
