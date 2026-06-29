const md = (() => {
  function escape(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function highlight(code, lang) {
    const e = escape(code);
    const rules = [
      [/(\/\/[^\n]*)|(#[^\n]*)/g,             '<span class="tok-cmt">$&</span>'],
      [/\/\*[\s\S]*?\*\//g,                    '<span class="tok-cmt">$&</span>'],
      [/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/g, '<span class="tok-str">$&</span>'],
      [/\b(function|return|if|else|for|while|const|let|var|class|import|export|from|new|this|typeof|async|await|try|catch|throw|of|in|null|undefined|true|false|def|print|elif|pass|and|or|not|lambda|yield|with|as|is|del|raise|assert|global|nonlocal|break|continue)\b/g,
                                               '<span class="tok-kw">$&</span>'],
      [/\b(\d+\.?\d*)\b/g,                     '<span class="tok-num">$&</span>'],
      [/\b([A-Z][a-zA-Z0-9_]*)\b/g,            '<span class="tok-type">$&</span>'],
      [/([a-z_$][a-z0-9_$]*)\s*(?=\()/gi,      '<span class="tok-fn">$1</span>'],
      [/(=>|===|!==|==|!=|>=|<=|&&|\|\||[+\-*/%=<>!&|^~])/g, '<span class="tok-op">$&</span>'],
    ];
    let out = e;
    for (const [re, rep] of rules) out = out.replace(re, rep);
    return out;
  }

  function inline(s) {
    if (s.startsWith('\x02CODE')) return s;
    return s
      // Images before links
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // Bold+italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      // Strikethrough
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Auto-links
      .replace(/(?<![="'`])(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  return function parse(src) {
    // Normalise
    src = src.replace(/\r\n?/g, '\n');

    // Fenced code blocks
    const codeBlocks = [];
    src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const id = `\x02CODE${codeBlocks.length}\x03`;
      const h = lang ? highlight(code.trimEnd(), lang) : escape(code.trimEnd());
      codeBlocks.push(`<pre><code>${h}</code></pre>`);
      return id;
    });

    // Tables
    src = src.replace(/^(\|.+\|)\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/gm, (_, header, rows) => {
      const ths = header.trim().split('|').filter(Boolean).map(c => `<th>${inline(c.trim())}</th>`).join('');
      const trs = rows.trim().split('\n').map(row => {
        const tds = row.trim().split('|').filter(Boolean).map(c => `<td>${inline(c.trim())}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    });

    // Headings
    src = src.replace(/^(#{1,6})\s+(.+)$/gm, (_, h, text) => `<h${h.length}>${inline(text)}</h${h.length}>`);

    // Blockquotes (multi-line)
    src = src.replace(/((?:^>.*\n?)+)/gm, m => {
      const inner = m.replace(/^>\s?/gm, '');
      return `<blockquote><p>${inline(inner.trim())}</p></blockquote>`;
    });

    // HR
    src = src.replace(/^(?:-{3,}|\*{3,}|_{3,})$/gm, '<hr>');

    // Task lists & ordered/unordered lists
    function buildList(lines) {
      let html = '';
      const ulRe = /^(\s*)([-*+])\s+(\[[ xX]\])?\s?(.*)/;
      const olRe = /^(\s*)\d+\.\s+(.*)/;
      let inUl = false, inOl = false;
      for (const line of lines) {
        const ulm = ulRe.exec(line);
        const olm = olRe.exec(line);
        if (ulm) {
          if (!inUl) { if (inOl) { html += '</ol>'; inOl=false; } const cls = ulm[3] ? ' class="task-list"' : ''; html += `<ul${cls}>`; inUl=true; }
          if (ulm[3]) {
            const checked = /[xX]/.test(ulm[3]) ? ' checked' : '';
            html += `<li class="task-list-item"><input type="checkbox"${checked} disabled> ${inline(ulm[4])}</li>`;
          } else {
            html += `<li>${inline(ulm[4])}</li>`;
          }
        } else if (olm) {
          if (!inOl) { if (inUl) { html += '</ul>'; inUl=false; } html += '<ol>'; inOl=true; }
          html += `<li>${inline(olm[2])}</li>`;
        } else {
          if (inUl) { html += '</ul>'; inUl=false; }
          if (inOl) { html += '</ol>'; inOl=false; }
        }
      }
      if (inUl) html += '</ul>';
      if (inOl) html += '</ol>';
      return html;
    }

    // Extract list blocks
    src = src.replace(/((?:^[ \t]*(?:[-*+]|\d+\.)\s+.+\n?)+)/gm, m => {
      return buildList(m.trimEnd().split('\n'));
    });

    // Paragraphs — wrap orphan lines
    const chunks = src.split(/\n{2,}/);
    src = chunks.map(chunk => {
      chunk = chunk.trim();
      if (!chunk) return '';
      if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|table|li)[\s>]/.test(chunk)) return chunk;
      if (/^\x02CODE/.test(chunk)) return chunk;
      return `<p>${inline(chunk.replace(/\n/g, ' '))}</p>`;
    }).join('\n');

    // Restore code blocks
    src = src.replace(/\x02CODE(\d+)\x03/g, (_, i) => codeBlocks[i]);

    return src;
  };
})()

console.log(md('## Heading'));

console.log(md('- item\n- item2'));

console.log(md('inline'));

console.log(md('`js\nconst x=1;\n`'));
