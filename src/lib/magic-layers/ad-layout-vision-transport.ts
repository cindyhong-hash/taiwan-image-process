import sharp from "sharp";
import { loadBuffer } from "../storage.ts";
export async function visionDataUrl(url:string,signal?:AbortSignal):Promise<string>{
 signal?.throwIfAborted();const raw=await loadBuffer(url,signal);
 const png=await sharp(Buffer.from(raw)).resize(768,768,{fit:"inside",withoutEnlargement:true}).png().toBuffer();
 signal?.throwIfAborted();return `data:image/png;base64,${png.toString("base64")}`;
}
export async function withVisionDeadline<T>(work:(signal:AbortSignal)=>Promise<T>,timeoutMs:number,parent?:AbortSignal):Promise<T>{
 const controller=new AbortController();const abort=()=>controller.abort(parent?.reason);
 parent?.addEventListener("abort",abort,{once:true});if(parent?.aborted)abort();
 const timer=setTimeout(()=>controller.abort(new DOMException("Vision timeout","TimeoutError")),timeoutMs);
 let listener:()=>void=()=>{};
 const deadline=new Promise<never>((_,reject)=>{listener=()=>reject(controller.signal.reason);controller.signal.addEventListener("abort",listener,{once:true});if(controller.signal.aborted)listener();});
 try{return await Promise.race([deadline,Promise.resolve().then(()=>{controller.signal.throwIfAborted();return work(controller.signal);})]);}
 finally{clearTimeout(timer);parent?.removeEventListener("abort",abort);controller.signal.removeEventListener("abort",listener);}
}
export async function completeDesignVision(system:string,payload:unknown,images:{role:string;url:string}[],signal:AbortSignal,key:string,model:string):Promise<string>{
 const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",signal,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:[{type:"text",text:JSON.stringify(payload)},...images.flatMap(i=>[{type:"text",text:`Image role: ${i.role}`},{type:"image_url",image_url:{url:i.url}}])]}],max_tokens:1800,temperature:0})});
 if(!response.ok)throw new Error("Vision unavailable");const data=await response.json();const text=data.choices?.[0]?.message?.content;if(typeof text!=="string")throw new Error("Invalid vision response");return text;
}
