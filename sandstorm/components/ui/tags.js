/**
 * @file tags.js
 * @description Tag-input field with autocomplete and drag-and-drop support.
 *
 * Converts an `<input type="text|email">` element into a tag field where
 * users can enter comma/Enter-separated tags. Features:
 * - Autocomplete with keyboard navigation (Arrow, Enter, Escape).
 * - Drag-and-drop: accepts elements with a configurable CSS class.
 * - Optional custom validation per tag.
 * - Duplicate prevention (configurable).
 * - Full cleanup and restore-original-input via `app.ui.tags.remove()`.
 *
 * Requires jQuery 3.7.1+ and jQuery UI 1.13.3+.
 *
 * @module components/ui/tags
 *
 * @namespace app.ui.tags
 *
 * @example
 * app.ui.tags.set("emailInput", {
 *   allowDuplicates: false,
 *   datalist: ["alice@example.com", "bob@example.com"],
 *   validate: text => /^[^\s@]+\@[^\s@]+\.[^\s@]+$/.test(text)
 * });
 *
 * const tags = app.ui.tags.getData("emailInput"); // ["alice@example.com"]
 * app.ui.tags.remove("emailInput");               // restores original input
 */
/**
 * app.ui.tags - Tag field with autocomplete, drag & drop and restoration
 * Uses jQuery 3.7.1 and jQuery UI 1.13.3
 * FIXED VERSION - All bugs resolved
 */

