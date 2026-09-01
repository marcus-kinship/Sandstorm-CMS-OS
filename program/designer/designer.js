/**
 * @file designer/designer.js
 * @description Visual Designer program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (icon + metadata) lives in `setup.js`.
 * Exports `start(os, win)` (window creation with drag-and-drop widget canvas).
 *
 * @module program/designer/designer
 */
export function start(os) {

    // Edit menu — Undo/Redo route straight to the window's own history
    // session (see win.history, WindowElement's live getter over
    // app.historyManager). Every tool's mutation goes through
    // win.history.execute() (tools/*.js, designer_objectmodel.js,
    // designer_hover_overlay.js), so these two are the only functions
    // this menu needs to reach into that system at all.
    function undoAction() { app.designer.win?.history?.undo(); }
    function redoAction() { app.designer.win?.history?.redo(); }

    os.ui.windowStart('designer', {
        id: 'designer',
        title: _('Designer'),
        windowIcon: true,
        resizable: true,
        width: '1100px',
        height: '840px',
        menu: {
            options: {
                position: 'window-title',
                mobileicon: true,
                class: 'designer-menu',
                windowTitleText: 'hidden',
                colors: {
                    main: {
                        background: 'transparent'
                    }
                }
            },
            menu: {
                File: {
                    children: {
                        'New Project': {
                            id: 'newproject',
                            label: _('New Project'),
                            click: function () {

                            }
                        },
                        'New File': {
                            id: 'newfile',
                            label: _('New File'),
                            click: function () {
                                app.designer.tabs?.add();
                            }
                        },
                        'Open File': {
                            id: 'openfile',
                            label: _('Open File'),
                            click: function () {
                                app.designer.open?.();
                            }
                        },
                        'Auto Save': {
                            id: 'autoSave',
                            label: _('Auto Save'),
                            click: function () {

                            }
                        },
                        'Save Data': {
                            id: 'viewData',
                            label: _('Save Data'),
                            click: function () {
                                viewExistingData();
                            }
                        },
                        'Exit': {
                            id: 'exitProgram',
                            label: _('Exit'),
                            click: function () {
                                closeProgram();
                            }
                        }
                    }
                },
                Edit: {
                    children: {
                        'Undo': {
                            id: 'undo',
                            label: _('Undo'),
                            click: function () {
                                undoAction();
                            }
                        },
                        'Redo': {
                            id: 'redo',
                            label: _('Redo'),
                            click: function () {
                                redoAction();
                            }
                        },
                        'Cut': {
                            id: 'cut',
                            label: _('Cut'),
                            click: function () {
                                cutAction();
                            }
                        },
                         'Copy': {
                            id: 'copy',
                            label: _('Copy'),
                            click: function () {
                                copyAction();
                            }   
                        }

                    }
                },
                Help: {
                    children: {
                        aboutProgram: {
                            id: 'aboutProgram',
                            label: _('About'),
                            click: function () {
                                showAboutDialog();
                            }
                        },
                        helpSection: {
                            id: 'helpSection',
                            label: _('Help'),
                            click: function () {
                                showHelp();
                            }
                        }
                    }
                }
            }
        },
        body: function (win) {
            app.designer = app.designer || {};
            app.designer.win = win;

            const langToken = "designer-" + win?.windowId;
            os.language.registerRefresh(langToken, () => win.title(_("Designer")));
            win?.on?.("close", () => os.language.unregisterRefresh(langToken));

            return `
                <div class="designer-toolbar" id="designerToolbar" style="height: 26px; flex: 0 0 auto; display: flex; align-items: center; background-color: var(--theme-backgruondcolorc, #00000040);">
        
                </div>
                <div class="designer-container" style="display: flex; height: calc(100% - 26px); width: 100%;">
                    <div class="designer-sidebar" id="designerSidebar" style="width: 40px; flex: 0 0 auto; background-color: var(--theme-backgruondcolord); transition: width 150ms ease;">
                       <div class="designer-menu" id="designerMenu" style="display: flex; flex-direction: column; height: 100%;">
                            <div class="designer-menu-header" id="designerMenuHeader" style="height: 15px; flex: 0 0 auto; display: flex; align-items: flex-start; justify-content: flex-start; background-color: rgba(0, 0, 0, 0.3); cursor: pointer;">
                                <svg style="width: 18px; height: 15px; padding-top: 2px;"><use href="#ic-arrow-double-right"/></svg>
                            </div>
                            <ul class="designer-menu-list" id="designerMenuList" style=" min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0;"></ul>
                            <div class="designer-sidebar-colors" id="designerSidebarColors" style="flex: 0 0 auto; display: flex; align-items: center; justify-content: center; height: 48px; "></div>
                       </div>
                    </div>
                    <div class="designer-canvas" id="designerCanvas" style="flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; background-color: var(--theme-backgruondcolore); ">
                        <!-- Canvas content will be dynamically generated here -->
                        <div class="tabbs-title" id="tabbsTitle" style="height: 24px; flex: 0 0 auto; display: flex; align-items: center;">
                        </div>
                        <div class="designer-ruler-row" id="designerRulerRow" style="flex: 0 0 auto; display: flex; height: 20px;">
                            <div class="designer-ruler-corner" id="designerRulerCorner" style="width: 20px; height: 20px; flex: 0 0 auto;    background-color: rgba(0, 0, 0, 0.15);"></div>
                            <canvas class="designer-ruler designer-ruler-top" id="rulerTop" style="flex: 1; height: 20px; display: block;"></canvas>
                            <div class="designer-ruler-corner" id="designerRulerCornerRight" style="width: 20px; height: 20px; flex: 0 0 auto; background-color: rgba(0, 0, 0, 0.15);"></div>
                        </div>
                        <div class="designer-body-row" id="designerBodyRow" style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
                            <div class="designer-content-row" id="designerContentRow" style="flex: 1; min-height: 0; display: flex;">
                                <canvas class="designer-ruler designer-ruler-left" id="rulerLeft" style="width: 20px; flex: 0 0 auto; display: block;"></canvas>
                                <div class="designer-canvas-content" id="designerCanvasContent" style="flex: 1; min-width: 0; min-height: 0; overflow: auto; position: relative; scrollbar-width: none; -ms-overflow-style: none;">
                                    <div class="body" id="designerCanvasBody" style="width: 100%; height: 100%; background-color: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.2); overflow: hidden;"></div>
                                </div>
                                <div class="designer-scrollbar designer-scrollbar-y" id="scrollbarY" style="width: 20px; flex: 0 0 auto; position: relative; z-index: 10; background-color: rgba(0, 0, 0, 0.15); display: flex; flex-direction: column;">
                                    <div class="designer-scrollbar-arrow" id="scrollbarYUp" style="height: 20px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                                        <svg viewBox="0 0 10 10" width="9" height="9"><path d="M5 2 L9 8 L1 8 Z" fill="#ffffff" opacity="0.6"/></svg>
                                    </div>
                                    <div class="designer-scrollbar-track" id="scrollbarYTrack" style="flex: 1; position: relative;">
                                        <div class="designer-scrollbar-thumb" id="scrollbarYThumb" style="position: absolute; left: 6px; right: 6px; background-color: rgba(255,255,255,0.35); border-radius: 4px; cursor: pointer;"></div>
                                    </div>
                                    <div class="designer-scrollbar-arrow" id="scrollbarYDown" style="height: 20px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                                        <svg viewBox="0 0 10 10" width="9" height="9"><path d="M5 8 L9 2 L1 2 Z" fill="#ffffff" opacity="0.6"/></svg>
                                    </div>
                                </div>
                            </div>
                            <div class="designer-control-row" id="designerControlRow" style="flex: 0 0 auto; height: 20px; display: flex; align-items: center;">
                                <div class="designer-device-mode" id="designerDeviceMode" style="width: 170px; height: 20px; flex: 0 0 auto; position: relative; z-index: 11;"></div>
                                <div class="designer-scrollbar designer-scrollbar-x" id="scrollbarX" style="height: 20px; flex: 1; position: relative; z-index: 10; background-color: rgba(0, 0, 0, 0.15); display: flex; flex-direction: row;">
                                    <div class="designer-scrollbar-arrow" id="scrollbarXLeft" style="width: 20px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                                        <svg viewBox="0 0 10 10" width="9" height="9"><path d="M2 5 L8 1 L8 9 Z" fill="#ffffff" opacity="0.6"/></svg>
                                    </div>
                                    <div class="designer-scrollbar-track" id="scrollbarXTrack" style="flex: 1; position: relative;">
                                        <div class="designer-scrollbar-thumb" id="scrollbarXThumb" style="position: absolute; top: 6px; bottom: 6px; background-color: rgba(255,255,255,0.35); border-radius: 4px; cursor: pointer;"></div>
                                    </div>
                                    <div class="designer-scrollbar-arrow" id="scrollbarXRight" style="width: 20px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                                        <svg viewBox="0 0 10 10" width="9" height="9"><path d="M8 5 L2 1 L2 9 Z" fill="#ffffff" opacity="0.6"/></svg>
                                    </div>
                                </div>
                                <div class="designer-scrollbar-corner" style="width: 20px; flex: 0 0 auto;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="designer-properties" id="designerProperties" style="width: 300px; min-width: 0; flex: 0 0 auto; position: relative; z-index: 20; display: flex; flex-direction: column; overflow-y: auto; background-color: var(--theme-backgruondcolord); ">
                    </div>
                </div>
            `;
        }
    });

    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_ruler.js')
        .then(mod => { if (mod && typeof mod.init === 'function') mod.init(app); });

    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_devicemode.js')
        .then(mod => { if (mod && typeof mod.init === 'function') mod.init(app); });

    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_scrollbar.js')
        .then(mod => { if (mod && typeof mod.init === 'function') mod.init(app); });

    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_tabs.js')
        .then(mod => { if (mod && typeof mod.init === 'function') mod.init(app); });

    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_grid.js')
        .then(mod => { if (mod && typeof mod.init === 'function') mod.init(app); });

    const dockReady = app.includeModule(app.config.local.ProgramRoot + 'designer/designer_dock.js')
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);

            app.designer.dock.add({ id: 'properties', sort: 10, title: _('Properties'), html: `<p>${_('Properties content')}</p>` });
            app.designer.dock.add({ id: 'history', sort: 20, title: _('History'), html: `<p>${_('History content')}</p>` });
            app.designer.dock.add({ id: 'layers', sort: 50, title: _('Layers'), html: `<p>${_('Layers content')}</p>` });

            return Promise.all([
                app.includeModule(app.config.local.ProgramRoot + 'designer/designer_dock_sortable.js'),
                app.includeModule(app.config.local.ProgramRoot + 'designer/designer_dock_resizable.js')
            ]);
        })
        .then(mods => {
            if (!mods) return;
            mods.forEach(mod => { if (mod && typeof mod.init === 'function') mod.init(app); });
        });

    const load = f => app.includeModule(app.config.local.ProgramRoot + 'designer/' + f)
        .then(mod => { if (mod && typeof mod.init === 'function') mod.init(app); });
    dockReady
        .then(() => load('designer_color_history.js'))
        .then(() => load('designer_color_element.js'))
        .then(() => {
            const mount = document.getElementById('designerSidebarColors');
            if (mount) {
                app.designer.sidebarColorGroup = app.designer.colorGroup.create({ layout: 'stacked' });
                mount.appendChild(app.designer.sidebarColorGroup.el);
            }
        })
        .then(() => load('designer_color_picker_window.js'))
        .then(() => load('tools/colorpickup.js'))
        .then(() => load('core/stylesheet.js'))
        .then(() => load('core/style.js'));

    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_menu.js')
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);


            app.designer.menu.add({
                id: 'cursor', sort: 25, type: 'icon',
                icon: { type: 'svg', value: '#ic-designer-cursor' },
                title: _('Cursor'),
                toolIds: ['select'],
                click: function () { app.designer.selectTool?.activate(); }
            });


            app.designer.menu.add({
                id: 'container', sort: 50, type: 'icon',
                icon: { type: 'svg', value: '#ic-designer-container' },
                title: _('Container'),
                submenu: [
                    { id: 'container', title: _('Container'), icon: '#ic-designer-container', draggable: true, blockType: 'container' },
                    { id: 'image', title: _('Image'), icon: '#ic-designer-container', draggable: true, blockType: 'image' }
                ]
            });

            app.designer.menu.add({
                id: 'form', sort: 60, type: 'icon',
                icon: { type: 'svg', value: '#ic-designer-form' },
                title: _('Form'),
                submenu: [
                    { id: 'form', title: _('Form'), icon: '#ic-designer-form', draggable: true, blockType: 'form' },
                    { id: 'button', title: _('Button'), icon: '#ic-designer-form', draggable: true, blockType: 'button' }
                ]
            });

            app.designer.menu.add({
                id: 'splitter', sort: 70, type: 'icon',
                icon: { type: 'svg', value: '#ic-designer-scissors' },
                title: _('Splitter'),
                toolIds: ['split-rows', 'split-columns'],
                submenu: [
                    { id: 'rows', title: _('Rows'), icon: '#ic-designer-rows', click: function () { app.designer.splitTool?.activate('rows'); } },
                    { id: 'columns', title: _('Columns'), icon: '#ic-designer-columns', click: function () { app.designer.splitTool?.activate('columns'); } }
                ]
            });

            app.designer.menu.add({
                id: 'move', sort: 80, type: 'icon',
                icon: { type: 'svg', value: '#ic-designer-move' },
                title: _('Move'),
                toolIds: ['move'],
                click: function () { app.designer.moveTool?.activate(); }
            });

            app.designer.menu.add({
                id: 'text-tool', sort: 90, type: 'icon',
                icon: { type: 'svg', value: '#ic-designer-text' },
                title: _('Text Tool'),
                toolIds: ['text'],
                click: function () { app.designer.textTool?.activate('normal'); },
                submenu: [
                    { id: 'text-normal', title: _('Normal Text'), icon: '#ic-designer-text', click: function () { app.designer.textTool?.activate('normal'); } },
                    { id: 'text-vertical', title: _('Vertical Text'), icon: '#ic-designer-text-vertical', click: function () { app.designer.textTool?.activate('vertical'); } }
                ]
            });

            app.designer.menu.add({
                id: 'colorpicker', sort: 100, type: 'icon',
                icon: { type: 'svg', value: '#ic-designer-colorpicker' },
                title: _('Color Picker'),
                toolIds: ['colorpicker'],
                click: function () { app.designer.colorPickupTool?.activate(); }
            });

            app.designer.menu.add({
                id: 'view', sort: 110, type: 'icon',
                icon: { type: 'svg', value: '#ic-designer-grid' },
                title: _('View'),
                submenu: [
                    { id: 'grid-system', title: _('Grid System'), icon: '#ic-designer-grid',
                        click: function () { app.designer.grid?.openDialog(); } },
                    { id: 'toggle-ruler',
                        title: function () { return app.designer.grid?.isRulerHidden() ? _('Show ruler') : _('Hide ruler'); },
                        click: function () { app.designer.grid?.toggleRuler(); } },
                    { id: 'toggle-guides',
                        title: function () { return app.designer.grid?.areGuidesHidden() ? _('Show guides') : _('Hide guides'); },
                        click: function () { app.designer.grid?.toggleGuides(); } }
                ]
            });
        });

    const objectModelReady = app.includeModule(app.config.local.ProgramRoot + 'designer/designer_objectmodel.js')
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);

            return app.includeModule(app.config.local.ProgramRoot + 'designer/canvas/droppable.js');
        })
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);

            return app.includeModule(app.config.local.ProgramRoot + 'designer/designer_selection.js');
        })
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);

            return app.includeModule(app.config.local.ProgramRoot + 'designer/tools/split.js');
        })
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);

            return app.includeModule(app.config.local.ProgramRoot + 'designer/tools/resize.js');
        })
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);

            return app.includeModule(app.config.local.ProgramRoot + 'designer/tools/move.js');
        })
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);

            return app.includeModule(app.config.local.ProgramRoot + 'designer/tools/text.js');
        })
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);

            return app.includeModule(app.config.local.ProgramRoot + 'designer/tools/select.js');
        })
        .then(mod => {
            if (mod && typeof mod.init === 'function') mod.init(app);

            return app.includeModule(app.config.local.ProgramRoot + 'designer/designer_hover_overlay.js');
        })
        .then(mod => { if (mod && typeof mod.init === 'function') mod.init(app); });

    Promise.all([dockReady, objectModelReady])
        .then(() => Promise.all([
            app.includeModule(app.config.local.ProgramRoot + 'designer/core/animation.js'),
            app.includeModule(app.config.local.ProgramRoot + 'designer/designer_boxmodel_panel.js'),
            app.includeModule(app.config.local.ProgramRoot + 'designer/designer_groups_panel.js'),
            app.includeModule(app.config.local.ProgramRoot + 'designer/designer_layers_panel.js'),
            app.includeModule(app.config.local.ProgramRoot + 'designer/designer_history_log.js'),
            app.includeModule(app.config.local.ProgramRoot + 'designer/designer_toolbar.js')
        ]))
        .then(mods => mods.forEach(mod => {
            if (!mod || typeof mod.init !== 'function') return;
            try { mod.init(app); } catch (error) { console.error('Error initializing Designer panel module:', error); }
        }));
}