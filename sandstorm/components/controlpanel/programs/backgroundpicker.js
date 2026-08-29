/**
 * @file controlpanel/programs/backgroundpicker.js
 * @description Shared thumbnail-picker sub-widget (original/recent slots +
 * "+" button + preview), extracted out of `customized.content.js`'s
 * `renderBackground()` so it can be reused by other Control Panel sections
 * that need their own image picker without depending on the live desktop
 * background — the caller decides what "apply" means via `onApply`/`onClear`.
 *
 * The cosmetic `.background-thumbnail`/`.background-settings-left/right`
 * classes stay shared/unprefixed (pure CSS, not JS-targeted); the
 * functional view/original/slot/plus-button ids and classes are scoped by
 * `idPrefix` so two instances (e.g. desktop background + login background)
 * never collide.
 *
 * @module components/controlpanel/programs/backgroundpicker
 */

const _CSS = `
.bgp-original {
    position: relative;
    border-style: dashed !important;
}
.bgp-original:empty::before,
.bgp-original:not([style*="background-image"])::before {
    content: '✕';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: rgba(255,255,255,0.35);
}

.background-settings-container .row {
    display: flex;
    gap: 24px;
    align-items: flex-start;
}

.background-settings-left {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
}

.background-settings-left > div:first-child {
    color: #fff;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
}

.background-settings-right {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 6px;
}

.background-thumbnail {
    background-color: rgba(0, 0, 0, 0.25);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    width: 90px;
    height: 58px;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.15);
    box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
    cursor: default;
    transition: border-color 0.2s;
    box-sizing: border-box;
}

.background-thumbnail:hover {
    border-color: rgba(255,255,255,0.35);
}

.background-settings-right .background-thumbnail {
    flex-shrink: 0;
}

.background-settings-left .background-thumbnail {
    width: 160px;
    height: 100px;
}

.bg-picker-plus {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    color: rgba(255,255,255,0.5);
    position: relative;
}
`;

let _cssInjected = false;

/** Idempotent — safe to call from every caller's own setup(os). */
export function injectCSS(os) {
    if (_cssInjected) return;
    os.addCSS('cp-backgroundpicker', _CSS);
    _cssInjected = true;
}

/**
 * @param {Object} os
 * @param {{idPrefix:string, currentImage?:string, previewImage?:string, title?:string}} opts
 * `previewImage` (defaults to `currentImage`) drives what's VISUALLY shown
 * in both the main "-view" box and the "Original" slot — lets a caller
 * preview the actually-resolved background (e.g. login's OS-follow
 * fallback) even when there's no raw override yet, so the two panels look
 * consistent (desktop's own "Original" always shows its real current
 * wallpaper; login's should too, not sit empty). `currentImage` (the raw
 * override, possibly empty) still separately drives the "Original" slot's
 * CLICK behavior in bindThumbnailPicker below — what it looks like and
 * what clicking it does are intentionally decoupled.
 * @returns {string}
 */
export function renderThumbnailPickerHTML(os, { idPrefix, currentImage, previewImage, title = _("Background") }) {
    const resolvedPreview = previewImage !== undefined ? previewImage : currentImage;
    const bgImg = resolvedPreview
        ? `background-image:url('${resolvedPreview.replace(/'/g, "\\'")}');`
        : "";

    return `
    <div class="row">
        <div class="background-settings-left">
            <div>${app.util.escapeHtml(title)}</div>
            <div class="background-thumbnail" id="${idPrefix}-view" style="${bgImg}"></div>
        </div>
        <div class="background-settings-right" style="display:flex;flex-wrap:nowrap;margin-top:25px;column-gap:22px;">
            <div class="background-thumbnail bgp-original ${idPrefix}-thumb-original" title="${_("Original")}" style="${bgImg}">
                <span style="font-size:9px;position:absolute;bottom:4px;left:0;right:0;text-align:center;color:rgba(255,255,255,0.7);text-shadow:0 1px 2px #000;pointer-events:none;">${_('Original')}</span>
            </div>
            <div class="background-thumbnail ${idPrefix}-thumb-slot" data-index="0" title="${_("Click to set as background")}"></div>
            <div class="background-thumbnail ${idPrefix}-thumb-slot" data-index="1" title="${_("Click to set as background")}"></div>
            <div class="background-thumbnail bg-picker-plus" id="${idPrefix}-thumbnail" title="${_("Choose Image")}">+</div>
        </div>
    </div>`;
}

/**
 * @param {Object} os
 * @param {{idPrefix:string, currentImage?:string, onApply:(url:string)=>void, onClear?:()=>void}} opts
 */
export function bindThumbnailPicker(os, { idPrefix, currentImage, onApply, onClear }) {
    let tempImages = [];

    function updateThumbs() {
        document.querySelectorAll(`.${idPrefix}-thumb-slot`).forEach((el) => {
            const i = parseInt(el.dataset.index);
            el.style.backgroundImage = tempImages[i] ? `url(${tempImages[i]})` : "";
        });
    }

    async function applyImage(url) {
        const view = document.getElementById(`${idPrefix}-view`);
        if (view) view.style.backgroundImage = `url(${url})`;
        onApply(url);
    }

    const originalThumbEl = document.querySelector(`.${idPrefix}-thumb-original`);
    if (originalThumbEl) {
        originalThumbEl.addEventListener('click', async () => {
            if (currentImage) {
                await applyImage(currentImage);
            } else if (typeof onClear === 'function') {
                const view = document.getElementById(`${idPrefix}-view`);
                if (view) view.style.backgroundImage = '';
                onClear();
            }
        });
    }

    document.querySelectorAll(`.${idPrefix}-thumb-slot`).forEach((el) => {
        el.addEventListener("click", async () => {
            const i = parseInt(el.dataset.index);
            if (tempImages[i]) {
                const selected = tempImages.splice(i, 1)[0];
                tempImages.unshift(selected);
                updateThumbs();
                await applyImage(selected);
            }
        });
    });

    document.getElementById(`${idPrefix}-thumbnail`)?.addEventListener("click", async () => {
        const parentWin = document.getElementById(`${idPrefix}-thumbnail`)?.closest('.window');
        const parentId = parentWin?.id?.replace('-win', '') || '';
        const path = await app.explorer.windows.select.file({
            types: ['png', 'jpg', 'jpeg', 'webp'],
            parentId,
            statusText: _("The program is waiting for the user"),
            dialogTitle: _("Select background image"),
        });
        if (!path) return;
        const node = app.explorer._getNode(path);
        const url = node?.url || node?.content;
        if (!url) return;
        tempImages.unshift(url);
        if (tempImages.length > 2) tempImages.pop();
        updateThumbs();
        await applyImage(url);
    });
}
