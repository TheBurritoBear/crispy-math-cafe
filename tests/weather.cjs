const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../weather.js'),'utf8');
const start=Date.parse('2026-09-21T17:00:00Z'),rise=Date.parse('2026-09-21T11:40:00Z'),set=Date.parse('2026-09-21T23:50:00Z');
const cached={saved:start,code:61,sun:[{rise,set}]};
function setup(stored,fail=false){
 let now=start,calls=0,interval;const els={townMap:{dataset:{}},townWeatherLabel:{}};
 class Clock extends Date{static now(){return now}}
 const context=vm.createContext({Date:Clock,Intl,AbortController,document:{hidden:false,getElementById:id=>els[id],addEventListener(){}},
 localStorage:{getItem:()=>stored,setItem(){}},setInterval:f=>{interval=f},setTimeout:()=>1,clearTimeout(){},
 fetch:async()=>{calls++;if(fail)throw Error('offline');return {ok:true,json:async()=>({current:{weather_code:75},daily:{sunrise:[rise/1000],sunset:[set/1000]}})}}});
 vm.runInContext(source,context);
 return {run:s=>vm.runInContext(s,context),els,calls:()=>calls,tick:()=>interval(),advance:ms=>{now+=ms}};
}
test('cache prevents polling before 12 hours, then refreshes',async()=>{
 const t=setup(JSON.stringify(cached));assert.equal(t.calls(),0);assert.equal(t.els.townMap.dataset.weather,'rain');
 t.advance(43200000-1);await t.tick();assert.equal(t.calls(),0);
 t.advance(1);await t.tick();assert.equal(t.calls(),1);assert.equal(t.els.townMap.dataset.weather,'snow');
});
test('sunrise/sunset boundaries use absolute timestamps and Chicago date',()=>{
 const t=setup(JSON.stringify(cached));
 for(const [time,day] of [[rise-1,false],[rise,true],[set-1,true],[set,false]])assert.equal(t.run(`TownWeather.daylight(${time},[{rise:${rise},set:${set}}]).day`),day);
 assert.equal(t.run(`TownWeather.daylight(${Date.parse('2026-09-22T03:00:00Z')},[{rise:${rise},set:${set}}]).estimated`),false);
});
test('weather mapping and offline fallback remain safe',async()=>{
 const t=setup('broken cache',true);await t.tick();await Promise.resolve();
 assert.equal(t.els.townMap.dataset.weather,'unknown');assert.match(t.els.townWeatherLabel.textContent,/unavailable/);
 for(const [code,kind] of [[0,'clear'],[3,'cloudy'],[45,'fog'],[65,'rain'],[85,'snow'],[95,'storm']])assert.equal(t.run(`TownWeather.kind(${code})`),kind);
});
