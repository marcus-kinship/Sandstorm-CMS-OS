/**
 * @file designer/core/document.js
 * @description Object-model core for the Designer: `Node` (a single block in
 * the tree) and `Document` (the tree + tree-editing operations). Plain ES
 * module with no `app` dependency — imported directly (not lazy-loaded via
 * `app.includeModule`) by the files that need it, since these are real code
 * dependencies rather than runtime feature wiring.
 *
 * The DOM is never the source of truth here — `designer_objectmodel.js`
 * renders a `Document` into `#designerCanvasBody` on every change; nothing
 * reads state back out of the DOM.
 *
 * @module program/designer/core/document
 */

let _uid = 1;

/** Generates a locally-unique node id, e.g. "text3". Not persisted across reloads. */
export function generateId(prefix = 'node') {
    return `${prefix}${_uid++}`;
}

const KNOWN_KEYS = new Set(['id', 'type', 'name', 'layout', 'style', 'props', 'children']);

export class Node {
    constructor(data = {}) {
        this.id = data.id || generateId(data.type || 'node');
        this.type = data.type || 'container';
        this.name = data.name || this.type;
        this.layout = data.layout || { mode: 'flow' };
        this.style = data.style || {};
        this.props = { ...(data.props || {}) };
        this.children = (data.children || []).map(c => (c instanceof Node ? c : new Node(c)));

        for (const key of Object.keys(data)) {
            if (!KNOWN_KEYS.has(key) && !(key in this.props)) this.props[key] = data[key];
        }
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            layout: this.layout,
            style: this.style,
            props: this.props,
            children: this.children.map(c => c.toJSON())
        };
    }

    /** Depth-first search for a node by id, starting at (and including) this node. */
    find(id) {
        if (this.id === id) return this;
        for (const child of this.children) {
            const found = child.find(id);
            if (found) return found;
        }
        return null;
    }

    /** Depth-first search for the direct parent of the node with the given id. */
    findParentOf(id) {
        for (const child of this.children) {
            if (child.id === id) return this;
            const found = child.findParentOf(id);
            if (found) return found;
        }
        return null;
    }

    insertChild(node, index = this.children.length) {
        this.children.splice(index, 0, node);
        return node;
    }

    /**
     * Swaps the child with the given id for `newNode` at the same index —
     * a single atomic operation, unlike insert-then-remove-by-id. That
     * matters whenever `newNode`'s own subtree embeds the very node being
     * replaced (e.g. wrapping a node in a new splitter that contains it):
     * insert-then-remove would briefly leave a node with that id at two
     * tree positions at once, and findParentOf's depth-first id search
     * would resolve to the wrong one.
     */
    replaceChild(id, newNode) {
        const idx = this.children.findIndex(c => c.id === id);
        if (idx === -1) return false;
        this.children.splice(idx, 1, newNode instanceof Node ? newNode : new Node(newNode));
        return true;
    }

    removeChild(id) {
        const idx = this.children.findIndex(c => c.id === id);
        if (idx === -1) return false;
        this.children.splice(idx, 1);
        return true;
    }

    /** Visits this node and every descendant, depth-first. */
    walk(fn, depth = 0) {
        fn(this, depth);
        this.children.forEach(c => c.walk(fn, depth + 1));
    }
}

export class Document {
    /**
     * @param {Node|Object} [root]
     * @param {{rules: Array<{selector: string, state?: string, breakpoint?: string, style: Object}>}} [stylesheet] -
     *   Style Binding foundation (Step 1) — a flat list of `.class`/`#id`
     *   rules, matched against each node's `props.classes`/`props.id` and
     *   merged beneath its own inline `style` by core/stylesheet.js's
     *   `resolveComputedStyle()` (core/style.js's `buildStyle()` calls it
     *   internally — nothing here or in the renderer needs to know that).
     *   A rule's own identity is `(selector, state, breakpoint)`, not
     *   `selector` alone — `state` is `'hover'|'active'|'focus'|'disabled'`
     *   (Step 7), `breakpoint` is `'tablet'|'mobile'` (Step 8), either
     *   absent for the selector's normal rule. No selector combinators yet;
     *   see core/stylesheet.js's own header comment for the planned next
     *   steps.
     */
    constructor(root, stylesheet) {
        this.root = root instanceof Node ? root : new Node(root || { type: 'container', name: 'Canvas' });
        this.stylesheet = (stylesheet && Array.isArray(stylesheet.rules)) ? stylesheet : { rules: [] };
    }

    find(id) {
        return this.root.find(id);
    }

    /**
     * Inserts `node` relative to `targetId`.
     * @param {Node|Object} node
     * @param {string} [targetId] - Omit to insert at the root's end.
     * @param {'inside'|'before'|'after'} [position='inside']
     */
    insertNode(node, targetId, position = 'inside') {
        const n = node instanceof Node ? node : new Node(node);
        if (!targetId) { this.root.insertChild(n); return n; }

        const target = this.root.find(targetId);
        if (!target) { this.root.insertChild(n); return n; }

        if (position === 'inside') {
            target.insertChild(n);
            return n;
        }

        const parent = this.root.findParentOf(targetId);
        if (!parent) { this.root.insertChild(n); return n; }
        const idx = parent.children.findIndex(c => c.id === targetId);
        parent.insertChild(n, position === 'before' ? idx : idx + 1);
        return n;
    }

    removeNode(id) {
        const parent = this.root.findParentOf(id);
        if (!parent) return false;
        return parent.removeChild(id);
    }

    toJSON() {
        return { version: '1.0', document: this.root.toJSON(), stylesheet: this.stylesheet };
    }

    static fromJSON(json) {
        const rootData = json?.document || json;
        return new Document(new Node(rootData), json?.stylesheet);
    }
}
