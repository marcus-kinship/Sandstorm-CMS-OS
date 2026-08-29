/**
 * @file explorer/setup/shortcuts.js
 * @description `app.shortcut` — `type:"shortcut"` fs entries that launch a
 * program (create/update/remove/get/getDesktop/launch/launchDraft) — and
 * `app.explorer.shortcutEditor`, the 3-step create/edit UI built on top of it.
 *
 * Exported `registerShortcuts(os)`, called once from explorer/setup/index.js
 * — must run after explorer/setup/core.js (`registerCore`) and
 * explorer/setup/fileops.js (`registerFileOps`, for `app.explorer.rename`/
 * `remove`).
 * Split out of the original monolithic explorer/setup.js — moved verbatim,
 * no logic changes (`_explorerUpdateAll(path)` calls became the
 * behaviorally-identical `app.explorer._refreshAll(path)` — see core.js).
 *
 * @module components/explorer/setup/shortcuts
 */

/**
 * Registers `app.shortcut` and `app.explorer.shortcutEditor`.
 *
 * @param {Object} os - The OS/program API.
 * @returns {void}
 */
export function registerShortcuts(os) {
    // app.shortcut — a `type:"shortcut"` fs entry that launches a program. See NOTES.md.
    const _SHORTCUT_START_MODES = ['normal', 'fullscreen', 'minimized'];

    /** Maps a shortcut's user-facing startMode to app.program.open()'s window options. */
    function _resolveStartMode(startMode) {
        return {
            mode: startMode === 'fullscreen' ? 'maximized' : 'normal',
            start: startMode === 'minimized' ? 'minimized' : undefined
        };
    }

    // Single source of truth for what counts as a valid startMode — used by
    // create()/update() (persisted) and launchDraft() (not persisted), so a
    // draft test-run and a saved shortcut can never disagree on what's valid.
    function _validateStartMode(startMode) {
        return _SHORTCUT_START_MODES.includes(startMode) ? startMode : 'normal';
    }

    function _cloneArgs(args) {
        const a = args ?? {};
        return (typeof structuredClone === 'function') ? structuredClone(a) : JSON.parse(JSON.stringify(a));
    }

    app.shortcut = {
        /**
         * @param {Object} opts
         * @param {string} opts.name - Display name (also the fs entry's key).
         * @param {string} opts.target - Program id to launch.
         * @param {*} [opts.args] - Passed through to app.program.open()'s options.args.
         * @param {"normal"|"fullscreen"|"minimized"} [opts.startMode="normal"]
         * @param {string} [opts.location="desktop"] - `"desktop"` or a real fs
         *   path (the folder to place the shortcut in). Not stored on the entry.
         * @returns {string|null} The new shortcut's path, or null on failure.
         */
        create({ name, target, args, startMode = 'normal', location = 'desktop' } = {}) {
            if (!name || !target) {
                app.dev.error('app.shortcut.create: name and target are required', 'Shortcut');
                return null;
            }
            startMode = _validateStartMode(startMode);

            const parentPath = location === 'desktop' ? '/Desktop' : location;
            const parentNode = app.explorer._getNode(parentPath);
            if (!parentNode || parentNode.type !== 'folder') {
                app.ui.alert({ title: _('Error'), message: _('Parent folder not found') + ': ' + parentPath, confirm: _('OK') });
                return null;
            }

            const cleanName = String(name).trim().replace(/\//g, '');
            if (!cleanName) return null;
            if (parentNode.children[cleanName]) {
                app.ui.alert({ title: _('Error'), message: _('A file or folder with that name already exists'), confirm: _('OK') });
                return null;
            }

            parentNode.children[cleanName] = {
                type: 'shortcut',
                target,
                args: _cloneArgs(args),
                startMode,
                modified: new Date().toISOString().slice(0, 10)
            };

            const path = (parentPath === '/' ? '' : parentPath) + '/' + cleanName;
            app.dev.log(`shortcut.create: "${path}" → ${target}`, 'Shortcut');
            app.api.post('/api/fs/shortcut', { path, target })?.success?.(() => {})?.fail?.(() => {});
            app.explorer._refreshAll(parentPath);
            return path;
        },

        /**
         * @param {string} path
         * @param {Object} changes - Any subset of {name, target, args, startMode}.
         *   `changes.name` renames via app.explorer.rename so the fs key and
         *   any open Explorer windows stay in sync.
         * @returns {boolean}
         */
        update(path, changes = {}) {
            const entry = this.get(path);
            if (!entry) return false;

            if (changes.target !== undefined) entry.target = changes.target;
            if (changes.args !== undefined) entry.args = _cloneArgs(changes.args);
            if (changes.startMode !== undefined) {
                entry.startMode = _validateStartMode(changes.startMode);
            }
            entry.modified = new Date().toISOString().slice(0, 10);

            if (changes.name && changes.name.trim()) {
                app.explorer.rename(path, changes.name.trim()); // moves the same entry object, triggers its own refresh
            } else {
                const parts = path.split('/').filter(Boolean);
                parts.pop();
                app.explorer._refreshAll(parts.length ? '/' + parts.join('/') : '/');
            }
            return true;
        },

        remove(path) { return app.explorer.remove(path); },

        get(path) {
            const e = app.explorer._getNode(path);
            return e?.type === 'shortcut' ? e : null;
        },

        getDesktop() {
            const desktop = app.explorer._getNode('/Desktop');
            if (!desktop?.children) return [];
            return Object.entries(desktop.children)
                .filter(([, e]) => e.type === 'shortcut')
                .map(([name, e]) => ({ path: '/Desktop/' + name, ...e }));
        },

        /**
         * Launches a {target, args, startMode} draft directly through
         * app.program.open() — no path, no _fs read/write. Shares
         * _validateStartMode/_cloneArgs/_resolveStartMode with create()/
         * update(), so a test-run and a saved shortcut can never disagree on
         * what counts as valid — only whether the result gets persisted.
         * Used by launch() below and by the ShortcutEditor's Test button.
         * @param {{target:string, args?:*, startMode?:string}} draft
         * @param {Object} [extra] - Extra app.program.open() options (e.g.
         *   source/shortcutPath — set by launch(), omitted by the editor).
         */
        launchDraft({ target, args, startMode } = {}, extra = {}) {
            if (!target) return null;
            return app.program.open(target, {
                args: _cloneArgs(args),
                window: _resolveStartMode(_validateStartMode(startMode)),
                ...extra
            });
        },

        launch(path) {
            const entry = this.get(path);
            if (!entry) return null;
            return this.launchDraft(entry, { source: 'shortcut', shortcutPath: path });
        }
    };

    // ── app.explorer.shortcutEditor — 3-step create/edit UI for app.shortcut ──
    app.explorer.shortcutEditor = {
        /**
         * @param {Object} opts
         * @param {"create"|"edit"} [opts.mode="create"]
         * @param {string} [opts.path] - Required for mode:"edit".
         */
        open({ mode = 'create', path = null } = {}) {
            const isEdit   = mode === 'edit';
            const existing = isEdit ? app.shortcut.get(path) : null;
            if (isEdit && !existing) {
                app.dev.error(`shortcutEditor.open: no shortcut at "${path}"`, 'Shortcut');
                return;
            }

            const dlgId        = 'shortcut-editor-' + Date.now();
            const editName     = isEdit ? path.split('/').filter(Boolean).pop() : '';
            const editLocation = isEdit
                ? '/' + path.split('/').filter(Boolean).slice(0, -1).join('/')
                : null;

            const draft = {
                target:    existing?.target ?? null,
                name:      editName,
                args:      existing?.args ?? {},
                startMode: existing?.startMode || 'normal',
                location:  editLocation || '/Desktop'
            };
            let step = 1;

            app.addCSS('shortcut-editor', `
                .se-wrap{display:flex;flex-direction:column;height:100%;color:var(--theme-fontcolor,#fff);font-size:var(--theme-font-size,12px);}
                .se-steps{display:flex;flex-shrink:0;padding:10px 16px 0;gap:6px;}
                .se-step-dot{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,0.15);}
                .se-step-dot.active{background:var(--theme-fontcolor,#fff);}
                .se-panels{flex:1;min-height:0;overflow-y:auto;padding:14px 16px;box-sizing:border-box;}
                .se-panel{display:none;flex-direction:column;gap:10px;}
                .se-panel.active{display:flex;}
                .se-label{opacity:.6;margin-bottom:2px;}
                .se-proglist{border:1px solid rgba(255,255,255,0.15);border-radius:4px;overflow-y:auto;max-height:320px;}
                .se-progrow{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:default;user-select:none;border-bottom:1px solid rgba(255,255,255,0.06);}
                .se-progrow:last-child{border-bottom:none;}
                .se-progrow:hover{background:rgba(255,255,255,0.06);}
                .se-progrow.se-sel{background:rgba(100,150,255,0.2);}
                .se-progrow svg,.se-progrow img{flex-shrink:0;width:20px;height:20px;object-fit:contain;}
                .se-field{width:100%;box-sizing:border-box;}
                .se-textarea{width:100%;box-sizing:border-box;min-height:120px;font-family:monospace;font-size:11px;resize:vertical;}
                .se-err{color:#ff8080;margin-top:4px;display:none;}
                .se-err.show{display:block;}
                .se-radiorow{display:flex;align-items:center;gap:6px;cursor:default;padding:3px 0;}
                .se-footer{display:flex;justify-content:space-between;gap:8px;padding:10px 16px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.1);}
                .se-footer-right{display:flex;gap:8px;}
            `);

            os.ui.windowStart('explorer', {
                id:        dlgId,
                title:     isEdit ? _('Edit Shortcut') + ' — ' + app.util.escapeHtml(editName) : _('New Shortcut'),
                width:     '440px',
                height:    '520px',
                resizable: false,
                single:    false,
                body(windowobj) {
                    const _wid = windowobj?.windowId || dlgId;

                    const progRows = Object.entries(app.program.getAll())
                        .sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]))
                        .map(([id, info]) => {
                            const iconHtml = info.icon
                                ? (info.icontype === 'svg' || info.icon.startsWith('#')
                                    ? `<svg><use href="${info.icon}"></use></svg>`
                                    : `<img src="${info.icon}" alt="">`)
                                : `<span style="width:20px;height:20px;display:inline-block;"></span>`;
                            return `<div class="se-progrow${id === draft.target ? ' se-sel' : ''}" data-id="${id}">
                                ${iconHtml}<span>${info.name || id}</span>
                            </div>`;
                        }).join('');

                    const folderOptions = Object.entries(app.explorer._getNode('/')?.children || {})
                        .filter(([, e]) => e.type === 'folder')
                        .map(([name]) => `/${name}`);
                    if (!folderOptions.includes('/Desktop')) folderOptions.unshift('/Desktop');
                    if (isEdit && !folderOptions.includes(draft.location)) folderOptions.push(draft.location);
                    const locationOptionsHtml = folderOptions
                        .map(p => `<option value="${app.util.escapeHtml(p)}"${p === draft.location ? ' selected' : ''}>${app.util.escapeHtml(p)}</option>`)
                        .join('');

                    setTimeout(() => {
                        const win = $('#' + _wid + '-win')[0];
                        if (!win) { app.dev.log(`shortcutEditor: win #${_wid}-win not found`, 'Shortcut'); return; }

                        function goStep(n) {
                            step = n;
                            win.querySelectorAll('.se-step-dot').forEach((d, i) => d.classList.toggle('active', i < n));
                            win.querySelectorAll('.se-panel').forEach(p => p.classList.toggle('active', +p.dataset.step === n));
                            win.querySelector('.se-back').style.visibility = n === 1 ? 'hidden' : 'visible';
                            win.querySelector('.se-next').style.display = n === 3 ? 'none' : '';
                            win.querySelector('.se-save').style.display = n === 3 ? '' : 'none';
                            win.querySelector('.se-test').style.display = n === 3 ? '' : 'none';
                        }

                        win.querySelectorAll('.se-progrow').forEach(row => {
                            row.addEventListener('click', () => {
                                win.querySelectorAll('.se-progrow').forEach(r => r.classList.remove('se-sel'));
                                row.classList.add('se-sel');
                                win.querySelector('.se-prog-err')?.classList.remove('show');
                                draft.target = row.dataset.id;
                                if (!isEdit) {
                                    const nameField = win.querySelector('.se-name');
                                    if (nameField && !nameField.value) {
                                        const info = app.program.getInfo(draft.target);
                                        nameField.value = info?.name || draft.target;
                                    }
                                }
                            });
                        });

                        win.querySelector('.se-next')?.addEventListener('click', () => {
                            if (step === 1) {
                                if (!draft.target) {
                                    win.querySelector('.se-prog-err')?.classList.add('show');
                                    return;
                                }
                                goStep(2);
                            } else if (step === 2) {
                                const argsRaw = win.querySelector('.se-args')?.value ?? '{}';
                                const errEl   = win.querySelector('.se-args-err');
                                try {
                                    draft.args = argsRaw.trim() ? JSON.parse(argsRaw) : {};
                                    errEl.classList.remove('show');
                                } catch (e) {
                                    errEl.textContent = _('Invalid JSON') + ': ' + e.message;
                                    errEl.classList.add('show');
                                    return;
                                }
                                draft.name = win.querySelector('.se-name')?.value?.trim() || draft.name;
                                goStep(3);
                            }
                        });

                        win.querySelector('.se-back')?.addEventListener('click', () => {
                            if (step > 1) goStep(step - 1);
                        });

                        win.querySelectorAll('input[name="se-startmode"]').forEach(r => {
                            r.addEventListener('change', () => { if (r.checked) draft.startMode = r.value; });
                        });

                        win.querySelector('.se-location')?.addEventListener('change', e => {
                            draft.location = e.target.value;
                        });

                        win.querySelector('.se-cancel')?.addEventListener('click', () => {
                            os.ui.windows.functions.closeWindow(_wid, null, 'explorer');
                        });

                        win.querySelector('.se-test')?.addEventListener('click', () => {
                            app.shortcut.launchDraft(draft);
                        });

                        win.querySelector('.se-save')?.addEventListener('click', () => {
                            const nameVal = win.querySelector('.se-name')?.value?.trim() || draft.name;
                            if (!nameVal || !draft.target) return;
                            if (isEdit) {
                                app.shortcut.update(path, {
                                    name:      nameVal,
                                    target:    draft.target,
                                    args:      draft.args,
                                    startMode: draft.startMode
                                });
                            } else {
                                app.shortcut.create({
                                    name:      nameVal,
                                    target:    draft.target,
                                    args:      draft.args,
                                    startMode: draft.startMode,
                                    location:  draft.location
                                });
                            }
                            os.ui.windows.functions.closeWindow(_wid, null, 'explorer');
                        });

                        goStep(1);
                    }, 0);

                    return `<div class="se-wrap">
                        <div class="se-steps">
                            <div class="se-step-dot active"></div>
                            <div class="se-step-dot"></div>
                            <div class="se-step-dot"></div>
                        </div>
                        <div class="se-panels">

                            <div class="se-panel active" data-step="1">
                                <div class="se-label">${_('Choose a program')}</div>
                                <div class="se-proglist">${progRows}</div>
                                <div class="se-err se-prog-err">${_('Please choose a program')}</div>
                            </div>

                            <div class="se-panel" data-step="2">
                                <div>
                                    <div class="se-label">${_('Name')}</div>
                                    <input class="def se-field se-name" type="text" value="${app.util.escapeHtml(draft.name)}">
                                </div>
                                <div>
                                    <div class="se-label">${_('Arguments (JSON)')}</div>
                                    <textarea class="def se-field se-textarea se-args">${app.util.escapeHtml(JSON.stringify(draft.args ?? {}, null, 2))}</textarea>
                                    <div class="se-err se-args-err"></div>
                                </div>
                            </div>

                            <div class="se-panel" data-step="3">
                                <div>
                                    <div class="se-label">${_('Start mode')}</div>
                                    <label class="se-radiorow"><input type="radio" name="se-startmode" value="normal" ${draft.startMode === 'normal' ? 'checked' : ''}> ${_('Normal')}</label>
                                    <label class="se-radiorow"><input type="radio" name="se-startmode" value="fullscreen" ${draft.startMode === 'fullscreen' ? 'checked' : ''}> ${_('Fullscreen')}</label>
                                    <label class="se-radiorow"><input type="radio" name="se-startmode" value="minimized" ${draft.startMode === 'minimized' ? 'checked' : ''}> ${_('Minimized')}</label>
                                </div>
                                <div>
                                    <div class="se-label">${_('Location')}</div>
                                    <select class="def se-field se-location" ${isEdit ? 'disabled' : ''}>${locationOptionsHtml}</select>
                                </div>
                            </div>

                        </div>
                        <div class="se-footer">
                            <button class="aero-button se-back" style="visibility:hidden;">${_('Back')}</button>
                            <div class="se-footer-right">
                                <button class="aero-button se-test" style="display:none;">${_('Test')}</button>
                                <button class="aero-button se-cancel">${_('Cancel')}</button>
                                <button class="aero-button se-next">${_('Next')}<div class="after pulse"></div></button>
                                <button class="aero-button se-save" style="display:none;">${isEdit ? _('Save') : _('Create')}<div class="after pulse"></div></button>
                            </div>
                        </div>
                    </div>`;
                }
            });
        }
    };
}
