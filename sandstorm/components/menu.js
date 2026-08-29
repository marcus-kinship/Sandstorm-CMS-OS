/**
 * @file menu.js
 * @description Dropdown menu component for the Sandstorm UI system.
 *
 * Registers `app.ui.menu.create()`, which builds and appends a fully
 * positioned dropdown (or context) menu to `<body>` and binds it to a
 * target element. Supports click, hover, and right-click triggers, multi-
 * level submenus, separators, icons, and keyboard-shortcut labels.
 *
 * The menu auto-repositions when the viewport is resized and closes when the
 * user clicks outside it or a draggable window starts moving.
 *
 * @module components/menu
 *
 * @example
 * app.ui.menu.create({
 *   selector: "#file-button",
 *   action: "click",
 *   menuItem: [
 *     { title: "New",   icon: "<svg>…</svg>", callback: () => {} },
 *     { title: "Open",                        callback: () => {} },
 *     "---",
 *     { title: "Save",                        callback: () => {} }
 *   ]
 * });
 */
(function (app) {
    // Ensure the app namespace exists and define a menu module
    app.ui = app.ui || {};
    app.ui.menu = {
        options: [],

        /**
         * Creates and displays a menu based on the provided options.
         * @param {Object} options - Configuration object for the menu.
         * @param {string} options.selector - The CSS selector for the element to which the menu is attached.
         * @param {string} [options.direction='down,right'] - Direction for the menu placement relative to the attached element.
         * @param {boolean} [options.directionPosition=false] - If true, starts from bottom of menu when using direction.
         * @param {string} [options.toggle] - CSS class to show the menu. If not provided, the menu's display property will be toggled.
         * @param {number} [options.zindex=300] - The z-index value for the menu.
         * @param {string} [options.class=''] - Additional CSS classes for styling the menu.
         * @param {string} [options.action='click'] - Event type to trigger the menu (options: 'click', 'hover', 'rightclick').
         * @param {Array<Object|string>} options.menuItem - Array of menu items. Each entry is either a menu item object or
         *   the string `"---"` to insert a visual separator line.
         * @param {string} options.menuItem[].title - Label text for the menu item.
         * @param {function} options.menuItem[].callback - Function executed when the item is clicked.
         * @param {string} [options.menuItem[].icon] - Icon HTML string shown to the left of the title.
         * @param {string} [options.menuItem[].alt] - Secondary text shown to the right of the title.
         * @param {string} [options.menuItem[].shortcut] - Keyboard shortcut label (display only).
         * @param {Array<Object|string>} [options.menuItem[].submenu] - Nested submenu items (same structure).
         * @param {true} [options.menuItem[].separator] - Alternative to `"---"`: set `separator: true` to render a divider.
         *
         * @example
         * app.ui.menu.create({
         *   selector: "#my-element",
         *   action: "rightclick",
         *   menuItem: [
         *     { title: "Copy",  icon: "<svg>…</svg>", callback: fn },
         *     { title: "Cut",                         callback: fn },
         *     "---",
         *     { title: "Paste",                       callback: fn },
         *     "---",
         *     { title: "Delete",                      callback: fn }
         *   ]
         * });
         */
        create: function (options) {
            const {
                selector,
                direction = 'down,right',
                directionPosition = false,
                toggle,
                zindex = 300,
                class: menuClass = '',
                action = 'click',
                menuItem
            } = options;

            // Find the target element using jQuery
            const element = $(selector);
            if (!element.length) {
                console.error('Element with selector ' + selector + ' not found.');
                return;
            }

            // Create the main menu element
            const menuElement = document.createElement('div');
            menuElement.className = `menu ${menuClass}`;
            menuElement.style.position = 'absolute';
            menuElement.style.zIndex = zindex;
            // Initialize as hidden (not display:none, use visibility or opacity if using toggle class)
            if (!toggle) {
                menuElement.style.display = 'none';
            }

            // Function to create menu items recursively (handles submenus)
            function createMenuItems(items, parentElement) {
                items.forEach(item => {
                    // Separator: "---" string or { separator: true }
                    if (item === "---" || (item && item.separator)) {
                        const sep = document.createElement('div');
                        sep.className = 'menu-separator';
                        parentElement.appendChild(sep);
                        return;
                    }

                    const menuItemElement = document.createElement('div');
                    menuItemElement.style.justifyContent = 'space-between';
                    menuItemElement.style.cursor = 'pointer';
                    menuItemElement.className = 'ctm-row';

                    // Add icon (if available)
                    const icon = document.createElement('span');
                    icon.innerHTML = item.icon || ''; // Use provided icon or leave blank
                    icon.style.marginRight = '10px';

                    // Add title
                    const title = document.createElement('span');
                    title.textContent = item.title;

                    // Add tooltip and bind the callback function
                    menuItemElement.addEventListener('click', function (e) {
                        e.stopPropagation();
                        item.callback();
                        // Hide menu after click
                        hideMenu();
                    });

                    const line = document.createElement('div');
                    line.className = 'ctm-title';
                    line.appendChild(icon);
                    line.appendChild(title);

                    // Add alternative text (alt description)
                    const alt = document.createElement('span');
                    alt.textContent = item.alt;

                    // Check if the item has a submenu and recursively create it
                    if (item.submenu) {
                        const submenuElement = document.createElement('div');
                        submenuElement.className = 'submenu';
                        createMenuItems(item.submenu, submenuElement); // Recursive call for submenu
                        submenuElement.style.position = 'absolute';
                        submenuElement.style.display = 'none';
                        menuItemElement.appendChild(submenuElement);

                        // Show submenu on mouseenter and hide on mouseleave
                        menuItemElement.addEventListener('mouseenter', () => {
                            submenuElement.style.display = 'block';
                        });
                        menuItemElement.addEventListener('mouseleave', () => {
                            submenuElement.style.display = 'none';
                        });
                    }

                    menuItemElement.appendChild(line);
                    menuItemElement.appendChild(alt);
                    // Append the menu item to the parent element
                    parentElement.appendChild(menuItemElement);
                });
            }

            // Call the createMenuItems function to populate the menu
            createMenuItems(menuItem, menuElement);

            // Append the menu to the document body
            document.body.appendChild(menuElement);

            // Function to position the menu relative to the target element
            function positionMenu() {
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;
                const rect = element[0].getBoundingClientRect(); // Use jQuery to access the native DOM element
                const menuWidth = menuElement.offsetWidth;
                const menuHeight = menuElement.offsetHeight;

                let [primaryDirection, alignment] = direction.split(',');

                let x = rect.left;
                let y = rect.top;

                // Determine Y-position (up or down)
                if (primaryDirection === 'up') {
                    if (directionPosition) {
                        // Start from bottom of menu - position so menu bottom aligns with element top
                        y = rect.top;
                    } else {
                        y = rect.top - menuHeight;
                    }
                } else if (primaryDirection === 'down') {
                    if (directionPosition) {
                        // Start from bottom of menu - position so menu bottom aligns with element bottom
                        y = rect.bottom - menuHeight;
                    } else {
                        y = rect.bottom;
                    }
                } else if (primaryDirection === 'right') {
                    if (directionPosition) {
                        // Position menu to the right, starting from bottom
                        x = rect.right;
                        if (alignment === 'top') {
                            y = rect.top;
                        } else if (alignment === 'bottom') {
                            y = rect.bottom - menuHeight;
                        }
                    } else {
                        x = rect.right;
                    }
                } else if (primaryDirection === 'left') {
                    if (directionPosition) {
                        x = rect.left - menuWidth;
                        if (alignment === 'top') {
                            y = rect.top;
                        } else if (alignment === 'bottom') {
                            y = rect.bottom - menuHeight;
                        }
                    } else {
                        x = rect.left - menuWidth;
                    }
                }

                // Determine X-position (left, right, center) - only if not already set by primary direction
                if (primaryDirection === 'up' || primaryDirection === 'down') {
                    if (alignment === 'left') {
                        x = rect.left;
                    } else if (alignment === 'right') {
                        x = rect.right - menuWidth;
                    } else if (alignment === 'center') {
                        x = rect.left + (rect.width / 2) - (menuWidth / 2);
                    }
                } else if (primaryDirection === 'left' || primaryDirection === 'right') {
                    if (!directionPosition) {
                        if (alignment === 'top') {
                            y = rect.top;
                        } else if (alignment === 'bottom') {
                            y = rect.bottom - menuHeight;
                        } else if (alignment === 'center') {
                            y = rect.top + (rect.height / 2) - (menuHeight / 2);
                        }
                    }
                }

                // Adjust if the menu overflows outside the window
                if (x + menuWidth > windowWidth) {
                    x = windowWidth - menuWidth - 10;
                }
                if (x < 0) {
                    x = 10;
                }
                if (y + menuHeight > windowHeight) {
                    y = windowHeight - menuHeight - 10;
                }
                if (y < 0) {
                    y = 10;
                }

                // Apply the calculated positions
                menuElement.style.left = `${x}px`;
                menuElement.style.top = `${y}px`;
            }

            // Function to toggle the menu's visibility
            function toggleMenu() {
                if (toggle) {
                    menuElement.classList.toggle(toggle);
                } else {
                    if (menuElement.style.display === 'none') {
                        menuElement.style.display = 'block';
                    } else {
                        menuElement.style.display = 'none';
                    }
                }
                if (menuElement.style.display === 'block' || menuElement.classList.contains(toggle)) {
                    positionMenu();
                }
            }

            // Show the menu
            function showMenu() {
                if (toggle) {
                    menuElement.classList.add(toggle);
                } else {
                    menuElement.style.display = 'block';
                }
                positionMenu();
            }

            // Hide the menu
            function hideMenu() {
                if (toggle) {
                    menuElement.classList.remove(toggle);
                } else {
                    menuElement.style.display = 'none';
                }
            }

            // Bind events based on the action type
            if (action === 'click') {
                element.on('click', function (e) {
                    e.stopPropagation();
                    toggleMenu();
                });

                // Close menu when clicking outside
                $(document).on('click', function (e) {
                    if (!$(e.target).closest(menuElement).length && !$(e.target).closest(selector).length) {
                        hideMenu();
                    }
                });
            } else if (action === 'hover') {
                element.mouseenter(showMenu).mouseleave(hideMenu);
            } else if (action === 'rightclick') {
                element.on("contextmenu", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    showMenu();
                });

                // Close menu when clicking anywhere
                $(document).on('click', function () {
                    hideMenu();
                });
            }

            // Reposition the menu when the window is resized
            window.addEventListener('resize', positionMenu);

            // Hide menu when any draggable window starts moving
            $(document).on('dragstart', hideMenu);
        }
    };
})(window.app = window.app || {});