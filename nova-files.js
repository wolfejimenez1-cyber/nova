/* Read user-selected text locally. Nothing is sent until the user presses Send. */
(function(root) {
  'use strict';
  const extensions = /\.(txt|md|csv|json|js|mjs|cjs|ts|tsx|jsx|py|html|css|xml|yml|yaml|sql|java|c|cpp|h|rs|go|sh|log)$/i;
  async function readTextFile(file) {
    if (!extensions.test(file.name)) throw Error('Choose a text or code file. Photos, PDFs, and Word documents are not supported yet.');
    if (file.size > 100000) throw Error('This file is too large. Choose a text file under 100 KB.');
    const content = await file.text();
    if (!content.trim()) throw Error('This file is empty.');
    if (content.length > 20000) throw Error('This file has too much text. Use a section under 20,000 characters.');
    if (/[\x00-\x08\x0e-\x1f]/.test(content) || content.includes('\ufffd')) throw Error('This does not look like a UTF-8 text file. Save it as UTF-8 text and try again.');
    const name = file.name.replace(/[\r\n\x00-\x1f]/g, ' ').slice(0,160);
    return '\n\n[Attached text file: ' + name + ']\n<file_content>\n' + content + '\n</file_content>';
  }
  function mount({form,input,busy,pauseVoice}) {
    let reading = false;
    const button = document.createElement('button'); button.type='button'; button.textContent='Add text file';
    const picker = document.createElement('input');picker.type='file';picker.hidden=true;
    picker.accept='.txt,.md,.csv,.json,.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yml,.yaml,.sql,.java,.c,.cpp,.h,.rs,.go,.sh,.log';
    const status = document.createElement('p');status.setAttribute('role','status');status.style.cssText='font-size:12px;color:#bdbdbd;margin:8px';
    const actions = form.querySelector('.actions') || form;
    actions.prepend(button);form.after(status,picker);
    button.onclick=()=>{
      if (busy() || reading) {status.textContent='Finish the current response or stop voice before adding a file.';return;}
      picker.click();
    };
    picker.onchange=async()=>{
      const file=picker.files[0];picker.value='';if(!file)return;
      if(busy() || reading){status.textContent='Finish the current task, then choose the file again.';return;}
      pauseVoice();reading=true;button.disabled=true;status.textContent='Reading file…';
      try {
        const addition=await readTextFile(file);
        if(input.value.length+addition.length>30000)throw Error('The combined draft is too long. Shorten it before adding this file.');
        input.value+=addition;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
        status.textContent='File added to your draft. Add your question and review before Send. File text is saved in this browser and sent to the AI with your message.';
      } catch(error){status.textContent=error.message || 'Could not read this file. Try again.';}
      finally{reading=false;button.disabled=false;}
    };
    return {busy:()=>reading};
  }
  const api={readTextFile,mount};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.NovaFiles=api;
})(typeof window!=='undefined'?window:globalThis);
