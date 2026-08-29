/**
 * @file designer/core/parser.js
 * @description `designer.parser.load(json)` / `.serialize(document)` — the
 * boundary between saved JSON and the live `Document` tree. Thin by design;
 * `Document.fromJSON`/`toJSON` do the real work, this just names the public
 * entry points the way `designer.parser.load(json)` is documented to work.
 *
 * @module program/designer/core/parser
 */

import { Document } from './document.js';

/** @returns {Document} */
export function load(json) {
    return Document.fromJSON(json);
}

/** @returns {{version: string, document: Object}} */
export function serialize(doc) {
    return doc.toJSON();
}
