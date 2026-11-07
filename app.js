// 공용 코드: 백엔드(Supabase 또는 데모) + 유틸
(function () {
  const C = window.CHALKAK_CONFIG || {};
  const LIVE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);

  // ---------- utils ----------
  const U = {
    $: (s, r = document) => r.querySelector(s),
    esc: s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    slugFromHash: () => decodeURIComponent((location.hash || "").slice(1)).toLowerCase() || (C.EVENT_SLUG || "").toLowerCase(),
    validSlug: s => /^[a-z0-9-]{3,40}$/.test(s),
    pageUrl: (file, slug) => {
      const base = location.href.split("#")[0].replace(/[^/]*$/, "");
      return base + file + (slug ? "#" + slug : "");
    },
    timeAgo: iso => {
      const s = (Date.now() - new Date(iso)) / 1000;
      if (s < 60) return "방금";
      if (s < 3600) return Math.floor(s / 60) + "분 전";
      if (s < 86400) return Math.floor(s / 3600) + "시간 전";
      return new Date(iso).toLocaleDateString("ko-KR");
    },
    fmtDate: d => d ? new Date(d + "T00:00:00").toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }) : "",
    toast(msg) {
      let t = document.getElementById("toast");
      if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
      t.textContent = msg; t.classList.add("show");
      clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2400);
    },
    store: {
      get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    },
    // 사진을 업로드 전에 줄여요. 실패하면(HEIC 등) 원본 그대로.
    async shrinkImage(file, maxEdge, quality = 0.86) {
      if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
        const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
        if (scale === 1 && file.size < 1.5e6) { bmp.close?.(); return file; }
        const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(bmp, 0, 0, w, h); bmp.close?.();
        const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", quality));
        return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
      } catch (e) { return file; }
    },
    blobToDataURL: b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); })
  };

  // ---------- LIVE backend (Supabase) ----------
  function liveBackend() {
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    const bucket = C.BUCKET || "wedding-photos";
    const pub = path => sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    const mapRow = r => ({ id: r.id, url: pub(r.path), kind: r.kind, guest: r.guest_name, hidden: r.hidden, likes: r.like_count || 0, created_at: r.created_at });
    return {
      live: true,
      async createEvent({ slug, groom, bride, date, code }) {
        const { error } = await sb.rpc("create_event", { p_slug: slug, p_groom: groom, p_bride: bride, p_date: date || null, p_code: code });
        if (error) throw new Error(/duplicate|already/i.test(error.message) ? "이미 사용 중인 주소예요" : error.message);
      },
      async getEvent(slug) {
        const { data, error } = await sb.from("public_events").select("*").eq("slug", slug).maybeSingle();
        if (error) throw error;
        return data && { slug: data.slug, groom: data.groom, bride: data.bride, date: data.wedding_date };
      },
      async listPhotos(slug) {
        const { data, error } = await sb.from("photos").select("*").eq("event_slug", slug).order("created_at", { ascending: false }).limit(5000);
        if (error) throw error;
        return data.map(mapRow);
      },
      async upload(slug, file, guest) {
        const kind = file.type.startsWith("video/") ? "video" : "image";
        const ext = (file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw up.error;
        const { error } = await sb.from("photos").insert({ event_slug: slug, path, kind, guest_name: guest || null });
        if (error) throw error;
      },
      subscribe(slug, onInsert) {
        const ch = sb.channel("photos-" + slug)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "photos", filter: `event_slug=eq.${slug}` }, p => onInsert(mapRow(p.new)))
          .subscribe();
        return () => sb.removeChannel(ch);
      },
      async like(id, delta) {
        const { data, error } = await sb.rpc("like_photo", { p_id: id, p_delta: delta });
        if (error) throw error; return data;
      },
      async checkAdmin(slug, code) {
        const { data, error } = await sb.rpc("check_admin", { p_slug: slug, p_code: code });
        if (error) throw error; return !!data;
      },
      async adminList(slug, code) {
        const { data, error } = await sb.rpc("admin_list_photos", { p_slug: slug, p_code: code });
        if (error) throw error; return data.map(mapRow);
      },
      async setHidden(slug, code, id, hidden) {
        const { error } = await sb.rpc("set_photo_hidden", { p_slug: slug, p_code: code, p_id: id, p_hidden: hidden });
        if (error) throw error;
      }
    };
  }

  // ---------- DEMO backend (브라우저 안에서만) ----------
  function demoBackend() {
    const KEY = "chalkak-demo-v3";
    let mem = U.store.get(KEY, null) || { events: {}, photos: [] };
    const save = () => { if (!U.store.set(KEY, mem)) { mem.photos = mem.photos.slice(0, 30); U.store.set(KEY, mem); } };
    const listeners = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function seed() {
      const DS = C.EVENT_SLUG || "our-wedding";
      if (mem.events[DS]) return;
      mem.events[DS] = { slug: DS, groom: "규동", bride: "은주", date: "2026-12-06", code: "1234" };
      save();
    }
    const ready = seed();
    const pubRows = slug => mem.photos.filter(p => p.slug === slug).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      live: false,
      async createEvent({ slug, groom, bride, date, code }) {
        await ready; await sleep(300);
        if (mem.events[slug]) throw new Error("이미 사용 중인 주소예요");
        mem.events[slug] = { slug, groom, bride, date, code }; save();
      },
      async getEvent(slug) { await ready; const e = mem.events[slug]; return e && { slug, groom: e.groom, bride: e.bride, date: e.date }; },
      async listPhotos(slug) { await ready; return pubRows(slug).filter(p => !p.hidden).map(p => ({ ...p })); },
      async upload(slug, file, guest) {
        await sleep(350);
        let url;
        if (file.type.startsWith("video/")) url = URL.createObjectURL(file); // 데모: 새로고침하면 사라져요
        else url = await U.blobToDataURL(await U.shrinkImage(file, 900, .7));
        const row = { id: "u" + Date.now() + Math.random().toString(36).slice(2, 5), slug, url, kind: file.type.startsWith("video/") ? "video" : "image", guest, hidden: false, likes: 0, created_at: new Date().toISOString() };
        mem.photos.push(row);
        if (row.kind === "image") save();
        (listeners[slug] || []).forEach(f => f({ ...row }));
      },
      subscribe(slug, cb) { (listeners[slug] = listeners[slug] || []).push(cb); return () => listeners[slug] = listeners[slug].filter(f => f !== cb); },
      async like(id, delta) { const p = mem.photos.find(x => x.id === id); if (!p) return 0; p.likes = Math.max(0, (p.likes || 0) + delta); save(); return p.likes; },
      async checkAdmin(slug, code) { await ready; return !!mem.events[slug] && mem.events[slug].code === code; },
      async adminList(slug) { await ready; return pubRows(slug).map(p => ({ ...p })); },
      async setHidden(slug, code, id, hidden) { const p = mem.photos.find(x => x.id === id); if (p) { p.hidden = hidden; save(); } }
    };
  }

  window.U = U;
  window.Chalkak = LIVE && window.supabase ? liveBackend() : demoBackend();

})();
