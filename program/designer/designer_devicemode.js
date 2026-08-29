/**
 * @file designer/designer_devicemode.js
 * @description Device-mode dropdown for the Designer canvas. Lazy-loaded by
 * `designer.js`'s `start()` once the window's DOM (#designerDeviceMode,
 * #designerCanvasBody) already exists.
 *
 * Exports `init(app)` — fills #designerDeviceMode with an `app.ui.dropmenu`
 * of device presets and, on change, sets #designerCanvasBody's width/height
 * to match (or 100% for "Full").
 *
 * @module program/designer/designer_devicemode
 */

function apply(devices, body, value) {
    const device = devices.find(d => d.value === value) || devices[0];
    body.style.width  = device.width  == null ? '100%' : device.width  + 'px';
    body.style.height = device.height == null ? '100%' : device.height + 'px';
}

export function init(app) {
    const mount = document.getElementById('designerDeviceMode');
    const body  = document.getElementById('designerCanvasBody');
    if (!mount || !body) return;

    const devices = [
        { value: 'full',  label: _('Full (100%)'),         width: 1440, height: null },
        { value: 'm320',  label: _('Mobile S — 320×568'),  width: 320,  height: 568 },
        { value: 'm350',  label: _('Mobile — 350×640'),    width: 350,  height: 640 },
        { value: 'm425',  label: _('Mobile L — 425×812'),  width: 425,  height: 812 },
        { value: 't768',  label: _('Tablet — 768×1024'),   width: 768,  height: 1024 },
        { value: 'l1024', label: _('Laptop — 1024×768'),   width: 1024, height: 768 },
        { value: 'd1440', label: _('Desktop — 1440×900'),  width: 1440, height: 900 },
        { value: 'd2560', label: _('2560×1600 (Recommended)'), width: 2560, height: 1600 },
        { value: 'd2048', label: _('2048×1536'),            width: 2048, height: 1536 },
        { value: 'd1920a', label: _('1920×1200'),           width: 1920, height: 1200 },
        { value: 'd1920b', label: _('1920×1080'),           width: 1920, height: 1080 },
        { value: 'd1680', label: _('1680×1050'),            width: 1680, height: 1050 },
        { value: 'd1600a', label: _('1600×1200'),           width: 1600, height: 1200 },
        { value: 'd1600b', label: _('1600×1000'),           width: 1600, height: 1000 },
        { value: 'd1280a', label: _('1280×1024'),           width: 1280, height: 1024 },
        { value: 'd1280b', label: _('1280×800'),            width: 1280, height: 800 },
        { value: 'd1280c', label: _('1280×720'),            width: 1280, height: 720 },
        { value: 'd1024',  label: _('1024×768'),            width: 1024, height: 768 },
        { value: 'd800',   label: _('800×600'),             width: 800,  height: 600 }
    ];

    mount.innerHTML = app.ui.dropmenu({
        id: 'designerDeviceModeSelect',
        options: devices.map(d => ({ value: d.value, label: d.label })),
        selected: 'd1440',
        direction: 'up'
    });
    app.ui.dropmenu.initAll();

    const select = document.getElementById('designerDeviceModeSelect');
    if (select) {
        select.style.height          = '100%';
        select.style.marginBottom    = '0';
        select.style.backgroundColor = 'rgba(0, 0, 0, 0.15)';
        select.style.borderRadius    = '0';
    }

    const arrow = select?.querySelector('.ui-dropmenu-arrow');
    if (arrow) {
        arrow.innerHTML = '<svg viewBox="0 0 10 10" width="9" height="9"><path d="M5 8 L9 2 L1 2 Z" fill="#ffffff" opacity="0.6"/></svg>';
    }

    if (select) {
        select.style.fontSize = '10px';
        select.querySelectorAll('.ui-dropmenu-option').forEach(opt => opt.style.fontSize = '10px');
    }

    apply(devices, body, 'd1440');

    document.getElementById('designerDeviceModeSelect')
        ?.addEventListener('change', e => apply(devices, body, e.target.value));
}
