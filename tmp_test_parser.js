
/* ── Markdown Parser ─────────────────────────────────────
   Fully self-contained — no external libs needed.         */
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
})();

/* ── DOM Refs ────────────────────────────────────────────── */
const editor   = document.getElementById('editor');
const preview  = document.getElementById('preview');
const stats    = document.getElementById('stats');
const toast    = document.getElementById('toast');
const divider  = document.getElementById('divider');
const edPane   = document.getElementById('editor-pane');
const workspace= document.getElementById('workspace');

/* ── Render ──────────────────────────────────────────────── */
function render() {
  preview.innerHTML = md(editor.value);
  const txt = editor.value;
  const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
  const chars = txt.length;
  stats.textContent = `${words}w · ${chars}c`;
}

/* ── Default content ─────────────────────────────────────── */
editor.value = `# Welcome to Markdown Previewer

Write Markdown on the left — see it rendered on the right **instantly**.

---

## Features at a Glance

- **Real-time preview** as you type
- Split-screen with a draggable divider
- Syntax highlighting for code blocks
- Tables, task lists, and blockquotes
- Export or copy the generated HTML

---

## Formatting

**Bold**, *italic*, ~~strikethrough~~, and \`inline code\` all work.

> Blockquotes look great with the indigo accent bar.

---

## Code

\`\`\`javascript
async function fetchData(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data.items.filter(item => item.active);
}
\`\`\`

---

## Tables

| Feature         | Supported |
|-----------------|-----------|
| Headings h1–h6  | ✅        |
| Bold / Italic   | ✅        |
| Tables          | ✅        |
| Task lists      | ✅        |
| Code blocks     | ✅        |

---

## Task List

- [x] Write the Markdown spec
- [x] Build the parser
- [ ] Ship it to production

---

## Links & Images

Visit [Markdown Guide](https://www.markdownguide.org) for a full reference.

![Placeholder](https://picsum.photos/seed/md/600/200)
`;

render();

editor.addEventListener('input', render);

/* ── Drag-to-resize ──────────────────────────────────────── */
let dragging = false, startX, startW;

divider.addEventListener('mousedown', e => {
  dragging = true;
  startX = e.clientX;
  startW = edPane.getBoundingClientRect().width;
  divider.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const total = workspace.getBoundingClientRect().width;
  const newW = Math.min(Math.max(startW + (e.clientX - startX), 160), total - 160 - 5);
  edPane.style.width = newW + 'px';
});

document.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  divider.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

/* ── Toast helper ────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ── Copy HTML ───────────────────────────────────────────── */
document.getElementById('btn-copy-html').addEventListener('click', () => {
  navigator.clipboard.writeText(preview.innerHTML)
    .then(() => showToast('HTML copied to clipboard ✓'))
    .catch(() => showToast('Copy failed — try again'));
});

/* ── Export HTML ─────────────────────────────────────────── */
document.getElementById('btn-export').addEventListener('click', () => {
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Exported Markdown</title>
<style>
  body { max-width: 720px; margin: 3rem auto; font-family: system-ui, sans-serif;
         font-size: 16px; line-height: 1.8; color: #1C1B2E; padding: 0 1.5rem; }
  h1,h2,h3,h4 { line-height: 1.3; }
  h1,h2 { border-bottom: 1px solid #e5e3de; padding-bottom: .3em; }
  pre { background: #1E1E2E; color: #CDD6F4; padding: 1em 1.2em; border-radius: 6px; overflow: auto; }
  code { background: rgba(99,102,241,.1); color: #6366F1; padding: .15em .4em; border-radius: 4px; font-size: .875em; }
  pre code { background: none; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #6366F1; margin: 1em 0; padding: .8em 1.2em; background: rgba(99,102,241,.05); color: #4B5563; }
  table { border-collapse: collapse; width: 100%; }
  th,td { border: 1px solid #e5e3de; padding: .6em 1em; }
  th { background: #f3f2ef; }
  img { max-width: 100%; border-radius: 6px; }
  a { color: #6366F1; }
</style>
</head>
<body>
${preview.innerHTML}
</body>
</html>`;
  const blob = new Blob([fullHtml], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'export.html';
  a.click();
  URL.revokeObjectURL(url);
  showToast('HTML file exported ✓');
});

/* ── Reset ───────────────────────────────────────────────── */
document.getElementById('btn-reset').addEventListener('click', () => {
  if (!editor.value.trim() || confirm('Clear the editor? This cannot be undone.')) {
    editor.value = '';
    render();
    editor.focus();
    showToast('Editor cleared');
  }
});

/* ── Focus / Fullscreen ──────────────────────────────────── */
const btnFull = document.getElementById('btn-fullscreen');
let fullscreen = false;

function toggleFullscreen() {
  fullscreen = !fullscreen;
  edPane.classList.toggle('fullscreen', fullscreen);
  btnFull.querySelector('span').textContent = fullscreen ? 'Exit Focus' : 'Focus Mode';
  btnFull.title = fullscreen ? 'Exit focus mode (Esc)' : 'Toggle fullscreen editor (F11)';
  if (fullscreen) editor.focus();
}

btnFull.addEventListener('click', toggleFullscreen);

document.addEventListener('keydown', e => {
  if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
  if (e.key === 'Escape' && fullscreen) toggleFullscreen();
});


console.log('loaded');

console.log(typeof md, md('# hi'));
