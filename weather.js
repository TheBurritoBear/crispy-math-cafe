/* Chicago only. Successful responses are cached per device for 12 hours. */
const TownWeather=(()=>{
  const TTL=43200000,KEY='crispy-chicago-weather-v1';
  const URL='https://api.open-meteo.com/v1/forecast?latitude=41.8781&longitude=-87.6298&current=weather_code&daily=sunrise,sunset&timezone=America%2FChicago&timeformat=unixtime&forecast_days=3';
  const dates=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
  let cache=null,nextAttempt=0,busy=false;
  function kind(code){
    if([71,73,75,77,85,86].includes(code))return 'snow';
    if([95,96,99].includes(code))return 'storm';
    if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return 'rain';
    if([45,48].includes(code))return 'fog';
    if([2,3].includes(code))return 'cloudy';
    return 'clear';
  }
  function valid(c){return c&&Number.isFinite(c.saved)&&Number.isInteger(c.code)&&Array.isArray(c.sun)&&c.sun.length>0&&c.sun.every(s=>Number.isFinite(s.rise)&&Number.isFinite(s.set)&&s.set>s.rise);}
  function daylight(now,sun){
    const row=sun.find(s=>dates.format(s.rise)===dates.format(now));
    if(row)return {day:now>=row.rise&&now<row.set,estimated:false};
    const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',hourCycle:'h23'}).format(now));
    return {day:hour>=7&&hour<19,estimated:true};
  }
  function paint(){
    const now=Date.now(),light=daylight(now,cache?.sun||[]),usable=cache&&now-cache.saved<259200000;
    const weather=usable?kind(cache.code):'unknown',map=document.getElementById('townMap');
    map.dataset.light=light.day?'day':'night';map.dataset.weather=weather;
    const label=document.getElementById('townWeatherLabel');
    label.textContent=`Chicago · ${light.day?'Day':'Night'} · ${weather==='unknown'?'Weather unavailable':weather}${usable&&now-cache.saved>=TTL?' (cached)':''}`;
    label.title=(usable?'Weather checked '+new Date(cache.saved).toLocaleString()+'. Refreshes every 12 hours. ':'')+(light.estimated?'Approximate Chicago daytime hours until sunrise/sunset data is available.':'Day/night follows Chicago sunrise and sunset.');
  }
  async function tick(){
    paint();if(busy||Date.now()<nextAttempt||document.hidden)return;
    busy=true;nextAttempt=Date.now()+TTL;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(URL,{signal:controller.signal});
      if(!response.ok)throw Error('Weather unavailable');
      const data=await response.json();
      const updated={saved:Date.now(),code:data.current?.weather_code,sun:(data.daily?.sunrise||[]).map((rise,i)=>({rise:rise*1000,set:data.daily.sunset?.[i]*1000}))};
      if(!valid(updated))throw Error('Invalid weather response');
      cache=updated;try{localStorage.setItem(KEY,JSON.stringify(cache));}catch{}
    }catch{nextAttempt=Date.now()+900000;} // Retry outages in 15 minutes.
    finally{clearTimeout(timeout);busy=false;paint();}
  }
  function init(){
    if(!document.getElementById('townMap'))return;
    try{const c=JSON.parse(localStorage.getItem(KEY));if(valid(c)&&c.saved<=Date.now())cache=c;}catch{}
    if(cache)nextAttempt=cache.saved+TTL;
    tick();setInterval(tick,60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  }
  return {init,kind,daylight};
})();
TownWeather.init();
