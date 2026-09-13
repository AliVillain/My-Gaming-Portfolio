const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {scan,root} = require('./media.cjs');
const games = scan();
const supplied = JSON.parse(fs.readFileSync(path.join(root,'document-links.json'),'utf8').replace(/^\uFEFF/,''));
function key(url) {const u=new URL(url);return u.hostname==='play.google.com'?u.searchParams.get('id'):u.origin+u.pathname;}
for(const url of supplied) assert(games.some(g=>key(g.url)===key(url)), 'Missing supplied link '+url);
assert.equal(new Set(games.map(g=>g.id)).size,games.length);
assert.equal(new Set(games.map(g=>key(g.url))).size,games.length);
for(const game of games) assert(fs.statSync(path.join(root,game.folder)).isDirectory());
const folder=fs.mkdtempSync(path.join(root,games[0].folder,'scan-test-'));
try {
  fs.writeFileSync(path.join(folder,'sample video.MP4'),'scanner fixture');
  fs.writeFileSync(path.join(folder,'sample image.PNG'),'scanner fixture');
  fs.writeFileSync(path.join(folder,'ignore.txt'),'not media');
  const result=scan()[0];
  assert(result.videos.some(p=>p.endsWith('sample%20video.MP4')));
  assert(result.screenshots.some(p=>p.endsWith('sample%20image.PNG')));
  assert(!result.videos.concat(result.screenshots).some(p=>p.endsWith('ignore.txt')));
} finally {
  // Only remove this test's three known files and newly created empty directory.
  for(const name of ['sample video.MP4','sample image.PNG','ignore.txt'])fs.unlinkSync(path.join(folder,name));
  fs.rmdirSync(folder);
}
assert(!scan()[0].videos.some(p=>p.includes('scan-test-')));
const gamesCode=fs.readFileSync(path.join(root,'games.js'),'utf8');
const engine=fs.readFileSync(path.join(root,'rollcage.js'),'utf8');
new vm.Script(gamesCode);new vm.Script(engine);
const map={GAMES:games,window:{}};
vm.runInNewContext(gamesCode.split('(function(){')[0],map);
let hits=[];
const ctx={gamesMode:true,ZONES:map.window.ROLLCAGE_GAMES,car:{x:0,z:48,yaw:0,vf:0},activeZone:null,openZone:z=>hits.push(z.id),Math};
const start=engine.indexOf('function updateZones(dt)');
vm.runInNewContext(engine.slice(start,engine.indexOf('/* --------------------------------------------------------------- camera ---- */',start)),ctx);
for(const z of ctx.ZONES){
  ctx.car.x=z.x;ctx.car.z=z.z;let before=hits.length;ctx.updateZones(1/60);assert.equal(hits.length,before+1);
  ctx.updateZones(1/60);assert.equal(hits.length,before+1);
  ctx.car.x=200;ctx.car.z=200;ctx.updateZones(1/60);
  ctx.car.x=z.x;ctx.car.z=z.z;ctx.updateZones(1/60);assert.equal(hits.length,before+2);
  ctx.car.x=200;ctx.car.z=200;ctx.updateZones(1/60);
}
// Test media rendering with empty folders and external demo links using a minimal DOM.
const elements={};
function element(){return {children:[],appendChild(e){this.children.push(e);},replaceChildren(){this.children=[];},addEventListener(){},showModal(){},focus(){},querySelectorAll(){return [];}};}
const ui={GAMES:games,window:{},location:{protocol:'file:'},document:{activeElement:null,getElementById(id){return elements[id] ||= element();},createElement:element}};
vm.runInNewContext(gamesCode,ui);
ui.window.showGame({id:'empty',name:'Empty',url:'https://example.com',screenshots:[],videos:[]});
assert.equal(elements.gameMedia.children.length,0);
ui.window.gamePanelOpen=false;
ui.window.showGame({id:'media',name:'Media',url:'https://example.com',screenshots:['image.png'],videos:['clip.mp4']});
assert.equal(elements.gameMedia.children.length,2);
for(const page of ['index.html','games.html','contact.html']){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g))if(!/^(https?:|mailto:|tel:)/.test(match[1]))assert(fs.existsSync(path.join(root,match[1])));
}
console.log('PASS: all supplied links, '+games.length+' folders, add/remove media scanning, empty and populated panels, '+ctx.ZONES.length+' game box triggers, page assets, and JavaScript syntax.');
