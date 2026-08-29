/**
 * @file formbuilder/setup.js
 * @description Boot-time registration for the Form Builder program.
 *
 * Registers the program's icon and metadata only. The window logic lives in
 * `formbuilder.js`, lazy-loaded by `app.program.open()` the first time the
 * user actually opens the program.
 *
 * @module program/formbuilder/setup
 */
export async function setup(os) {
    os.svg.global.load({
        id: 'formbuilder',
        viewBox: '0 0 85 85',
        content: `
          <rect x="15" y="29" width="14" height="7" fill="#fff"/>
          <rect x="32" y="29" width="38" height="7" fill="#fff"/>
          <rect x="15" y="43" width="14" height="7" fill="#fff"/>
          <rect x="32" y="43" width="38" height="7" fill="#fff"/>
          <rect x="50" y="58" width="19" height="7" fill="#fff"/>
        `
    });

    os.program.addInfo("formbuilder", {
        name: () => _("Formbuilder"),
        version: "1.0",
        owner: "Marcus Larsson",
        description: () => _("A simple formbuilder"),
        icontype: "svg",
        icon: "#formbuilder",
        taskbar: true,
        startmenu: true,
        multistart: false,
        main: "start",
        file: "formbuilder/formbuilder.js", // Lazy-loaded by app.program.open() on first launch
        root: "program"
    });

    await os.language.loadProgram("formbuilder");
}
