/**
 * @file window/snap-zones.js
 * @description Quarter-splitting zone-occupancy registry for dragresize.js's
 * left/right half-snap. A left or right workspace half holds two quarter
 * slots (top/bottom); this module owns which windowId currently sits in
 * each slot and all the rect math, so dragresize.js only ever asks "is
 * snapping allowed right now" and "what rect(s) result from dropping here."
 *
 * Not imported by window/index.js — used directly by dragresize.js (drag
 * wiring) and lifecycle.js (close/minimize/maximize eviction hooks), same
 * as any other sibling helper in this split.
 *
 * @module components/ui/window/snap-zones
 */

const SLOTS = ['topLeft', 'bottomLeft', 'topRight', 'bottomRight'];

/** slot -> windowId|null */
const registry = { topLeft: null, bottomLeft: null, topRight: null, bottomRight: null };

function halfRect(ws, side) {
    return {
        x: side === 'left' ? ws.x : ws.x + ws.width / 2,
        y: ws.y,
        width: ws.width / 2,
        height: ws.height,
    };
}

function quarterRect(ws, slot) {
    const isLeft = slot === 'topLeft' || slot === 'bottomLeft';
    const isTop = slot === 'topLeft' || slot === 'topRight';
    return {
        x: isLeft ? ws.x : ws.x + ws.width / 2,
        y: isTop ? ws.y : ws.y + ws.height / 2,
        width: ws.width / 2,
        height: ws.height / 2,
    };
}

function applyRect($el, rect) {
    $el.css({
        right: "", bottom: "",
        left: rect.x + "px", top: rect.y + "px",
        width: rect.width + "px", height: rect.height + "px",
    });
}

/**
 * Whether the drag currently in progress may snap at all — false while
 * Shift is held (temporary per-drag override), while Snap Layout is
 * disabled in Control Panel, or below the tablet breakpoint.
 * @param {MouseEvent} [event] - the live jQuery UI drag event, if any.
 */
export function isSnapAllowed(event) {
    if (event && event.shiftKey) return false;

    const api = app.responsiveLayout && app.responsiveLayout.api;
    if (!api || typeof api.isSnapEnabled !== 'function' || !api.isSnapEnabled()) return false;

    const tablet = api.getConfig()?.default?.breakpoints?.tablet;
    const tabletBp = Number.isFinite(tablet) ? tablet : 768;
    return window.innerWidth >= tabletBp;
}

const CORNER_BAND = 0.2;

/**
 * Resolves what dropping the dragged window on `side` would produce, given
 * the current zone occupancy and cursor Y.
 *
 * - Cursor in the top or bottom band of the workspace height → always
 *   targets that specific quarter (topSlot/bottomSlot), regardless of
 *   whether the side is otherwise empty. If that exact quarter is already
 *   held by another window, returns `null` (no snap). If the complementary
 *   slot is held by a window spanning the whole half, that window shrinks
 *   into its own complementary quarter as part of the commit.
 * - Cursor in the middle band → a plain half, but only when the side is
 *   completely free; with any existing occupant there's no unambiguous
 *   middle-band target, so it returns `null`.
 *
 * @param {{x:number,y:number,width:number,height:number}} ws - workspace rect
 * @param {"left"|"right"} side
 * @param {number} mouseY - live page Y of the cursor
 * @param {string} draggedWindowId - excluded from occupancy (already cleared at drag start, but defensive)
 * @returns {{kind:'half'|'quarter', side:string, slot?:string, rect:Object, occupantId?:string, complementSlot?:string, occupantRect?:Object}|null}
 */
