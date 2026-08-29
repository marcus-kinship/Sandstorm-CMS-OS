/**
 * @file networkmonitor/setup.js
 * @description Boot-time registration for the Network Monitor program.
 *
 * Builds the entire `app.networkmonitor` API and the always-visible wifi
 * taskbar status icon (with its click handler, showing live connection
 * status via `app.networkmonitor.functions.status()`) — all boot-critical,
 * independent of whether the Network Monitor window is ever opened. The
 * window entry point lives in `networkmonitor.js` (a thin wrapper calling
 * logic already registered here), lazy-loaded by `app.program.open()` the
 * first time the user actually opens the program.
 *
 * @module components/networkmonitor/setup
 */
export function setup(os) {
    os.svg.global.load({
        id: 'ic-wifi',
        viewBox: '0 0 24 24',
        content: `<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#ffffff" transform="matrix(-0.70426255,0.70993958,0.70993958,0.70426255,14.008082,-3.2612979)">
    <path d="m 5,12.55 a 11,11 0 0 1 14.08,0"></path>
    <path d="m 1.4199998,9.0000001 a 16,16 0 0 1 21.1600002,0"></path>
    <path d="m 8.5299988,16.109999 a 6,6 0 0 1 6.9500012,0"></path>
    <line x1="11.999999" y1="20" x2="12.010001" y2="20"></line>
  </g>`
    });

    // Register Network Monitor with relevant information
    os.program.addInfo("networkmonitor", {
        name: () => _("Network Monitor"),
        version: "1.0",
        owner: "Marcus Larsson",
        description: () => _("Network monitoring tool for the entire OS CMS system"),
        icontype: "png",
        icon: "sandstorm/components/networkmonitor/networkmonitor.png",
        taskbar: false,      // Show in taskbar
        startmenu: true,    // Show in start menu
        multistart: false,  // Allow multiple instances
        main: "start",      // Main entry point function
        programtype: "system", // Classified as a system app
        file: "networkmonitor/networkmonitor.js", // Lazy-loaded by app.program.open() on first launch
        root: "components"
    });

    app.desktop.taskbar.setStatusIcon({
        id: "wifiIcon",
        class: "icon wifiIcon",
        title: `Incoming or outgoing request`,
        svg: "#ic-wifi",
        order: 0,
        click: function (e) {
            app.ui.toggle.window({
                windowId:     "#wifiWindow",
                iconSelector: ".wifiIcon",
                gap: 15,
                width: "300px",
                height: "360px",
                body: function () {
                    return app.networkmonitor.functions.status("#wifiWindow");
                },
            });
        },
    });

    // Define the app structure and functionalities
    (function (app) {
        app.networkmonitor = {
            windows: {
                // Function to open the control center
                controlcenter: function () {
                    // Open Control Center window
                    os.ui.windowStart("networkmonitor", {
                        id: "networkmonitor",
                        title: _("Network Control Center"),
                        resizable: true,
                        width: "1000px",
                        height: "868px",
                        body: function (os) {
                            // Lägg till innehåll för kontrollpanelens fönster här
                            return "Manage network access policies and detailed settings here.";
                        }
                    });
                },
            },
            functions: {
                isBlocked: false, // Flag to disable network traffic
                blockedAddresses: [], // Array to hold blocked addresses
                logNetworkRequests: [],

                // Function to display network status in taskbar
                status: function (windowid) {
                    let content = `
                                <div class="networkmonitor-status">
                                    <div class="row">
                                        <div class="left">
                                        <div class="h3">${_("Network Traffic")}</div>
                                        </div>
                                        <div class="right">
                                      <label class="switch-def" title="${_("Disable All Connections")}">
                                            <input type="checkbox" " id="disableNetwork">
                                            <span class="slider"></span>
                                        </label>
                                        </div>
                                     </div>
                                     <div class="row">
                                    <div id="networkRequestsList">
                                        <!-- List of network requests with kill option -->
                                        <div class="service-list">
                                           
                                        </div>
                                    </div>
                                    </div>
                                    <div class="row">
                                    <div onclick="app.networkmonitor.windows.controlcenter()">${_("Open Control Center")}</div>
                                    </div>
                                </div>
                            `;
                    
                    app.addCSS("Network Monitor", `div.networkmonitor-status{
                                    width: 300px;
                                    height: 360px;
                                    display: flex;
                                    flex-direction: column;
                                    color: white;
                                    padding: 10px 18px;
                                    box-sizing: border-box;
                                }

                                /* General row styling */
                              .networkmonitor-status .row {
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: flex-start;
                    
                                }

                                /* Styling for the first and third row */
                                .networkmonitor-status .row:first-child,
                                .networkmonitor-status .row:last-child {
                                    height: 30px;
                                    align-items: center;
                                }

                                .networkmonitor-status .right .switch-def {
                                    zoom: 0.8;
                                    margin-top: 4px;
                                }

                                 .networkmonitor-status .h3{
                                    font-size: 18px;
                                    color:#fff;
                                }

                                /* Flex items for left and right alignment */
                                .networkmonitor-status .left {
                                    flex: 1;
                                }

                                .networkmonitor-status .right {
                                    flex-shrink: 0;
                                }

                                /* Ensuring the network list takes up remaining space */
                               .networkmonitor-status  #networkRequestsList {
                                    flex-grow: 1;
                                    overflow-y: auto;
                                    height: 265px;
                                    padding: 8px 0px;
                                    margin: 0px -5px;
                       
                                }
                                .networkmonitor-status .service-list {

                                    font-family: Arial, sans-serif;
                                    margin: 0px 1px;
                                    font-family: Arial, sans-serif;
                                    row-gap: 9px;
                                    display: flex;
                                    flex-direction: column;
                                    justify-content: space-between;

                                }

                                .networkmonitor-status .service-item {
                                    display: flex;
                                    align-items: center;
                                    padding: 10px;                    
                                    justify-content: center;
                                    background-color: rgb(0 0 0 / 0%);

                                    border-radius: 5px;
                                    transition: background-color 0.8s ease, box-shadow 0.8s ease; /* Lägger till mjuk övergång */

                                }

                                .service-item:hover {
                                    background-color: rgb(0 0 0 / 30%);
                                    animation: fadeInOut 3s ease infinite;
                                    animation-delay: 1s;
                                }


                                .networkmonitor-status .service-icon {
                                    width: 40px;
                                    height: 40px;
                                    border-radius: 50%;
                                }

                                .networkmonitor-status .service-info h3 {
                                    margin: 0;
                                    font-size: 1em;
                                    overflow: hidden;
                                    width: 160px;
                                    text-overflow: ellipsis;
                                }

                                .networkmonitor-status .service-info p {
                                    margin: 5px 0;
                                    font-size: 0.9em;
                     
                                }
                               .networkmonitor-status .service-select {
                                    margin-left: auto;
                                    width: 22px;
                                    height: 22px;
                                    background-color: rgba(255, 255, 255, 1); /* Vit cirkel */
                                    background-color: rgb(0 0 0 / 30%);
                                    appearance: none; /* Tar bort standardradio-stilen */
                                    border-radius: 50%;
                                    cursor: default;
                                    position: relative;
                                    display: inline-block;
                                     transition: background-color 0.3s ease, border-color 0.3s ease;
                                }

                                .networkmonitor-status .service-select:checked:hover::before{
                                    animation: backgroundFade 3s ease infinite;
                                    animation-delay: 1s;
                                }

                               @keyframes backgroundFade {
                                    0% {
                                        background-color: rgba(255, 255, 255, 1); /* Transparent vit */
                                    }
                                    50% {
                                        background-color: rgba(255, 255, 255, 0); /* Fullt vit */
                                    }
                                    100% {
                                        background-color: rgba(255, 255, 255, 1); /* Transparent vit igen */
                                    }
                                }

                                /* Stil för när radio-knappen är vald */
                                .networkmonitor-status .service-select:checked::before {
                                    content: "";
                                    position: absolute;
                                    top: 50%;
                                    left: 50%;
                                    width: 14px;
                                    height: 14px;
                                    background-color: rgba(255, 255, 255, 1); /* Vit cirkel */
                                    border-radius: 50%;
                                    transform: translate(-50%, -50%);
                                }

                                

                                `)

                    windowid = $(windowid);

                    if (!windowid) {
                        // error handling code here
                    }

                    // Bind functionality for disable network checkbox
                    $(function () {
                        $('#disableNetwork').on('change', function () {
                            if (this.checked) {
                                app.networkmonitor.functions.disableAllConnections();
                            } else {
                                app.networkmonitor.functions.enableAllConnections();
                            }
                        });
                    });

                    // Load live network requests
                  //  app.networkmonitor.functions.loadNetworkRequests();
                    // Lägg till en fördröjning på 12 ms innan uppdatering
                    setTimeout(() => {
                        this.refreshNetworkRequestsList();
                    }, 12);
                    return content;
                },

                logNetworkRequest: function (entry) {
                    this.logNetworkRequests.push(entry);

                    // Om förfrågan blockerades, lägg till logiken för att hantera det
                    if (this.isBlocked && this.blockedAddresses.includes(entry.url)) {
                        console.warn(`Blocked request: ${entry.url}`);
                    }

                    // Här kan du också anropa en funktion för att uppdatera UI, om så önskas
                    this.updateNetworkRequestsList(entry);
                },


                // Function to load live network requests (up to 10 at a time)
                loadNetworkRequests: function () {
                    let requests = app.networkmonitor.functions.getLiveRequests();
                    let list = $('#networkRequestsList')[0];
                    list.innerHTML = '';  // Clear the list

                    requests.slice(0, 10).forEach(req => {
                        let listItem = document.createElement('li');
                        listItem.innerHTML = `
                            <span>${req.url} at ${req.time}</span>
                            <label><input type="checkbox" class="killRequest" data-request-id="${req.id}"> Kill</label>
                        `;
                        list.appendChild(listItem);
                    });

                    // Bind kill request functionality
                    document.querySelectorAll('.killRequest').forEach(checkbox => {
                        checkbox.addEventListener('change', function () {
                            if (this.checked) {
                                app.networkmonitor.functions.killRequest(this.getAttribute('data-request-id'));
                            }
                        });
                    });
                },

                // Function to get live network requests (mock implementation)
                getLiveRequests: function () {
                    return [
                        { id: 1, url: "https://example.com/api/1", time: "10:05" },
                        { id: 2, url: "https://example.com/api/2", time: "10:06" },
                        { id: 3, url: "https://example.com/api/3", time: "10:07" },
                        // Up to 10 requests
                    ];
                },

                // Function to disable all connections
                disableAllConnections: function () {
                    app.dev.log("All network connections disabled.", "Network Monitor");
                    this.isBlocked = false;
                },

                // Function to enable all connections
                enableAllConnections: function () {
                    app.dev.log("All network connections enabled.", "Network Monitor");
                    this.isBlocked = true;
                },
                removeBlockedAddress: function(address) {
                    this.blockedAddresses = this.blockedAddresses.filter(addr => addr !== address);
                },

                formatTimestamp: function (timestamp) {
                    const date = new Date(timestamp);

                    // Hämta datum och tid
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0'); // Månad 0-11
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');

                    // Formatera tidstämpeln
                    const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

                    // Skapa HTML-element
                    const timestampElement = document.createElement('div');
                    timestampElement.title = formattedDate;
                    timestampElement.textContent = `${hours}:${minutes}:${seconds}`;

                    return timestampElement.outerHTML; // Returnera som en sträng
                },

                addBlockedAddress: function(address) {
                    if (!this.blockedAddresses.includes(address)) {
                        this.blockedAddresses.push(address);
                    }
                },

                refreshNetworkRequestsList: function () {
                    const requestListContainer = document.querySelector('#networkRequestsList .service-list');

                    if (requestListContainer) {
                        // Töm listan innan den fylls på nytt
                    requestListContainer.innerHTML = '';
                    }

                    

                    // Loopa genom logNetworkRequest och lägg till varje begäran
                    this.logNetworkRequests.forEach((entry) => {
                        this.updateNetworkRequestsList(entry);
                    });
                },

                updateNetworkRequestsList: function (entry) {
                    const serviceList = document.querySelector('#networkRequestsList .service-list');

                    // Om popupen inte är öppen, logga bara – uppdatera inte DOM
                    if (!serviceList) return;

                    const serviceItem = document.createElement('div');
                    serviceItem.classList.add('service-item');
                    serviceItem.innerHTML = `
        <div class="service-icon">${app.util.escapeHtml(entry.method)}</div>
        <div class="service-info">
            <h3 title="${app.util.escapeHtml(printf(_(`Full info server: %s\nData: %s\nTid: %d ms`),
                        entry.url,
                        JSON.stringify(entry.data || 'N/A'),
                        entry.duration
                    ))}">${app.util.escapeHtml(entry.url)}</h3>
            <p title="Full date">${this.formatTimestamp(entry.timestamp)}</p>
        </div>
        <input type="checkbox" class="service-select" title="${_("Block the address")}">
    `;

                    serviceList.appendChild(serviceItem);
                },

                // Function to set up network interceptors
                setupNetworkInterceptor: function () {
                    this.interceptXMLHttpRequest();
                    this.interceptFetch();
                    app.dev.log('Network interceptor set up.', "Network Monitor"); // To indicate setup completion
                },

                interceptXMLHttpRequest: function () {
                    const originalOpen = XMLHttpRequest.prototype.open;
                    const originalSend = XMLHttpRequest.prototype.send;

                    XMLHttpRequest.prototype.open = function (method, url) {
                        this._method = method; // Spara metoden
                        this._url = url; // Spara URL:en
                        return originalOpen.apply(this, arguments);
                    };

                    XMLHttpRequest.prototype.send = function (body) {
                        // Kontrollera om förfrågan ska blockeras
                        if (app.networkmonitor.functions.isBlocked &&
                            app.networkmonitor.functions.blockedAddresses.includes(this._url)) {
                            app.dev.log(`Blocked request to ${this._url} with method ${this._method}.`, "Network Monitor");
                            return; // Förhindra att förfrågan skickas
                        }

                        const startTime = new Date();

                        this.addEventListener('load', () => {
                            const duration = new Date() - startTime;
                            const logEntry = {
                                method: this._method,
                                url: this._url,
                                data: body || null,
                                duration: duration,
                                timestamp: startTime,
                            };

                            app.networkmonitor.functions.logNetworkRequest(logEntry);
                        });

                        return originalSend.apply(this, arguments);
                    };
                },

                interceptFetch: function () {
                    const originalFetch = window.fetch;

                    window.fetch = (...args) => {
                        const [url, options] = args;
                        const method = options?.method || 'GET'; // Hämta metoden

                        // Kontrollera om förfrågan ska blockeras
                        if (app.networkmonitor.functions.isBlocked &&
                            app.networkmonitor.functions.blockedAddresses.includes(url)) {
                            app.dev.log(`Blocked fetch request to ${url} with method ${method}.`, "Network Monitor");
                            return Promise.reject(new Error(`Blocked request to ${url}`)); // Blockera förfrågan
                        }

                        const startTime = new Date();

                        return originalFetch(...args).then(response => {
                            const duration = new Date() - startTime;
                            const logEntry = {
                                method: method,
                                url: url,
                                data: options?.body || null,
                                duration: duration,
                                timestamp: startTime,
                            };

                            app.networkmonitor.functions.logNetworkRequest(logEntry);
                            return response; // Returnera svaret
                        });
                    };
                },

                // Task Manager live monitoring function
                live: function () {
                    // Display real-time network traffic in Task Manager
                    os.ui.window.create({
                        title: _("Network Monitor - Live"),
                        content: "Live monitoring of network traffic...",
                        width: 600,
                        height: 400
                    });

                    // Implement logic to update live traffic with packet addresses, program ID, etc.
                }
            }
        };
        app.lock('networkmonitor.*');
    })(os);

    app.networkmonitor.functions.setupNetworkInterceptor();
}
