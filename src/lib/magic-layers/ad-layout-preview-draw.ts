import type { LayerData } from "./types.ts";
import { drawEditableText, fitText, readTextLayout } from "./editable-text.ts";
import { drawEditableShape, normalizeShape } from "./editable-shape.ts";
export function previewLayers(layers: LayerData[]) { return layers.filter(l => l.meta?.visible !== false).slice().sort((a,b)=>a.zIndex-b.zIndex); }
export function fitPreviewText(layers: LayerData[], measure: (text:string,size:number,font?:string,weight?:number)=>number): LayerData[] {
  return layers.map(l => {
    const st=l.meta?.style as {text?:string;fontSizePx?:number;layout?:unknown;fontFamily?:string;fontWeight?:number}|undefined;
    const layout=readTextLayout(st?.layout);
    if (!layout || !st?.text || !st.fontSizePx) return l;
    const fitted=fitText(st.text,l.width,l.height,Math.ceil(st.fontSizePx*0.85),st.fontSizePx,(s,size)=>measure(s,size,st.fontFamily,st.fontWeight),layout);
    if (!fitted.fits) throw new Error("文案較長，請縮短後重新建立設計稿");
    return {...l,meta:{...l.meta,style:{...st,fontSizePx:fitted.fontSize}}};
  });
}
export function drawAdLayoutPreview(ctx: CanvasRenderingContext2D, layers: LayerData[], images: Map<string,HTMLImageElement>) {
  for (const l of previewLayers(layers)) {
    ctx.save(); ctx.globalAlpha=typeof l.meta?.opacity==="number"?l.meta.opacity:1;
    ctx.translate(l.x+l.width/2,l.y+l.height/2);ctx.rotate((l.rotation??0)*Math.PI/180);
    if(l.image) { const img=images.get(l.image); if(img)ctx.drawImage(img,-l.width/2,-l.height/2,l.width,l.height); }
    else {
      const shape=normalizeShape(l.meta?.shape);
      if(shape)drawEditableShape(ctx,l.width,l.height,shape);
      else if(l.type==="independent_text") {
        const s=l.meta.style as {text:string;fontSizePx:number;fontWeight:number;fontFamily:string;align:"left"|"center"|"right";color:string;layout?:unknown};
        ctx.font=`${s.fontWeight} ${s.fontSizePx}px ${s.fontFamily}`;ctx.fillStyle=s.color;
        const layout=readTextLayout(s.layout);
        if(layout) { ctx.letterSpacing=`${layout.letterSpacing}px`;drawEditableText(ctx,{text:s.text,width:l.width,height:l.height,fontSize:s.fontSizePx,align:s.align,layout}); }
        else { ctx.textBaseline="middle";ctx.textAlign=s.align;ctx.fillText(s.text,s.align==="left"?-l.width/2:s.align==="right"?l.width/2:0,0); }
      }
    }
    ctx.restore();
  }
}
