import {MAX_BYTES, MIN_SUGGESTED_BYTES, dimensions, outputName, cropTransform, compressJPEG, makeZip} from './core.mjs';
const $ = id => document.getElementById(id);
const canvas = $('crop-canvas');
const context = canvas.getContext('2d');
let photos = [], selectedId = null, sequence = 0, exportTimer, toastTimer, processingBatch = false, importing = false;
const active = () => photos.find(p => p.id === selectedId);
const kb = bytes => (bytes / 1000).toFixed(1);

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => {$('toast').hidden = true;}, 6500);
}
function setBusy(disabled) {
  for (const id of ['drop-zone','clear-all','preset','zoom','brightness','rotate','reset','demo']) $(id).disabled = disabled || (!active() && ['zoom','brightness','rotate','reset'].includes(id)) || (id === 'zoom' && active()?.preset === 'original');
  document.querySelectorAll('.photo-select,.remove-photo').forEach(b => b.disabled = disabled);
}
function renderList() {
  $('photo-list').replaceChildren();
  photos.forEach(photo => {
    const row = document.createElement('div');row.className = 'photo-row' + (photo.id === selectedId ? ' selected' : '');
    const button = document.createElement('button');button.className='photo-select';button.type='button';button.setAttribute('aria-pressed',photo.id === selectedId);
    const img = document.createElement('img');img.src=photo.thumb;img.alt='';
    const info = document.createElement('span');info.className='photo-info';
    const name = document.createElement('strong');name.textContent=photo.name;name.title=photo.name;
    const detail = document.createElement('small');detail.textContent=photo.error ? 'Needs attention' : photo.blob ? `${kb(photo.blob.size)} KB · ready` : photo.revision ? 'Changes to prepare' : `${kb(photo.originalBytes)} KB · original`;
    info.append(name,detail);button.append(img,info);button.onclick=()=>select(photo.id);
    const remove = document.createElement('button');remove.className='remove-photo';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${photo.name}`);remove.onclick=()=>removePhoto(photo.id);
    row.append(button,remove);$('photo-list').append(row);
  });
  $('photo-count').textContent=`${photos.length} photo${photos.length===1?'':'s'}`;
  $('empty-queue').hidden=!!photos.length;$('clear-all').hidden=!photos.length;
  $('queue-summary').textContent=photos.length ? 'Select a photo to adjust its crop.' : 'Add one photo or a whole batch.';
  $('batch-heading').textContent=photos.length ? `${photos.length} photo${photos.length===1?'':'s'} in your batch` : 'One photo or one hundred.';
  $('batch-detail').textContent=photos.length ? 'Every photo keeps its own crop and settings.' : 'Download your prepared photos together.';
  $('download-all').disabled=!photos.length || processingBatch || importing;
  setBusy(processingBatch);
}
function removePhoto(id) {
  const p=photos.find(p=>p.id===id);if(!p)return;
  URL.revokeObjectURL(p.thumb);p.image.close?.();photos=photos.filter(p=>p.id!==id);
  if(selectedId===id) selectedId=photos[0]?.id??null;
  select(selectedId);
}
function select(id) {
  selectedId=id;const p=active();
  $('placeholder').hidden=!!p;canvas.hidden=!p;$('preview-badge').hidden=!p;
  $('editor-filename').textContent=p?.name??'Select a photo to begin';
  $('preset').value=p?.preset??'640x800';$('zoom').value=p?.zoom??1.4;$('brightness').value=p?.brightness??100;
  $('zoom-value').textContent=`${Number($('zoom').value).toFixed(2)}×`;$('brightness-value').textContent=`${$('brightness').value}%`;
  renderList();
  if(p){draw();scheduleExport();}else{clearTimeout(exportTimer);updateOutput(null);$('guide-overlay').hidden=true;}
}
function drawPhoto(target,p) {
  const [w,h]=dimensions(p.preset,p.image.width,p.image.height);target.width=w;target.height=h;
  const ctx=target.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.filter=`brightness(${p.brightness}%)`;
  if(p.preset==='original')ctx.drawImage(p.image,0,0,w,h);
  else{
    const t=cropTransform(p.image.width,p.image.height,w,h,p.zoom,p.cx,p.cy);
    p.cx=t.cx;p.cy=t.cy;ctx.drawImage(p.image,t.x,t.y,p.image.width*t.scale,p.image.height*t.scale);
  }
  ctx.filter='none';
}
function draw(){const p=active();if(!p)return;drawPhoto(canvas,p);positionGuide();}
function positionGuide(){
  const guide=$('guide-overlay');guide.hidden=!active() || !$('show-guide').checked || active().preset==='original';
  if(!guide.hidden){const box=canvas.getBoundingClientRect(),stage=$('preview-stage').getBoundingClientRect();guide.style.cssText=`left:${box.left-stage.left-1}px;top:${box.top-stage.top-1}px;width:${box.width}px;height:${box.height}px`;}
}
new ResizeObserver(positionGuide).observe($('preview-stage'));
function changed(){const p=active();if(!p)return;p.revision++;p.blob=null;p.error=null;draw();updateOutput(p,true);scheduleExport();}
function scheduleExport(){clearTimeout(exportTimer);const p=active();if(!p)return;exportTimer=setTimeout(()=>prepare(p).catch(error=>{p.error=error.message;if(active()===p)updateOutput(p);toast(error.message);}),260);}
async function prepare(p){
  const rev=p.revision;if(p.blob && p.preparedRevision===rev)return p.blob;
  const temp=document.createElement('canvas');drawPhoto(temp,p);const blob=await compressJPEG(temp);
  if(p.revision!==rev || !photos.includes(p))return null;
  p.blob=blob;p.preparedRevision=rev;p.error=null;p.outWidth=temp.width;p.outHeight=temp.height;
  if(active()===p)updateOutput(p);renderList();return blob;
}
function updateOutput(p,waiting=false){
  $('download-one').disabled=!p?.blob || waiting || !!p?.error || processingBatch;
  const status=$('size-status');status.className='status';
  if(!p){status.textContent='Waiting';status.classList.add('neutral');$('output-size').innerHTML='— <span>KB</span>';$('output-detail').textContent='Aiming below 195 KB, with room under the 200 KB limit.';$('size-meter-fill').style.width='0%';return;}
  if(p.error){status.textContent='Check photo';status.classList.add('error');$('output-detail').textContent=p.error;return;}
  if(waiting || !p.blob){status.textContent='Preparing…';status.classList.add('neutral');$('output-size').innerHTML='— <span>KB</span>';$('output-detail').textContent='Finding a clear JPEG below the size limit.';$('size-meter-fill').style.width='0%';return;}
  const small=p.blob.size<MIN_SUGGESTED_BYTES;
  status.textContent=small?'Below 60 KB':'Under 200 KB';if(small)status.classList.add('warning');
  $('output-size').innerHTML=`${kb(p.blob.size)} <span>KB</span>`;
  $('output-detail').textContent=small?`${p.outWidth} × ${p.outHeight} pixels. Some terminals require at least 60 KB; try a larger output size.`:`${p.outWidth} × ${p.outHeight} pixels · JPEG · ready to download.`;
  $('size-meter-fill').style.width=`${Math.min(100,p.blob.size/2000)}%`;
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function decode(file){
  if(globalThis.createImageBitmap)return createImageBitmap(file,{imageOrientation:'from-image'});
  const url=URL.createObjectURL(file),img=new Image();try{img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
}
async function addFiles(files){
  if(importing || processingBatch)return;importing=true;const added=[];
  $('drop-zone').disabled=true;$('download-all').disabled=true;
  for(const file of files){
    if(photos.length>=100){toast('A batch can contain up to 100 photos. Download or clear this batch first.');break;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)){toast(`${file.name}: choose a JPG, PNG or WebP image.`);continue;}
    if(file.size>20*1024*1024){toast(`${file.name}: this file is over 20 MB.`);continue;}
    try{
      const image=await decode(file);
      if(image.width*image.height>50000000){image.close?.();throw new Error('Image exceeds 50 megapixels. Resize it first.');}
      const thumbCanvas=document.createElement('canvas');thumbCanvas.width=72;thumbCanvas.height=90;thumbCanvas.getContext('2d').drawImage(image,0,0,72,90);
      const thumb=URL.createObjectURL(await new Promise(resolve=>thumbCanvas.toBlob(resolve,'image/jpeg',.7)));
      const p={id:++sequence,name:file.name,originalBytes:file.size,image,thumb,preset:'640x800',zoom:1.4,cx:.5,cy:.43,brightness:100,revision:0,preparedRevision:-1,blob:null,error:null};photos.push(p);added.push(p);
    }catch(error){toast(`${file.name}: ${error.message || 'Unable to read this photo. Try saving it as JPEG.'}`);}
  }
  importing=false;$('file-input').value='';
  if(added.length){select(added[0].id);toast(`${added.length} photo${added.length===1?'':'s'} added. Adjust the crop before downloading.`);}else renderList();
}
$('drop-zone').onclick=()=>$('file-input').click();$('file-input').onchange=e=>addFiles([...e.target.files]);
for(const event of ['dragenter','dragover'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.add('dragover');});
for(const event of ['dragleave','drop'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.remove('dragover');});
$('drop-zone').addEventListener('drop',e=>addFiles([...e.dataTransfer.files]));
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
$('clear-all').onclick=()=>{clearTimeout(exportTimer);photos.forEach(p=>{URL.revokeObjectURL(p.thumb);p.image.close?.();});photos=[];select(null);};
$('preset').onchange=()=>{const p=active();if(!p)return;p.preset=$('preset').value;$('zoom').disabled=p.preset==='original';changed();};
$('zoom').oninput=()=>{const p=active();if(!p)return;p.zoom=Number($('zoom').value);$('zoom-value').textContent=`${p.zoom.toFixed(2)}×`;changed();};
$('brightness').oninput=()=>{const p=active();if(!p)return;p.brightness=Number($('brightness').value);$('brightness-value').textContent=`${p.brightness}%`;changed();};
$('show-guide').onchange=positionGuide;
$('reset').onclick=()=>{const p=active();if(!p)return;p.zoom=1.4;p.cx=.5;p.cy=.43;p.brightness=100;p.revision++;p.blob=null;select(p.id);};
$('rotate').onclick=async()=>{
  const p=active();if(!p)return;const target=document.createElement('canvas');target.width=p.image.height;target.height=p.image.width;const ctx=target.getContext('2d');ctx.translate(target.width/2,target.height/2);ctx.rotate(Math.PI/2);ctx.drawImage(p.image,-p.image.width/2,-p.image.height/2);
  p.image.close?.();p.image=target;p.cx=.5;p.cy=.5;changed();
};
let drag=null;
canvas.addEventListener('pointerdown',e=>{const p=active();if(!p || p.preset==='original' || processingBatch)return;const t=cropTransform(p.image.width,p.image.height,canvas.width,canvas.height,p.zoom,p.cx,p.cy);drag={id:p.id,x:e.clientX,y:e.clientY,cx:p.cx,cy:p.cy,scale:t.scale,ratio:canvas.width/canvas.getBoundingClientRect().width};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{const p=active();if(!drag || !p || drag.id!==p.id)return;p.cx=drag.cx-(e.clientX-drag.x)*drag.ratio/(p.image.width*drag.scale);p.cy=drag.cy-(e.clientY-drag.y)*drag.ratio/(p.image.height*drag.scale);changed();});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{drag=null;});
canvas.addEventListener('keydown',e=>{const p=active();if(!p || p.preset==='original' || processingBatch)return;const delta=.01/p.zoom;
  if(e.key==='ArrowLeft')p.cx+=delta;else if(e.key==='ArrowRight')p.cx-=delta;else if(e.key==='ArrowUp')p.cy+=delta;else if(e.key==='ArrowDown')p.cy-=delta;else if(e.key==='+'||e.key==='=')p.zoom=Math.min(4,p.zoom+.1);else if(e.key==='-')p.zoom=Math.max(1,p.zoom-.1);else return;
  e.preventDefault();$('zoom').value=p.zoom;$('zoom-value').textContent=`${p.zoom.toFixed(2)}×`;changed();
});
$('download-one').onclick=async()=>{const p=active();if(!p?.blob || p.blob.size>=MAX_BYTES)return;download(p.blob,outputName(p.name,photos.indexOf(p)));toast('JPEG downloaded. Select it in your terminal’s upload screen.');};
$('download-all').onclick=async()=>{
  if(!photos.length || processingBatch || importing)return;clearTimeout(exportTimer);processingBatch=true;setBusy(true);$('download-all').disabled=true;$('download-one').disabled=true;
  try{
    const files=[];
    for(let i=0;i<photos.length;i++){
      $('download-all').textContent=`Preparing ${i+1} / ${photos.length}…`;
      const p=photos[i],blob=await prepare(p);if(!blob || blob.size>=MAX_BYTES)throw new Error(`Unable to prepare ${p.name}. Review its settings.`);
      files.push({name:outputName(p.name,i),blob});
    }
    download(await makeZip(files),'hikvision_photos.zip');toast(`${files.length} JPEG${files.length===1?'':'s'} downloaded in one ZIP. Extract the ZIP before uploading individual photos.`);
  }catch(error){toast(error.message);}finally{processingBatch=false;$('download-all').textContent='↓ Download all (.zip)';renderList();updateOutput(active());}
};
$('demo').onclick=async()=>{
  const c=document.createElement('canvas');c.width=800;c.height=1000;const ctx=c.getContext('2d');ctx.fillStyle='#dbe4d5';ctx.fillRect(0,0,800,1000);
  ctx.fillStyle='#63857c';ctx.beginPath();ctx.ellipse(400,1020,320,350,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#be9674';ctx.fillRect(330,560,140,170);ctx.beginPath();ctx.ellipse(400,420,155,210,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#28493f';ctx.beginPath();ctx.ellipse(400,264,153,82,0,Math.PI,Math.PI*2);ctx.fill();for(const x of [340,460]){ctx.beginPath();ctx.ellipse(x,405,12,10,0,0,Math.PI*2);ctx.fill();}ctx.strokeStyle='#745041';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(350,510);ctx.quadraticCurveTo(400,535,450,510);ctx.stroke();
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));await addFiles([new File([blob],'sample_portrait.png',{type:'image/png'})]);
};
select(null);