export function resolveSnapTarget(ws, side, mouseY, draggedWindowId) {
    if (side !== 'left' && side !== 'right') return null;

    const topSlot = side === 'left' ? 'topLeft' : 'topRight';
    const bottomSlot = side === 'left' ? 'bottomLeft' : 'bottomRight';

    const topOccupant = (registry[topSlot] && registry[topSlot] !== draggedWindowId) ? registry[topSlot] : null;
    const bottomOccupant = (registry[bottomSlot] && registry[bottomSlot] !== draggedWindowId) ? registry[bottomSlot] : null;

    const relY = (mouseY - ws.y) / ws.height;
    const vertical = relY < CORNER_BAND ? 'top' : (relY > 1 - CORNER_BAND ? 'bottom' : null);

    if (vertical === null) {
        if (!topOccupant && !bottomOccupant) {
            return { kind: 'half', side, rect: halfRect(ws, side) };
        }
        return null;
    }

    const targetSlot    = vertical === 'top' ? topSlot : bottomSlot;
    const otherSlot      = vertical === 'top' ? bottomSlot : topSlot;
    const targetOccupant = vertical === 'top' ? topOccupant : bottomOccupant;

    if (topOccupant && bottomOccupant && topOccupant === bottomOccupant) {
        return {
            kind: 'quarter', side, slot: targetSlot,
            rect: quarterRect(ws, targetSlot),
            occupantId: topOccupant,
            complementSlot: otherSlot,
            occupantRect: quarterRect(ws, otherSlot),
        };
    }

    if (targetOccupant) return null; // that exact corner has its own distinct occupant already

    // Target quarter is free; the other one is either empty or already its
    // own independent quarter-occupant — just take the free target quarter.
    return { kind: 'quarter', side, slot: targetSlot, rect: quarterRect(ws, targetSlot) };
}

/**
 * Applies a resolved target to the dragged window (and, for a quarter
 * split, resizes the existing occupant into the complementary quarter) and
 * updates the zone registry accordingly.
 *
 * @param {jQuery} windowElement - the dragged window's element.
 * @param {string} windowId
 * @param {Object|null} target - the value last returned by resolveSnapTarget.
 */
export function commitSnap(windowElement, windowId, target) {
    if (!target) return;

    windowElement.removeClass('maximized');

    clearWindowFromAllZones(windowId);

    if (target.kind === 'half') {
        applyRect(windowElement, target.rect);
        const topSlot = target.side === 'left' ? 'topLeft' : 'topRight';
        const bottomSlot = target.side === 'left' ? 'bottomLeft' : 'bottomRight';
        registry[topSlot] = windowId;
        registry[bottomSlot] = windowId;
        windowElement.data('snap.slots', [topSlot, bottomSlot]);
        return;
    }

    // Quarter: evict the occupant from its old slot(s) first, then place
    // both windows into their final quarters.
    if (target.occupantId) clearWindowFromAllZones(target.occupantId);

    applyRect(windowElement, target.rect);
    registry[target.slot] = windowId;
    windowElement.data('snap.slots', [target.slot]);

    if (target.occupantId && target.complementSlot) {
        const $occupant = $(`#${target.occupantId}-win`);
        if ($occupant.length) {
            $occupant.css({ transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease" });
            applyRect($occupant, target.occupantRect);
            $occupant.data('snap.slots', [target.complementSlot]);
        }
        registry[target.complementSlot] = target.occupantId;
    }
}

/**
 * Recomputes and re-applies a snapped window's rect from its recorded
 * slot(s) against the CURRENT workspace rect. `applyRect` only ever writes
 * absolute pixel left/top/width/height at the moment a window snaps — a
 * later browser resize changes the workspace, but nothing revisits that
 * pixel rect on its own, so a snapped window is otherwise stuck at
 * whatever size it happened to get at snap time forever. Called from
 * dragresize.js's adjust() for any window still carrying `snap.slots` data.
 *
 * @param {jQuery} windowElement - the snapped window's element.
 * @param {{x:number,y:number,width:number,height:number}} ws - current workspace rect.
 * @returns {boolean} true if the window had slots and was reflowed.
 */
export function reflowSlots(windowElement, ws) {
    const slots = windowElement.data('snap.slots');
    if (!slots || !slots.length) return false;

    if (slots.length === 2) {
        // Half: both slots are the top/bottom pair of the same side.
        const side = (slots[0] === 'topLeft' || slots[0] === 'bottomLeft') ? 'left' : 'right';
        applyRect(windowElement, halfRect(ws, side));
    } else {
        // Quarter: single slot.
        applyRect(windowElement, quarterRect(ws, slots[0]));
    }
    return true;
}

/**
 * Frees every slot currently held by `windowId` — called when it closes,
 * minimizes, or maximizes, so a fresh drag to that edge sees the slot as
 * available again instead of permanently "owned" by a gone/hidden window.
 * @param {string} windowId
 */
export function clearWindowFromAllZones(windowId) {
    if (!windowId) return;
    SLOTS.forEach(slot => { if (registry[slot] === windowId) registry[slot] = null; });
}
