/* Safe text formatting; never interpret model output as HTML. */
(function (root) {
  'use strict';
  function mathText(text) {
    return text.replace(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$/g,
      (_, a, b, c) => {
        let value = (a ?? b ?? c).trim();
        for (let i = 0; i < 8; i++) {
          const next = value.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
            .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
            .replace(/\\(?:text|mathrm|mathbf)\{([^{}]*)\}/g, '$1');
          if (next === value) break;
          value = next;
        }
        return value.replace(/\\(?:cdot|times)\b/g, '×').replace(/\\div\b/g, '÷')
          .replace(/\\leq?\b/g, '≤').replace(/\\geq?\b/g, '≥')
          .replace(/\\neq\b/g, '≠').replace(/\\pi\b/g, 'π')
          .replace(/\\(?:left|right)\b/g, '').replace(/\^\{([^{}]*)\}/g, '^($1)')
          .replace(/\\[,;! ]/g, ' ');
      });
  }
  function render(host, message) {
    host.replaceChildren();
    const parts = String(message).split(/(```[\s\S]*?```|`[^`\n]+`)/g);
    for (const part of parts) {
      if (part.startsWith('```') && part.endsWith('```')) {
        const raw = part.slice(3, -3);
        const line = raw.indexOf('\n');
        const codeText = line >= 0 ? raw.slice(line + 1) : raw;
        const pre = document.createElement('pre');
        pre.style.cssText = 'overflow:auto;max-width:100%;padding:12px;background:#111;border-radius:10px;white-space:pre';
        const code = document.createElement('code');
        code.textContent = codeText;
        pre.appendChild(code);
        const copy = document.createElement('button');
        copy.type = 'button'; copy.textContent = 'Copy code';
        copy.onclick = async () => {
          try { await navigator.clipboard.writeText(codeText); copy.textContent = 'Copied'; }
          catch { copy.textContent = 'Copy unavailable—select the code below'; }
        };
        host.append(copy, pre);
      } else if (part.startsWith('`') && part.endsWith('`')) {
        const code = document.createElement('code'); code.textContent = part.slice(1, -1); host.append(code);
      } else {
        for (const segment of mathText(part).split(/(\*\*[^*\n]+\*\*)/g)) {
          if (segment.startsWith('**') && segment.endsWith('**')) {
            const strong = document.createElement('strong'); strong.textContent = segment.slice(2, -2); host.append(strong);
          } else host.append(document.createTextNode(segment));
        }
      }
    }
  }
  const api = { mathText, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NovaPresentation = api;
})(typeof window !== 'undefined' ? window : globalThis);
