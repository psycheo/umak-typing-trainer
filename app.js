(() => {
  "use strict";
  const TOTAL_TIME = 2 * 60 * 60 * 1000;
  const LAYOUT_TIME = 60 * 60 * 1000;
  const el = (id) => document.getElementById(id);
  const timer = el("timer");
  const pauseButton = el("pause-resume");
  const modeButton = el("mode-toggle");
  const layoutButton = el("layout-mode");
  const timerLabel = el("timer-label");
  const undoButton = el("undo");
  const redoButton = el("redo");
  const zoomOutButton = el("zoom-out");
  const zoomInButton = el("zoom-in");
  const zoomResetButton = el("zoom-reset");
  const correctColorButton = el("correct-color-toggle");
  const zoomLevel = el("zoom-level");
  const lineNumbersButton = el("line-numbers-toggle");
  const editorArea = el("editor-area");
  const editor = el("editor");
  const mirror = el("mirror");
  const gutter = el("gutter");
  const preview = el("preview");
  const previewEmpty = el("preview-empty");
  const status = el("status");
  const lineCount = el("line-count");
  const countLabel = el("count-label");
  const accuracy = el("accuracy");
  const errorCount = el("error-count");
  const progress = el("progress");
  const progressTrack = document.querySelector('[role="progressbar"]');
  const editorTitle = el("editor-title");
  const editorEyebrow = el("editor-eyebrow");
  const standardTip = el("standard-tip");
  const layoutTip = el("layout-tip");
  const standardFootnote = el("standard-footnote");
  const layoutFootnote = el("layout-footnote");
  const lessonMap = el("lesson-map");
  const standardState = { value: "", lastStableValue: "", undo: [], redo: [] };
  let activeMode = "standard";
  let standardCode = "";
  let layoutCode = "";
  let sourceLines = [];
  let adaptiveTasks = [];
  let adaptiveStates = [];
  const layoutState = { value: "", lastStableValue: "", undo: [], redo: [] };
  let activeTaskIndex = 0;
  let pendingSelection = null;
  let lastSelection = { start: 0, end: 0 };
  const remaining = { practice: TOTAL_TIME, layout: LAYOUT_TIME };
  const timerExpired = { practice: false, layout: false };
  let timerRunning = false;
  let lastTick = 0;
  let previewDelay = 0;
  let advanceDelay = 0;
  let missingImages = [];
  let baseCodeFontSize = 15;
  let currentCodeFontSize = 15;
  const MIN_CODE_FONT_SIZE = 11;
  const MAX_CODE_FONT_SIZE = 26;

  function stateForCurrent() {
    if (activeMode === "layout") return layoutState;
    return activeMode === "standard" ? standardState : adaptiveStates[activeTaskIndex];
  }
  function targetForCurrent() {
    if (activeMode === "layout") return layoutCode;
    return activeMode === "standard" ? standardCode : (adaptiveTasks[activeTaskIndex] ? adaptiveTasks[activeTaskIndex].target : "");
  }
  function timerKey() { return activeMode === "layout" ? "layout" : "practice"; }
  function isTimerExpired() { return timerExpired[timerKey()]; }
  function setStatus(message) { status.textContent = message; }

  function updateZoomControls() {
    const percent = Math.round(currentCodeFontSize / baseCodeFontSize * 100);
    zoomLevel.textContent = percent + "%";
    zoomOutButton.disabled = currentCodeFontSize <= MIN_CODE_FONT_SIZE;
    zoomInButton.disabled = currentCodeFontSize >= MAX_CODE_FONT_SIZE;
    zoomResetButton.disabled = currentCodeFontSize === baseCodeFontSize;
  }

  function setCodeFontSize(size) {
    currentCodeFontSize = Math.max(MIN_CODE_FONT_SIZE, Math.min(MAX_CODE_FONT_SIZE, size));
    editorArea.style.setProperty("--code-font", currentCodeFontSize + "px");
    mirror.scrollTop = editor.scrollTop;
    mirror.scrollLeft = editor.scrollLeft;
    gutter.scrollTop = editor.scrollTop;
    updateZoomControls();
  }

  function initializeZoom() {
    baseCodeFontSize = Number.parseFloat(getComputedStyle(editorArea).getPropertyValue("--code-font")) || 15;
    setCodeFontSize(baseCodeFontSize);
  }

  function toggleLineNumbers() {
    const hidden = editorArea.classList.toggle("no-line-numbers");
    const label = hidden ? "Show line numbers" : "Hide line numbers";
    lineNumbersButton.setAttribute("aria-pressed", String(!hidden));
    lineNumbersButton.setAttribute("aria-label", label);
    lineNumbersButton.title = label;
  }

  function toggleCorrectTextColor() {
    const black = editorArea.classList.toggle("black-matched");
    const colorName = black ? "Black" : "Green";
    const nextColor = black ? "green" : "black";
    correctColorButton.setAttribute("aria-pressed", String(black));
    correctColorButton.setAttribute("aria-label", "Switch correct typed characters to " + nextColor);
    correctColorButton.title = "Correct typed text: " + colorName + ". Click to switch to " + nextColor + ".";
    correctColorButton.querySelector(".line-numbers-label").textContent = colorName;
  }

  function setControlState() {
    pauseButton.disabled = !standardCode || isTimerExpired();
    modeButton.disabled = !standardCode;
    layoutButton.disabled = !layoutCode;
    pauseButton.innerHTML = timerRunning ? 'Ⅱ <span class="button-label">Pause</span>' : '▶ <span class="button-label">Resume</span>';
    pauseButton.setAttribute("aria-label", timerRunning ? "Pause timer" : "Resume timer");
    undoButton.disabled = !stateForCurrent() || stateForCurrent().undo.length === 0;
    redoButton.disabled = !stateForCurrent() || stateForCurrent().redo.length === 0;
    modeButton.setAttribute("aria-pressed", String(activeMode === "adaptive"));
    modeButton.classList.toggle("is-active", activeMode === "adaptive");
    modeButton.textContent = activeMode === "standard" ? "Adaptive Learning" : "Full Page Practice";
    layoutButton.setAttribute("aria-pressed", String(activeMode === "layout"));
    layoutButton.classList.toggle("is-active", activeMode === "layout");
  }

  function renderTimer() {
    const totalSeconds = Math.ceil(remaining[timerKey()] / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    timer.textContent = hours + ":" + minutes + ":" + seconds;
    timer.setAttribute("aria-label", hours + " hours, " + minutes + " minutes, " + seconds + " seconds remaining");
    timerLabel.textContent = timerKey() === "layout" ? "LAYOUT SPRINT" : "TIME LEFT";
  }

  function expireTimer() {
    timerExpired[timerKey()] = true;
    timerRunning = false;
    editor.readOnly = true;
    window.clearTimeout(advanceDelay);
    setStatus(activeMode === "layout" ? "Your one-hour layout sprint is up." : "Time is up. Refresh the page to start a new attempt.");
    setControlState();
  }
  function tickTimer() {
    if (!timerRunning) return;
    const now = performance.now();
    const key = timerKey();
    remaining[key] = Math.max(0, remaining[key] - (now - lastTick));
    lastTick = now;
    renderTimer();
    if (remaining[key] === 0) expireTimer();
  }
  function firstIncompleteTask() {
    const found = adaptiveStates.findIndex((state, index) => state.value !== adaptiveTasks[index].target);
    return found < 0 ? adaptiveTasks.length - 1 : found;
  }
  function toggleTimer() {
    if (timerRunning) {
      tickTimer();
      if (isTimerExpired()) return;
      timerRunning = false;
      editor.readOnly = true;
      window.clearTimeout(advanceDelay);
      setStatus(activeMode === "layout" ? "Layout sprint paused. Resume when you are ready." : "Timer paused. Resume when you are ready.");
    } else if (!isTimerExpired()) {
      timerRunning = true;
      editor.readOnly = false;
      lastTick = performance.now();
      setStatus(activeMode === "layout" ? "One-hour layout sprint running. Build the page structure." : "Timer running. Keep typing the code in order.");
      if (activeMode === "adaptive" && stateForCurrent().value === targetForCurrent()) scheduleAdaptiveAdvance(activeTaskIndex);
    }
    setControlState();
  }

  function renderLineNumbers() {
    const count = Math.max(1, targetForCurrent().split("\n").length);
    gutter.textContent = Array.from({ length: count }, (_, index) => index + 1).join("\n");
    gutter.scrollTop = editor.scrollTop;
  }
  function appendRun(kind, text) {
    if (!text) return;
    const node = document.createElement("span");
    if (kind) node.className = kind;
    node.textContent = text;
    mirror.appendChild(node);
  }
  function renderMirror() {
    const value = editor.value;
    const target = targetForCurrent();
    const total = Math.max(target.length, value.length);
    mirror.replaceChildren();
    let runKind = null;
    let runText = "";
    for (let index = 0; index < total; index++) {
      let kind;
      let character;
      if (index >= value.length) {
        kind = "prompt";
        character = target[index];
      } else if (index < target.length && value[index] === target[index]) {
        kind = "matched";
        character = value[index];
      } else {
        kind = "mistake";
        character = value[index];
      }
      if (kind !== runKind) {
        appendRun(runKind === "prompt" ? "" : runKind, runText);
        runKind = kind;
        runText = "";
      }
      runText += character;
    }
    appendRun(runKind === "prompt" ? "" : runKind, runText);
    mirror.scrollTop = editor.scrollTop;
    mirror.scrollLeft = editor.scrollLeft;
    gutter.scrollTop = editor.scrollTop;
  }

  function renderStatusForValue(value, errors) {
    if (isTimerExpired()) {
      setStatus(activeMode === "layout" ? "Your one-hour layout sprint is up." : "Time is up. Refresh the page to start a new attempt.");
      return;
    }
    const target = targetForCurrent();
    if (value === target) {
      if (activeMode === "layout") setStatus("HTML structure complete. Your section IDs and classes are ready for CSS styling.");
      else if (activeMode === "standard") setStatus("The full formatted competition page matches. Code complete!");
      else if (activeTaskIndex === adaptiveTasks.length - 1 && adaptiveStates.every((part, index) => part.value === adaptiveTasks[index].target)) {
        setStatus("All adaptive components are complete. You built the full page.");
      } else {
        const task = adaptiveTasks[activeTaskIndex];
        setStatus(task.component + " · " + task.phase + " complete. Review it or choose the next available part below.");
      }
    } else if (value.length === 0) {
      if (activeMode === "adaptive") {
        const task = adaptiveTasks[activeTaskIndex];
        setStatus("Type the faint " + task.phase.toLowerCase() + " prompt for " + task.component + ".");
      } else if (activeMode === "layout") setStatus(timerRunning ? "Type the faint HTML-only prompt and place each page section." : "Layout sprint paused. Resume when you are ready.");
      else setStatus(timerRunning ? "Start typing to build the live preview." : "Timer paused. Resume when you are ready.");
    } else if (errors > 0) {
      setStatus(errors + " character" + (errors === 1 ? "" : "s") + " need" + (errors === 1 ? "s" : "") + " correction. Backspace or use Undo.");
    } else setStatus("Everything typed so far matches the prompt.");
  }

  function totalAdaptiveCharacters() {
    return adaptiveTasks.reduce((sum, task) => sum + task.target.length, 0);
  }
  function renderStats() {
    const value = editor.value;
    const target = targetForCurrent();
    let correct = 0;
    for (let index = 0; index < value.length; index++) {
      if (index < target.length && value[index] === target[index]) correct++;
    }
    const errors = value.length - correct;
    const accuracyPercent = errors
      ? Math.min(99.9, Math.floor(correct / value.length * 1000) / 10)
      : 100;
    accuracy.textContent = accuracyPercent + "%";
    errorCount.textContent = String(errors);
    if (activeMode !== "adaptive") {
      countLabel.textContent = "LINE";
      const targetLineCount = Math.max(1, target.split("\n").length);
      const line = Math.min(targetLineCount, value.slice(0, editor.selectionStart).split("\n").length);
      lineCount.textContent = line + " / " + targetLineCount;
      const done = target.length ? Math.min(100, value.length / target.length * 100) : 0;
      progress.style.width = done + "%";
      progressTrack.setAttribute("aria-valuenow", String(Math.round(done)));
    } else {
      countLabel.textContent = "PART";
      lineCount.textContent = String(activeTaskIndex + 1).padStart(2, "0") + " / " + adaptiveTasks.length;
      const typed = adaptiveStates.reduce((sum, state, index) => sum + Math.min(state.value.length, adaptiveTasks[index].target.length), 0);
      const done = totalAdaptiveCharacters() ? Math.min(100, typed / totalAdaptiveCharacters() * 100) : 0;
      progress.style.width = done + "%";
      progressTrack.setAttribute("aria-valuenow", String(Math.round(done)));
    }
    renderStatusForValue(value, errors);
  }

  function enhancePreview(source) {
    const openHead = source.match(/<head\b[^>]*>/i);
    if (!openHead) return source;
    const base = '<base href="' + document.baseURI.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '">';
    const rules = missingImages.map((name) => 'figure img[src=' + JSON.stringify(name) + ']{opacity:0}').join("\n");
    const fallback = rules ? "<style>" + rules + "</style>" : "";
    return source.replace(openHead[0], openHead[0] + base + fallback);
  }

  function currentAdaptiveValue(index) {
    if (activeMode === "adaptive" && index === activeTaskIndex) return editor.value;
    return adaptiveStates[index] ? adaptiveStates[index].value : "";
  }
  function buildAdaptivePreview() {
    if (!adaptiveTasks.length) return "";
    const foundation = currentAdaptiveValue(0);
    if (!foundation.trim()) return "";
    const styles = [];
    const regions = { navigation: [], hero: [], banner: [], main: [], footer: [] };
    adaptiveTasks.forEach((task, index) => {
      if (index === 0) return;
      const value = currentAdaptiveValue(index);
      if (!value.trim()) return;
      if (task.type === "css") styles.push(value);
      if (task.region) regions[task.region].push(value);
    });
    let page = foundation;
    if (styles.length) page = page.replace(/<\/style>/i, styles.join("\n") + "\n</style>");
    let navigation = regions.navigation.join("\n");
    const hero = regions.hero.join("\n");
    if (hero) {
      navigation = navigation.replace(/<\/div>\s*<\/header>\s*$/, "");
      navigation += "\n" + hero + "\n</div></header>";
    }
    page = page.replace(/<body\b[^>]*>/i, (opening) => opening + "\n" + navigation + "\n" + regions.banner.join("\n"));
    page = page.replace(/<\/main>/i, regions.main.join("\n") + "\n</main>");
    page = page.replace(/<\/body>/i, regions.footer.join("\n") + "\n</body>");
    return page;
  }
  function queuePreview() {
    window.clearTimeout(previewDelay);
    previewDelay = window.setTimeout(() => {
      const source = activeMode === "adaptive" ? buildAdaptivePreview() : editor.value;
      preview.srcdoc = enhancePreview(source);
      const hasStructure = activeMode === "adaptive" ? currentAdaptiveValue(0).trim().length > 0 : editor.value.trim().length > 0;
      previewEmpty.hidden = hasStructure;
    }, 180);
  }

  function renderLessonMap() {
    lessonMap.replaceChildren();
    const nextOpen = firstIncompleteTask();
    adaptiveTasks.forEach((task, index) => {
      const complete = adaptiveStates[index].value === task.target;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lesson-chip";
      if (complete) button.classList.add("is-complete");
      if (index === activeTaskIndex) button.classList.add("is-current");
      button.disabled = index > nextOpen;
      button.setAttribute("aria-current", index === activeTaskIndex ? "step" : "false");
      const badge = document.createElement("span");
      badge.className = "lesson-index";
      badge.textContent = complete ? "✓" : String(index + 1).padStart(2, "0");
      const label = document.createElement("span");
      label.className = "lesson-label";
      label.textContent = task.component + " · " + task.phase;
      button.append(badge, label);
      button.addEventListener("click", () => setAdaptiveTask(index));
      lessonMap.appendChild(button);
    });
  }
  function renderModeLabels() {
    if (activeMode === "standard") {
      editorEyebrow.textContent = "02 / TYPE THE FAINT PROMPT";
      editorTitle.textContent = "Code practice";
      editor.setAttribute("aria-label", "Type the full competition page code shown in faint gray");
      standardTip.hidden = false;
      layoutTip.hidden = true;
      lessonMap.hidden = true;
      standardFootnote.hidden = false;
      layoutFootnote.hidden = true;
    } else if (activeMode === "layout") {
      editorEyebrow.textContent = "ONE-HOUR HTML LAYOUT SPRINT";
      editorTitle.textContent = "HTML structure practice";
      editor.setAttribute("aria-label", "Type the HTML-only layout prompt shown in faint gray");
      standardTip.hidden = true;
      layoutTip.hidden = false;
      lessonMap.hidden = true;
      standardFootnote.hidden = true;
      layoutFootnote.hidden = false;
    } else {
      const task = adaptiveTasks[activeTaskIndex];
      editorEyebrow.textContent = "ADAPTIVE LEARNING · PART " + String(activeTaskIndex + 1).padStart(2, "0") + " OF " + adaptiveTasks.length;
      editorTitle.textContent = task.component + " · " + task.phase;
      editor.setAttribute("aria-label", "Type the current adaptive component shown in faint gray");
      standardTip.hidden = true;
      layoutTip.hidden = true;
      lessonMap.hidden = false;
      standardFootnote.hidden = false;
      layoutFootnote.hidden = true;
    }
  }
  function updateView() {
    renderMirror();
    renderStats();
    renderModeLabels();
    renderLessonMap();
    queuePreview();
  }

  function findChange(before, after) {
    let start = 0;
    while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
    let suffix = 0;
    while (suffix < before.length - start && suffix < after.length - start && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
    return { start, removed: before.slice(start, before.length - suffix), inserted: after.slice(start, after.length - suffix) };
  }
  function scheduleAdaptiveAdvance(completedIndex) {
    window.clearTimeout(advanceDelay);
    if (activeMode !== "adaptive" || completedIndex >= adaptiveTasks.length - 1 || !timerRunning || isTimerExpired()) return;
    advanceDelay = window.setTimeout(() => {
      if (activeMode === "adaptive" && activeTaskIndex === completedIndex && stateForCurrent().value === targetForCurrent() && timerRunning) setAdaptiveTask(completedIndex + 1, true);
    }, 900);
  }
  function recordInput() {
    const state = stateForCurrent();
    const after = editor.value;
    if (after === state.lastStableValue) return;
    const change = findChange(state.lastStableValue, after);
    state.undo.push({ ...change, selectionBefore: pendingSelection || lastSelection, selectionAfter: { start: editor.selectionStart, end: editor.selectionEnd } });
    state.redo.length = 0;
    state.value = state.lastStableValue = after;
    pendingSelection = null;
    lastSelection = { start: editor.selectionStart, end: editor.selectionEnd };
    setControlState();
    updateView();
    if (activeMode === "adaptive" && after === targetForCurrent()) scheduleAdaptiveAdvance(activeTaskIndex);
  }
  function applyUndo() {
    const state = stateForCurrent();
    const change = state.undo.pop();
    if (!change) return;
    editor.value = editor.value.slice(0, change.start) + change.removed + editor.value.slice(change.start + change.inserted.length);
    editor.setSelectionRange(change.selectionBefore.start, change.selectionBefore.end);
    state.redo.push(change);
    state.value = state.lastStableValue = editor.value;
    lastSelection = { start: editor.selectionStart, end: editor.selectionEnd };
    setControlState();
    updateView();
  }
  function applyRedo() {
    const state = stateForCurrent();
    const change = state.redo.pop();
    if (!change) return;
    editor.value = editor.value.slice(0, change.start) + change.inserted + editor.value.slice(change.start + change.removed.length);
    editor.setSelectionRange(change.selectionAfter.start, change.selectionAfter.end);
    state.undo.push(change);
    state.value = state.lastStableValue = editor.value;
    lastSelection = { start: editor.selectionStart, end: editor.selectionEnd };
    setControlState();
    updateView();
  }
  function insertTab() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    pendingSelection = { start, end };
    editor.setRangeText("\t", start, end, "end");
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "\t" }));
  }

  function makeTask(component, phase, type, numbers, region) {
    return { component, phase, type, region: region || "", target: numbers.map((line) => sourceLines[line - 1]).join("\n") };
  }
  function buildAdaptiveTasks() {
    const range = (first, last) => Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
    return [
      makeTask("Document structure", "HTML", "foundation", [...range(1, 35), ...range(270, 272), 309, 375, 382, 383]),
      makeTask("Navigation", "CSS", "css", range(36, 77)),
      makeTask("Navigation", "HTML", "markup", [...range(273, 285), 304, 305], "navigation"),
      makeTask("Hero", "CSS", "css", range(78, 128)),
      makeTask("Hero", "HTML", "markup", range(286, 303), "hero"),
      makeTask("Banner", "CSS", "css", range(129, 136)),
      makeTask("Banner", "HTML", "markup", range(306, 308), "banner"),
      makeTask("Gallery", "CSS", "css", range(137, 184)),
      makeTask("Gallery", "HTML", "markup", range(310, 338), "main"),
      makeTask("About section", "CSS", "css", range(185, 199)),
      makeTask("About section", "HTML", "markup", range(339, 353), "main"),
      makeTask("IT Skills Olympics", "CSS", "css", range(200, 216)),
      makeTask("IT Skills Olympics", "HTML", "markup", range(354, 366), "main"),
      makeTask("Contact section", "CSS", "css", range(217, 221)),
      makeTask("Contact section", "HTML", "markup", range(367, 374), "main"),
      makeTask("Footer", "CSS", "css", range(222, 230)),
      makeTask("Footer", "HTML", "markup", range(376, 381), "footer"),
      makeTask("Responsive layout", "CSS", "css", range(231, 269))
    ];
  }
  function setAdaptiveTask(index, keepFocus) {
    if (index < 0 || index >= adaptiveTasks.length || index > firstIncompleteTask()) return;
    window.clearTimeout(advanceDelay);
    activeTaskIndex = index;
    editor.value = stateForCurrent().value;
    editor.readOnly = isTimerExpired() || !timerRunning;
    editor.scrollTop = 0;
    editor.scrollLeft = 0;
    pendingSelection = null;
    lastSelection = { start: editor.selectionStart, end: editor.selectionEnd };
    renderLineNumbers();
    setControlState();
    updateView();
    if (keepFocus && timerRunning) editor.focus({ preventScroll: true });
  }
  function setMode(nextMode) {
    if (nextMode === activeMode) return;
    if (timerRunning) tickTimer();
    window.clearTimeout(advanceDelay);
    activeMode = nextMode;
    if (activeMode === "adaptive") activeTaskIndex = firstIncompleteTask();
    editor.value = stateForCurrent().value;
    editor.readOnly = isTimerExpired() || !timerRunning;
    editor.scrollTop = 0;
    editor.scrollLeft = 0;
    pendingSelection = null;
    lastSelection = { start: editor.selectionStart, end: editor.selectionEnd };
    renderTimer();
    renderLineNumbers();
    setControlState();
    updateView();
    if (timerRunning) lastTick = performance.now();
    if (timerRunning) editor.focus({ preventScroll: true });
  }
  function switchMode() {
    setMode(activeMode === "standard" ? "adaptive" : "standard");
  }
  function switchLayoutMode() {
    setMode(activeMode === "layout" ? "standard" : "layout");
  }

  async function inspectMissingImages(sources) {
    const results = await Promise.all(sources.map(async (source) => {
      try {
        const response = await fetch(new URL(source, document.baseURI), { method: "HEAD", cache: "no-store" });
        return response.ok ? null : source;
      } catch (_) { return source; }
    }));
    return results.filter(Boolean);
  }
  async function loadPrompt() {
    try {
      const response = await fetch("target.html", { cache: "no-store" });
      if (!response.ok) throw new Error("target.html was not found");
      const raw = (await response.text()).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
      standardCode = raw.replace(/\n+$/, "");
      layoutCode = standardCode.replace(/\n[ \t]*<style\b[^>]*>[\s\S]*?<\/style>[ \t]*\n/i, "\n").replace(/\n+$/, "");
      sourceLines = standardCode.split("\n");
      adaptiveTasks = buildAdaptiveTasks();
      adaptiveStates = adaptiveTasks.map(() => ({ value: "", lastStableValue: "", undo: [], redo: [] }));
      const imageMatches = [...standardCode.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)];
      missingImages = await inspectMissingImages([...new Set(imageMatches.map((match) => match[1]))]);
      renderLineNumbers();
      editor.disabled = false;
      updateView();
      timerRunning = true;
      editor.readOnly = false;
      lastTick = performance.now();
      renderTimer();
      setControlState();
      window.setInterval(tickTimer, 200);
      editor.focus({ preventScroll: true });
    } catch (_) {
      editor.disabled = true;
      timer.textContent = "--:--:--";
      setStatus("Could not load target.html. Open the project through XAMPP at http://localhost/umak-typing-trainer/.");
    }
  }

  editor.addEventListener("beforeinput", () => { pendingSelection = { start: editor.selectionStart, end: editor.selectionEnd }; });
  editor.addEventListener("input", recordInput);
  editor.addEventListener("scroll", () => {
    mirror.scrollTop = editor.scrollTop;
    mirror.scrollLeft = editor.scrollLeft;
    gutter.scrollTop = editor.scrollTop;
  });
  editor.addEventListener("click", () => { lastSelection = { start: editor.selectionStart, end: editor.selectionEnd }; renderStats(); });
  editor.addEventListener("keyup", () => { lastSelection = { start: editor.selectionStart, end: editor.selectionEnd }; renderStats(); });
  editor.addEventListener("select", () => { lastSelection = { start: editor.selectionStart, end: editor.selectionEnd }; });
  editor.addEventListener("keydown", (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) applyRedo(); else applyUndo();
    } else if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      applyRedo();
    } else if (event.key === "Tab") {
      event.preventDefault();
      insertTab();
    } else if (event.key === "Enter") {
      const caret = editor.selectionStart;
      const nextPromptCharacter = targetForCurrent()[caret];
      if (caret !== editor.value.length || nextPromptCharacter !== "\n") {
        event.preventDefault();
        setStatus("Finish the faint text on this line first. Enter works at the prompt’s line breaks.");
      }
    }
  });
  editor.addEventListener("paste", (event) => {
    event.preventDefault();
    setStatus("Paste is disabled so this stays a typing practice. Type the next character instead.");
  });
  editor.addEventListener("drop", (event) => event.preventDefault());
  pauseButton.addEventListener("click", toggleTimer);
  modeButton.addEventListener("click", switchMode);
  layoutButton.addEventListener("click", switchLayoutMode);
  undoButton.addEventListener("click", () => { applyUndo(); editor.focus({ preventScroll: true }); });
  redoButton.addEventListener("click", () => { applyRedo(); editor.focus({ preventScroll: true }); });
  zoomOutButton.addEventListener("click", () => setCodeFontSize(currentCodeFontSize - 1));
  zoomInButton.addEventListener("click", () => setCodeFontSize(currentCodeFontSize + 1));
  zoomResetButton.addEventListener("click", () => setCodeFontSize(baseCodeFontSize));
  lineNumbersButton.addEventListener("click", toggleLineNumbers);
  correctColorButton.addEventListener("click", toggleCorrectTextColor);
  window.addEventListener("beforeunload", () => {
    window.clearTimeout(previewDelay);
    window.clearTimeout(advanceDelay);
  });
  initializeZoom();
  loadPrompt();
})();
