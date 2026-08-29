/**
 * @file controlpanel/programs/program.content.js
 * @description Programs manager panel content (System/Programs lists, Edit
 * and Install dialogs) — lazy-loaded on first open via `program.js`'s
 * `panel.contentPath`.
 *
 * @module components/controlpanel/programs/program.content
 */

// ── Helpers ───────────────────────────────────────────────────────────────

function _letterIconHtml(p, size) {
    const letter = (p.name || '?')[0].toUpperCase();
    return `<div style="width:${size}px;height:${size}px;border-radius:8px;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.42)}px;font-weight:700;color:#fff;flex-shrink:0;">${letter}</div>`;
}

function _iconHtml(p, size = 36) {
    if (!p.icon) return _letterIconHtml(p, size);
    if (p.icontype === 'svg' || p.icon.startsWith('#')) {
        return `<svg style="width:${size}px;height:${size}px;flex-shrink:0;"><use href="${p.icon}"></use></svg>`;
    }
    if (/\.svg$/i.test(String(p.icon).split(/[?#]/)[0])) {
        app.dev.warn(`Rejected .svg as an <img> icon path (icontype:'img') for program:`, p.icon);
        return _letterIconHtml(p, size);
    }
    return `<img src="${p.icon}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:6px;flex-shrink:0;" alt="">`;
}

function _card(pid, p, canRemove) {
    const meta = [p.version ? 'v' + p.version : '', p.owner || ''].filter(Boolean).join(' · ');
    return `
    <div class="pm-card" data-pid="${pid}">
        ${_iconHtml(p, 28)}
        <div class="pm-card-body">
            <div class="pm-card-name">${p.name || pid}</div>
            ${meta ? `<div class="pm-card-meta">${meta}</div>` : ''}
        </div>
        <button class="pm-edit-btn" data-pid="${pid}">${_('Edit')}</button>
        ${canRemove
            ? `<button class="pm-remove-btn" data-pid="${pid}" title="${_('Remove')}">✕</button>`
            : `<div style="width:28px;flex-shrink:0;"></div>`}
    </div>`;
}

// ── Bind panel events ─────────────────────────────────────────────────────

function _bind() {

    // Tab switching (same pattern as users.js)
    document.querySelectorAll('.pm-inner-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.pm-inner-tab').forEach(b => {
                b.classList.toggle('active', b === btn);
                b.style.opacity    = b === btn ? '1' : '0.55';
                b.style.background = b === btn ? 'var(--theme-backgruondcolorc,#00000040)' : 'none';
            });
            document.querySelectorAll('.pm-tab-pane').forEach(p => {
                p.style.display = p.dataset.pane === tab ? '' : 'none';
            });
        });
    });

    // Search filters
    ['system', 'programs'].forEach(tab => {
        $(`#pm-search-${tab}`).on('input', function () {
            const q = this.value.toLowerCase();
            document.querySelectorAll(`#pm-list-${tab} .pm-card`).forEach(card => {
                const match = !q
                    || (card.querySelector('.pm-card-name')?.textContent || '').toLowerCase().includes(q)
                    || (card.dataset.pid || '').toLowerCase().includes(q);
                card.style.display = match ? '' : 'none';
            });
        });
    });

    // Edit buttons (delegated on both lists)
    ['system', 'programs'].forEach(tab => {
        $(`#pm-list-${tab}`).on('click', e => {
            const btn = e.target.closest('.pm-edit-btn');
            if (btn) _openEditDialog(btn.dataset.pid);
        });
    });

    // Remove (delegated on programs list)
    $('#pm-list-programs').on('click', e => {
        const btn = e.target.closest('.pm-remove-btn');
        if (!btn) return;
        const pid  = btn.dataset.pid;
        const card = btn.closest('.pm-card');
        const name = card?.querySelector('.pm-card-name')?.textContent || pid;
        if (!confirm(`${_('Remove')} "${name}"?`)) return;
        app.program.remove(pid);
        card.remove();
        if (!document.querySelector('#pm-list-programs .pm-card')) {
            const list = $('#pm-list-programs')[0];
            if (list) list.innerHTML = `<div style="padding:32px 0;opacity:0.4;text-align:center;font-size:12px;">${_('No programs registered')}</div>`;
        }
    });

    // Install button
    $('#pm-install-btn').on('click', _openInstallDialog);
}

// ── Edit dialog (windowStart) ─────────────────────────────────────────────