(function () {
    'use strict';

    // CSS for the tag system
    const TAGS_CSS = `
    .tags-wrapper {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 42px;
    cursor: text;
    position: relative;
    background-color: #00000040;
    border-radius: 8px;
    background: var(--theme-backgruondcolorc, #00000040);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;
    width: 100%;
    box-sizing: border-box;
    }
    
    .tags-wrapper.drag-over {
      border-color: #4CAF50;
      background: #f0f8f0;
    }
    
    .tags-wrapper .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: #e3f2fd;
      border: 1px solid #90caf9;
      border-radius: 3px;
      font-size: 14px;
      user-select: none;
    }
    
    .tags-wrapper .tag-remove {
      cursor: default;
      font-weight: bold;
      color: #666;
      font-size: 16px;
      line-height: 1;
      padding: 0 2px;
    }
    
    .tags-wrapper .tag-remove:hover {
      color: #f44336;
    }
    
    .tags-wrapper .tag-input {
      flex: 1;
      min-width: 100px;
      outline: none;
      font-size: 14px;
      border: none;
      background: transparent;
    }
    
    .tags-autocomplete {
      position: absolute;
      background-color: #00000040;
      background: linear-gradient(144deg, var(--theme-backgruondcolora, rgba(37, 37, 37, 0.3)) 0%, var(--theme-backgruondcolorb, rgba(10, 10, 10, 0.2)) 47%);
      box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
      padding: 6px;
      backdrop-filter: blur(10px);
      border-top: none;
      max-height: 200px;
      overflow-y: auto;
      z-index: 10000;
      border-radius: 4px;
    }
    
    .tags-autocomplete-item {
      padding: 8px 12px;
      cursor: default;
      font-size: 14px;
      border-radius: 3px;
    }
    
    .tags-autocomplete-item:hover {
      background-color: #00000040;
    }
    
    .tags-autocomplete-item.active {
      background-color: #00000040;
      color: #ffffff;
    }
  `;

    const CSS_ID = 'app-ui-tags-styles';
    const DEFAULT_DROP_CLASS = 'draggable-tag';

    // Map to store all state
    const instances = new Map();
    let cssLoaded = false;

    /**
     * Ensure CSS is loaded once
     * @private
     */
    function ensureCSS() {
        if (!cssLoaded && typeof app !== 'undefined' && app.addCSS) {
            app.addCSS(CSS_ID, TAGS_CSS);
            cssLoaded = true;
        }
    }

    /**
     * Clean up CSS if no instances remain
     * @private
     */
    function cleanupCSS() {
        if (instances.size === 0 && cssLoaded && typeof app !== 'undefined' && app.removeCSS) {
            app.removeCSS(CSS_ID);
            cssLoaded = false;
        }
    }

    /**
     * Create a tag element
     * @private
     * @param {string} text - Tag text content
     * @param {Object} instance - Tag field instance
     * @returns {jQuery} Tag element
     */
    function createTag(text, instance) {
        const $tag = $('<span class="tag"></span>');
        const $tagText = $('<span class="tag-text"></span>').text(text);
        $tag.append($tagText);

        const $remove = $('<span class="tag-remove">×</span>');
        $remove.on('click', function (e) {
            e.stopPropagation();
            removeTag($tag, instance);
        });

        $tag.append($remove);
        return $tag;
    }

    /**
     * Remove a tag from the field
     * @private
     * @param {jQuery} $tag - Tag element to remove
     * @param {Object} instance - Tag field instance
     */
    function removeTag($tag, instance) {
        const text = $tag.find('.tag-text').text();
        $tag.remove();

        // Remove from tags array
        const index = instance.tags.indexOf(text);
        if (index > -1) {
            instance.tags.splice(index, 1);
        }

        updateOriginalInput(instance);
    }

    /**
     * Add a tag to the field
     * @private
     * @param {string} text - Tag text to add
     * @param {Object} instance - Tag field instance
     * @returns {boolean} True if tag was added, false if duplicate or empty
     */
    function addTag(text, instance) {
        text = text.trim();
        if (!text) return false;

        // Run validation if provided
        if (instance.options.validate) {
            try {
                if (instance.options.validate(text) !== true) return false;
            } catch (e) {
                if (typeof app !== 'undefined' && app.dev && app.dev.error) {
                    app.dev.error('app.ui.tags validate error:', e);
                } else {
                    console.error('app.ui.tags validate error:', e);
                }
                return false;
            }
        }
        // Check for duplicates if not allowed
        if (!instance.options.allowDuplicates && instance.tags.includes(text)) {
            return false;
        }

        instance.tags.push(text);
        const $tag = createTag(text, instance);
        instance.$input.before($tag);
        updateOriginalInput(instance);

        return true;
    }

    /**
     * Update the original input field value
     * @private
     * @param {Object} instance - Tag field instance
     */
    function updateOriginalInput(instance) {
        if (instance.$original.attr('type') === 'email') {
            instance.$original.val(instance.tags.join(', '));
        } else {
            instance.$original.val(instance.tags.join(','));
        }
    }

    /**
     * Position the autocomplete dropdown
     * @private
     * @param {Object} instance - Tag field instance
     */
    function positionAutocomplete(instance) {
        if (!instance.$autocomplete || !instance.$autocomplete.is(':visible')) {
            return;
        }

        const wrapperOffset = instance.$wrapper.offset();
        const wrapperWidth = instance.$wrapper.outerWidth();

        instance.$autocomplete.css({
            top: wrapperOffset.top + instance.$wrapper.outerHeight() + 'px',
            left: wrapperOffset.left + 'px',
            width: wrapperWidth + 'px'
        });
    }

    /**
     * Create autocomplete functionality
     * @private
     * @param {Object} instance - Tag field instance
     */
    function createAutocomplete(instance) {
        if (!instance.options.datalist || !instance.options.datalist.length) {
            return;
        }

        const $autocomplete = $('<div class="tags-autocomplete"></div>');
        $autocomplete.hide();

        // Append to body to avoid z-index and overflow issues
        $('body').append($autocomplete);
        instance.$autocomplete = $autocomplete;

        // Handle scroll events to reposition autocomplete
        $(window).on('scroll.tags.' + instance.id, function () {
            positionAutocomplete(instance);
        });

        // Handle scroll on scrollable parents
        instance.$wrapper.parents().each(function () {
            const $parent = $(this);
            if ($parent.css('overflow') === 'auto' || $parent.css('overflow') === 'scroll' ||
                $parent.css('overflow-y') === 'auto' || $parent.css('overflow-y') === 'scroll') {
                $parent.on('scroll.tags.' + instance.id, function () {
                    positionAutocomplete(instance);
                });
            }
        });

        // Handle input for autocomplete
        instance.$input.on('input.tags', function () {
            const value = $(this).val().trim().toLowerCase();

            if (!value) {
                $autocomplete.hide().empty();
                return;
            }

            const matches = instance.options.datalist.filter(item =>
                item.toLowerCase().includes(value) &&
                (instance.options.allowDuplicates || !instance.tags.includes(item))
            );

            if (matches.length === 0) {
                $autocomplete.hide().empty();
                return;
            }

            $autocomplete.empty();
            matches.forEach((item, idx) => {
                const $item = $('<div class="tags-autocomplete-item"></div>').text(item);
                if (idx === 0) $item.addClass('active');

                $item.on('mousedown', function (e) {
                    e.preventDefault(); // Prevent blur on input
                    if (addTag(item, instance)) {
                        instance.$input.val('');
                        $autocomplete.hide().empty();
                        instance.$input.focus();
                    }
                });

                $autocomplete.append($item);
            });

            $autocomplete.show();
            positionAutocomplete(instance);
        });

        instance.$input.on('keydown.tags-autocomplete', function (e) {
            if (!$autocomplete.is(':visible')) return;

            const $items = $autocomplete.find('.tags-autocomplete-item');
            const $active = $items.filter('.active');
            let newIndex = -1;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                newIndex = $items.index($active) + 1;
                if (newIndex >= $items.length) newIndex = 0;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                newIndex = $items.index($active) - 1;
                if (newIndex < 0) newIndex = $items.length - 1;
            } else if (e.key === 'Enter' && $active.length) {
                e.preventDefault();
                e.stopPropagation();
                const selectedText = $active.text();
                if (addTag(selectedText, instance)) {
                    instance.$input.val('');
                    $autocomplete.hide().empty();
                    instance.$input.focus();
                }
                return;
            } else if (e.key === 'Escape') {
                e.preventDefault();
                $autocomplete.hide().empty();
                return;
            }

            if (newIndex >= 0) {
                $items.removeClass('active');
                $items.eq(newIndex).addClass('active');
            }
        });
    }

    /**
     * Setup drag & drop functionality
     * @private
     * @param {Object} instance - Tag field instance
     */
    function setupDragDrop(instance) {
        if (instance.options.dropClass === false) return;

        const dropClass = instance.options.dropClass || DEFAULT_DROP_CLASS;

        instance.$wrapper.on('dragover.tags', function (e) {
            e.preventDefault();
            $(this).addClass('drag-over');
        });

        instance.$wrapper.on('dragleave.tags', function (e) {
            $(this).removeClass('drag-over');
        });

        instance.$wrapper.on('drop.tags', function (e) {
            e.preventDefault();
            $(this).removeClass('drag-over');

            // Try to get dragged element data
            let value = '';
            try {
                const htmlData = e.originalEvent.dataTransfer.getData('text/html');
                if (htmlData) {
                    const $temp = $('<div>').html(htmlData);
                    const $dragged = $temp.find('.' + dropClass).first();
                    if ($dragged.length) {
                        value = $dragged.text().trim() || $dragged.attr('data-value') || $dragged.val();
                    }
                }
            } catch (ex) { }

            // Fallback to plain text
            if (!value) {
                value = e.originalEvent.dataTransfer.getData('text/plain');
            }

            if (value && addTag(value, instance)) {
                instance.$input.focus();
            }
        });
    }

    /**
     * Setup input field event handlers
     * @private
     * @param {Object} instance - Tag field instance
     */
    function setupInput(instance) {
        // Click on wrapper focuses input
        instance.$wrapper.on('click.tags', function (e) {
            if (e.target === this || $(e.target).hasClass('tags-wrapper')) {
                instance.$input.focus();
            }
        });

        // Create tag on comma or enter (only if autocomplete is not visible)
        instance.$input.on('keydown.tags-input', function (e) {
            const autocompleteVisible = instance.$autocomplete && instance.$autocomplete.is(':visible');

            if ((e.key === ',' || (e.key === 'Enter' && !autocompleteVisible)) && !autocompleteVisible) {
                e.preventDefault();
                const value = $(this).val();
                if (addTag(value, instance)) {
                    $(this).val('');
                    if (instance.$autocomplete) {
                        instance.$autocomplete.hide().empty();
                    }
                }
            } else if (e.key === 'Backspace' && $(this).val() === '' && instance.tags.length > 0) {
                // Remove last tag on backspace with empty field
                const $lastTag = instance.$wrapper.find('.tag').last();
                if ($lastTag.length) {
                    removeTag($lastTag, instance);
                }
            }
        });

        instance.$input.on('blur.tags', function () {
            const value = $(this).val();
            if (value.trim()) {
                addTag(value, instance);
                $(this).val('');
            }

            if (instance.$autocomplete) {
                setTimeout(() => instance.$autocomplete.hide().empty(), 200);
            }
        });
    }

    /**
     * Parse and load existing values from the input field
     * @private
     * @param {Object} instance - Tag field instance
     */
    function parseInitialValues(instance) {
        const value = instance.$original.val();
        if (!value) return;

        // Split by comma regardless of input type
        const values = value.split(',').map(v => v.trim()).filter(Boolean);

        values.forEach(v => {
            if (!instance.options.allowDuplicates && instance.tags.includes(v)) return;
            instance.tags.push(v);
            const $tag = createTag(v, instance);
            instance.$input.before($tag);
        });
    }

    /**
     * Initialize a tag field on an input element
     * 
     * @param {string} id - The ID of the input element to convert
     * @param {Object} [options={}] - Configuration options
     * @param {boolean} [options.allowDuplicates=false] - Allow duplicate tags
     * @param {string[]} [options.datalist=null] - Array of autocomplete suggestions
     * @param {string|false} [options.dropClass='draggable-tag'] - CSS class for droppable elements, or false to disable
     * @param {Function} [options.validate=null] - Validation function that receives tag text and returns true/false
     * 
     * @example
     * app.ui.tags.set('emailInput', {
     *   allowDuplicates: false,
     *   datalist: ['john@example.com', 'jane@example.com'],
     *   dropClass: 'email-drag',
     *   validate: (text) => {
     *     // Only allow valid email format
     *     return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
     *   }
     * });
     */
    function set(id, options = {}) {
        // Ensure jQuery is available
        if (typeof $ === 'undefined' || typeof jQuery === 'undefined') {
            console.error('app.ui.tags requires jQuery');
            return;
        }

        // Remove existing instance if any
        if (instances.has(id)) {
            remove(id);
        }

        // Find the original input
        const $original = $('#' + id);
        if (!$original.length) {
            console.error('app.ui.tags: Element not found:', id);
            return;
        }

        // Validate input type
        const type = $original.attr('type');
        if (type !== 'text' && type !== 'email') {
            console.error('app.ui.tags: Element must be input[type="text"] or input[type="email"]');
            return;
        }

        // Ensure CSS is loaded
        ensureCSS();

        // Create instance object
        const instance = {
            id: id,
            $original: $original,
            tags: [],
            options: {
                allowDuplicates: options.allowDuplicates === true,
                datalist: Array.isArray(options.datalist) ? options.datalist : null,
                dropClass: options.dropClass === false ? false : (options.dropClass || DEFAULT_DROP_CLASS),
                validate: typeof options.validate === 'function' ? options.validate : null
            },
            originalState: {
                isDisabled: $original.prop('disabled'),
                isReadonly: $original.prop('readonly')
            }
        };

        // Create wrapper
        const $wrapper = $('<div class="tags-wrapper"></div>');
        const $input = $('<input type="text" class="tag-input" />');
        $wrapper.append($input);

        instance.$wrapper = $wrapper;
        instance.$input = $input;

        // Hide original and insert wrapper
        $original.hide();
        $original.after($wrapper);

        // Parse initial values
        parseInitialValues(instance);

        // Setup functionality
        setupInput(instance);
        setupDragDrop(instance);
        createAutocomplete(instance);

        // Store instance
        instances.set(id, instance);
    }

    /**
     * Get all tags for a given field
     * 
     * @param {string} id - The ID of the tag field
     * @returns {string[]} Array of tag values
     * 
     * @example
     * const tags = app.ui.tags.getData('myInput');
     * console.log(tags); // ['tag1', 'tag2', 'tag3']
     */
    function getData(id) {
        const instance = instances.get(id);
        if (!instance) {
            console.warn('app.ui.tags.getData: Instance not found:', id);
            return [];
        }

        return [...instance.tags];
    }

    /**
     * Remove a tag field and restore the original input
     * 
     * @param {string} id - The ID of the tag field to remove
     * 
     * @example
     * app.ui.tags.remove('myInput');
     * // Original input is now visible again
     */
    function remove(id) {
        const instance = instances.get(id);
        if (!instance) {
            console.warn('app.ui.tags.remove: Instance not found:', id);
            return;
        }

        // Remove scroll events
        $(window).off('scroll.tags.' + id);
        instance.$wrapper.parents().off('scroll.tags.' + id);

        // Remove events
        if (instance.$wrapper) {
            instance.$wrapper.off('.tags');
        }
        if (instance.$input) {
            instance.$input.off('.tags');
            instance.$input.off('.tags-input');
            instance.$input.off('.tags-autocomplete');
        }

        // Remove autocomplete
        if (instance.$autocomplete) {
            instance.$autocomplete.remove();
        }

        // Remove wrapper
        if (instance.$wrapper) {
            instance.$wrapper.remove();
        }

        // Restore original input
        instance.$original.show();
        instance.$original.prop('disabled', instance.originalState.isDisabled);
        instance.$original.prop('readonly', instance.originalState.isReadonly);

        // Remove from instances
        instances.delete(id);

        // Cleanup CSS if no instances remain
        cleanupCSS();
    }

    /**
     * Reload a tag field (rebuild from stored state)
     * Useful when the DOM has been modified or if the UI is broken
     * 
     * @param {string} id - The ID of the tag field to reload
     * 
     * @example
     * app.ui.tags.reload('myInput');
     * // Field is rebuilt with all existing tags
     */
    function reload(id) {
        const instance = instances.get(id);
        if (!instance) {
            console.warn('app.ui.tags.reload: Instance not found:', id);
            return;
        }

        // Check if wrapper is missing or broken
        if (!instance.$wrapper || !instance.$wrapper.parent().length) {
            // Save complete state
            const tags = [...instance.tags];
            const options = {
                allowDuplicates: instance.options.allowDuplicates,
                datalist: instance.options.datalist,
                dropClass: instance.options.dropClass,
                validate: instance.options.validate
            };

            // Remove and recreate
            remove(id);
            set(id, options);

            // Restore tags
            const newInstance = instances.get(id);
            if (newInstance) {
                tags.forEach(tag => addTag(tag, newInstance));
            }
        }
    }

    function has(id) {
        return instances.has(id);
    }

    // Initialize app.ui if it doesn't exist
    if (typeof window.app === 'undefined') {
        window.app = {};
    }
    if (typeof window.app.ui === 'undefined') {
        window.app.ui = {};
    }

    // Expose API
    /**
     * @namespace app.ui.tags
     * @property {Function} set - Initialize a tag field
     * @property {Function} getData - Get all tags for a field
     * @property {Function} remove - Remove a tag field
     * @property {Function} reload - Reload a tag field
     */
    window.app.ui.tags = {
        set: set,
        getData: getData,
        remove: remove,
        reload: reload,
        has: has
    };

    if (typeof app !== 'undefined' && app.lock) {
        app.lock('ui.tags.*', { writable: false, configurable: false });
    }

})();