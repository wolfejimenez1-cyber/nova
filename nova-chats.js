/* Browser-local conversations. No account tokens or memories are exported. */
(function(root) {
  'use strict';
  const KEY = 'nova_chats_v1';
  function validate(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.chats) || data.chats.length > 500) throw Error('Invalid chat backup.');
    const ids = new Set();
    const chats = data.chats.map(c => {
      if (!c || typeof c.id !== 'string' || ids.has(c.id) || typeof c.title !== 'string' || c.title.length > 120 || !Array.isArray(c.messages) || c.messages.length > 10000 || !Array.isArray(c.context) || c.context.length > 20) throw Error('Invalid conversation.');
      ids.add(c.id);
      const messages = c.messages.map(m => {
        if (!m || !['user','assistant'].includes(m.role) || typeof m.text !== 'string' || m.text.length > 200000) throw Error('Invalid message.');
        return {role:m.role,text:m.text};
      });
      const context = c.context.map(m => {
        if (!m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 200000) throw Error('Invalid context.');
        return {role:m.role,content:m.content};
      });
      return {id:c.id,title:c.title,messages,context,draft:typeof c.draft==='string'?c.draft.slice(0,200000):'',updated:Number.isFinite(c.updated)?c.updated:0};
    });
    return {version:1,chats,active:ids.has(data.active)?data.active:chats[0]?.id||null};
  }
  function createStore(storage, uid) {
    let raw = storage.getItem(KEY);
    let data = raw ? validate(JSON.parse(raw)) : {version:1,chats:[],active:null};
    function commit(next) {
      if (storage.getItem(KEY) !== raw) throw Error('Chats changed in another tab. Reload Nova before saving more.');
      const value = JSON.stringify(next);
      storage.setItem(KEY,value); raw=value; data=next;
    }
    return {
      read:()=>JSON.parse(JSON.stringify(data)),
      update(fn) {const next=JSON.parse(JSON.stringify(data));fn(next);commit(validate(next));},
      newChat() {const c={id:uid(),title:'New chat',messages:[],context:[],draft:'',updated:Date.now()};this.update(d=>{d.chats.unshift(c);d.active=c.id;});return c.id;},
      merge(imported) {const source=validate(imported);this.update(d=>{for(const c of source.chats)d.chats.push({...c,id:uid()});if(!d.active)d.active=d.chats[0]?.id;});},
      export:()=>JSON.stringify(data,null,2)
    };
  }
  function mount(options) {
    const {chat,input,render,busy,onSelect}=options;
    const aside=document.createElement('aside');aside.id='nova-chat-sidebar';aside.setAttribute('aria-label','Saved conversations');
    aside.innerHTML='<h2>Your chats</h2><button type="button" data-action="new">+ New chat</button><input aria-label="Search chats" placeholder="Search chats"><div data-list></div><button type="button" data-action="rename">Rename chat</button><button type="button" data-action="delete">Delete chat</button><button type="button" data-action="undo" hidden>Undo delete</button><hr><button type="button" data-action="export">Export chats</button><button type="button" data-action="import">Restore chats</button><p>Saved on this browser only. Clearing browser data can erase chats. Export a backup to keep them.</p><p role="status" data-status></p>';
    document.body.appendChild(aside);
    const css=document.createElement('style');css.textContent='#nova-chat-sidebar{position:fixed;left:0;top:72px;bottom:0;width:240px;overflow:auto;padding:18px;background:#171717;border-right:1px solid #363636;z-index:20}#nova-chat-sidebar h2{font-size:16px}#nova-chat-sidebar button{font-size:12px;padding:9px;margin:4px 3px 4px 0}#nova-chat-sidebar p{font-size:12px;line-height:1.5;color:#bdbdbd}#nova-chat-sidebar input{margin:14px 0;font-size:13px;width:100%}#nova-chat-sidebar [data-list] button{display:block;width:100%;text-align:left;overflow-wrap:anywhere}#nova-chat-sidebar [aria-current=true]{border-color:#eee!important;background:#454545!important}body main{margin-left:max(250px,calc((100vw - 650px)/2))!important;margin-right:16px!important;max-width:900px!important}#nova-chats-toggle{display:none}@media(max-width:900px){body main{margin:0 auto!important}#nova-chat-sidebar{display:none;top:0;bottom:0;width:min(290px,85vw);padding-top:55px;box-shadow:15px 0 50px #0008}#nova-chat-sidebar.open{display:block}#nova-chats-toggle{display:block;position:relative;z-index:30;margin:0 8px 0 0}}';document.head.appendChild(css);
    const toggle=document.createElement('button');toggle.type='button';toggle.id='nova-chats-toggle';toggle.textContent='Chats';toggle.setAttribute('aria-expanded','false');document.querySelector('header').prepend(toggle);toggle.onclick=()=>{aside.classList.toggle('open');toggle.setAttribute('aria-expanded',String(aside.classList.contains('open')));};
    const status=aside.querySelector('[data-status]'),list=aside.querySelector('[data-list]'),search=aside.querySelector('input');
    let store,failed=false,deleted=null;
    const uid=()=>crypto.randomUUID();
    try{store=createStore(localStorage,uid);if(!store.read().chats.length)store.newChat();}catch(e){failed=true;status.textContent='Chat storage is unavailable or damaged. Existing data was not overwritten. '+e.message;}
    const current=()=>store?.read().chats.find(c=>c.id===store.read().active);
    function report(e){failed=true;status.textContent='Could not save chats. Export a backup before reloading. '+e.message;}
    function update(fn){if(failed)return false;try{store.update(fn);return true;}catch(e){report(e);return false;}}
    function drawList(){if(!store)return;const d=store.read(),q=search.value.toLowerCase();list.replaceChildren();for(const c of d.chats.filter(c=>(c.title+' '+c.messages.map(m=>m.text).join(' ')).toLowerCase().includes(q)).sort((a,b)=>b.updated-a.updated)){const b=document.createElement('button');b.type='button';b.textContent=c.title;b.setAttribute('aria-current',String(c.id===d.active));b.onclick=()=>select(c.id);list.appendChild(b);}if(!list.children.length)list.textContent='No matching chats.';}
    function blocked(){if(busy()){status.textContent='Stop the current response, microphone, or music request before changing chats.';return true;}return failed;}
    function saveDraft(){return update(d=>{const c=d.chats.find(c=>c.id===d.active);if(c)c.draft=input.value;});}
    function show(){const c=current();chat.replaceChildren();if(c){for(const m of c.messages)render(m.role,m.text);input.value=c.draft;onSelect(c.context);}else{input.value='';onSelect([]);}drawList();aside.classList.remove('open');toggle.setAttribute('aria-expanded','false');}
    function select(id){if(blocked()||!saveDraft())return;if(update(d=>d.active=id))show();}
    search.oninput=drawList;
    input.addEventListener('input',saveDraft);
    const button=a=>aside.querySelector('[data-action="'+a+'"]');
    button('new').onclick=()=>{if(blocked()||!saveDraft())return;try{store.newChat();show();input.focus();}catch(e){report(e);}};
    button('rename').onclick=()=>{if(blocked())return;const c=current();if(!c)return;const name=prompt('Chat name',c.title);if(name?.trim()&&update(d=>{d.chats.find(x=>x.id===c.id).title=name.trim().slice(0,120);}))drawList();};
    button('delete').onclick=()=>{if(blocked())return;const c=current();if(!c||!confirm('Delete “'+c.title+'”? You can undo until you reload.'))return;if(update(d=>{d.chats=d.chats.filter(x=>x.id!==c.id);d.active=d.chats[0]?.id||null;})){deleted=c;button('undo').hidden=false;show();status.textContent='Chat deleted. Undo is available until reload.';}};
    button('undo').onclick=()=>{if(blocked()||!deleted)return;if(update(d=>{d.chats.unshift(deleted);d.active=deleted.id;})){deleted=null;button('undo').hidden=true;show();status.textContent='Chat restored.';}};
    button('export').onclick=()=>{if(!store)return;saveDraft();const url=URL.createObjectURL(new Blob([store.export()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='nova-chats-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Backup exported. Keep it private; it contains your conversations.';};
    const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.hidden=true;aside.appendChild(file);
    button('import').onclick=()=>{if(!blocked())file.click();};
    file.onchange=async()=>{const f=file.files[0];file.value='';if(!f)return;if(f.size>20000000){status.textContent='Backup is too large (20 MB maximum).';return;}try{const data=validate(JSON.parse(await f.text()));if(blocked()||!confirm('Add '+data.chats.length+' chats from this backup? Existing chats will be kept.'))return;if(!saveDraft())return;store.merge(data);drawList();status.textContent='Backup chats added.';}catch(e){status.textContent='Could not restore: '+e.message;}};
    if(store)show();
    return {
      record(role,text){if(failed)return;try{if(!current())store.newChat();if(update(d=>{const c=d.chats.find(x=>x.id===d.active);c.messages.push({role,text:String(text)});c.draft=input.value;c.updated=Date.now();if(role==='user'&&c.title==='New chat')c.title=String(text).slice(0,60);})){drawList();}}catch(e){report(e);}},
      context(messages){update(d=>{const c=d.chats.find(x=>x.id===d.active);if(c)c.context=messages.slice(-20);});}
    };
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={validate,createStore};
  else root.NovaChats={mount};
})(typeof window==='undefined'?{}:window);