function _openEditDialog(pid) {
    const p = app.program.getInfo(pid);
    if (!p) return;
    const uid = 'pm-edit-' + pid;

    try { app.ui.windowStart('controlpanel', {
        id:        uid,
        title:     p.name || pid,
        width:     '340px',
        height:    '250px',
        resizable: false,
        body(windowobj) {
            const row = (id, label, desc, checked) => `
            <label style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;">
                <div>
                    <div style="font-size:12px;color:#fff;">${label}</div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.38);margin-top:2px;">${desc}</div>
                </div>
                <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;flex-shrink:0;">
            </label>`;

            setTimeout(() => {
                const root = windowobj?.el?.[0] || document.querySelector(`#${(windowobj?.windowId || uid + '-0')}-win`);
                if (!root) return;
                root.querySelector('#pme-taskbar')  ?.addEventListener('change', function () { p.taskbar    = this.checked; });
                root.querySelector('#pme-startmenu') ?.addEventListener('change', function () { p.startmenu  = this.checked; });
                root.querySelector('#pme-multistart')?.addEventListener('change', function () { p.multistart = this.checked; });
                root.querySelector('#pme-close')?.addEventListener('click', e => {
                    e.stopPropagation();
                    windowobj?.close?.();
                });
            }, 0);

            return `
            <div style="padding:20px 24px;overflow-y:auto;height:100%;box-sizing:border-box;font-size:12px;color:#fff;">
                ${row('pme-taskbar',    _('Taskbar'),            _('Show icon in taskbar'),      !!p.taskbar)}
                ${row('pme-startmenu',  _('Start menu'),         _('Show in start menu'),        !!p.startmenu)}
                ${row('pme-multistart', _('Multiple instances'), _('Allow more than one window'),!!p.multistart)}
                <div style="display:flex;justify-content:flex-end;margin-top:20px;">
                    <button class="aero-button" id="pme-close">${_('Close')}<div class="after"></div></button>
                </div>
            </div>`;
        }
    }); } catch (err) {
        console.error('pm edit dialog', err);
    }
}

// ── Install dialog (windowStart) ──────────────────────────────────────────

function _openInstallDialog() {
    const uid = 'pm-install-' + Date.now();

    try { app.ui.windowStart('controlpanel', {
        id:        uid,
        title:     _('Install program'),
        width:     '420px',
        height:    '190px',
        resizable: false,
        body(windowobj) {
            setTimeout(() => {
                const root = windowobj?.el?.[0] || document.querySelector(`#${(windowobj?.windowId || uid + '-0')}-win`);
                if (!root) return;

                root.querySelector('#pmi-cancel')?.addEventListener('click', e => {
                    e.stopPropagation();
                    windowobj?.close?.();
                });

                root.querySelector('#pmi-save')?.addEventListener('click', async e => {
                    e.stopPropagation();
                    const pathEl  = root.querySelector('#pmi-path');
                    const msgEl   = root.querySelector('#pmi-msg');
                    const saveBtn = root.querySelector('#pmi-save');
                    const path    = pathEl?.value?.trim();
                    if (!path) return;

                    if (saveBtn) { saveBtn.disabled = true; saveBtn.firstChild.textContent = _('Loading…'); }

                    const before = new Set(Object.keys(app.program.getAll()));
                    try {
                        const mod = await app.includeProgram(path);
                        if (mod) {
                            const newId = Object.keys(app.program.getAll()).find(id => !before.has(id));
                            if (newId) {
                                const p     = app.program.getInfo(newId);
                                const isSys = p?.programtype === 'system';
                                const list  = $('#' + (isSys ? 'pm-list-system' : 'pm-list-programs'))[0];
                                if (list && p) {
                                    const empty = list.querySelector('[style*="text-align:center"]');
                                    empty?.remove();
                                    list.insertAdjacentHTML('beforeend', _card(newId, p, !isSys));
                                }
                            }
                            windowobj?.close?.();
                        } else {
                            if (msgEl) { msgEl.textContent = _('Failed — check console'); msgEl.style.color = '#f87171'; msgEl.style.display = 'block'; }
                            if (saveBtn) { saveBtn.disabled = false; saveBtn.firstChild.textContent = _('Install'); }
                        }
                    } catch (err) {
                        if (msgEl) { msgEl.textContent = err?.message || _('Error'); msgEl.style.color = '#f87171'; msgEl.style.display = 'block'; }
                        if (saveBtn) { saveBtn.disabled = false; saveBtn.firstChild.textContent = _('Install'); }
                    }
                });
            }, 0);

            return `
            <div style="padding:20px 24px;font-size:12px;color:#fff;">
                <div class="input-def" style="margin-bottom:12px;">
                    <input class="def" type="text" id="pmi-path" placeholder=" ">
                    <label>${_('Module path (e.g. calc/calc.js)')}</label>
                </div>
                <div id="pmi-msg" style="display:none;font-size:11px;padding:8px 10px;border-radius:6px;background:var(--theme-backgruondcolorc,#00000040);margin-bottom:10px;"></div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button class="aero-button" id="pmi-cancel">${_('Cancel')}<div class="after"></div></button>
                    <button class="aero-button" id="pmi-save">${_('Install')}<div class="after"></div></button>
                </div>
            </div>`;
        }
    }); } catch (err) {
        console.error('pm install dialog', err);
    }
}

