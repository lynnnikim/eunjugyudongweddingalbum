// 갤러리 그리드 + 라이트박스 (하객/관리 페이지 공용)
(function () {
  const { esc } = window.U;

  // opts: { likes:bool, liked:Set, selecting:bool, selected:Set, newIds:Set }
  function tileHTML(p, i, o) {
    const media = p.kind === "video"
      ? `<video src="${esc(p.url)}#t=0.1" muted playsinline preload="metadata"></video><span class="vid">▶ 영상</span>`
      : `<img src="${esc(p.url)}" alt="" loading="lazy">`;
    const like = o.likes
      ? `<span class="like${o.liked?.has(p.id) ? " on" : ""}" data-like="${esc(p.id)}"><b>♥</b>${p.likes || 0}</span>` : "";
    const sel = o.selecting ? `<span class="chk${o.selected?.has(p.id) ? " on" : ""}">✓</span>` : "";
    const cls = ["tile", o.newIds?.has(p.id) && "new", p.hidden && "hidden-photo", o.selecting && o.selected?.has(p.id) && "picked"].filter(Boolean).join(" ");
    return `<button class="${cls}" data-i="${i}">${media}${like}${sel}</button>`;
  }

  function renderGrid(el, items, o = {}) {
    if (o instanceof Set) o = { newIds: o };
    el.innerHTML = items.map((p, i) => tileHTML(p, i, o)).join("");
  }

  let lb, list = [], idx = 0, extra = null;
  function ensure() {
    if (lb) return;
    lb = document.createElement("div");
    lb.className = "lb";
    lb.innerHTML = `<div class="bar"><span id="lbCount"></span><span id="lbExtra"></span><button id="lbClose" aria-label="닫기">×</button></div>
      <div class="stagebox"><div id="lbMedia" style="display:contents"></div>
      <button class="nav prev" aria-label="이전">‹</button><button class="nav next" aria-label="다음">›</button></div>
      <div class="foot" id="lbFoot"></div>`;
    document.body.appendChild(lb);
    lb.querySelector("#lbClose").onclick = close;
    lb.querySelector(".prev").onclick = () => go(-1);
    lb.querySelector(".next").onclick = () => go(1);
    document.addEventListener("keydown", e => {
      if (!lb.classList.contains("show")) return;
      if (e.key === "Escape") close(); if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1);
    });
    let sx = null;
    lb.addEventListener("touchstart", e => sx = e.touches[0].clientX, { passive: true });
    lb.addEventListener("touchend", e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); sx = null; });
  }
  function draw() {
    const p = list[idx];
    lb.querySelector("#lbMedia").innerHTML = p.kind === "video"
      ? `<video src="${esc(p.url)}" controls playsinline autoplay></video>`
      : `<img src="${esc(p.url)}" alt="">`;
    lb.querySelector("#lbCount").textContent = `${idx + 1} / ${list.length}`;
    lb.querySelector("#lbFoot").textContent = (p.guest ? `${p.guest} 님이 올림 · ` : "") + window.U.timeAgo(p.created_at);
    const ex = lb.querySelector("#lbExtra"); ex.innerHTML = "";
    if (extra) ex.appendChild(extra(p, draw));
  }
  function go(d) { if (!list.length) return; idx = (idx + d + list.length) % list.length; draw(); }
  function close() { lb.classList.remove("show"); lb.querySelector("#lbMedia").innerHTML = ""; document.body.style.overflow = ""; }
  function open(items, i, extraFn) { ensure(); list = items; idx = i; extra = extraFn || null; lb.classList.add("show"); document.body.style.overflow = "hidden"; draw(); }

  // handlers: { onLike(id), onSelect(p) , isSelecting() }
  function bindGrid(el, getItems, extraFn, handlers = {}) {
    el.addEventListener("click", e => {
      const lk = e.target.closest("[data-like]");
      if (lk && handlers.onLike && !(handlers.isSelecting && handlers.isSelecting())) { e.stopPropagation(); handlers.onLike(lk.dataset.like); return; }
      const t = e.target.closest(".tile"); if (!t) return;
      const items = getItems(), p = items[+t.dataset.i];
      if (handlers.isSelecting && handlers.isSelecting()) { handlers.onSelect(p); return; }
      open(items, +t.dataset.i, extraFn);
    });
  }

  window.Gallery = { renderGrid, bindGrid, open };
})();
