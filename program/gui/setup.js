/**
 * @file gui/setup.js
 * @description Boot-time registration for the GUI Controls showcase program.
 *
 * Registers the program's icon and metadata only. The window logic lives in
 * `gui.js`, lazy-loaded by `app.program.open()` the first time the user
 * actually opens the program.
 *
 * @module program/gui/setup
 */
export async function setup(os) {

    os.svg.global.load({
        id: 'gui',
        viewBox: '0 0 85 85',
        content: `<g id="group1">
 <path d="m4.7187 8.5h75.505c2.6634 0 4.7187 2.1126 4.7187 4.7187v58.607c0 2.6634-2.0552 4.7761-4.7187 4.7761h-75.505c-2.6061 0-4.7187-2.1126-4.7187-4.7761v-58.607c0-2.606 2.1126-4.7187 4.7187-4.7187z" fill="#f4f3f3" fill-rule="evenodd" stroke="#000000" stroke-width="0px"/>
 <path d="m12.881 19.092v57.511h-8.2194c-2.5487 0-4.6613-2.1126-4.6613-4.7187v-58.722c0-2.5487 2.1126-4.6613 4.6613-4.6613h75.62c2.606 0 4.6613 2.1126 4.6613 4.6613v5.9302z" fill="#d9d9d9" fill-rule="evenodd" stroke="#000000" stroke-width="0px"/>
 <path d="m-4.6812e-7 19.092v-5.8728c0-2.606 2.1126-4.7187 4.7187-4.7187h75.505c2.6634 0 4.7761 2.1126 4.7761 4.7187v5.8728z" fill="#64717c" fill-rule="evenodd" stroke="#000000" stroke-width="0px"/>
 <path d="m21.24 25.341h27.668c1.2326 0 2.2318 1.0566 2.2318 2.2318v40.485c0 1.2326-.99921 2.2318-2.2318 2.2318h-27.668c-1.1752 0-2.2318-.99921-2.2318-2.2318v-40.485c0-1.1752 1.0566-2.2318 2.2318-2.2318z" fill="#e8e8e8" fill-rule="evenodd" style="stroke-width:.063766"/>
 <path d="m21.24 25.341h27.668c1.2326 0 2.2318 1.0566 2.2318 2.2318v40.485c0 1.2326-.99921 2.2318-2.2318 2.2318h-27.668c-1.1752 0-2.2318-.99921-2.2318-2.2318v-40.485c0-1.1752 1.0566-2.2318 2.2318-2.2318z" stroke="#000000" stroke-width="0px" style="fill:#0a9cf3"/>
 <path d="m58.352 27.694h19.378c.52824 0 .8991.42825.8991.8991v2.353c0 .52824-.37086.8991-.8991.8991h-19.378c-.47085 0-.8991-.37086-.8991-.8991v-2.353c0-.47085.42825-.8991.8991-.8991z" fill-rule="evenodd" stroke="#000000" stroke-width="0px" style="fill:#cccccc"/>
 <path d="m58.352 36.238h19.378c.52824 0 .8991.42825.8991.8991v2.353c0 .52824-.37086.8991-.8991.8991h-19.378c-.47085 0-.8991-.37086-.8991-.8991v-2.353c0-.47085.42825-.8991.8991-.8991z" fill-rule="evenodd" stroke="#000000" stroke-width="0px" style="fill:#cccccc"/>
 <path d="m77.731 48.934h-19.321c-.52824 0-.95649-.37086-.95649-.95649v-2.2956c0-.47085.42825-.95649.95649-.95649h19.321c.52824 0 .95649.48564.95649.95649v2.2956c0 .58563-.42825.95649-.95649.95649zm-19.315 4.2659h10.579c.6339 0 1.1478.51389 1.1478 1.1478v1.913c0 .6339-.51389 1.1478-1.1478 1.1478h-10.579c-.57651 0-1.1478-.51389-1.1478-1.1478v-1.913c0-.6339.57128-1.1478 1.1478-1.1478z" style="fill:#cccccc" fill-rule="evenodd" stroke="#000000" stroke-width="0px"/>
</g>`
    });

    os.program.addInfo("gui", {
        name:        () => _("Layout components"),
        version:     "1.0",
        owner:       "Sandstorm",
        description: () => _("GUI Controls and Layout Components showcase"),
        icontype:    "svg",
        icon:        "#gui",
        programtype: "system",
        taskbar:     true,
        startmenu:   true,
        multistart:  true,
        main:        "start",
        file:        "gui/gui.js", // Lazy-loaded by app.program.open() on first launch
        root:        "program"
    });

    await os.language.loadProgram("gui");
}
