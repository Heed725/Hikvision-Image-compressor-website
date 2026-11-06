import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensions, cropTransform, outputName, crc32, makeZip, compressJPEG, MAX_BYTES} from '../core.mjs';

test('crop remains filled, within image bounds, at all supported sizes and zoom levels',()=>{
  for(const [w,h] of [[540,960],[4000,2000],[800,800]])for(const [ow,oh] of [[640,800],[640,480],[480,640]])for(const zoom of [1,1.4,4])for(const center of [-2,.43,4]){
    const t=cropTransform(w,h,ow,oh,zoom,center,center);
    assert.ok(t.x<=0 && t.y<=0);assert.ok(t.x+w*t.scale>=ow-.00001 && t.y+h*t.scale>=oh-.00001);
  }
  assert.deepEqual(dimensions('original',4000,2000),[1600,800]);
  assert.deepEqual(dimensions('original',540,960),[540,960]);
});
test('output filenames are ASCII JPEGs with unique batch indices',()=>{
  assert.equal(outputName('A face (1).png',0),'001_A_face_1_hikvision.jpg');
  assert.notEqual(outputName('photo.png',0),outputName('photo.png',1));
});
test('compression keeps the actual encoded bytes strictly below the limit',async()=>{
  const canvas={toBlob(cb,type,q){cb(new Blob([new Uint8Array(Math.round(20000+400000*q))],{type}));}};
  const blob=await compressJPEG(canvas);assert.ok(blob.size<MAX_BYTES && blob.size>190000);assert.equal(blob.type,'image/jpeg');
});
test('compression rejects a photo that cannot fit even at low quality',async()=>{
  const canvas={toBlob(cb,type){cb(new Blob([new Uint8Array(220000)],{type}));}};
  await assert.rejects(()=>compressJPEG(canvas),/smaller output/);
});
test('ZIP includes valid CRC, names, payloads and central directory offsets',async()=>{
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const entries=[{name:'001_photo.jpg',blob:new Blob(['hello'])},{name:'002_photo.jpg',blob:new Blob(['world'])}];
  const bytes=new Uint8Array(await (await makeZip(entries)).arrayBuffer()),v=new DataView(bytes.buffer);
  assert.equal(v.getUint32(0,true),0x04034b50);
  const end=bytes.length-22;assert.equal(v.getUint32(end,true),0x06054b50);assert.equal(v.getUint16(end+10,true),2);
  let central=v.getUint32(end+16,true);
  for(const entry of entries){
    assert.equal(v.getUint32(central,true),0x02014b50);const n=v.getUint16(central+28,true),offset=v.getUint32(central+42,true);
    assert.equal(new TextDecoder().decode(bytes.slice(central+46,central+46+n)),entry.name);
    const start=offset+30+v.getUint16(offset+26,true),size=v.getUint32(offset+18,true),data=bytes.slice(start,start+size);
    assert.equal(new TextDecoder().decode(data),await entry.blob.text());assert.equal(v.getUint32(offset+14,true),crc32(data));central+=46+n;
  }
  assert.equal(central,end);
});