// ── Panel entry point ─────────────────────────────────────────────────────

export function render() {
    const all      = app.program.getAll();
    const entries  = Object.entries(all);
    const sysList  = entries.filter(([, p]) => p.programtype === 'system');
    const progList = entries.filter(([, p]) => p.programtype !== 'system');

    const html = `
    <style>
    .pm-inner-tab { padding:7px 16px; background:none; border:none; color:#fff; font-size:12px; border-radius:6px 6px 0 0; cursor:default; opacity:0.55; transition:background 0.2s,opacity 0.2s; }
    .pm-inner-tab.active { opacity:1; background:var(--theme-backgruondcolorc,#00000040); }
    .pm-search { width:100%; padding:7px 12px; border-radius:8px; background:var(--theme-backgruondcolorc,#00000040); border:1px solid rgba(255,255,255,0.1); color:#fff; font-size:12px; outline:none; box-sizing:border-box; margin-bottom:12px; }
    .pm-search:focus { border-color:rgba(255,255,255,0.25); }
    .pm-card { display:flex; align-items:center; gap:14px; padding:12px 16px; border-radius:10px; background:var(--theme-backgruondcolorc,#00000040); margin-bottom:8px; transition:background 0.2s; }
    .pm-card-body { flex:1; min-width:0; }
    .pm-card-name { font-size:13px; font-weight:600; }
    .pm-card-meta { font-size:11px; opacity:0.55; margin-top:2px; }
    .pm-edit-btn { background:none; border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:rgba(255,255,255,0.6); font-size:11px; padding:4px 10px; cursor:default; transition:all 0.15s; flex-shrink:0; }
    .pm-edit-btn:hover { border-color:rgba(255,255,255,0.3); color:#fff; background:rgba(255,255,255,0.06); }
    .pm-remove-btn { background:none; border:none; cursor:default; color:rgba(255,255,255,0.35); font-size:16px; line-height:1; padding:4px 6px; border-radius:6px; transition:color 0.15s,background 0.15s; flex-shrink:0; }
    .pm-remove-btn:hover { color:#f87171; background:rgba(248,113,113,0.12); }
    </style>

    <div style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;">

      <!-- Tab bar -->
      <div style="display:flex;gap:2px;padding:10px 20px 0;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
        <button class="pm-inner-tab" data-tab="system">${_('System')}</button>
        <button class="pm-inner-tab active" data-tab="programs">${_('Programs')}</button>
      </div>

      <!-- System pane -->
      <div class="pm-tab-pane" data-pane="system" style="flex:1;overflow-y:auto;padding:28px;display:none;">
        <div class="h1">${_('System')}</div>
        <div class="p">${_('Core system programs')}</div>
        <div class="line"></div>
        <input type="text" class="pm-search" id="pm-search-system" placeholder="${_('Filter...')}">
        <div id="pm-list-system">
          ${sysList.length
              ? sysList.map(([pid, p]) => _card(pid, p, false)).join('')
              : `<div style="padding:32px 0;opacity:0.4;text-align:center;font-size:12px;">${_('No system programs')}</div>`}
        </div>
      </div>

      <!-- Programs pane -->
      <div class="pm-tab-pane" data-pane="programs" style="flex:1;overflow-y:auto;padding:28px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <div class="h1" style="margin:0;">${_('Programs')}</div>
          <button class="aero-button" id="pm-install-btn">
            ${_('Install')}<div class="after pulse"></div>
          </button>
        </div>
        <div class="p">${_('Installed programs')}</div>
        <div class="line"></div>
        <input type="text" class="pm-search" id="pm-search-programs" placeholder="${_('Filter...')}">
        <div id="pm-list-programs">
          ${progList.length
              ? progList.map(([pid, p]) => _card(pid, p, true)).join('')
              : `<div style="padding:32px 0;opacity:0.4;text-align:center;font-size:12px;">${_('No programs registered')}</div>`}
        </div>
      </div>

    </div>`;

    setTimeout(() => _bind(), 0);
    return html;
}
