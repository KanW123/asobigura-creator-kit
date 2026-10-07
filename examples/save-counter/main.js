(async()=>{
  const status=document.querySelector('#status');
  const buttons=[...document.querySelectorAll('button')];
  let count=0,platform,loaded=false;
  const render=()=>document.querySelector('#count').textContent=String(count);
  const gameId=new URLSearchParams(location.search).get('gameId') ||
    (location.hostname.endsWith('.asobigura.net')?location.hostname.split('.')[0]:location.pathname.split('/')[1]);
  const busy=value=>{for(const b of buttons)b.disabled=value;};
  async function load(){
    try{
      const row=await platform.saves.loadProgress({slot:0});
      if(!row||row.save_version!==1||!Number.isSafeInteger(row.data?.count)||row.data.count<0)throw Error('未対応のセーブ形式です。上書きせず終了します。');
      count=row.data.count;loaded=true;render();status.textContent='クラウドから読込完了';
    }catch(e){
      if(e.code==='NOT_FOUND'){count=0;loaded=true;render();status.textContent='新規データです。';}
      else{loaded=false;throw e;}
    }
  }
  const action=fn=>async()=>{busy(true);try{await fn();}catch(e){status.textContent=e.message||e.code;}finally{busy(false);document.querySelector('#save').disabled=!loaded;document.querySelector('#add').disabled=!loaded;}};
  try{
    platform=await GamePlatform.init({gameId});
    if(!platform.ready){status.textContent='PF未接続。下書きをPFから起動してください。保存機能は無効です。';return;}
    document.querySelector('#add').onclick=()=>{count++;render();};
    document.querySelector('#save').onclick=action(async()=>{
      if(!loaded)throw Error('読込確認前には保存できません');
      const result=await platform.saves.saveProgress({slot:0,data:{count},saveVersion:1});
      if(!result?.success)throw Error('保存できませんでした');
      status.textContent='クラウド保存完了';
    });
    document.querySelector('#load').onclick=action(load);
    // Click remains the navigation gesture. Saving is a separate explicit action.
    document.querySelector('#back').onclick=()=>platform.openUrl('https://asobigura.com/').catch(e=>status.textContent=e.message);
    await action(load)();
  }catch(e){status.textContent=e.message;}
})();
