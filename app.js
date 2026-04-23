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
      container.innerHTML = `<div class="empty">No projects yet. Tap <strong>+ New Project</strong> to start one.</div>`;
      $('#home-subtitle').textContent = 'Your projects';
      return;
    }

    $('#home-subtitle').textContent = `${projects.length} project${projects.length === 1 ? '' : 's'}`;

    container.innerHTML = `<div class="projects-grid">${
      projects.map(p => `
        <button class="project-card ${p.status}" data-id="${escapeHtml(p.id)}">
          <div>
            <div class="name">${escapeHtml(p.name)}</div>
            ${p.address ? `<div class="meta">${escapeHtml(p.address)}</div>` : ''}
          </div>
          <div>
            <div class="meta">${escapeHtml(fmtDate(p.createdAt))}</div>
            <div class="status">${p.status === 'in_progress' ? 'In progress' : 'Finished'}</div>
          </div>
        </button>
      `).join('')
    }</div>`;

    $$('.project-card', container).forEach(card => {
      let holdTimer = null;
      let longPressFired = false;

      const tryDelete = async () => {
        longPressFired = true;
        const id = card.dataset.id;
        const p = projects.find(x => x.id === id);
        if (!p) return;
        const ok = await confirmModal('Delete project?', `"${p.name}" and all of its media will be permanently removed.`);
        if (ok) { await db.deleteProject(id); renderHome(); toast('Project deleted'); }
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
    if (!name) { toast('Give it a name first'); return; }
    const p = await db.createProject({ name, address });
    modal.close('#modal-new');
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
      [p.address, `${mediaCount} item${mediaCount === 1 ? '' : 's'}`, fmtDate(p.createdAt)].filter(Boolean).join(' · ');

    // Reset fields
    $('#media-title').value = '';
    $('#media-description').value = '';
    $('#capture-stage').innerHTML = `<div class="placeholder">Tap Photo or Video to begin</div>`;
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
    toast('Saved');
    navigate(`/project/${captureState.projectId}/report`);
  });
  $('#capture-save-next').addEventListener('click', async () => {
    const m = await saveCurrentCapture();
    if (!m) return;
    toast('Saved');
    await renderCapture(captureState.projectId);
  });

  $('#capture-back').addEventListener('click', () => {
    if (captureState.currentBlob) {
      confirmModal('Discard current capture?', 'You have an unsaved photo/video.').then(ok => { if (ok) navigate('/'); });
    } else {
      navigate('/');
    }
  });

  $('#capture-finish').addEventListener('click', async () => {
    const pid = captureState.projectId;
    if (!pid) return;
    if (captureState.currentBlob) {
      const ok = await confirmModal('Save current capture?', 'Save this photo/video before finishing?');
      if (ok) await saveCurrentCapture();
    }
    const p = await db.getProject(pid);
    if (p) { p.status = 'finished'; await db.updateProject(p); }
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

    $('#report-project-name').textContent = p.name;
    $('#report-project-meta').textContent =
      [p.address, `${media.length} item${media.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');

    $('#report-header').innerHTML = `
      <h2>${escapeHtml(p.name)}</h2>
      <div class="meta">
        ${p.address ? escapeHtml(p.address) + ' · ' : ''}
        Visit ${escapeHtml(fmtDate(p.createdAt))}
      </div>
    `;

    const grid = $('#report-grid');
    if (!media.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">No media yet. <button class="btn ghost small" id="empty-add">Add some →</button></div>`;
      $('#empty-add')?.addEventListener('click', () => navigate(`/project/${projectId}`));
    } else {
      grid.innerHTML = await Promise.all(media.map(async m => {
        const thumbBlob = m.type === 'image' ? m.blob : m.thumbnail;
        let url = '';
        if (thumbBlob) url = URL.createObjectURL(thumbBlob);
        return `
          <div class="report-cell" data-id="${escapeHtml(m.id)}" draggable="false">
            ${url ? `<img alt="${escapeHtml(m.title || 'media')}" src="${url}"/>` : `<div class="placeholder" style="padding:24px;color:var(--text-subtle)">No preview</div>`}
            ${m.type === 'video' ? `<div class="video-badge">▶ VIDEO</div>` : ''}
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
    const ok = await confirmModal('Delete project?', `"${p.name}" and all of its media will be permanently removed.`);
    if (ok) {
      await db.deleteProject(pid);
      toast('Project deleted');
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
    toast(reportState.reorderMode ? 'Drag tiles to reorder' : 'Order saved');
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
    $('#detail-position').textContent = `${idx + 1} of ${media.length}`;

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
      const ok = await confirmModal('Delete this media?', 'This can\u2019t be undone.');
      if (!ok) return;
      await db.deleteMedia(m.id);
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

  /* ---------- PDF + ZIP export ---------- */

  $('#report-export').addEventListener('click', async () => {
    const projectId = reportState.projectId;
    const p = await db.getProject(projectId);
    const media = await db.listMedia(projectId);
    if (!media.length) { toast('Nothing to export yet'); return; }

    spinner.show('Building report…');
    try {
      const { pdfBlob, filenames } = await buildPdf(p, media);
      const zip = new JSZip();
      zip.file('report.pdf', pdfBlob);
      const mediaFolder = zip.folder('media');
      for (let i = 0; i < media.length; i++) {
        mediaFolder.file(filenames[i], media[i].blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const safe = (p.name || 'site-visit').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'site-visit';
      const filename = `${safe}-${p.createdAt.slice(0, 10)}.zip`;

      // Prefer the iOS Share sheet so "Save to Files" / "Save to iCloud Drive"
      // is one tap away. Falls back to a plain download on browsers without it.
      const shareFile = new File([zipBlob], filename, { type: 'application/zip' });
      if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
        try {
          await navigator.share({ files: [shareFile], title: p.name, text: `Site visit report: ${p.name}` });
          toast('Report shared');
        } catch (e) {
          // User cancelled or share failed — fall back to download
          if (e?.name !== 'AbortError') triggerDownload(zipBlob, filename);
        }
      } else {
        triggerDownload(zipBlob, filename);
        toast('Report downloaded');
      }
    } catch (e) {
      console.error(e);
      toast('Export failed — see console');
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

  async function buildPdf(project, media) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentW = pageW - margin * 2;

    // ----- Cover / header -----
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(project.name || 'Site Visit', margin, margin + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(100);
    let cursorY = margin + 34;
    if (project.address) {
      doc.text(project.address, margin, cursorY);
      cursorY += 16;
    }
    doc.text(`Visit: ${fmtDate(project.createdAt)}`, margin, cursorY);
    cursorY += 16;
    doc.text(`${media.length} item${media.length === 1 ? '' : 's'}`, margin, cursorY);
    cursorY += 24;
    doc.setDrawColor(220);
    doc.line(margin, cursorY, pageW - margin, cursorY);
    cursorY += 16;

    doc.setTextColor(20);

    // ----- Grid of thumbnails with captions -----
    const cols = 2;
    const gap = 14;
    const cellW = (contentW - gap * (cols - 1)) / cols;
    const imgH = cellW * 0.75; // 4:3
    const captionReserveMin = 50;
    const filenames = [];

    let col = 0;
    let rowTop = cursorY;
    const pagePadding = 40;
    const bottomLimit = pageH - margin;

    for (let i = 0; i < media.length; i++) {
      const m = media[i];
      const ext = (m.mimeType?.split('/')[1] || (m.type === 'image' ? 'jpg' : 'mp4')).split(';')[0];
      const baseName = (m.title || `item-${i + 1}`).replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || `item-${i + 1}`;
      const filename = `${String(i + 1).padStart(2, '0')}-${baseName}.${ext}`;
      filenames.push(filename);

      // Need enough space for image + ~80pt of caption
      if (rowTop + imgH + captionReserveMin + pagePadding > bottomLimit && col === 0) {
        // fits check fails; should not happen at start of new page
      }

      const x = margin + col * (cellW + gap);
      const y = rowTop;

      // Image
      const imgBlob = m.type === 'image' ? m.blob : m.thumbnail;
      if (imgBlob) {
        try {
          const { dataUrl, format } = await blobToPdfImage(imgBlob);
          // Fit image into cellW x imgH preserving aspect ratio
          doc.addImage(dataUrl, format, x, y, cellW, imgH, undefined, 'FAST');
        } catch (e) {
          doc.setDrawColor(200); doc.rect(x, y, cellW, imgH);
          doc.setFontSize(10); doc.setTextColor(150);
          doc.text('(no preview)', x + 10, y + imgH / 2);
          doc.setTextColor(20);
        }
      } else {
        doc.setDrawColor(200); doc.rect(x, y, cellW, imgH);
      }

      // Video badge
      if (m.type === 'video') {
        doc.setFillColor(0, 0, 0);
        doc.roundedRect(x + 6, y + 6, 50, 16, 3, 3, 'F');
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255);
        doc.text('VIDEO', x + 12, y + 17);
        doc.setTextColor(20); doc.setFont('helvetica', 'normal');
      }

      // Caption block
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      const titleLines = doc.splitTextToSize(m.title || `Item ${i + 1}`, cellW);
      let ty = y + imgH + 14;
      doc.text(titleLines, x, ty);
      ty += titleLines.length * 14;

      if (m.description) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80);
        const descLines = doc.splitTextToSize(m.description, cellW);
        const maxDescLines = 6;
        const toDraw = descLines.slice(0, maxDescLines);
        doc.text(toDraw, x, ty);
        ty += toDraw.length * 11;
        if (descLines.length > maxDescLines) {
          doc.setTextColor(140);
          doc.text('…', x, ty);
          ty += 10;
        }
        doc.setTextColor(20);
      }

      if (m.type === 'video') {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(110);
        doc.text(`Video file: media/${filename}`, x, ty);
        doc.setTextColor(20); doc.setFont('helvetica', 'normal');
      }

      // Advance layout
      col++;
      if (col >= cols) {
        col = 0;
        // Row height = imgH + caption space (use conservative estimate based on description length)
        const descLen = m.description ? Math.min(6, Math.ceil(doc.splitTextToSize(m.description, cellW).length)) : 0;
        const rowHeight = imgH + 14 + 14 + descLen * 11 + (m.type === 'video' ? 16 : 0) + 20;
        rowTop += rowHeight;

        if (rowTop + imgH + captionReserveMin > bottomLimit && i < media.length - 1) {
          doc.addPage();
          rowTop = margin;
        }
      }
    }

    // Footer on last page
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text('Generated with Site Visit · ' + fmtDateTime(new Date().toISOString()), margin, pageH - 20);

    const pdfBlob = doc.output('blob');
    return { pdfBlob, filenames };
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
