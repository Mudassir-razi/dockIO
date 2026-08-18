(() => {
  "use strict";

  const THEME_KEY = "portable-docs:theme";
  const SIDEBAR_KEY = "portable-docs:sidebar";

  const blankDocumentTemplate = `# My Documentation

**A short description of this document**

Explain what this documentation covers and who it is for.

---

# First Topic

Start writing here. Mention signals such as [[valid]] and [[ready]].

## Example

\`\`\`systemverilog
module example (
  input logic clk
);
  // Add your example here.
endmodule
\`\`\`
`;

  const diagramTemplate = [
    "",
    '<div class="diagram">',
    '<svg viewBox="0 0 700 180" role="img" aria-label="Describe this diagram">',
    '  <rect x="40" y="45" width="180" height="90" rx="8" class="box accent"/>',
    '  <text x="130" y="96" text-anchor="middle" class="title">Input block</text>',
    '  <line x1="220" y1="90" x2="470" y2="90" class="arrow"/>',
    '  <rect x="470" y="45" width="180" height="90" rx="8" class="box"/>',
    '  <text x="560" y="96" text-anchor="middle" class="title">Output block</text>',
    "</svg>",
    "</div>",
    ""
  ].join("\n");

  const diagramFenceTemplates = {
    block: [
      "",
      "```block",
      "mode block;",
      "// Shared: module ports, bus arrows, [row] hints, # gaps.",
      "module cpu ([input clk, rst], [output irq]);",
      "endmodule",
      "module mem ([input clk], [output ready]);",
      "endmodule",
      "initial begin",
      "  [cpu u_cpu, mem u_mem];",
      "  bus u_cpu <=DATA=> u_mem;",
      "end",
      "```",
      ""
    ].join("\n"),
    asm: [
      "",
      "```asm",
      "mode asm;",
      "// State type holds defaults. Chart is initial begin.",
      "// Next state is a name: if (cond) IDLE; else RUN;",
      "module fsm ([input clk, rst_n, input1], [output output1, output2]);",
      "endmodule",
      "module state;",
      "  output1 = 1'b0;",
      "  output2 = 2'b11;",
      "endmodule",
      "initial begin",
      "  state IDLE(output1 = \"CDF\");",
      "  if (input1 == 3'b101) IDLE;",
      "  else RUN;",
      "  state RUN;",
      "  if (input1 == 3'b000) STOP;",
      "  else RUN;",
      "  state STOP;",
      "end",
      "```",
      ""
    ].join("\n"),
    circuit: [
      "",
      "```circuit",
      "mode circuit;",
      "// circuit extras: gate primitives and wire declarations. No Verilog export.",
      "module maj ([input a, b, c], [output y]);",
      "  wire n1, n2, n3;",
      "  and g1(n1, a, b);",
      "  and g2(n2, b, c);",
      "  and g3(n3, a, c);",
      "  or  g4(y, n1, n2, n3);",
      "endmodule",
      "```",
      ""
    ].join("\n")
  };

  const SV_TYPES =
    "byte|bit|logic|reg|wire|tri|trireg|integer|int|shortint|longint|time|realtime|real|shortreal|string|chandle|event|void|mailbox|semaphore|process";
  const SV_PORTS = "input|output|inout|ref";
  const SV_ENDPOINTS = "begin|end";
  const SV_MOD = "module|endmodule|task|endtask";
  const SV_STRUCTURE =
    "interface|endinterface|modport|package|endpackage|class|endclass|function|endfunction|program|endprogram|checker|endchecker|property|endproperty|sequence|endsequence|clocking|endclocking|covergroup|endgroup|generate|endgenerate|fork|join|join_any|join_none";
  const SV_CONTROL =
    "always_ff|always_comb|always_latch|always|if|else|case|casex|casez|endcase|default|for|foreach|while|do|unique|unique0|priority|return|wait|posedge|negedge|initial|final|assert|assume|cover|assign";
  const SV_KEYWORD =
    "typedef|struct|union|enum|extends|virtual|import|export|parameter|localparam|or|and|xor|xnor|not|nand|nor|constraint|with|inside|dist|solve|before|soft|rand|randc|new|this|super|static|automatic|const|extern|pure|protected|local|null|signed|unsigned";

  const newDocumentButton = document.getElementById("new-document-button");
  const openDocumentButton = document.getElementById("open-document-button");
  const saveDocumentButton = document.getElementById("save-document-button");
  const modeToggle = document.getElementById("mode-toggle");
  const themeToggle = document.getElementById("theme-toggle");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const helperBanner = document.getElementById("helper-banner");
  const viewShell = document.getElementById("view-shell");
  const editorShell = document.getElementById("editor-shell");
  const documentView = document.getElementById("document-view");
  const sourceEditorHost = document.getElementById("source-editor");
  const editorFindButton = document.getElementById("editor-find-button");
  const editorReplaceButton = document.getElementById("editor-replace-button");
  const editorPreview = document.getElementById("editor-preview");
  const toc = document.getElementById("toc");
  const sidebarBrand = document.getElementById("sidebar-brand");
  const docStatus = document.getElementById("doc-status");
  const fileInput = document.getElementById("markdown-file-input");
  const tableHelperButton = document.getElementById("table-helper-button");
  const tablePicker = document.getElementById("table-picker");
  const tableGrid = document.getElementById("table-grid");
  const tableSizeLabel = document.getElementById("table-size-label");
  const launchNew = document.getElementById("launch-new");
  const launchOpen = document.getElementById("launch-open");
  const launchDialog = document.getElementById("launch-dialog");
  const app = document.getElementById("app");

  const state = {
    mode: "launch",
    markdown: "",
    savedMarkdown: "",
    fileName: "untitled.md",
    fileHandle: null,
    dirty: false,
    scrollObserver: null,
    previewTimer: null,
    tableRows: 1,
    tableCols: 1,
    monacoReady: false,
    applyingEditorValue: false,
    syncingScroll: false
  };

  let monacoEditor = null;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function classifyKeyword(word) {
    if (new RegExp(`^(?:${SV_TYPES})$`).test(word)) return "sv-type";
    if (new RegExp(`^(?:${SV_PORTS})$`).test(word)) return "sv-port";
    if (new RegExp(`^(?:${SV_STRUCTURE})$`).test(word)) return "sv-structure";
    if (new RegExp(`^(?:${SV_CONTROL})$`).test(word)) return "sv-control";
    if (new RegExp(`^(?:${SV_KEYWORD})$`).test(word)) return "sv-keyword";
    if (new RegExp(`^(?:${SV_ENDPOINTS})$`).test(word)) return "sv-endpoint";
    if (new RegExp(`^(?:${SV_MOD})$`).test(word)) return "sv-mod";
    return "sv-keyword";
  }

  function highlightSystemVerilog(code) {
    const allWords = [
      SV_TYPES,
      SV_PORTS,
      SV_STRUCTURE,
      SV_CONTROL,
      SV_KEYWORD,
      SV_ENDPOINTS,
      SV_MOD
    ].join("|");
    const tokenRegex = new RegExp(
      String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\`\w+\b)|(\$\w+\b)|(\b(?:${allWords})\b)|(\b\d*\s*'[sS]?[bBhHdDoO][0-9a-fA-F_xXzZ]+|\b\d[\d_]*\b)|([{}()\[\];,:.#@=~+\-*/%<>!?|&^]+)`,
      "g"
    );

    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(code)) !== null) {
      result += escapeHtml(code.slice(lastIndex, match.index));
      const [full, comment, string, directive, system, keyword, number, operator] = match;
      let cls = "";
      if (comment) cls = "sv-comment";
      else if (string) cls = "sv-string";
      else if (directive) cls = "sv-directive";
      else if (system) cls = "sv-function";
      else if (keyword) cls = classifyKeyword(keyword);
      else if (number) cls = "sv-number";
      else if (operator) cls = "sv-operator";
      result += cls
        ? `<span class="${cls}">${escapeHtml(full)}</span>`
        : escapeHtml(full);
      lastIndex = match.index + full.length;
    }

    result += escapeHtml(code.slice(lastIndex));
    return result;
  }

  function highlightWithRegex(code, tokenRegex, classify) {
    let result = "";
    let lastIndex = 0;
    let match;
    tokenRegex.lastIndex = 0;
    while ((match = tokenRegex.exec(code)) !== null) {
      result += escapeHtml(code.slice(lastIndex, match.index));
      const cls = classify(match);
      result += cls
        ? `<span class="${cls}">${escapeHtml(match[0])}</span>`
        : escapeHtml(match[0]);
      lastIndex = match.index + match[0].length;
    }
    result += escapeHtml(code.slice(lastIndex));
    return result;
  }

  function highlightPython(code) {
    const keywords =
      "False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield";
    const types =
      "bool|bytearray|bytes|complex|dict|float|frozenset|int|list|memoryview|object|set|str|tuple|type";
    const builtins =
      "abs|all|any|bin|callable|chr|classmethod|dir|enumerate|filter|format|getattr|globals|hasattr|hash|help|hex|id|input|isinstance|issubclass|iter|len|map|max|min|next|oct|open|ord|pow|print|property|range|repr|reversed|round|setattr|slice|sorted|staticmethod|sum|super|vars|zip";
    const tokenRegex = new RegExp(
      String.raw`([fFrRbBuU]{0,2}"""[\s\S]*?"""|[fFrRbBuU]{0,2}'''[\s\S]*?'''|#.*$|[fFrRbBuU]{0,2}"(?:\\.|[^"\\])*"|[fFrRbBuU]{0,2}'(?:\\.|[^'\\])*')|(\b(?:${keywords})\b)|(\b(?:${types})\b)|(\b(?:${builtins})\b)|(@[A-Za-z_]\w*)|(\bself\b|\bcls\b)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([{}()\[\]:,.=+\-*/%<>!|&^~]+)`,
      "gm"
    );
    return highlightWithRegex(code, tokenRegex, (match) => {
      if (match[1]) return match[1].trimStart().startsWith("#") ? "sv-comment" : "sv-string";
      if (match[2]) return "sv-keyword";
      if (match[3]) return "sv-type";
      if (match[4]) return "sv-function";
      if (match[5]) return "sv-function";
      if (match[6]) return "sv-variable";
      if (match[7]) return "sv-number";
      if (match[8]) return "sv-operator";
      return "";
    });
  }

  function highlightBash(code) {
    const keywords =
      "if|then|else|elif|fi|for|while|until|do|done|case|esac|function|in|select|time|return|break|continue|exit";
    const builtins =
      "echo|printf|cd|ls|pwd|export|unset|read|test|shift|trap|eval|exec|source|alias|unalias|true|false|wait|kill|jobs|local|declare|typeset|readonly|let|mapfile|readarray";
    const tokenRegex = new RegExp(
      String.raw`((?<!\$)#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\$\{?[A-Za-z_][\w-]*\}?|\$\d+|\$[#@*?!\-])|(\b(?:${keywords})\b)|(\b(?:${builtins})\b)|(--?[A-Za-z][\w-]*)|(\b\d+\b)|([|;&<>()\[\]{}=!]+)`,
      "g"
    );
    return highlightWithRegex(code, tokenRegex, (match) => {
      if (match[1]) return "sv-comment";
      if (match[2]) return "sv-string";
      if (match[3]) return "sv-variable";
      if (match[4]) return "sv-control";
      if (match[5]) return "sv-function";
      if (match[6]) return "sv-variable";
      if (match[7]) return "sv-number";
      if (match[8]) return "sv-operator";
      return "";
    });
  }

  function highlightTcl(code) {
    const keywords =
      "proc|set|unset|if|else|elseif|for|foreach|while|switch|catch|return|break|continue|source|package|namespace|expr|global|upvar|variable|eval|uplevel|incr|append";
    const commands =
      "puts|gets|open|close|list|lindex|llength|lappend|lrange|lsort|dict|array|string|concat|join|split|regexp|regsub|format|scan|clock|file|glob|cd|pwd|exec|pid|after|update|bind|pack|grid|wm|frame|button|label|entry";
    const tokenRegex = new RegExp(
      String.raw`(#[^\n]*)|("(?:\\.|[^"\\])*")|(\$[A-Za-z_:][\w:]*)|(\b(?:${keywords})\b)|(\b(?:${commands})\b)|(\b\d+(?:\.\d+)?\b)|([{}()\[\];])`,
      "g"
    );
    return highlightWithRegex(code, tokenRegex, (match) => {
      if (match[1]) return "sv-comment";
      if (match[2]) return "sv-string";
      if (match[3]) return "sv-variable";
      if (match[4]) return "sv-keyword";
      if (match[5]) return "sv-function";
      if (match[6]) return "sv-number";
      if (match[7]) return "sv-operator";
      return "";
    });
  }

  function fenceKind(lang) {
    const normalized = String(lang || "").toLowerCase().trim().split(/\s+/)[0];
    if (
      normalized === "systemverilog" ||
      normalized === "sv" ||
      normalized === "verilog" ||
      normalized === "v"
    ) {
      return "sv";
    }
    if (normalized === "python" || normalized === "py") return "python";
    if (
      normalized === "bash" ||
      normalized === "sh" ||
      normalized === "shell" ||
      normalized === "zsh"
    ) {
      return "bash";
    }
    if (normalized === "tcl" || normalized === "tk" || normalized === "wish") return "tcl";
    if (
      normalized === "tree" ||
      normalized === "filetree" ||
      normalized === "files" ||
      normalized === "dir"
    ) {
      return "tree";
    }
    return null;
  }

  function highlightFence(lang, text) {
    const kind = fenceKind(lang);
    if (kind === "sv") return highlightSystemVerilog(text);
    if (kind === "python") return highlightPython(text);
    if (kind === "bash") return highlightBash(text);
    if (kind === "tcl") return highlightTcl(text);
    return null;
  }

  function detectTreeIndentUnit(spaceLengths) {
    if (!spaceLengths.length) return 2;
    if (spaceLengths.every((n) => n % 4 === 0)) return 4;
    if (spaceLengths.every((n) => n % 2 === 0)) return 2;
    return 1;
  }

  function leadingTreeDepth(ws, spaceUnit) {
    let depth = 0;
    let spaces = 0;
    for (let i = 0; i < ws.length; i += 1) {
      if (ws[i] === "\t") {
        depth += 1 + Math.floor(spaces / spaceUnit);
        spaces = 0;
      } else if (ws[i] === " ") {
        spaces += 1;
      }
    }
    depth += Math.floor(spaces / spaceUnit);
    return depth;
  }

  function parseTreeItems(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const rows = [];
    raw.forEach((line) => {
      if (!line.trim()) return;
      const match = line.match(/^([ \t]*)(.*)$/);
      if (!match) return;
      const name = match[2].replace(/\s+$/, "");
      if (!name) return;
      rows.push({ ws: match[1], name: name });
    });
    const spaceLengths = rows
      .map((row) => (row.ws.indexOf("\t") >= 0 ? 0 : row.ws.length))
      .filter((n) => n > 0);
    const spaceUnit = detectTreeIndentUnit(spaceLengths);
    const items = rows.map((row) => ({
      depth: leadingTreeDepth(row.ws, spaceUnit),
      name: row.name
    }));
    if (!items.length) return items;
    const minDepth = Math.min.apply(
      null,
      items.map((item) => item.depth)
    );
    items.forEach((item) => {
      item.depth -= minDepth;
    });
    return items;
  }

  function isLastAtDepth(items, index, depth) {
    for (let j = index + 1; j < items.length; j += 1) {
      if (items[j].depth < depth) return true;
      if (items[j].depth === depth) return false;
    }
    return true;
  }

  function renderUnicodeTree(text) {
    const source = String(text || "");
    if (/[│├└─┌┐┘]/.test(source)) {
      return escapeHtml(source.replace(/\r\n/g, "\n").replace(/\s+$/, ""));
    }
    const items = parseTreeItems(source);
    if (!items.length) return "";
    return items
      .map((item, index) => {
        let prefix = "";
        for (let level = 0; level < item.depth; level += 1) {
          const last = isLastAtDepth(items, index, level + 1);
          if (level === item.depth - 1) prefix += last ? "└── " : "├── ";
          else prefix += last ? "     " : "│    ";
        }
        const isDir =
          /\/$/.test(item.name) ||
          (index + 1 < items.length && items[index + 1].depth > item.depth);
        const nameClass = isDir ? "tree-dir" : "tree-file";
        return (
          `<span class="tree-line">` +
          (prefix
            ? `<span class="tree-guide">${escapeHtml(prefix)}</span>`
            : "") +
          `<span class="${nameClass}">${escapeHtml(item.name)}</span>` +
          `</span>`
        );
      })
      .join("\n");
  }

  function isTreeFence(lang) {
    const normalized = String(lang || "").toLowerCase().trim().split(/\s+/)[0];
    return (
      normalized === "tree" ||
      normalized === "filetree" ||
      normalized === "files" ||
      normalized === "dir"
    );
  }

  function shouldHighlight(lang) {
    const kind = fenceKind(lang);
    return kind && kind !== "tree";
  }

  function diagramModeFromLang(lang) {
    const normalized = String(lang || "").toLowerCase().trim().split(/\s+/)[0];
    if (normalized === "block" || normalized === "blockio") return "block";
    if (normalized === "asm" || normalized === "fsm") return "asm";
    if (normalized === "circuit" || normalized === "sch") return "circuit";
    return null;
  }

  let diagramSerial = 0;

  function renderDiagramFence(text, mode) {
    if (typeof BlockIO === "undefined") {
      return `<div class="diagram-error">Diagram engine failed to load.</div>\n`;
    }
    diagramSerial += 1;
    try {
      const drawn = BlockIO.render(text, {
        mode: mode,
        idPrefix: "doc-" + mode + "-" + diagramSerial
      });
      const errors = (drawn.diagnostics || []).filter((d) => d.severity === "error");
      let html =
        `<div class="diagram">` +
        `<button type="button" class="blockio-grid-toggle" aria-pressed="false" title="Toggle routing grid">Grid</button>` +
        `${drawn.svg}</div>`;
      if (errors.length) {
        html +=
          `<div class="diagram-error">` +
          errors.map((d) => escapeHtml(d.message)).join("<br>") +
          `</div>`;
      }
      if (mode !== "circuit" && typeof BlockIO.generate === "function") {
        const gen = BlockIO.generate(text, { mode: mode });
        if (gen.verilog && String(gen.verilog).trim()) {
          html +=
            `<details class="diagram-verilog"><summary>Generated Verilog</summary>` +
            `<pre><code class="language-verilog">${highlightSystemVerilog(gen.verilog)}</code></pre>` +
            `</details>`;
        }
      }
      return html + "\n";
    } catch (_) {
      return `<div class="diagram-error">Could not render diagram.</div>\n`;
    }
  }

  function configureMarked() {
    if (typeof marked === "undefined") {
      throw new Error("marked.js failed to load");
    }

    const renderer = new marked.Renderer();
    const originalCode = renderer.code.bind(renderer);

    renderer.code = function codeRenderer(code, infostring, escaped) {
      let text = code;
      let lang = infostring || "";
      if (code && typeof code === "object") {
        text = code.text ?? "";
        lang = code.lang ?? "";
        escaped = code.escaped;
      }

      if (isTreeFence(lang) || fenceKind(lang) === "tree") {
        const tree = renderUnicodeTree(text);
        return `<pre class="file-tree"><code class="language-tree">${tree}</code></pre>\n`;
      }
      const highlighted = highlightFence(lang, text);
      if (highlighted != null) {
        const langClass = escapeHtml(String(lang).split(/\s+/)[0] || "text");
        return `<pre><code class="language-${langClass}">${highlighted}</code></pre>\n`;
      }
      const diagramMode = diagramModeFromLang(lang);
      if (diagramMode) {
        return renderDiagramFence(text, diagramMode);
      }

      try {
        return originalCode(code, infostring, escaped);
      } catch (_) {
        const safe = escapeHtml(text);
        const langClass = lang ? ` class="language-${escapeHtml(String(lang).split(/\s+/)[0])}"` : "";
        return `<pre><code${langClass}>${safe}</code></pre>\n`;
      }
    };

    marked.setOptions({
      gfm: true,
      breaks: false,
      renderer
    });
  }

  function expandSignalSyntax(source) {
    let inFence = false;
    return source
      .split("\n")
      .map((line) => {
        if (/^\s*```/.test(line)) {
          inFence = !inFence;
          return line;
        }
        if (inFence) return line;
        return line
          .split(/(`[^`]*`)/g)
          .map((part) =>
            part.startsWith("`")
              ? part
              : part.replace(
                  /\[\[([A-Za-z0-9_][A-Za-z0-9_$.\[\]:-]*)\]\]/g,
                  '<span class="signal-name">$1</span>'
                )
          )
          .join("");
      })
      .join("\n");
  }

  function slugify(text, used) {
    const base =
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-") || "section";
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) slug = `${base}-${suffix++}`;
    used.add(slug);
    return slug;
  }

  function assignHeadingIds(root, prefix = "") {
    const used = new Set();
    root.querySelectorAll("h1, h2, h3").forEach((heading) => {
      heading.id = prefix + slugify(heading.textContent, used);
    });
  }

  function renderMarkdownInto(target, source, headingPrefix = "") {
    target.innerHTML = marked.parse(expandSignalSyntax(source));
    assignHeadingIds(target, headingPrefix);
  }

  function updateIdentity(root) {
    const title =
      root.querySelector("h1")?.textContent.trim() ||
      state.fileName.replace(/\.md$/i, "") ||
      "Untitled Documentation";
    sidebarBrand.textContent = title;
    document.title = `${title} · Portable Documentation`;
  }

  function rebuildToc(root) {
    toc.innerHTML = "";
    const list = document.createElement("ul");
    root.querySelectorAll("h1, h2, h3").forEach((heading) => {
      const item = document.createElement("li");
      item.className = `toc-depth-${heading.tagName.slice(1)}`;
      const link = document.createElement("a");
      const targetId =
        root === editorPreview ? heading.id.replace(/^preview-/, "") : heading.id;
      link.href = `#${targetId}`;
      link.textContent = heading.textContent;
      item.appendChild(link);
      list.appendChild(item);
    });
    toc.appendChild(list);
    if (root === documentView) setupScrollSpy();
  }

  function setupScrollSpy() {
    if (state.scrollObserver) state.scrollObserver.disconnect();
    const links = [...toc.querySelectorAll("a")];
    const headings = links
      .map((link) => {
        const id = decodeURIComponent(link.hash.slice(1));
        return [...documentView.querySelectorAll("h1, h2, h3")].find(
          (heading) => heading.id === id
        );
      })
      .filter(Boolean);

    const markActive = (id) => {
      links.forEach((link) => {
        link.classList.toggle(
          "active",
          decodeURIComponent(link.hash.slice(1)) === id
        );
      });
    };

    state.scrollObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) markActive(visible[0].target.id);
      },
      { rootMargin: "-8% 0px -78% 0px", threshold: 0 }
    );

    headings.forEach((heading) => state.scrollObserver.observe(heading));
    if (headings.length) markActive(headings[0].id);
  }

  function setStatus(message) {
    docStatus.textContent = message || "";
  }

  function setDirty(isDirty) {
    state.dirty = isDirty;
    if (state.mode === "edit") {
      setStatus(
        isDirty
          ? "Unsaved changes"
          : state.fileHandle
            ? `Saved · ${state.fileName}`
            : `Ready · ${state.fileName}`
      );
    }
  }

  function syncSavedBaseline() {
    state.savedMarkdown = state.markdown;
    setDirty(false);
  }

  function getEditorValue() {
    return monacoEditor ? monacoEditor.getValue() : state.markdown;
  }

  function setEditorValue(value, keepCursor = false) {
    if (!monacoEditor) {
      state.markdown = value;
      return;
    }
    state.applyingEditorValue = true;
    const model = monacoEditor.getModel();
    const position = keepCursor ? monacoEditor.getPosition() : null;
    if (model && model.getValue() !== value) {
      monacoEditor.setValue(value);
    }
    if (keepCursor && position) monacoEditor.setPosition(position);
    state.applyingEditorValue = false;
  }

  function focusEditor() {
    if (!monacoEditor) return;
    window.requestAnimationFrame(() => {
      monacoEditor.layout();
      monacoEditor.focus();
    });
  }

  function layoutEditor() {
    if (!monacoEditor || state.mode !== "edit") return;
    const width = sourceEditorHost.clientWidth;
    const height = sourceEditorHost.clientHeight;
    if (width > 0 && height > 0) {
      monacoEditor.layout({ width, height });
    }
  }

  function schedulePreviewUpdate() {
    setStatus("Updating preview…");
    window.clearTimeout(state.previewTimer);
    state.previewTimer = window.setTimeout(() => {
      updatePreview();
      setDirty(state.markdown !== state.savedMarkdown);
    }, 220);
  }

  function runScrollSync(callback) {
    if (state.syncingScroll || state.mode !== "edit") return;
    state.syncingScroll = true;
    callback();
    window.requestAnimationFrame(() => {
      state.syncingScroll = false;
    });
  }

  function syncPreviewToEditor() {
    if (!monacoEditor) return;
    const editorMax =
      monacoEditor.getScrollHeight() - monacoEditor.getLayoutInfo().height;
    const previewMax = editorPreview.scrollHeight - editorPreview.clientHeight;
    const ratio = editorMax > 0 ? monacoEditor.getScrollTop() / editorMax : 0;
    editorPreview.scrollTop = Math.max(0, previewMax) * Math.min(1, ratio);
  }

  function syncEditorToPreview() {
    if (!monacoEditor) return;
    const previewMax = editorPreview.scrollHeight - editorPreview.clientHeight;
    const editorMax =
      monacoEditor.getScrollHeight() - monacoEditor.getLayoutInfo().height;
    const ratio = previewMax > 0 ? editorPreview.scrollTop / previewMax : 0;
    monacoEditor.setScrollTop(
      Math.max(0, editorMax) * Math.min(1, ratio),
      monaco.editor.ScrollType.Immediate
    );
  }

  function renderView() {
    renderMarkdownInto(documentView, state.markdown);
    updateIdentity(documentView);
    rebuildToc(documentView);
  }

  function updatePreview() {
    renderMarkdownInto(editorPreview, getEditorValue(), "preview-");
    updateIdentity(editorPreview);
    rebuildToc(editorPreview);
    syncPreviewToEditor();
  }

  function updateModeToggle() {
    const toEdit = state.mode !== "edit";
    modeToggle.setAttribute("aria-label", toEdit ? "Edit" : "View");
    modeToggle.title = toEdit ? "Edit" : "View";
  }

  function setMode(mode) {
    state.mode = mode;
    app.dataset.mode = mode;
    document.documentElement.classList.toggle("is-editing", mode === "edit");
    const isEdit = mode === "edit";
    const isView = mode === "view";

    helperBanner.hidden = !isEdit;
    editorShell.hidden = !isEdit;
    viewShell.hidden = !isView;
    tablePicker.hidden = true;
    tableHelperButton.setAttribute("aria-expanded", "false");
    updateModeToggle();

    if (isEdit) {
      setEditorValue(state.markdown);
      updatePreview();
      focusEditor();
      setDirty(state.markdown !== state.savedMarkdown);
    } else if (isView) {
      renderView();
      setStatus(state.dirty ? "Unsaved changes" : "");
    }
  }

  function toggleEditViewMode() {
    if (state.mode === "launch") return;
    if (state.mode === "edit") {
      state.markdown = getEditorValue();
      setDirty(state.markdown !== state.savedMarkdown);
      setMode("view");
      return;
    }
    setMode("edit");
  }

  function confirmDiscardIfNeeded() {
    if (!state.dirty) return true;
    return window.confirm("You have unsaved changes. Discard them?");
  }

  function startNewDocument() {
    if (!confirmDiscardIfNeeded()) return;
    state.markdown = blankDocumentTemplate;
    state.fileName = "untitled.md";
    state.fileHandle = null;
    syncSavedBaseline();
    setMode("edit");
    setStatus("New document");
  }

  async function openWithFilePicker() {
    if (!confirmDiscardIfNeeded()) return;

    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "Markdown",
              accept: {
                "text/markdown": [".md", ".markdown"],
                "text/plain": [".md", ".markdown", ".txt"]
              }
            }
          ]
        });
        const file = await handle.getFile();
        const text = await file.text();
        state.fileHandle = handle;
        state.fileName = file.name || "document.md";
        state.markdown = text;
        syncSavedBaseline();
        setMode(state.mode === "launch" ? "view" : "edit");
        if (state.mode === "edit") {
          setEditorValue(text);
          updatePreview();
        }
        setStatus(`Opened ${state.fileName}`);
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }

    fileInput.value = "";
    fileInput.click();
  }

  async function readFromFileInput(file) {
    const text = await file.text();
    state.fileHandle = null;
    state.fileName = file.name || "document.md";
    state.markdown = text;
    syncSavedBaseline();
    setMode(state.mode === "launch" || state.mode === "view" ? "view" : "edit");
    if (state.mode === "edit") {
      setEditorValue(text);
      updatePreview();
    } else {
      renderView();
    }
    setStatus(`Opened ${state.fileName}`);
  }

  function downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function safeFilename(source, extension) {
    const titleMatch = source.match(/^#\s+(.+)$/m);
    const base =
      (titleMatch?.[1] || state.fileName.replace(/\.[^.]+$/, "") || "documentation")
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "documentation";
    return `${base}.${extension}`;
  }

  async function saveDocument() {
    if (state.mode === "edit") {
      state.markdown = getEditorValue();
    }

    if (state.fileHandle && state.fileHandle.createWritable) {
      try {
        const writable = await state.fileHandle.createWritable();
        await writable.write(state.markdown);
        await writable.close();
        syncSavedBaseline();
        setStatus(`Saved ${state.fileName}`);
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
        setStatus("Direct save failed. Downloading a copy instead.");
      }
    }

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: state.fileName.endsWith(".md")
            ? state.fileName
            : safeFilename(state.markdown, "md"),
          types: [
            {
              description: "Markdown",
              accept: { "text/markdown": [".md"] }
            }
          ]
        });
        const writable = await handle.createWritable();
        await writable.write(state.markdown);
        await writable.close();
        state.fileHandle = handle;
        state.fileName = handle.name || state.fileName;
        syncSavedBaseline();
        setStatus(`Saved ${state.fileName}`);
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }

    const filename = state.fileName.endsWith(".md")
      ? state.fileName
      : safeFilename(state.markdown, "md");
    downloadBlob(state.markdown, "text/markdown;charset=utf-8", filename);
    syncSavedBaseline();
    setStatus(`Downloaded ${filename}`);
  }

  function replaceEditorRange(text) {
    if (!monacoEditor) return;
    const selection = monacoEditor.getSelection();
    monacoEditor.executeEdits("portable-docs", [
      {
        range: selection,
        text,
        forceMoveMarkers: true
      }
    ]);
    const model = monacoEditor.getModel();
    const endPos = model.getPositionAt(
      model.getOffsetAt(selection.getStartPosition()) + text.length
    );
    monacoEditor.setPosition(endPos);
    monacoEditor.focus();
    state.markdown = monacoEditor.getValue();
    setDirty(state.markdown !== state.savedMarkdown);
    schedulePreviewUpdate();
  }

  function wrapOrInsert(options) {
    const { empty, transformSelection } = options;
    if (!monacoEditor) return;
    const model = monacoEditor.getModel();
    const selection = monacoEditor.getSelection();
    const selected = model.getValueInRange(selection);
    let replacement;

    if (!selected) replacement = empty;
    else if (typeof transformSelection === "function") {
      replacement = transformSelection(selected);
    } else {
      replacement = selected;
    }

    replaceEditorRange(replacement);
  }

  function insertAtCursor(text) {
    replaceEditorRange(text);
  }

  function applyHelper(kind) {
    switch (kind) {
      case "title":
        wrapOrInsert({
          empty: "\n# Title\n",
          transformSelection: (selected) => `\n# ${selected.trim()}\n`
        });
        break;
      case "subtitle":
        wrapOrInsert({
          empty: "\n## Subtitle\n",
          transformSelection: (selected) => `\n## ${selected.trim()}\n`
        });
        break;
      case "code":
        wrapOrInsert({
          empty:
            "\n```systemverilog\nmodule example;\n  // Add code here\nendmodule\n```\n",
          transformSelection: (selected) =>
            `\n\`\`\`systemverilog\n${selected.replace(/^\n+|\n+$/g, "")}\n\`\`\`\n`
        });
        break;
      case "tree":
        wrapOrInsert({
          empty:
            "\n```tree\nroot\n  dir1\n  dir2/\n    subdir1\n    subdir2\n```\n",
          transformSelection: (selected) =>
            `\n\`\`\`tree\n${selected.replace(/^\n+|\n+$/g, "")}\n\`\`\`\n`
        });
        break;
      case "signal":
        wrapOrInsert({
          empty: "[[signal_name]]",
          transformSelection: (selected) => {
            const cleaned = selected.trim().replace(/^\[\[|\]\]$/g, "");
            return `[[${cleaned || "signal_name"}]]`;
          }
        });
        break;
      case "diagram":
        insertAtCursor(diagramTemplate);
        break;
      case "block":
        insertAtCursor(diagramFenceTemplates.block);
        break;
      case "asm":
        insertAtCursor(diagramFenceTemplates.asm);
        break;
      case "circuit":
        insertAtCursor(diagramFenceTemplates.circuit);
        break;
      default:
        break;
    }
  }

  function buildMarkdownTable(rows, cols) {
    const header = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
    const separator = Array.from({ length: cols }, () => "---");
    const body = Array.from({ length: Math.max(0, rows - 1) }, (_, r) =>
      Array.from({ length: cols }, (_, c) => `R${r + 1}C${c + 1}`)
    );
    const line = (cells) => `| ${cells.join(" | ")} |`;
    return (
      "\n" +
      [line(header), line(separator), ...body.map(line)].join("\n") +
      "\n"
    );
  }

  function paintTableGrid(rows, cols) {
    state.tableRows = rows;
    state.tableCols = cols;
    tableSizeLabel.textContent = `${cols} × ${rows} (header + ${Math.max(0, rows - 1)} body)`;
    [...tableGrid.children].forEach((cell) => {
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      const active = r <= rows && c <= cols;
      cell.classList.toggle("is-active", active);
      cell.classList.toggle("is-header", active && r === 1);
    });
  }

  function buildTablePicker() {
    tableGrid.innerHTML = "";
    for (let r = 1; r <= 10; r += 1) {
      for (let c = 1; c <= 10; c += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "table-cell";
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.setAttribute("aria-label", `${c} columns by ${r} rows`);
        cell.addEventListener("mouseenter", () => paintTableGrid(r, c));
        cell.addEventListener("focus", () => paintTableGrid(r, c));
        cell.addEventListener("click", () => {
          insertAtCursor(buildMarkdownTable(r, c));
          tablePicker.hidden = true;
          tableHelperButton.setAttribute("aria-expanded", "false");
          setStatus(`Inserted ${c}×${r} table`);
        });
        tableGrid.appendChild(cell);
      }
    }
    paintTableGrid(1, 1);
  }

  function patchMarkdownSignalHighlight(mod) {
    const src = mod && (mod.language ? mod : mod.default);
    if (!src || !src.language || !src.language.tokenizer) return;

    const language = Object.assign({}, src.language, {
      tokenizer: Object.assign({}, src.language.tokenizer, {
        linecontent: [
          [/\[\[[A-Za-z0-9_][A-Za-z0-9_$.\[\]:-]*\]\]/, "variable.signal"],
          ...(src.language.tokenizer.linecontent || [])
        ]
      })
    });
    monaco.languages.setMonarchTokensProvider("markdown", language);

    const conf = Object.assign({}, src.conf || {});
    conf.brackets = [["[[", "]]"]].concat(conf.brackets || []);
    monaco.languages.setLanguageConfiguration("markdown", conf);
  }

  function defineMonacoThemes() {
    monaco.editor.defineTheme("portable-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "variable.signal", foreground: "7dd3fc", fontStyle: "bold" }
      ],
      colors: {
        "editor.background": "#0d1620",
        "editor.foreground": "#e8f1f8",
        "editorLineNumber.foreground": "#6b8299",
        "editorCursor.foreground": "#4cc2ff",
        "editor.selectionBackground": "#1e3a55",
        "editor.inactiveSelectionBackground": "#163049",
        "editor.lineHighlightBackground": "#122233",
        "editorIndentGuide.background": "#243749",
        "editorGutter.background": "#0d1620"
      }
    });

    monaco.editor.defineTheme("portable-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "variable.signal", foreground: "0369a1", fontStyle: "bold" }
      ],
      colors: {
        "editor.background": "#f4f8fb",
        "editor.foreground": "#0f2740",
        "editorLineNumber.foreground": "#7b92a8",
        "editorCursor.foreground": "#0284c7",
        "editor.selectionBackground": "#cfe8f7",
        "editor.inactiveSelectionBackground": "#e2eef6",
        "editor.lineHighlightBackground": "#eaf3f9",
        "editorIndentGuide.background": "#d5e3ee",
        "editorGutter.background": "#f4f8fb"
      }
    });
  }

  function applyMonacoTheme() {
    if (!window.monaco || !monacoEditor) return;
    const theme =
      document.documentElement.dataset.theme === "light"
        ? "portable-light"
        : "portable-dark";
    monaco.editor.setTheme(theme);
  }

  function createMonacoEditor() {
    defineMonacoThemes();
    monacoEditor = monaco.editor.create(sourceEditorHost, {
      value: state.markdown || "",
      language: "markdown",
      theme:
        document.documentElement.dataset.theme === "light"
          ? "portable-light"
          : "portable-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
      lineHeight: 22,
      wordWrap: "on",
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      tabSize: 2,
      insertSpaces: true,
      padding: { top: 12, bottom: 12 },
      smoothScrolling: true,
      cursorBlinking: "smooth",
      bracketPairColorization: { enabled: true },
      fixedOverflowWidgets: true,
      find: {
        addExtraSpaceOnTop: false,
        autoFindInSelection: "multiline",
        seedSearchStringFromSelection: "always"
      }
    });

    monacoEditor.onDidChangeModelContent(() => {
      if (state.applyingEditorValue) return;
      state.markdown = monacoEditor.getValue();
      setDirty(state.markdown !== state.savedMarkdown);
      schedulePreviewUpdate();
    });

    monacoEditor.onDidScrollChange((event) => {
      if (!event.scrollTopChanged) return;
      runScrollSync(syncPreviewToEditor);
    });

    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveDocument();
    });

    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => {
      applyHelper("signal");
    });

    state.monacoReady = true;
  }

  function loadMonaco() {
    return new Promise((resolve, reject) => {
      if (window.monaco && state.monacoReady) {
        resolve(window.monaco);
        return;
      }
      if (typeof require === "undefined") {
        reject(new Error("Monaco loader failed to load"));
        return;
      }
      const vsPath = new URL("./vendor/monaco/vs", window.location.href).href.replace(/\/$/, "");
      require.config({ paths: { vs: vsPath } });
      require(["vs/editor/editor.main"], () => {
        require(
          ["vs/basic-languages/markdown/markdown"],
          (markdownLang) => {
            try {
              patchMarkdownSignalHighlight(markdownLang);
              createMonacoEditor();
              resolve(window.monaco);
            } catch (error) {
              reject(error);
            }
          },
          () => {
            try {
              createMonacoEditor();
              resolve(window.monaco);
            } catch (error) {
              reject(error);
            }
          }
        );
      }, reject);
    });
  }

  function applyTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    const themeColor = next === "light" ? "#ffffff" : "#0b1118";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = themeColor;
    applyMonacoTheme();
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (_) {
      /* ignore */
    }
  }

  function applySidebar(collapsed) {
    app.dataset.sidebar = collapsed ? "collapsed" : "open";
    sidebarToggle.setAttribute(
      "aria-label",
      collapsed ? "Expand sidebar" : "Collapse sidebar"
    );
    sidebarToggle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
    } catch (_) {
      /* ignore */
    }
    window.setTimeout(layoutEditor, 220);
  }

  function closeFloatingUi(event) {
    const target = event.target;
    if (
      !tablePicker.hidden &&
      !tablePicker.contains(target) &&
      !tableHelperButton.contains(target)
    ) {
      tablePicker.hidden = true;
      tableHelperButton.setAttribute("aria-expanded", "false");
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const isSecure =
      location.protocol === "https:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1";
    if (!isSecure) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  function bindEvents() {
    launchNew.addEventListener("click", () => {
      launchDialog.close();
      startNewDocument();
    });

    launchOpen.addEventListener("click", async () => {
      await openWithFilePicker();
      if (state.mode !== "launch") launchDialog.close();
    });

    newDocumentButton.addEventListener("click", () => {
      startNewDocument();
    });

    openDocumentButton.addEventListener("click", async () => {
      await openWithFilePicker();
    });

    saveDocumentButton.addEventListener("click", async () => {
      await saveDocument();
    });

    modeToggle.addEventListener("click", () => {
      toggleEditViewMode();
    });

    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });

    sidebarToggle.addEventListener("click", () => {
      applySidebar(app.dataset.sidebar !== "collapsed");
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      await readFromFileInput(file);
      if (launchDialog.open) launchDialog.close();
      fileInput.value = "";
    });

    document.querySelectorAll("[data-insert]").forEach((button) => {
      button.addEventListener("click", () => applyHelper(button.dataset.insert));
    });

    tableHelperButton.addEventListener("click", () => {
      const open = tablePicker.hidden;
      tablePicker.hidden = !open;
      tableHelperButton.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) paintTableGrid(state.tableRows, state.tableCols);
    });

    editorPreview.addEventListener(
      "scroll",
      () => {
        runScrollSync(syncEditorToPreview);
      },
      { passive: true }
    );

    editorFindButton.addEventListener("click", () => {
      if (!monacoEditor) return;
      layoutEditor();
      window.requestAnimationFrame(() => {
        monacoEditor.focus();
        monacoEditor.getAction("actions.find")?.run();
      });
    });

    editorReplaceButton.addEventListener("click", () => {
      if (!monacoEditor) return;
      layoutEditor();
      window.requestAnimationFrame(() => {
        monacoEditor.focus();
        monacoEditor.getAction("editor.action.startFindReplaceAction")?.run();
      });
    });

    toc.addEventListener("click", (event) => {
      const link = event.target.closest("a");
      if (!link) return;
      const id = decodeURIComponent(link.hash.slice(1));
      const root = state.mode === "edit" ? editorPreview : documentView;
      const expectedId = state.mode === "edit" ? `preview-${id}` : id;
      const target = [...root.querySelectorAll("h1, h2, h3")].find(
        (heading) => heading.id === expectedId
      );
      if (!target) return;
      event.preventDefault();
      if (state.mode === "edit") {
        const offset =
          target.getBoundingClientRect().top -
          editorPreview.getBoundingClientRect().top -
          12;
        editorPreview.scrollTo({
          top: editorPreview.scrollTop + offset,
          behavior: "smooth"
        });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        try {
          history.replaceState(null, "", `#${id}`);
        } catch (_) {
          /* ignore */
        }
      }
    });

    document.addEventListener("click", closeFloatingUi);

    document.addEventListener("click", (event) => {
      const toggle = event.target.closest(".blockio-grid-toggle");
      if (!toggle) return;
      const wrap = toggle.closest(".diagram");
      const svg = wrap && wrap.querySelector("svg.blockio-diagram");
      if (!svg) return;
      const on = svg.getAttribute("data-blockio-grid") !== "on";
      svg.setAttribute("data-blockio-grid", on ? "on" : "off");
      toggle.classList.toggle("is-active", on);
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });

    window.addEventListener("resize", layoutEditor);

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        if (state.mode === "launch") return;
        event.preventDefault();
        toggleEditViewMode();
      }
      if (event.key === "Escape" && state.mode === "edit" && tablePicker.hidden) {
        state.markdown = getEditorValue();
        setDirty(state.markdown !== state.savedMarkdown);
        setMode("view");
      }
      if (event.key === "Escape") {
        tablePicker.hidden = true;
        tableHelperButton.setAttribute("aria-expanded", "false");
      }
    });
  }

  function initThemeAndSidebar() {
    let theme = "dark";
    let sidebar = "open";
    try {
      theme = localStorage.getItem(THEME_KEY) || theme;
      sidebar = localStorage.getItem(SIDEBAR_KEY) || sidebar;
    } catch (_) {
      /* ignore */
    }
    applyTheme(theme);
    applySidebar(sidebar === "collapsed");
  }

  async function init() {
    configureMarked();
    buildTablePicker();
    bindEvents();
    initThemeAndSidebar();
    registerServiceWorker();
    setMode("launch");

    try {
      await loadMonaco();
    } catch (error) {
      console.error(error);
      setStatus("Monaco editor failed to load.");
    }

    if (typeof launchDialog.showModal === "function") {
      launchDialog.showModal();
    } else {
      launchDialog.setAttribute("open", "");
    }
  }

  init();
})();
