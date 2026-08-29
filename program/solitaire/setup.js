/**
 * @file solitaire/setup.js
 * @description Boot-time registration for the Solitaire program.
 *
 * Registers the program's icon and metadata only. The game window and all
 * game logic live in `solitaire.js`, lazy-loaded by `app.program.open()`
 * the first time the user actually opens the program.
 *
 * @module program/solitaire/setup
 */
export async function setup(os) {
    os.svg.global.load({
        id: "solitaire",
        viewBox: "0 0 389 334",
        content: `
           <path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(14, 95, 164)"
 d="M15.276,49.448 L187.860,6.066 C198.010,3.516 208.353,9.674 210.964,19.819 L274.289,265.831 C276.901,275.977 270.829,286.316 260.724,288.923 L88.898,333.277 C78.729,335.904 68.339,329.774 65.693,319.585 L1.567,72.547 C-1.077,62.359 5.062,52.017 15.276,49.448 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill-opacity="0.051" fill="rgb(0, 0, 0)"
 d="M292.680,24.426 L202.000,304.000 L183.268,308.445 L88.097,307.264 C74.445,307.094 63.141,293.807 63.233,280.053 C63.233,280.053 64.693,94.584 65.139,37.877 C64.904,67.808 60.209,39.094 82.1000,32.000 C147.880,11.806 292.680,24.426 292.680,24.426 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill-opacity="0.051" fill="rgb(0, 0, 0)"
 d="M98.593,2.170 L271.107,4.097 C284.340,4.245 294.982,15.125 294.878,28.399 L292.906,279.756 C292.801,293.030 281.990,303.671 268.757,303.523 L96.243,301.596 C83.010,301.448 72.368,290.568 72.472,277.294 L74.445,25.937 C74.549,12.663 85.360,2.023 98.593,2.170 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(44, 181, 236)"
 d="M102.354,1.945 L279.912,4.522 C290.388,4.674 298.787,13.316 298.672,23.824 L295.882,278.606 C295.767,289.113 287.182,297.508 276.706,297.356 L99.148,294.779 C88.672,294.627 80.273,285.985 80.388,275.478 L83.178,20.696 C83.293,10.188 91.878,1.793 102.354,1.945 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill-opacity="0.051" fill="rgb(0, 0, 0)"
 d="M233.180,4.681 L297.586,21.794 L298.000,33.1000 L273.000,231.1000 L202.1000,302.1000 L177.772,310.521 L113.404,293.417 C100.188,289.906 92.503,274.281 96.000,260.1000 L162.029,11.506 C162.745,8.787 165.351,4.076 165.351,4.076 L233.180,4.681 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill-opacity="0.051" fill="rgb(0, 0, 0)"
 d="M198.1000,1.1000 L241.000,260.000 C241.000,260.000 251.323,289.949 188.164,307.235 C153.224,297.998 122.720,289.933 122.720,289.933 C109.905,286.545 102.266,273.411 105.657,260.597 L169.868,17.948 C171.612,11.355 175.149,3.064 181.470,3.075 C186.489,3.084 189.465,2.774 193.1000,2.1000 C195.645,3.082 197.344,1.562 198.1000,1.1000 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(218, 221, 222)"
 d="M202.919,1.585 L374.719,47.620 C384.855,50.336 390.870,60.754 388.154,70.890 L322.301,316.651 C319.585,326.787 309.167,332.802 299.031,330.086 L127.230,284.051 C117.094,281.335 111.079,270.917 113.795,260.781 L179.648,15.020 C182.364,4.884 192.783,-1.131 202.919,1.585 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(0, 0, 0)"
 d="M265.000,96.1000 C266.1000,116.533 299.200,155.667 300.1000,162.1000 C314.974,186.708 305.1000,224.400 272.1000,225.000 C258.883,224.750 246.913,217.650 238.1000,195.000 C237.823,221.664 240.548,233.030 243.1000,247.000 C241.702,246.937 235.921,236.140 207.1000,237.000 C224.530,220.845 229.533,208.260 238.000,194.000 C228.629,200.552 226.356,206.964 209.000,207.000 C188.212,207.043 167.342,184.609 182.000,155.1000 C197.742,125.274 239.487,125.671 265.000,96.1000 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(0, 0, 0)"
 d="M216.887,23.368 C217.487,29.228 227.148,40.968 227.687,43.168 C231.880,50.280 229.187,61.588 219.288,61.768 C215.052,61.693 211.461,59.563 209.087,52.768 C208.734,60.767 209.552,64.177 210.588,68.368 C209.898,68.349 208.164,65.110 199.787,65.368 C204.747,60.521 206.247,56.746 208.787,52.468 C205.976,54.434 205.294,56.357 200.088,56.368 C193.851,56.381 187.590,49.651 191.988,41.068 C196.710,31.850 209.234,31.969 216.887,23.368 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(0, 0, 0)"
 d="M298.887,258.368 C299.487,264.228 309.148,275.968 309.687,278.168 C313.880,285.280 311.187,296.588 301.288,296.768 C297.052,296.693 293.461,294.563 291.087,287.768 C290.734,295.767 291.552,299.177 292.588,303.368 C291.898,303.349 290.164,300.110 281.787,300.368 C286.747,295.521 288.247,291.746 290.787,287.468 C287.976,289.434 287.294,291.357 282.088,291.368 C275.851,291.381 269.590,284.651 273.988,276.068 C278.710,266.850 291.234,266.969 298.887,258.368 Z"/>
        `,
    });

    os.program.addInfo("solitaire", {
        name: () => _("Solitaire"),
        version: "1.0",
        owner: "Microsoft",
        description: () => _("Classic card game solitaire"),
        icontype: "svg",
        icon: "#solitaire",
        category: "game",
        taskbar: false,
        startmenu: true,
        multistart: false,
        desktop: true,
        main: "start",
        file: "solitaire/solitaire.js", // Lazy-loaded by app.program.open() on first launch
        root: "program"
    });

    await os.language.loadProgram("solitaire");
}
