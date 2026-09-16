let ws=null;const connect=()=>{try{ws=new WebSocket('ws://127.0.0.1:18765');ws.onclose=()=>setTimeout(connect,2000);ws.onerror=()=>{};}catch{setTimeout(connect,2000)}};connect();
function send(tab){if(ws&&ws.readyState===1&&tab)ws.send(JSON.stringify({type:'activeTab',tabId:tab.id,url:tab.url||'',title:tab.title||'',windowId:tab.windowId,active:true,ts:Date.now()}));}
chrome.tabs.onActivated.addListener(async info=>{try{send(await chrome.tabs.get(info.tabId))}catch{}});chrome.tabs.onUpdated.addListener((id,change,tab)=>{if(change.status==='complete')send(tab)});
chrome.runtime.onMessage.addListener((m)=>{if(m.type==='closeTab'&&m.tabId)chrome.tabs.remove(m.tabId)});
