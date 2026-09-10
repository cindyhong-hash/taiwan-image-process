"use client";
import { useEffect, useRef, useState } from "react";
import type { LayerData } from "@/lib/magic-layers/types.ts";
import { drawAdLayoutPreview, fitPreviewText } from "@/lib/magic-layers/ad-layout-preview-draw.ts";
export function AdLayoutPreviewCanvas({ layers, width, height, onReady }: { layers: LayerData[]; width:number; height:number; onReady:(layers:LayerData[]|null)=>void }) {
  const ref=useRef<HTMLCanvasElement>(null);
  const callback=useRef(onReady);useEffect(()=>{callback.current=onReady;},[onReady]);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    callback.current(null);
    const pending:HTMLImageElement[]=[];
    async function draw(){
      await document.fonts.ready;
      const images=new Map<string,HTMLImageElement>();
      await Promise.all([...new Set(layers.flatMap(l=>l.image?[l.image]:[]))].map(url=>new Promise<void>((resolve,reject)=>{
        const img=new Image();pending.push(img);img.crossOrigin="anonymous";
        img.onload=()=>{images.set(url,img);resolve();};img.onerror=()=>reject(new Error("素材預覽載入失敗，請重新建立設計稿"));img.src=url;
      })));
      if(!active||!ref.current)return;
      const ctx=ref.current.getContext("2d")!;
      const fitted=fitPreviewText(layers,(text,size,font,weight)=>{ctx.font=`${weight??700} ${size}px ${font??"sans-serif"}`;return ctx.measureText(text).width;});
      ctx.clearRect(0,0,width,height);drawAdLayoutPreview(ctx,fitted,images);callback.current(fitted);
    }
    draw().catch(e=>{if(active){setError(e instanceof Error?e.message:"預覽失敗");callback.current(null);}});
    return()=>{active=false;pending.forEach(img=>{img.onload=null;img.onerror=null;});};
  },[layers,width,height]);
  return <div className="relative" style={{aspectRatio:`${width}/${height}`}}><canvas ref={ref} width={width} height={height} className="block h-auto w-full" aria-label="可編輯設計稿預覽" />{error&&<span className="absolute inset-0 flex items-center bg-white/95 p-3 text-xs text-red-600">{error}</span>}</div>;
}
