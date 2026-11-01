const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/nova-upgrade.js', 'utf8');
function setup() {
  const elements = [], timers = new Map(), events = {}, recognizers = [];
  let timerId = 0, sent = 0;
  function el() {
    const listeners = {};
    const e = {value:'', hidden:false, textContent:'', style:{}, attrs:{},
      setAttribute(k,v){this.attrs[k]=v;}, after(){},
      addEventListener(k,f){listeners[k]=f;},
      dispatchEvent(event){listeners[event.type]?.(event);},
      click(){return this.onclick?.();}};
    elements.push(e);return e;
  }
  class Recognition {
    constructor(){recognizers.push(this);}
    start(){this.onstart?.();}
    abort(){this.aborted=true; this.onend?.();}
  }
  const c = {handsFree:false,speaking:false,voiceTurnPending:false,resumeVoiceTimer:null,
    thinking:false,musicBusy:false,cancelAnswer:null,outputMode:'type',
    input:el(),micButton:el(),voiceSource:el(),
    form:{after(){},onsubmit:async()=>{sent++; c.input.value=''; c.speaking=true;},requestSubmit(){c.pending=this.onsubmit({preventDefault(){}});}},
    window:{SpeechRecognition:Recognition,isSecureContext:true},
    document:{hidden:false,createElement:el,addEventListener(k,f){events[k]=f;}},
    Event:class {constructor(type){this.type=type;this.isTrusted=false;}},
    stopSpeech(){c.speaking=false;},loadVoiceChoices(){},updateMode(){},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(c);
  const start=source.indexOf('  // Hands-free listening is opt-in');
  const end=source.indexOf('  // Show Settings for the one-time Spotify',start);
  vm.runInContext(source.slice(start,end)+'\nthis.sessionButton=voiceSessionButton;this.stopButton=stopVoiceButton;this.status=voiceStatus;',c);
  return {c,recognizers,events,get sent(){return sent;},flush(){const q=[...timers.values()];timers.clear();q.forEach(f=>f());}};
}
(async()=>{
  const t=setup(),c=t.c;
  c.sessionButton.click();assert.equal(c.handsFree,true);assert.equal(c.voiceSource.value,'browser');assert.equal(t.recognizers.length,1);
  const r=t.recognizers[0];r.onresult({results:[[{transcript:'hello'}]]});await c.pending;
  assert.equal(t.sent,1);assert.equal(c.handsFree,true);t.flush();assert.equal(t.recognizers.length,1,'cannot hear own speech');
  c.speaking=false;c.resumeVoiceSession();t.flush();assert.equal(t.recognizers.length,2,'resume after reply');
  c.stopButton.click();assert.equal(c.handsFree,false);assert.equal(c.outputMode,'type');
  t.recognizers[1].onresult({results:[[{transcript:'late event'}]]});assert.equal(t.sent,1);
  c.sessionButton.click();t.recognizers.at(-1).onerror({error:'not-allowed'});t.flush();assert.equal(c.handsFree,false);assert(c.status.textContent.includes('blocked'));
  c.sessionButton.click();t.recognizers.at(-1).onend();assert.equal(c.handsFree,false,'silence stops session');
  c.input.value='my draft';const n=t.recognizers.length;c.sessionButton.click();assert.equal(t.recognizers.length,n);assert.equal(c.input.value,'my draft');
  c.input.value='';c.sessionButton.click();c.input.value='typing';c.input.dispatchEvent({type:'input',isTrusted:true});assert.equal(c.handsFree,false);assert.equal(c.outputMode,'type');
  c.input.value='';c.sessionButton.click();c.document.hidden=true;t.events.visibilitychange();assert.equal(c.handsFree,false);assert(t.recognizers.at(-1).aborted);
  console.log('PASS: voice start, free voice, submit once, no speech feedback, resume, stop, late event, permission error, silence, draft protection, typing, background.');
})().catch(e=>{console.error(e);process.exitCode=1;});
