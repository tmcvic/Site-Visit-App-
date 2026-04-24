/* ============================================================
   Site Visit — PWA
   Offline-first media capture + PDF report generation.
   All data lives in IndexedDB on the device.
   ============================================================ */

(() => {
  'use strict';

  /* ---------- Utilities ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const uuid = () => {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const fmtDate = iso => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  const fmtDateTime = iso => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return ''; }
  };

  const escapeHtml = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const toast = (msg, ms = 1800) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  };

  const spinner = {
    show(label = 'Working…') {
      $('#spinner-label').textContent = label;
      $('#spinner').classList.add('active');
    },
    hide() { $('#spinner').classList.remove('active'); }
  };

  /* ---------- Modal helpers ---------- */

  const modal = {
    open(id) { $(id).classList.add('active'); },
    close(id) { $(id).classList.remove('active'); }
  };

  const confirmModal = (title, body) => new Promise(resolve => {
    $('#confirm-title').textContent = title;
    $('#confirm-body').textContent = body || '';
    modal.open('#modal-confirm');
    const cleanup = (result) => {
      $('#confirm-ok').removeEventListener('click', onOk);
      $('#confirm-cancel').removeEventListener('click', onCancel);
      modal.close('#modal-confirm');
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    $('#confirm-ok').addEventListener('click', onOk);
    $('#confirm-cancel').addEventListener('click', onCancel);
  });

  /* ---------- IndexedDB ---------- */

  const DB_NAME = 'site-visit-db';
  const DB_VERSION = 1;
  let dbPromise = null;

  const openDB = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) {
          const s = db.createObjectStore('projects', { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('media')) {
          const s = db.createObjectStore('media', { keyPath: 'id' });
          s.createIndex('projectId', 'projectId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  };

  const tx = async (stores, mode, fn) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const result = fn(t);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    });
  };

  const db = {
    // Projects
    async createProject({ name, address }) {
      const p = {
        id: uuid(),
        name: name.trim(),
        address: (address || '').trim(),
        createdAt: new Date().toISOString(),
        status: 'in_progress'
      };
      await tx(['projects'], 'readwrite', t => t.objectStore('projects').add(p));
      return p;
    },
    async updateProject(p) {
      await tx(['projects'], 'readwrite', t => t.objectStore('projects').put(p));
      return p;
    },
    async getProject(id) {
      return tx(['projects'], 'readonly', t => new Promise((res, rej) => {
        const r = t.objectStore('projects').get(id);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
      }));
    },
    async listProjects() {
      return tx(['projects'], 'readonly', t => new Promise((res, rej) => {
        const out = [];
        const cursor = t.objectStore('projects').index('createdAt').openCursor(null, 'prev');
        cursor.onsuccess = e => {
          const c = e.target.result;
          if (c) { out.push(c.value); c.continue(); } else res(out);
        };
        cursor.onerror = () => rej(cursor.error);
      }));
    },
    async deleteProject(id) {
      const list = await db.listMedia(id);
      await tx(['projects', 'media'], 'readwrite', t => {
        const pStore = t.objectStore('projects');
        const mStore = t.objectStore('media');
        pStore.delete(id);
        list.forEach(m => mStore.delete(m.id));
      });
    },

    // Media
    async addMedia(m) {
      await tx(['media'], 'readwrite', t => t.objectStore('media').add(m));
      return m;
    },
    async updateMedia(m) {
      await tx(['media'], 'readwrite', t => t.objectStore('media').put(m));
      return m;
    },
    async getMedia(id) {
      return tx(['media'], 'readonly', t => new Promise((res, rej) => {
        const r = t.objectStore('media').get(id);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
      }));
    },
    async listMedia(projectId) {
      return tx(['media'], 'readonly', t => new Promise((res, rej) => {
        const out = [];
        const r = t.objectStore('media').index('projectId').openCursor(IDBKeyRange.only(projectId));
        r.onsuccess = e => {
          const c = e.target.result;
          if (c) { out.push(c.value); c.continue(); }
          else {
            out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            res(out);
          }
        };
        r.onerror = () => rej(r.error);
      }));
    },
    async deleteMedia(id) {
      await tx(['media'], 'readwrite', t => t.objectStore('media').delete(id));
    },
    async reorderMedia(projectId, orderedIds) {
      const items = await db.listMedia(projectId);
      const byId = new Map(items.map(m => [m.id, m]));
      await tx(['media'], 'readwrite', t => {
        const store = t.objectStore('media');
        orderedIds.forEach((id, idx) => {
          const m = byId.get(id);
          if (m) { m.order = idx; store.put(m); }
        });
      });
    }
  };

  /* ---------- Router (hash-based) ---------- */

  const routes = [
    { pattern: /^#?\/?$/,                          view: 'home' },
    { pattern: /^#\/project\/([^/]+)$/,            view: 'capture' },
    { pattern: /^#\/project\/([^/]+)\/report$/,    view: 'report' },
    { pattern: /^#\/project\/([^/]+)\/media\/([^/]+)$/, view: 'detail' }
  ];

  const navigate = path => { location.hash = path; };

  const showView = id => {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
    window.scrollTo(0, 0);
  };

  const handleRoute = async () => {
    const h = location.hash || '#/';
    for (const r of routes) {
      const m = h.match(r.pattern);
      if (m) {
        try {
          if (r.view === 'home')    await renderHome();
          if (r.view === 'capture') await renderCapture(m[1]);
          if (r.view === 'report')  await renderReport(m[1]);
          if (r.view === 'detail')  await renderDetail(m[1], m[2]);
        } catch (e) {
          console.error(e);
          toast('Something went wrong');
        }
        return;
      }
    }
    navigate('/');
  };

  window.addEventListener('hashchange', handleRoute);

  /* ---------- View: Home ---------- */

  async function renderHome() {
    showView('view-home');
    const projects = await db.listProjects();
    const container = $('#projects-container');

    if (!projects.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="eyebrow">Empty</div>
          <h2 class="display display-md">No walks logged yet.</h2>
          <div class="msg">Start one when you get to the farm.</div>
        </div>`;
      $('#home-subtitle').textContent = 'Your tours';
      return;
    }

    $('#home-subtitle').textContent = `${projects.length} tour${projects.length === 1 ? '' : 's'}`;

    // Build cards with first-captured media as cover (if any)
    const cards = await Promise.all(projects.map(async p => {
      const media = await db.listMedia(p.id);
      const coverBlob = media[0] ? (media[0].type === 'image' ? media[0].blob : media[0].thumbnail) : null;
      const coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : null;
      const statusLabel = p.status === 'in_progress' ? 'In progress' : 'Closed';
      const statusClass = p.status === 'in_progress' ? '' : 'closed';
      const countTxt = `${media.length} record${media.length === 1 ? '' : 's'}`;
      return `
        <button class="project-card ${escapeHtml(p.status)}" data-id="${escapeHtml(p.id)}">
          <div class="cover" ${coverUrl ? `style="background-image:url(${coverUrl});"` : ''}>
            ${!coverUrl ? `
              <div class="cover-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
              </div>
            ` : ''}
            <div class="status-tag ${statusClass}">${statusLabel}</div>
            ${media.length ? `<div class="count-chip">${escapeHtml(countTxt)}</div>` : ''}
          </div>
          <div class="meta-row">
            <div class="name">${escapeHtml(p.name)}</div>
            ${p.address ? `<div class="address">${escapeHtml(p.address)}</div>` : ''}
            <div class="date-line">${escapeHtml(fmtDate(p.createdAt))}</div>
          </div>
        </button>
      `;
    }));
    container.innerHTML = `<div class="projects-feed">${cards.join('')}</div>`;

    $$('.project-card', container).forEach(card => {
      let holdTimer = null;
      let longPressFired = false;

      const tryDelete = async () => {
        longPressFired = true;
        const id = card.dataset.id;
        const p = projects.find(x => x.id === id);
        if (!p) return;
        const ok = await confirmModal('Delete this tour?', `"${p.name}" and every photo in it goes away. Can't be undone.`);
        if (ok) { await db.deleteProject(id); renderHome(); toast('Tour deleted'); }
      };

      card.addEventListener('click', (e) => {
        if (longPressFired) { longPressFired = false; e.preventDefault(); return; }
        const id = card.dataset.id;
        const p = projects.find(x => x.id === id);
        if (!p) return;
        navigate(p.status === 'in_progress' ? `/project/${id}` : `/project/${id}/report`);
      });
      // Long-press (600ms) opens the delete confirm — works on iOS where contextmenu doesn't fire.
      card.addEventListener('touchstart', () => {
        longPressFired = false;
        holdTimer = setTimeout(tryDelete, 600);
      }, { passive: true });
      card.addEventListener('touchmove', () => clearTimeout(holdTimer), { passive: true });
      card.addEventListener('touchend', () => clearTimeout(holdTimer));
      card.addEventListener('touchcancel', () => clearTimeout(holdTimer));
      // Desktop fallback
      card.addEventListener('contextmenu', async e => {
        e.preventDefault();
        await tryDelete();
        longPressFired = false;
      });
    });
  }

  $('#btn-new-project').addEventListener('click', () => {
    $('#new-name').value = '';
    $('#new-address').value = '';
    modal.open('#modal-new');
    setTimeout(() => $('#new-name').focus(), 100);
  });
  $('#new-cancel').addEventListener('click', () => modal.close('#modal-new'));
  $('#new-create').addEventListener('click', async () => {
    const name = $('#new-name').value.trim();
    const address = $('#new-address').value.trim();
    if (!name) { toast('Give it a name first.'); return; }
    const p = await db.createProject({ name, address });
    modal.close('#modal-new');
    toast('Tour started');
    navigate(`/project/${p.id}`);
  });

  /* ---------- View: Capture ---------- */

  let captureState = { projectId: null, currentMedia: null, currentBlob: null, currentType: null };

  async function renderCapture(projectId) {
    const p = await db.getProject(projectId);
    if (!p) { navigate('/'); return; }
    showView('view-capture');

    captureState = { projectId, currentMedia: null, currentBlob: null, currentType: null };

    const mediaCount = (await db.listMedia(projectId)).length;
    $('#capture-project-name').textContent = p.name;
    $('#capture-project-meta').textContent =
      [p.address, `${mediaCount} record${mediaCount === 1 ? '' : 's'}`, fmtDate(p.createdAt)].filter(Boolean).join(' · ');

    // Reset fields
    $('#media-title').value = '';
    $('#media-description').value = '';
    $('#capture-stage').innerHTML = `
      <div class="placeholder">
        <div class="eyebrow">New record</div>
        <div>Tap Photo or Video to begin.</div>
      </div>`;
    $('#file-photo').value = '';
    $('#file-video').value = '';
  }

  const loadCapturedFile = async (file, type) => {
    if (!file) return;
    captureState.currentBlob = file;
    captureState.currentType = type;
    const url = URL.createObjectURL(file);
    const stage = $('#capture-stage');
    if (type === 'image') {
      stage.innerHTML = `<img alt="preview" src="${url}"/>`;
    } else {
      stage.innerHTML = `<video playsinline controls muted src="${url}"></video><div class="video-badge">VIDEO</div>`;
    }
  };

  $('#file-photo').addEventListener('change', e => loadCapturedFile(e.target.files[0], 'image'));
  $('#file-video').addEventListener('change', e => loadCapturedFile(e.target.files[0], 'video'));

  const saveCurrentCapture = async () => {
    const { projectId, currentBlob, currentType } = captureState;
    if (!currentBlob) { toast('Take a photo or video first'); return null; }
    const title = $('#media-title').value.trim();
    const description = $('#media-description').value.trim();
    const existing = await db.listMedia(projectId);
    const order = existing.length;
    let thumbnail = null;
    if (currentType === 'video') {
      try { thumbnail = await extractVideoThumbnail(currentBlob); } catch (e) { console.warn('thumbnail failed', e); }
    }
    const m = {
      id: uuid(),
      projectId,
      title,
      description,
      type: currentType,
      mimeType: currentBlob.type || (currentType === 'image' ? 'image/jpeg' : 'video/mp4'),
      blob: currentBlob,
      thumbnail,
      order,
      createdAt: new Date().toISOString()
    };
    await db.addMedia(m);
    return m;
  };

  $('#capture-save-only').addEventListener('click', async () => {
    const m = await saveCurrentCapture();
    if (!m) return;
    toast('Logged.');
    navigate(`/project/${captureState.projectId}/report`);
  });
  $('#capture-save-next').addEventListener('click', async () => {
    const m = await saveCurrentCapture();
    if (!m) return;
    toast('Logged.');
    await renderCapture(captureState.projectId);
  });

  $('#capture-back').addEventListener('click', () => {
    if (captureState.currentBlob) {
      confirmModal('Discard this capture?', 'You have an unsaved photo or video.').then(ok => { if (ok) navigate('/'); });
    } else {
      navigate('/');
    }
  });

  $('#capture-finish').addEventListener('click', async () => {
    const pid = captureState.projectId;
    if (!pid) return;
    if (captureState.currentBlob) {
      const ok = await confirmModal('Save this capture?', 'Save it before closing the tour?');
      if (ok) await saveCurrentCapture();
    }
    const ok = await confirmModal('Close this tour?', 'You can reopen and add more records later.');
    if (!ok) return;
    const p = await db.getProject(pid);
    if (p) { p.status = 'finished'; await db.updateProject(p); }
    toast('Tour closed');
    navigate(`/project/${pid}/report`);
  });

  /* ---------- Video thumbnail extraction ---------- */

  function extractVideoThumbnail(blob) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      const url = URL.createObjectURL(blob);
      v.src = url;
      v.addEventListener('loadedmetadata', () => {
        // seek slightly in to avoid black frame
        v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
      });
      v.addEventListener('seeked', () => {
        try {
          const c = document.createElement('canvas');
          const w = c.width = v.videoWidth || 640;
          const h = c.height = v.videoHeight || 360;
          const ctx = c.getContext('2d');
          ctx.drawImage(v, 0, 0, w, h);
          c.toBlob(b => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/jpeg', 0.85);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      });
      v.addEventListener('error', () => { URL.revokeObjectURL(url); reject(new Error('video load failed')); });
    });
  }

  /* ---------- View: Report ---------- */

  let reportState = { projectId: null, reorderMode: false };

  async function renderReport(projectId) {
    const p = await db.getProject(projectId);
    if (!p) { navigate('/'); return; }
    showView('view-report');
    reportState = { projectId, reorderMode: false };

    const media = await db.listMedia(projectId);
    const photos = media.filter(m => m.type === 'image');
    const videos = media.filter(m => m.type === 'video');

    $('#report-project-name').textContent = p.name;
    $('#report-project-meta').textContent =
      [p.address, `${media.length} record${media.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');

    const statusLabel = p.status === 'in_progress' ? 'In progress' : 'Closed';
    $('#report-header').innerHTML = `
      <div class="eyebrow">${escapeHtml(statusLabel)} · ${escapeHtml(fmtDate(p.createdAt))}</div>
      <h2 class="display" style="margin-top:10px;">${escapeHtml(p.name)}</h2>
      ${p.address ? `<div class="address">${escapeHtml(p.address)}</div>` : ''}
      <div class="report-stats">
        <div class="stat"><div class="num">${photos.length}</div><div class="lbl">Photos</div></div>
        <div class="stat"><div class="num">${videos.length}</div><div class="lbl">Videos</div></div>
        <div class="stat"><div class="num">${media.length}</div><div class="lbl">Records</div></div>
      </div>
    `;

    const grid = $('#report-grid');
    if (!media.length) {
      grid.innerHTML = `
        <div class="empty" style="grid-column:1/-1;margin:0;">
          <div class="eyebrow">Empty</div>
          <h3 class="display display-md">No records yet.</h3>
          <div class="msg">Add a photo or video to start the report.</div>
          <div style="margin-top:16px;"><button class="btn secondary small" id="empty-add">Add a record</button></div>
        </div>`;
      $('#empty-add')?.addEventListener('click', () => navigate(`/project/${projectId}`));
    } else {
      grid.innerHTML = await Promise.all(media.map(async (m, idx) => {
        const thumbBlob = m.type === 'image' ? m.blob : m.thumbnail;
        let url = '';
        if (thumbBlob) url = URL.createObjectURL(thumbBlob);
        const num = String(idx + 1).padStart(2, '0');
        return `
          <div class="report-cell" data-id="${escapeHtml(m.id)}" draggable="false">
            ${url ? `<img alt="${escapeHtml(m.title || 'record')}" src="${url}"/>` : `<div class="placeholder" style="padding:24px;color:var(--stone);"></div>`}
            ${m.type === 'video' ? `<div class="video-badge">VIDEO</div>` : ''}
            <div class="num-badge">No.&nbsp;${num}</div>
            <div class="cell-title">${escapeHtml(m.title || 'Untitled')}</div>
          </div>
        `;
      })).then(rows => rows.join(''));

      $$('.report-cell', grid).forEach(cell => {
        cell.addEventListener('click', () => {
          if (reportState.reorderMode) return;
          navigate(`/project/${projectId}/media/${cell.dataset.id}`);
        });
      });
      attachReorder(grid);
    }
  }

  $('#report-back').addEventListener('click', () => navigate('/'));
  $('#report-delete-project').addEventListener('click', async () => {
    const pid = reportState.projectId;
    if (!pid) return;
    const p = await db.getProject(pid);
    const ok = await confirmModal('Delete this tour?', `"${p.name}" and every photo in it goes away. Can't be undone.`);
    if (ok) {
      await db.deleteProject(pid);
      toast('Tour deleted');
      navigate('/');
    }
  });
  $('#report-resume').addEventListener('click', async () => {
    const p = await db.getProject(reportState.projectId);
    if (!p) return;
    p.status = 'in_progress';
    await db.updateProject(p);
    navigate(`/project/${reportState.projectId}`);
  });
  $('#report-reorder-toggle').addEventListener('click', () => {
    reportState.reorderMode = !reportState.reorderMode;
    document.body.classList.toggle('reorder-mode', reportState.reorderMode);
    $('#view-report').classList.toggle('reorder-mode', reportState.reorderMode);
    $$('.report-cell').forEach(c => c.setAttribute('draggable', reportState.reorderMode ? 'true' : 'false'));
    toast(reportState.reorderMode ? 'Drag tiles to reorder.' : 'Order saved.');
    if (!reportState.reorderMode) persistCurrentOrder();
  });

  async function persistCurrentOrder() {
    const ids = $$('#report-grid .report-cell').map(c => c.dataset.id);
    await db.reorderMedia(reportState.projectId, ids);
  }

  function attachReorder(grid) {
    // HTML5 drag-and-drop for desktop; touch-drag emulation for mobile.
    let draggedId = null;

    const reorderDOM = (draggedEl, targetEl, before) => {
      if (!draggedEl || !targetEl || draggedEl === targetEl) return;
      if (before) grid.insertBefore(draggedEl, targetEl);
      else grid.insertBefore(draggedEl, targetEl.nextSibling);
    };

    $$('.report-cell', grid).forEach(cell => {
      cell.addEventListener('dragstart', e => {
        if (!reportState.reorderMode) return;
        draggedId = cell.dataset.id;
        cell.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      cell.addEventListener('dragend', () => cell.classList.remove('dragging'));
      cell.addEventListener('dragover', e => {
        if (!reportState.reorderMode) return;
        e.preventDefault();
      });
      cell.addEventListener('drop', e => {
        if (!reportState.reorderMode) return;
        e.preventDefault();
        const dragged = $(`.report-cell[data-id="${CSS.escape(draggedId)}"]`, grid);
        const rect = cell.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        reorderDOM(dragged, cell, before);
        persistCurrentOrder();
      });

      // Touch drag for iOS — long-press to pick up, drag to reorder
      let touchStart = null;
      let holding = false;
      let holdTimer = null;
      cell.addEventListener('touchstart', e => {
        if (!reportState.reorderMode) return;
        touchStart = e.touches[0];
        holdTimer = setTimeout(() => {
          holding = true;
          draggedId = cell.dataset.id;
          cell.classList.add('dragging');
          if (navigator.vibrate) navigator.vibrate(30);
        }, 220);
      }, { passive: true });

      cell.addEventListener('touchmove', e => {
        if (!reportState.reorderMode) return;
        if (!holding) { clearTimeout(holdTimer); return; }
        e.preventDefault();
        const t = e.touches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const target = el?.closest('.report-cell');
        $$('.report-cell', grid).forEach(c => c.classList.remove('drop-target'));
        if (target && target.dataset.id !== draggedId) target.classList.add('drop-target');
      }, { passive: false });

      cell.addEventListener('touchend', e => {
        clearTimeout(holdTimer);
        if (!reportState.reorderMode || !holding) { holding = false; return; }
        holding = false;
        const t = e.changedTouches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const target = el?.closest('.report-cell');
        $$('.report-cell', grid).forEach(c => c.classList.remove('drop-target', 'dragging'));
        if (target && target.dataset.id !== draggedId) {
          const dragged = $(`.report-cell[data-id="${CSS.escape(draggedId)}"]`, grid);
          const rect = target.getBoundingClientRect();
          const before = (t.clientY - rect.top) < rect.height / 2;
          reorderDOM(dragged, target, before);
          persistCurrentOrder();
        }
      });
    });
  }

  /* ---------- View: Detail ---------- */

  let detailState = { projectId: null, mediaId: null, media: [] };

  async function renderDetail(projectId, mediaId) {
    const p = await db.getProject(projectId);
    if (!p) { navigate('/'); return; }
    const media = await db.listMedia(projectId);
    if (!media.length) { navigate(`/project/${projectId}/report`); return; }
    showView('view-detail');

    detailState = { projectId, mediaId, media };
    const idx = media.findIndex(m => m.id === mediaId);
    const m = media[idx] || media[0];

    $('#detail-project-name').textContent = p.name;
    $('#detail-position').textContent = `Record ${idx + 1} of ${media.length}`;

    const stage = $('#detail-stage');
    if (m.type === 'image') {
      const url = URL.createObjectURL(m.blob);
      stage.innerHTML = `<img alt="${escapeHtml(m.title || 'media')}" src="${url}"/>`;
    } else {
      const url = URL.createObjectURL(m.blob);
      stage.innerHTML = `<video playsinline controls src="${url}"></video><div class="video-badge">VIDEO</div>`;
    }

    const titleEl = $('#detail-title');
    const descEl = $('#detail-description');
    titleEl.value = m.title || '';
    descEl.value = m.description || '';

    const saveEdit = async () => {
      const fresh = await db.getMedia(m.id);
      if (!fresh) return;
      fresh.title = titleEl.value.trim();
      fresh.description = descEl.value.trim();
      await db.updateMedia(fresh);
    };
    titleEl.oninput = saveEdit;
    descEl.oninput = saveEdit;

    $('#detail-prev').onclick = () => {
      const prev = media[(idx - 1 + media.length) % media.length];
      navigate(`/project/${projectId}/media/${prev.id}`);
    };
    $('#detail-next').onclick = () => {
      const next = media[(idx + 1) % media.length];
      navigate(`/project/${projectId}/media/${next.id}`);
    };
    $('#detail-delete').onclick = async () => {
      const ok = await confirmModal('Delete this record?', 'This photo or video goes away. Can\u2019t be undone.');
      if (!ok) return;
      await db.deleteMedia(m.id);
      toast('Deleted');
      const remaining = await db.listMedia(projectId);
      // re-sequence
      await db.reorderMedia(projectId, remaining.map(x => x.id));
      if (remaining.length) {
        const next = remaining[Math.min(idx, remaining.length - 1)];
        navigate(`/project/${projectId}/media/${next.id}`);
      } else {
        navigate(`/project/${projectId}/report`);
      }
    };
  }

  $('#detail-back').addEventListener('click', () => navigate(`/project/${detailState.projectId}/report`));

  /* ---------- PDF export ---------- */

  $('#report-export').addEventListener('click', async () => {
    const projectId = reportState.projectId;
    const p = await db.getProject(projectId);
    const media = await db.listMedia(projectId);
    if (!media.length) { toast('Nothing to export yet'); return; }

    spinner.show('Preparing your field report…');
    try {
      const pdfBlob = await buildPdf(p, media);
      const safe = (p.name || 'harvest-fieldnotes').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'harvest-fieldnotes';
      const filename = `harvest-fieldnotes-${safe}-${p.createdAt.slice(0, 10)}.pdf`;

      // Prefer the iOS Share sheet so "Save to Files" / "Save to iCloud Drive"
      // is one tap away. Falls back to a plain download on browsers without it.
      const shareFile = new File([pdfBlob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
        try {
          await navigator.share({ files: [shareFile], title: p.name, text: `HARVEST FieldNotes · ${p.name}` });
          toast('Field report ready.');
        } catch (e) {
          // User cancelled or share failed — fall back to download
          if (e?.name !== 'AbortError') { triggerDownload(pdfBlob, filename); toast('Field report ready.'); }
        }
      } else {
        triggerDownload(pdfBlob, filename);
        toast('Field report ready.');
      }
    } catch (e) {
      console.error(e);
      toast('Export failed. Check the console.');
    } finally {
      spinner.hide();
    }
  });

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  /* ---------- Harvest FieldNotes PDF template ---------- */

  // HARVEST Clean Eats approved palette (do not alter)
  const HG = {
    dark:     [24, 86, 65],     // #185641
    light:    [181, 219, 120],  // #B5DB78
    rule:     [213, 229, 191],  // #D5E5BF
    stone:    [159, 180, 138],  // #9FB48A
    inkMuted: [75, 107, 90],    // #4B6B5A
    paper:    [255, 255, 255],
    paperAlt: [237, 244, 226],  // #EDF4E2
  };

  // Cache for the approved HARVEST logo — loaded once per export.
  let _brandLogo = null;
  async function loadBrandLogo() {
    if (_brandLogo) return _brandLogo;
    const resp = await fetch('brand/harvest-logo-green.png');
    const blob = await resp.blob();
    _brandLogo = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ dataUrl: fr.result, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    return _brandLogo;
  }

  async function buildPdf(project, media) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();    // 612
    const pageH = doc.internal.pageSize.getHeight();   // 792
    const margin = 56;
    const contentW = pageW - margin * 2;

    const logo = await loadBrandLogo();
    const photos = media.filter(m => m.type === 'image');
    const videos = media.filter(m => m.type === 'video');

    // --- helpers ----------------------------------------------------------

    const setFill = (rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    const setStroke = (rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    const setText = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

    // Display text uses helvetica-bold with letter-spacing and uppercase — the
    // closest we can get to Oswald without shipping a TTF in the PWA bundle.
    const display = (txt, x, y, size, opts = {}) => {
      doc.setFont('helvetica', opts.weight || 'bold');
      doc.setFontSize(size);
      setText(opts.color || HG.dark);
      if (opts.charSpace !== undefined) doc.setCharSpace(opts.charSpace); else doc.setCharSpace(0);
      const t = opts.preserveCase ? txt : String(txt).toUpperCase();
      doc.text(t, x, y, { baseline: opts.baseline || 'alphabetic' });
      doc.setCharSpace(0);
    };

    const eyebrow = (txt, x, y, color = HG.stone) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      setText(color); doc.setCharSpace(1.6);
      doc.text(String(txt).toUpperCase(), x, y);
      doc.setCharSpace(0);
    };

    const body = (txt, x, y, size = 10, color = HG.inkMuted, maxW) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(size); setText(color); doc.setCharSpace(0);
      if (maxW) {
        const lines = doc.splitTextToSize(txt, maxW);
        doc.text(lines, x, y);
        return lines.length;
      }
      doc.text(txt, x, y);
      return 1;
    };

    // 8pt masthead bar + logo footer — drawn on every page.
    const drawPageChrome = (pageNum, total) => {
      // Masthead (Harvest light green)
      setFill(HG.light);
      doc.rect(0, 0, pageW, 8, 'F');

      // Footer divider
      setStroke(HG.rule);
      doc.setLineWidth(0.5);
      doc.line(margin, pageH - 40, pageW - margin, pageH - 40);

      // Footer logo
      const logoH = 16;
      const logoW = logoH * (logo.width / logo.height);
      doc.addImage(logo.dataUrl, 'PNG', margin, pageH - 32, logoW, logoH, undefined, 'FAST');

      // Project name centered
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      setText(HG.stone); doc.setCharSpace(1.4);
      const projLabel = (project.name || 'HARVEST FieldNotes').toUpperCase();
      const tw = doc.getTextWidth(projLabel);
      doc.text(projLabel, pageW / 2 - tw / 2, pageH - 22);

      // Page number right
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      setText(HG.stone); doc.setCharSpace(1.4);
      const pageLabel = `${String(pageNum).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
      const pw = doc.getTextWidth(pageLabel);
      doc.text(pageLabel, pageW - margin - pw, pageH - 22);
      doc.setCharSpace(0);
    };

    const newPage = () => { doc.addPage(); };

    // --- Cover page -------------------------------------------------------

    // Top masthead
    setFill(HG.light);
    doc.rect(0, 0, pageW, 8, 'F');

    // Cover logo (larger) + report label on right
    const coverLogoH = 42;
    const coverLogoW = coverLogoH * (logo.width / logo.height);
    doc.addImage(logo.dataUrl, 'PNG', margin, 44, coverLogoW, coverLogoH, undefined, 'FAST');

    eyebrow('Farm visit report', pageW - margin - 120, 60);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    setText(HG.stone); doc.setCharSpace(0);
    doc.text(fmtDate(project.createdAt || new Date().toISOString()).toUpperCase(), pageW - margin - 120, 74);

    // Hero image (first photo if available)
    const heroBlob = photos[0] ? photos[0].blob : (videos[0] ? videos[0].thumbnail : null);
    const heroY = 120;
    const heroH = 210;
    const heroW = contentW;
    if (heroBlob) {
      try {
        const { dataUrl, format } = await blobToPdfImage(heroBlob, 1800, 0.88);
        doc.addImage(dataUrl, format, margin, heroY, heroW, heroH, undefined, 'FAST');
      } catch {
        setFill(HG.paperAlt); doc.rect(margin, heroY, heroW, heroH, 'F');
      }
    } else {
      setFill(HG.paperAlt); doc.rect(margin, heroY, heroW, heroH, 'F');
    }

    // Cover title block
    let coverY = heroY + heroH + 30;
    eyebrow('A record of the visit', margin, coverY, HG.stone);
    coverY += 22;

    // Big display title — split on comma or dash if present for the two-line look
    const title = (project.name || 'Field Tour').toUpperCase();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(32);
    setText(HG.dark); doc.setCharSpace(0.4);
    const titleLines = doc.splitTextToSize(title, contentW);
    doc.text(titleLines, margin, coverY);
    coverY += titleLines.length * 32 + 8;
    doc.setCharSpace(0);

    // Address + context
    if (project.address) {
      body(project.address, margin, coverY, 11, HG.inkMuted);
      coverY += 14;
    }
    const contextLine = `Field walk · ${fmtDate(project.createdAt)} · ${media.length} record${media.length === 1 ? '' : 's'}`;
    body(contextLine, margin, coverY, 11, HG.inkMuted);

    // Meta grid (bottom of cover)
    const metaTop = pageH - 150;
    setStroke(HG.dark); doc.setLineWidth(1.5);
    doc.line(margin, metaTop, pageW - margin, metaTop);

    const metaCells = [
      ['Prepared by', 'HARVEST Field Team'],
      ['Visit date', fmtDate(project.createdAt).toUpperCase()],
      ['Photographs', String(photos.length).padStart(2, '0')],
      ['Videos', String(videos.length).padStart(2, '0')],
    ];
    const cellW = contentW / 4;
    metaCells.forEach(([k, v], i) => {
      const cx = margin + i * cellW;
      if (i > 0) {
        setStroke(HG.rule); doc.setLineWidth(0.5);
        doc.line(cx, metaTop + 6, cx, metaTop + 48);
      }
      const px = i === 0 ? cx : cx + 10;
      eyebrow(k, px, metaTop + 20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      setText(HG.dark); doc.setCharSpace(0.3);
      doc.text(String(v), px, metaTop + 42);
      doc.setCharSpace(0);
    });

    // Confidential footer (cover uses its own, not the page chrome)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    setText(HG.stone); doc.setCharSpace(1.4);
    doc.text('CONFIDENTIAL', margin, pageH - 22);
    const rightTxt = 'FOR THE ADDRESSEE ONLY';
    const rw = doc.getTextWidth(rightTxt);
    doc.text(rightTxt, pageW - margin - rw, pageH - 22);
    doc.setCharSpace(0);

    // --- Interior pages: Photos + Videos grids ---------------------------

    const gridCols = 2;
    const gridGap = 18;
    const gridCellW = (contentW - gridGap * (gridCols - 1)) / gridCols;
    const gridImgH = gridCellW * 0.75; // 4:3

    const drawSectionHeader = (eyebrowTxt, titleTxt, sectionNum, continued, y) => {
      // accent bar
      setFill(HG.light);
      doc.rect(margin, y - 14, 4, 14, 'F');
      // eyebrow
      eyebrow(eyebrowTxt, margin + 12, y - 2);
      // display title
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
      setText(HG.dark); doc.setCharSpace(0.4);
      let t = titleTxt.toUpperCase();
      doc.text(t, margin, y + 22);
      if (continued) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(13);
        setText(HG.stone); doc.setCharSpace(0);
        const w = doc.getTextWidth(t) + 10;
        doc.text('(continued)', margin + w, y + 22);
      }
      doc.setCharSpace(0);
      // section number top-right
      if (sectionNum) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        setText(HG.light); doc.setCharSpace(0.3);
        const sw = doc.getTextWidth(sectionNum);
        doc.text(sectionNum, pageW - margin - sw, y + 22);
        doc.setCharSpace(0);
      }
      // divider under heading
      setStroke(HG.dark); doc.setLineWidth(1.2);
      doc.line(margin, y + 40, pageW - margin, y + 40);
      return y + 58;
    };

    async function renderMediaGrid(items, sectionKind, sectionNum) {
      if (!items.length) return;
      const eyebrowTxt = sectionKind === 'videos' ? 'Video record' : 'Photographs';
      const titleTxt   = sectionKind === 'videos' ? 'Walkthroughs' : 'Field records';
      const videoStyle = sectionKind === 'videos';
      let indexOffset = 0;
      if (sectionKind === 'videos') indexOffset = photos.length;

      newPage();
      let y = drawSectionHeader(eyebrowTxt, titleTxt, sectionNum, false, 90);

      // Optional intro line for videos section
      if (sectionKind === 'videos') {
        body('Stills drawn from recorded video. Full footage is available on request.', margin, y, 10, HG.inkMuted, contentW);
        y += 20;
      }

      const bottomLimit = pageH - 60; // leave room for page chrome footer

      for (let i = 0; i < items.length; i += gridCols) {
        const row = items.slice(i, i + gridCols);

        // Measure row height — max caption size among the pair
        let maxCapLines = 0;
        row.forEach((m, j) => {
          const globalIdx = indexOffset + i + j + 1;
          const titleStr = (m.title || `Record ${String(globalIdx).padStart(2, '0')}`).toUpperCase();
          const tl = doc.splitTextToSize(titleStr, gridCellW).length;
          const dl = m.description ? Math.min(5, doc.splitTextToSize(m.description, gridCellW).length) : 0;
          maxCapLines = Math.max(maxCapLines, tl * 14 + dl * 12);
        });
        const rowH = gridImgH + 16 + maxCapLines + 24;

        if (y + rowH > bottomLimit) {
          newPage();
          y = drawSectionHeader(eyebrowTxt, titleTxt, sectionNum, true, 90);
        }

        for (let j = 0; j < row.length; j++) {
          const m = row[j];
          const globalIdx = indexOffset + i + j + 1;
          const x = margin + j * (gridCellW + gridGap);

          // Image (rounded 6pt radius — jsPDF doesn't clip, so we use the
          // native roundedRect as a background and embed image on top).
          const imgBlob = m.type === 'image' ? m.blob : m.thumbnail;
          if (imgBlob) {
            try {
              const { dataUrl, format } = await blobToPdfImage(imgBlob, 1400, 0.85);
              doc.addImage(dataUrl, format, x, y, gridCellW, gridImgH, undefined, 'FAST');
            } catch {
              setFill(HG.paperAlt); doc.rect(x, y, gridCellW, gridImgH, 'F');
            }
          } else {
            setFill(HG.paperAlt); doc.rect(x, y, gridCellW, gridImgH, 'F');
          }

          // VIDEO chip + duration placeholder
          if (videoStyle) {
            setFill(HG.dark);
            doc.rect(x + 10, y + 10, 52, 16, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
            setText(HG.paper); doc.setCharSpace(1.8);
            doc.text('VIDEO', x + 14, y + 21);
            doc.setCharSpace(0);
          }

          // Caption: "No. 01 — TITLE" + description
          const capY = y + gridImgH + 16;
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
          setText(HG.light); doc.setCharSpace(1);
          const numLabel = `No. ${String(globalIdx).padStart(2, '0')}`;
          doc.text(numLabel, x, capY);
          const numW = doc.getTextWidth(numLabel) + 8;
          doc.setCharSpace(0);

          doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
          setText(HG.dark); doc.setCharSpace(0.3);
          const titleStr = (m.title || `Record ${String(globalIdx).padStart(2, '0')}`).toUpperCase();
          const tLines = doc.splitTextToSize(titleStr, gridCellW - numW);
          doc.text(tLines, x + numW, capY);
          doc.setCharSpace(0);

          let ty = capY + Math.max(14, tLines.length * 13) + 2;

          if (m.description) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            setText(HG.inkMuted); doc.setCharSpace(0);
            const dLines = doc.splitTextToSize(m.description, gridCellW).slice(0, 5);
            doc.text(dLines, x, ty);
            ty += dLines.length * 12;
          }
        }
        y += rowH;
      }
    }

    await renderMediaGrid(photos, 'photos', '01');
    await renderMediaGrid(videos, 'videos', photos.length ? '02' : '01');

    // --- Page chrome on every non-cover page -----------------------------

    const total = doc.internal.getNumberOfPages();
    for (let i = 2; i <= total; i++) {
      doc.setPage(i);
      drawPageChrome(i, total);
    }

    return doc.output('blob');
  }

  /**
   * Convert any image blob the browser can decode (JPEG/PNG/HEIC/WebP) into
   * a downscaled JPEG data URL suitable for embedding in a PDF. iPhones shoot
   * HEIC by default and jsPDF can't embed HEIC directly, so we re-encode via
   * canvas. Downscaling to MAX_DIM keeps PDF size reasonable.
   */
  function blobToPdfImage(blob, maxDim = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const w0 = img.naturalWidth || img.width;
          const h0 = img.naturalHeight || img.height;
          const scale = Math.min(1, maxDim / Math.max(w0, h0));
          const w = Math.round(w0 * scale);
          const h = Math.round(h0 * scale);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = c.toDataURL('image/jpeg', quality);
          URL.revokeObjectURL(url);
          resolve({ dataUrl, format: 'JPEG' });
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image decode failed'));
      };
      img.src = url;
    });
  }

  /* ---------- Service worker ---------- */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW register failed', err));
    });
  }

  /* ---------- Boot ---------- */

  if (!location.hash) location.hash = '#/';
  handleRoute();

})();
