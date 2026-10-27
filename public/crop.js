export function cropBounds(data,width,height,step=3){
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){const at=(y*width+x)*4;if(data[at+3]>20&&Math.min(data[at],data[at+1],data[at+2])<245){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}
  if(right<0)return null;const pad=step*3;return {left:Math.max(0,left-pad),top:Math.max(0,top-pad),right:Math.min(width,right+pad+1),bottom:Math.min(height,bottom+pad+1)};
}
export function cropCanvasPage(wrapper,canvas){
  const bounds=cropBounds(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);if(!bounds)return;
  const scale=canvas.getBoundingClientRect().width/canvas.width,clip=document.createElement('div');clip.className='cropped-page';clip.style.width=(bounds.right-bounds.left)*scale+'px';clip.style.height=(bounds.bottom-bounds.top)*scale+'px';wrapper.replaceWith(clip);clip.append(wrapper);wrapper.style.transform=`translate(${-bounds.left*scale}px,${-bounds.top*scale}px)`;
}
export async function cropImagePage(image,rotation=0){
  if(!image.complete)await new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});
  if(!image.isConnected||!image.naturalWidth)return;
  const scale=Math.min(1,3000/image.naturalWidth,3000/image.naturalHeight),width=Math.round(image.naturalWidth*scale),height=Math.round(image.naturalHeight*scale),source=document.createElement('canvas');source.width=rotation%180?height:width;source.height=rotation%180?width:height;
  const context=source.getContext('2d');context.translate(source.width/2,source.height/2);context.rotate(rotation*Math.PI/180);context.drawImage(image,-width/2,-height/2,width,height);
  const bounds=cropBounds(context.getImageData(0,0,source.width,source.height).data,source.width,source.height);if(!bounds)return;
  const canvas=document.createElement('canvas');canvas.width=bounds.right-bounds.left;canvas.height=bounds.bottom-bounds.top;canvas.style.cssText=image.style.cssText;canvas.style.transform='none';canvas.style.maxWidth=canvas.style.maxWidth||'100%';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',image.alt);canvas.getContext('2d').drawImage(source,bounds.left,bounds.top,canvas.width,canvas.height,0,0,canvas.width,canvas.height);image.replaceWith(canvas);
}
