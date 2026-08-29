/**
 * @file formbuilder/formbuilder.js
 * @description Form Builder program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (icon + metadata) lives in `setup.js`.
 * Exports `start(os, win)` (window creation with component palette, canvas, and
 * property inspector). Form state is persisted to `localStorage` under
 * `STORAGE_KEY`.
 *
 * @module program/formbuilder/formbuilder
 */
const STORAGE_KEY = "sandstorm_formbuilder_state";
let _formbuilderOS = null;
let _formbuilderListenersAdded = false;

export function start(os) {
    _formbuilderOS = os;
    if (!window.app) window.app = {};

    loadFormbuilderState();

    if (typeof os.addProgramCSS === 'function') {
        os.addProgramCSS('formbuilder', 'formbuilder-style', css);
    } else if (window.app && typeof app.addProgramCSS === 'function') {
        app.addProgramCSS('formbuilder', 'formbuilder-style', css);
    }

    bindFormbuilderEvents();

    os.ui.windowStart('formbuilder', {
        id: 'formbuilder',
        title: _('Formbuilder'),
        windowIcon: true,
        resizable: true,
        width: '1100px',
        height: '840px',
        menu: {
            options: {
                position: 'top',
                mobileicon: true,
                class: 'formbuilder-menu',
                colors: {
                    main: {
                        background: '#333333',
                        text: '#f5f5f5',
                        hover: '#2a2a2a',
                        iconFill: '#f5f5f5',
                        shortcutColor: '#f5f5f5'
                    },
                    submenu: {
                        background: '#ffffff',
                        text: '#333333',
                        textHover: '#ffffff',
                        hover: '#0088cc',
                        borderRadius: '0px',
                        boxShadow: false,
                        padding: '3px',
                        menuitemBorderRadius: '0px',
                        iconFill: '#333333',
                        shortcutColor: '#333333'
                    }
                }
            },
            menu: {
                File: {
                    children: {
                        newForm: {
                            id: 'newForm',
                            label: _('Create New Form'),
                            click: function () {
                                openCreateNewForm();
                            }
                        },
                        allForms: {
                            id: 'allForms',
                            label: _('View All Forms'),
                            click: function () {
                                openAllFormsView();
                            }
                        },
                        createHtml: {
                            id: 'createHtml',
                            label: _('Create New HTML Structure'),
                            click: function () {
                                openHtmlStructureCreator();
                            }
                        },
                        viewHtml: {
                            id: 'viewHtml',
                            label: _('View All HTML Structures'),
                            click: function () {
                                viewHtmlStructures();
                            }
                        },
                        viewData: {
                            id: 'viewData',
                            label: _('View Existing Data'),
                            click: function () {
                                viewExistingData();
                            }
                        },
                        exitProgram: {
                            id: 'exitProgram',
                            label: _('Exit'),
                            click: function () {
                                closeProgram();
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
        body: function (windowobj) {
            const langToken = "formbuilder-" + windowobj?.windowId;
            os.language.registerRefresh(langToken, () => windowobj.title(_("Formbuilder")));
            windowobj?.on?.("close", () => os.language.unregisterRefresh(langToken));

            const state = getState();
            return `
                <div class="formbuilder cp">
                    <div class="formbuilder-header">
                        <div>
                            <div class="h1">${_('Welcome to Formbuilder')}</div>
                            <div class="p">${_('Create forms, manage saved forms and store HTML structures.')}</div>
                        </div>
                        <div class="formbuilder-buttons">
                            <button class="aero-button" id="btn-create-form">${_('Create New Form')}</button>
                            <button class="aero-button" id="btn-view-forms">${_('View All Forms')}</button>
                            <button class="aero-button" id="btn-html-creator">${_('Create HTML Structure')}</button>
                            <button class="aero-button" id="btn-view-html">${_('View HTML Structures')}</button>
                            <button class="aero-button" id="btn-view-data">${_('View Existing Data')}</button>
                        </div>
                    </div>
                    <div id="formbuilderpage" class="form-list-container">
                        ${renderDashboard(state)}
                    </div>
                </div>
            `;
        }
    });
}

function bindFormbuilderEvents() {
    if (_formbuilderListenersAdded) return;
    _formbuilderListenersAdded = true;

    $(document).on('click', '.pid-formbuilder #btn-create-form', function () {
        openCreateNewForm();
    });

    $(document).on('click', '.pid-formbuilder #btn-view-forms', function () {
        openAllFormsView();
    });

    $(document).on('click', '.pid-formbuilder #btn-html-creator', function () {
        openHtmlStructureCreator();
    });

    $(document).on('click', '.pid-formbuilder #btn-view-html', function () {
        viewHtmlStructures();
    });

    $(document).on('click', '.pid-formbuilder #btn-view-data', function () {
        viewExistingData();
    });

    $(document).on('click', '.pid-formbuilder .btn-add-field', function () {
        const type = $(this).data('type');
        addField(type);
    });

    $(document).on('click', '.pid-formbuilder .btn-remove-field', function () {
        $(this).closest('.form-field').remove();
    });

    $(document).on('click', '.pid-formbuilder .btn-save-form', function () {
        saveCurrentForm();
    });

    $(document).on('click', '.pid-formbuilder .btn-preview-json', function () {
        previewCurrentForm();
    });

    $(document).on('click', '.pid-formbuilder .btn-back', function () {
        openDashboard();
    });

    $(document).on('click', '.pid-formbuilder .btn-preview-form', function () {
        const formId = $(this).data('id');
        openFormDetail(formId);
    });

    $(document).on('click', '.pid-formbuilder .btn-delete-form', function () {
        const formId = $(this).data('id');
        deleteForm(formId);
    });

    $(document).on('click', '.pid-formbuilder .btn-save-html', function () {
        saveHtmlStructure();
    });

    $(document).on('click', '.pid-formbuilder .btn-delete-html', function () {
        const structureId = $(this).data('id');
        deleteHtmlStructure(structureId);
    });

    $(document).on('click', '.pid-formbuilder .btn-preview-html', function () {
        const structureId = $(this).data('id');
        previewHtmlStructure(structureId);
    });

    $(document).on('click', '.pid-formbuilder .btn-generate-data', function () {
        generateSampleData();
    });

    $(document).on('input', '.pid-formbuilder .field-name', function () {
        const $row = $(this).closest('.form-field');
        const slug = slugify($(this).val());
        const $id = $row.find('.field-id');
        const $table = $row.find('.field-table');
        if (!$id.val().trim()) {
            $id.val(slug);
        }
        if (!$table.val().trim()) {
            $table.val(slug);
        }
    });
}

function openDashboard() {
    const state = getState();
    $('.pid-formbuilder #formbuilderpage').html(renderDashboard(state));
}

function renderDashboard(state) {
    const totalForms = state.forms.length;
    const totalHtml = state.htmlStructures.length;
    const totalRecords = state.records.length;
    const formRows = totalForms > 0 ? state.forms.map(form => `
        <tr>
            <td>${escapeHtml(form.name)}</td>
            <td>${form.fields.length}</td>
            <td>${new Date(form.createdAt).toLocaleDateString()}</td>
            <td>${escapeHtml(form.permissions || _('Read'))}</td>
            <td>
                <button class="aero-button btn-preview-form" data-id="${form.id}">${_('Preview')}</button>
                <button class="aero-button btn-delete-form" data-id="${form.id}">${_('Delete')}</button>
            </td>
        </tr>
    `).join('') : '';

    return `
        <div class="dashboard-summary">
            <div class="summary-card">
                <div class="summary-value">${totalForms}</div>
                <div>${_('Forms saved')}</div>
            </div>
            <div class="summary-card">
                <div class="summary-value">${totalHtml}</div>
                <div>${_('HTML structures')}</div>
            </div>
            <div class="summary-card">
                <div class="summary-value">${totalRecords}</div>
                <div>${_('Data records')}</div>
            </div>
        </div>
        <div class="dashboard-body">
            ${totalForms > 0 ? `
                <div class="table-wrapper">
                    <table class="form-list">
                        <thead>
                            <tr>
                                <th>${_('Name')}</th>
                                <th>${_('Fields')}</th>
                                <th>${_('Date')}</th>
                                <th>${_('Permissions')}</th>
                                <th>${_('Actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${formRows}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div class="empty-state">
                    <div class="h2">${_('No forms saved yet')}</div>
                    <p>${_('Start by creating a new form or open an existing HTML structure.')}</p>
                </div>
            `}
        </div>
    `;
}

function openCreateNewForm() {
    const html = `
        <div class="create-page">
            <div class="page-header">
                <div>
                    <div class="h2">${_('Create New Form')}</div>
                    <div class="p">${_('Add form fields and save the definition for later use.')}</div>
                </div>
                <button class="aero-button btn-back">${_('Back')}</button>
            </div>
            <div class="create-grid">
                <div class="builder-sidebar">
                    <div class="sidebar-title">${_('Add fields')}</div>
                    ${['text','password','email','number','tel','url','checkbox','radio','date','file','textarea'].map(type => `
                        <button type="button" class="aero-button btn-add-field" data-type="${type}">${_(type.charAt(0).toUpperCase() + type.slice(1).replace('tel', 'Phone').replace('url','URL'))}</button>
                    `).join('')}
                </div>
                <div class="builder-content">
                    <div class="form-fields-header">
                        <div class="input-def wide">
                            <input type="text" id="formName" placeholder=" ">
                            <label>${_('Form Name')}</label>
                        </div>
                        <div class="input-def wide">
                            <select id="formPermissions">
                                <option value="read">${_('Read')}</option>
                                <option value="write">${_('Write')}</option>
                                <option value="admin">${_('Admin')}</option>
                            </select>
                            <label>${_('Permissions')}</label>
                        </div>
                    </div>
                    <div id="formFieldsContainer" class="form-fields">
                        <div class="empty-state small">${_('Use the buttons to the left to add fields to your form.')}</div>
                    </div>
                    <div class="builder-actions">
                        <button class="aero-button btn-save-form">${_('Save Form')}</button>
                        <button class="aero-button btn-preview-json">${_('Preview JSON')}</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('.pid-formbuilder #formbuilderpage').html(html);
    const container = $('.pid-formbuilder #formFieldsContainer');
    if ($.fn.sortable) {
        container.sortable({
            placeholder: 'ui-state-highlight',
            handle: '.handle',
            axis: 'y'
        }).disableSelection();
    }
}

function addField(fieldType) {
    const container = $('.pid-formbuilder #formFieldsContainer');
    if (!container.length) return;
    const rowId = `field-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    const fieldHtml = createFieldHtml(fieldType, rowId);
    if (container.find('.empty-state').length) {
        container.empty();
    }
    container.append(fieldHtml);
    if ($.fn.sortable) {
        container.sortable('refresh');
    }
}

function createFieldHtml(type, rowId) {
    const options = [
        ['text', _('Text')],
        ['password', _('Password')],
        ['email', _('Email')],
        ['number', _('Number')],
        ['tel', _('Phone')],
        ['url', _('URL')],
        ['checkbox', _('Checkbox')],
        ['radio', _('Radio Button')],
        ['date', _('Date')],
        ['file', _('File')],
        ['textarea', _('Textarea')]
    ];

    return `
        <div class="form-field" data-row-id="${rowId}">
            <div class="field-row">
                <span class="handle" title="${_('Move')}">☰</span>
                <div class="field-inputs">
                    <div class="input-def">
                        <input type="text" class="field-name" placeholder=" ">
                        <label>${_('Field Name')}</label>
                    </div>
                    <div class="input-def">
                        <input type="text" class="field-id" placeholder=" ">
                        <label>${_('Field Id')}</label>
                    </div>
                    <div class="input-def">
                        <input type="text" class="field-table" placeholder=" ">
                        <label>${_('Table Field')}</label>
                    </div>
                    <div class="input-def">
                        <select class="field-type">
                            ${options.map(([value,label]) => `<option value="${value}" ${value === type ? 'selected' : ''}>${label}</option>`).join('')}
                        </select>
                        <label>${_('Type')}</label>
                    </div>
                </div>
                <button type="button" class="aero-button btn-remove-field">${_('Remove')}</button>
            </div>
        </div>
    `;
}

function saveCurrentForm() {
    const state = getState();
    const form = buildFormDefinition();
    if (!form) return;
    state.forms.unshift(form);
    saveFormbuilderState(state);
    if (_formbuilderOS?.ui?.alert) {
        _formbuilderOS.ui.alert({
            title: _('Saved'),
            body: () => `<p>${_('Your form was saved successfully.')}</p>`,
            confirm: _('OK')
        });
    }
    openAllFormsView();
}

function buildFormDefinition() {
    const title = $('.pid-formbuilder #formName').val()?.trim() || '';
    const permissions = $('.pid-formbuilder #formPermissions').val() || 'read';
    if (!title) {
        if (_formbuilderOS?.ui?.alert) {
            _formbuilderOS.ui.alert({
                title: _('Validation'),
                body: () => `<p>${_('A form name is required.')}</p>`,
                confirm: _('OK')
            });
        }
        return null;
    }

    const fields = [];
    const usedIds = new Set();
    let valid = true;

    $('.pid-formbuilder #formFieldsContainer .form-field').each(function () {
        const $row = $(this);
        const name = $row.find('.field-name').val()?.trim() || '';
        let id = $row.find('.field-id').val()?.trim() || '';
        const table = $row.find('.field-table').val()?.trim() || '';
        const type = $row.find('.field-type').val() || 'text';

        if (!name) {
            valid = false;
            return false;
        }

        if (!id) {
            id = slugify(name);
        }

        if (usedIds.has(id)) {
            valid = false;
            return false;
        }

        usedIds.add(id);
        fields.push({
            name,
            id,
            table: table || id,
            type
        });
    });

    if (!valid) {
        if (_formbuilderOS?.ui?.alert) {
            _formbuilderOS.ui.alert({
                title: _('Validation'),
                body: () => `<p>${_('Please ensure every field has a unique name and id.')}</p>`,
                confirm: _('OK')
            });
        }
        return null;
    }

    if (fields.length === 0) {
        if (_formbuilderOS?.ui?.alert) {
            _formbuilderOS.ui.alert({
                title: _('Validation'),
                body: () => `<p>${_('Please add at least one field before saving.')}</p>`,
                confirm: _('OK')
            });
        }
        return null;
    }

    return {
        id: `form-${Date.now()}`,
        name: title,
        permissions,
        fields,
        createdAt: new Date().toISOString()
    };
}

function previewCurrentForm() {
    const form = buildFormDefinition();
    if (!form) return;
    const json = JSON.stringify(form, null, 2);
    if (_formbuilderOS?.ui?.alert) {
        _formbuilderOS.ui.alert({
            title: _('Form JSON'),
            body: () => `<pre>${escapeHtml(json)}</pre>`,
            confirm: _('OK')
        });
    }
}

function openAllFormsView() {
    const state = getState();
    const rows = state.forms.length > 0 ? state.forms.map(form => `
        <tr>
            <td>${escapeHtml(form.name)}</td>
            <td>${form.fields.length}</td>
            <td>${new Date(form.createdAt).toLocaleDateString()}</td>
            <td>${escapeHtml(form.permissions)}</td>
            <td>
                <button class="aero-button btn-preview-form" data-id="${form.id}">${_('Preview')}</button>
                <button class="aero-button btn-delete-form" data-id="${form.id}">${_('Delete')}</button>
            </td>
        </tr>
    `).join('') : '';

    const html = `
        <div class="page-header">
            <div>
                <div class="h2">${_('Saved Forms')}</div>
                <div class="p">${_('Review saved forms and preview details.')}</div>
            </div>
            <button class="aero-button btn-back">${_('Back')}</button>
        </div>
        ${state.forms.length > 0 ? `
            <div class="table-wrapper">
                <table class="form-list">
                    <thead>
                        <tr>
                            <th>${_('Name')}</th>
                            <th>${_('Fields')}</th>
                            <th>${_('Date')}</th>
                            <th>${_('Permissions')}</th>
                            <th>${_('Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        ` : `
            <div class="empty-state">
                <div class="h2">${_('No saved forms')}</div>
                <p>${_('Create a new form to begin building and saving form definitions.')}</p>
            </div>
        `}
    `;

    $('.pid-formbuilder #formbuilderpage').html(html);
}

function openFormDetail(formId) {
    const state = getState();
    const form = state.forms.find(item => item.id === formId);
    if (!form) {
        if (_formbuilderOS?.ui?.alert) {
            _formbuilderOS.ui.alert({
                title: _('Not found'),
                body: () => `<p>${_('The selected form could not be found.')}</p>`,
                confirm: _('OK')
            });
        }
        return;
    }

    const fieldRows = form.fields.map(field => `
        <tr>
            <td>${escapeHtml(field.name)}</td>
            <td>${escapeHtml(field.id)}</td>
            <td>${escapeHtml(field.type)}</td>
            <td>${escapeHtml(field.table)}</td>
        </tr>
    `).join('');

    const html = `
        <div class="page-header">
            <div>
                <div class="h2">${escapeHtml(form.name)}</div>
                <div class="p">${_('Form saved on')} ${new Date(form.createdAt).toLocaleDateString()}</div>
            </div>
            <button class="aero-button btn-back">${_('Back')}</button>
        </div>
        <div class="detail-block">
            <div><strong>${_('Permissions')}:</strong> ${escapeHtml(form.permissions)}</div>
            <div class="table-wrapper">
                <table class="form-list">
                    <thead>
                        <tr>
                            <th>${_('Name')}</th>
                            <th>${_('Id')}</th>
                            <th>${_('Type')}</th>
                            <th>${_('Table Field')}</th>
                        </tr>
                    </thead>
                    <tbody>${fieldRows}</tbody>
                </table>
            </div>
        </div>
    `;

    $('.pid-formbuilder #formbuilderpage').html(html);
}

function deleteForm(formId) {
    const state = getState();
    state.forms = state.forms.filter(item => item.id !== formId);
    saveFormbuilderState(state);
    openAllFormsView();
}

function openHtmlStructureCreator() {
    const html = `
        <div class="page-header">
            <div>
                <div class="h2">${_('Create HTML Structure')}</div>
                <div class="p">${_('Save custom HTML snippets for reuse in forms and layouts.')}</div>
            </div>
            <button class="aero-button btn-back">${_('Back')}</button>
        </div>
        <div class="html-creator">
            <div class="input-def wide">
                <input type="text" id="htmlStructureName" placeholder=" ">
                <label>${_('Structure Name')}</label>
            </div>
            <div class="input-def wide">
                <textarea id="htmlStructureCode" placeholder="" rows="10"></textarea>
                <label>${_('HTML Code')}</label>
            </div>
            <div class="builder-actions">
                <button class="aero-button btn-save-html">${_('Save Structure')}</button>
            </div>
        </div>
    `;

    $('.pid-formbuilder #formbuilderpage').html(html);
}

function saveHtmlStructure() {
    const state = getState();
    const name = $('.pid-formbuilder #htmlStructureName').val()?.trim() || '';
    const code = $('.pid-formbuilder #htmlStructureCode').val()?.trim() || '';

    if (!name || !code) {
        if (_formbuilderOS?.ui?.alert) {
            _formbuilderOS.ui.alert({
                title: _('Validation'),
                body: () => `<p>${_('Both a name and HTML code are required.')}</p>`,
                confirm: _('OK')
            });
        }
        return;
    }

    state.htmlStructures.unshift({
        id: `html-${Date.now()}`,
        name,
        code,
        createdAt: new Date().toISOString()
    });
    saveFormbuilderState(state);
    if (_formbuilderOS?.ui?.alert) {
        _formbuilderOS.ui.alert({
            title: _('Saved'),
            body: () => `<p>${_('HTML structure saved successfully.')}</p>`,
            confirm: _('OK')
        });
    }
    viewHtmlStructures();
}

function viewHtmlStructures() {
    const state = getState();
    const rows = state.htmlStructures.length > 0 ? state.htmlStructures.map(structure => `
        <tr>
            <td>${escapeHtml(structure.name)}</td>
            <td>${new Date(structure.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="aero-button btn-preview-html" data-id="${structure.id}">${_('Preview')}</button>
                <button class="aero-button btn-delete-html" data-id="${structure.id}">${_('Delete')}</button>
            </td>
        </tr>
    `).join('') : '';

    const html = `
        <div class="page-header">
            <div>
                <div class="h2">${_('Saved HTML Structures')}</div>
                <div class="p">${_('Review and preview your stored HTML snippets.')}</div>
            </div>
            <button class="aero-button btn-back">${_('Back')}</button>
        </div>
        ${state.htmlStructures.length > 0 ? `
            <div class="table-wrapper">
                <table class="form-list">
                    <thead>
                        <tr>
                            <th>${_('Name')}</th>
                            <th>${_('Date')}</th>
                            <th>${_('Actions')}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        ` : `
            <div class="empty-state">
                <div class="h2">${_('No HTML structures')}</div>
                <p>${_('Create a new HTML structure to save reusable snippets.')}</p>
            </div>
        `}
    `;

    $('.pid-formbuilder #formbuilderpage').html(html);
}

function deleteHtmlStructure(structureId) {
    const state = getState();
    state.htmlStructures = state.htmlStructures.filter(item => item.id !== structureId);
    saveFormbuilderState(state);
    viewHtmlStructures();
}

function previewHtmlStructure(structureId) {
    const state = getState();
    const structure = state.htmlStructures.find(item => item.id === structureId);
    if (!structure) {
        if (_formbuilderOS?.ui?.alert) {
            _formbuilderOS.ui.alert({
                title: _('Not found'),
                body: () => `<p>${_('The selected HTML structure could not be found.')}</p>`,
                confirm: _('OK')
            });
        }
        return;
    }

    if (_formbuilderOS?.ui?.alert) {
        _formbuilderOS.ui.alert({
            title: _('Preview'),
            body: () => `<pre>${escapeHtml(structure.code)}</pre>`,
            confirm: _('OK')
        });
    }
}

function viewExistingData() {
    const state = getState();
    const hasData = state.records.length > 0;
    let dataRows = '';
    if (hasData) {
        dataRows = state.records.map(record => `
            <tr>
                <td>${escapeHtml(record.formName)}</td>
                <td>${new Date(record.createdAt).toLocaleDateString()}</td>
                <td><pre>${escapeHtml(JSON.stringify(record.values, null, 2))}</pre></td>
            </tr>
        `).join('');
    }

    const html = `
        <div class="page-header">
            <div>
                <div class="h2">${_('Existing Data')}</div>
                <div class="p">${_('View data records generated from saved forms.')}</div>
            </div>
            <button class="aero-button btn-back">${_('Back')}</button>
        </div>
        ${hasData ? `
            <div class="table-wrapper">
                <table class="form-list">
                    <thead>
                        <tr>
                            <th>${_('Form')}</th>
                            <th>${_('Saved')}</th>
                            <th>${_('Values')}</th>
                        </tr>
                    </thead>
                    <tbody>${dataRows}</tbody>
                </table>
            </div>
        ` : `
            <div class="empty-state">
                <div class="h2">${_('No stored records')}</div>
                <p>${_('Generate sample data from a saved form to get started.')}</p>
                <button class="aero-button btn-generate-data">${_('Generate sample data')}</button>
            </div>
        `}
    `;

    $('.pid-formbuilder #formbuilderpage').html(html);
}

function generateSampleData() {
    const state = getState();
    if (state.forms.length === 0) {
        if (_formbuilderOS?.ui?.alert) {
            _formbuilderOS.ui.alert({
                title: _('No forms'),
                body: () => `<p>${_('Save a form first to generate sample data.')}</p>`,
                confirm: _('OK')
            });
        }
        return;
    }

    state.records = state.forms.map((form, index) => ({
        id: `rec-${Date.now()}-${index}`,
        formId: form.id,
        formName: form.name,
        values: form.fields.reduce((memo, field) => {
            memo[field.id] = sampleValue(field.type);
            return memo;
        }, {}),
        createdAt: new Date().toISOString()
    }));

    saveFormbuilderState(state);
    viewExistingData();
}

function sampleValue(type) {
    switch (type) {
        case 'email':
            return 'user@example.com';
        case 'number':
            return 123;
        case 'date':
            return new Date().toISOString().slice(0, 10);
        case 'checkbox':
            return true;
        case 'radio':
            return _('Option 1');
        case 'file':
            return _('file.txt');
        case 'textarea':
            return _('Sample text');
        case 'tel':
            return '+46123456789';
        case 'url':
            return 'https://example.com';
        default:
            return _('Example text');
    }
}

function closeProgram() {
    if (_formbuilderOS?.ui?.windows?.functions?.closeActiveWindow) {
        _formbuilderOS.ui.windows.functions.closeActiveWindow();
    }
}

function showAboutDialog() {
    if (_formbuilderOS?.ui?.alert) {
        _formbuilderOS.ui.alert({
            title: _('About Formbuilder'),
            body: () => `<p>${_('Formbuilder version 1.0')}</p><p>${_('Build simple forms, save definitions and preview HTML snippets.')}</p>`,
            confirm: _('OK')
        });
    }
}

function showHelp() {
    if (_formbuilderOS?.ui?.alert) {
        _formbuilderOS.ui.alert({
            title: _('Help'),
            body: () => `
                <p>${_('Use the File menu or the buttons to create a new form, review saved forms, store HTML structures and examine data records.')}</p>
                <ul>
                    <li>${_('Create New Form: Build a form definition using field types.')}</li>
                    <li>${_('View All Forms: See saved form definitions and preview details.')}</li>
                    <li>${_('Create HTML Structure: Store an HTML snippet for reuse.')}</li>
                    <li>${_('View Existing Data: Generate sample data from saved forms.')}</li>
                </ul>
            `,
            confirm: _('OK')
        });
    }
}

function getState() {
    if (window.app && window.app.formbuilder) {
        return window.app.formbuilder;
    }
    return loadFormbuilderState();
}

function loadFormbuilderState() {
    let parsed = null;
    try {
        if (window.localStorage) {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            parsed = stored ? JSON.parse(stored) : null;
        }
    } catch (error) {
        console.warn('Formbuilder localStorage load failed:', error);
    }

    const state = Object.assign({
        forms: [],
        htmlStructures: [],
        records: []
    }, parsed || {});

    window.app = window.app || {};
    window.app.formbuilder = state;
    return state;
}

function saveFormbuilderState(state) {
    window.app = window.app || {};
    window.app.formbuilder = state;
    try {
        if (window.localStorage) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
    } catch (error) {
        console.warn('Formbuilder localStorage save failed:', error);
    }
}

function slugify(value) {
    return (value || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

function escapeHtml(unsafe) {
    return app.util.escapeHtml(unsafe);
}

const css = `
    .pid-formbuilder .formbuilder {
        font-family: Arial, sans-serif;
        color: #f5f5f5;
        background: #1f1f1f;
        min-height: 100%;
    }

    .pid-formbuilder .formbuilder-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 20px 24px 10px 24px;
        background: #262626;
        border-bottom: 1px solid rgba(255,255,255,0.08);
    }

    .pid-formbuilder .formbuilder-header .h1 {
        font-size: 24px;
        margin-bottom: 6px;
    }

    .pid-formbuilder .formbuilder-header .p {
        color: #d1d1d1;
        font-size: 13px;
        margin: 0;
    }

    .pid-formbuilder .formbuilder-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
    }

    .pid-formbuilder .formbuilder-buttons .aero-button {
        min-width: 145px;
    }

    .pid-formbuilder .dashboard-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin: 20px 24px;
    }

    .pid-formbuilder .summary-card {
        background: #252525;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 18px 20px;
        min-width: 150px;
        flex: 1;
    }

    .pid-formbuilder .summary-value {
        font-size: 28px;
        font-weight: 700;
        margin-bottom: 6px;
    }

    .pid-formbuilder .dashboard-body,
    .pid-formbuilder .table-wrapper,
    .pid-formbuilder .empty-state,
    .pid-formbuilder .detail-block,
    .pid-formbuilder .html-creator,
    .pid-formbuilder .create-page,
    .pid-formbuilder .page-header {
        margin: 0 24px 24px 24px;
    }

    .pid-formbuilder .table-wrapper {
        overflow-x: auto;
        background: #202020;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 12px;
    }

    .pid-formbuilder .form-list {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }

    .pid-formbuilder .form-list th,
    .pid-formbuilder .form-list td {
        padding: 11px 12px;
        text-align: left;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        color: #f5f5f5;
    }

    .pid-formbuilder .form-list th {
        color: #c8c8c8;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }

    .pid-formbuilder .form-list tbody tr:hover {
        background: rgba(255,255,255,0.03);
    }

    .pid-formbuilder .empty-state {
        padding: 40px;
        text-align: center;
        border: 1px dashed rgba(255,255,255,0.12);
        border-radius: 10px;
        color: #d1d1d1;
        background: rgba(255,255,255,0.02);
    }

    .pid-formbuilder .empty-state.small {
        padding: 20px;
    }

    .pid-formbuilder .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 16px;
    }

    .pid-formbuilder .page-header .h2 {
        font-size: 20px;
        margin-bottom: 6px;
    }

    .pid-formbuilder .page-header .p {
        color: #c6c6c6;
        font-size: 13px;
        margin: 0;
    }

    .pid-formbuilder .create-grid {
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: 18px;
    }

    .pid-formbuilder .builder-sidebar {
        background: #242424;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 16px;
    }

    .pid-formbuilder .sidebar-title {
        margin-bottom: 14px;
        font-weight: 700;
    }

    .pid-formbuilder .builder-sidebar .aero-button {
        width: 100%;
        margin-bottom: 10px;
    }

    .pid-formbuilder .builder-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .pid-formbuilder .form-fields-header {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
    }

    .pid-formbuilder .input-def {
        position: relative;
        margin-bottom: 16px;
    }

    .pid-formbuilder .input-def.wide {
        flex: 1;
        min-width: 240px;
    }

    .pid-formbuilder .input-def input,
    .pid-formbuilder .input-def select,
    .pid-formbuilder .input-def textarea {
        width: 100%;
        padding: 12px 12px 10px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.12);
        background: #1d1d1d;
        color: #f5f5f5;
        outline: none;
        font-size: 14px;
    }

    .pid-formbuilder .input-def textarea {
        min-height: 180px;
        resize: vertical;
    }

    .pid-formbuilder .input-def label {
        position: absolute;
        top: 12px;
        left: 14px;
        pointer-events: none;
        color: rgba(255,255,255,0.7);
        font-size: 12px;
        transition: transform 0.2s ease, font-size 0.2s ease;
    }

    .pid-formbuilder .input-def input:focus + label,
    .pid-formbuilder .input-def select:focus + label,
    .pid-formbuilder .input-def textarea:focus + label,
    .pid-formbuilder .input-def input:not(:placeholder-shown) + label,
    .pid-formbuilder .input-def textarea:not(:placeholder-shown) + label {
        transform: translateY(-18px);
        font-size: 11px;
        color: #a9a9a9;
    }

    .pid-formbuilder .form-fields {
        background: #202020;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 12px;
        min-height: 220px;
    }

    .pid-formbuilder .form-field {
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        background: #171717;
        padding: 12px;
        margin-bottom: 10px;
    }

    .pid-formbuilder .field-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
    }

    .pid-formbuilder .field-row .handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: rgba(255,255,255,0.06);
        border-radius: 8px;
        cursor: move;
        user-select: none;
    }

    .pid-formbuilder .field-inputs {
        display: grid;
        grid-template-columns: repeat(2, minmax(220px, 1fr));
        gap: 12px;
        flex: 1;
    }

    .pid-formbuilder .field-inputs .input-def {
        margin-bottom: 0;
    }

    .pid-formbuilder .builder-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-start;
    }

    .pid-formbuilder .detail-block {
        background: #242424;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 18px;
    }

    .pid-formbuilder pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: rgba(255,255,255,0.04);
        border-radius: 10px;
        padding: 12px;
        color: #f8f8f8;
        overflow-x: auto;
    }

    .pid-formbuilder .formbuilder-menu .menu-bar {
        background: #242424;
    }
`;