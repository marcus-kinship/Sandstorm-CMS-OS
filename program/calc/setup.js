/**
 * @file calc/setup.js
 * @description Boot-time registration for the Calculator program.
 *
 * Registers the program's icon and metadata only. The window logic lives in
 * `calc.js`, lazy-loaded by `app.program.open()` the first time the user
 * actually opens the program.
 *
 * @module program/calc/setup
 */
export async function setup(os) {
    os.svg.global.load({
        id: 'calc2',
        viewBox: '0 0 85 85',
        content: `
      <rect
         style="fill:#ffffff"
         id="rect1228"
         width="30.582235"
         height="6.8036866"
         x="26.664961"
         y="33.262474"
         ry="0" />
      <rect
         style="fill:#ffffff"
         id="rect1228-6"
         width="30.582235"
         height="6.8036866"
         x="26.699322"
         y="46.629318"
         ry="0" />
    `
    });

    os.program.addInfo("calculator", {
        name: () => _("Calculator"),
        version: "1.0",
        owner: "Marcus Larsson",
        description: () => _("A simple calculator"),
        icontype: "svg",
        icon: "#calc2",
        taskbar: true,      // Show in taskbar
        startmenu: true,    // Show in start menu
        multistart: true,   // Allow multiple instances
        main: "start",      // Entry point function
        file: "calc/calc.js", // Lazy-loaded by app.program.open() on first launch
        root: "program"
    });

    await os.language.loadProgram("calc");
}
