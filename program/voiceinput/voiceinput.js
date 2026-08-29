/**
 * @file voiceinput/voiceinput.js
 * @description Voice input program for Sandstorm OS.
 *
 * ES module that registers the voice-to-text input tool.
 * Exports `setup(os)` (builds `app.voiceinput` state, program registration)
 * and `start(os, win)` (window creation with microphone controls).
 *
 * Uses the Web Speech API (`SpeechRecognition`) to capture speech and
 * insert recognised text into whichever input field is currently active.
 *
 * @module program/voiceinput/voiceinput
 */
export async function setup(os) {
    if (!window.app) window.app = {};
    if (!window.app.voiceinput) window.app.voiceinput = {};

    const state = window.app.voiceinput;
    state.activeField    = null;
    state.waitingForField = false;
    state.listening      = false;
    state.recognition    = null;
    state.finalTranscript = "";
    state.pressedKeys    = new Set();
    state.autoHideTimer  = null;

    os.svg.global.load({
        id: 'ic-mic',
        viewBox: '0 0 24 24',
        content: `<path fill="#ffffff" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2zm-5 9c-2.33 0-4.31-1.46-5.11-3.5H5.5a.5.5 0 0 0 0 1h1.39A7.96 7.96 0 0 0 12 21a7.96 7.96 0 0 0 5.11-2.5h1.39a.5.5 0 0 0 0-1h-1.39A5.002 5.002 0 0 1 12 20z"/>`
    });

    os.program.addInfo("voiceinput", {
        name:        () => _("Voice Input"),
        version:     "1.0",
        owner:       "System",
        description: () => _("Speak directly into text fields when voice input is enabled."),
        icontype:    "svg",
        icon:        "#ic-mic",
        taskbar:     false,
        startmenu:   false,
        multistart:  false,
        main:        "start",
        programtype: "system"
    });

    await os.language.loadProgram("voiceinput");

    app.addProgramCSS("voiceinput", "Voice Input", `
        @keyframes micPulse {
            0%   { opacity: 1;   transform: scale(1);    filter: drop-shadow(0 0 0px rgba(255,80,80,0)); }
            50%  { opacity: 0.5; transform: scale(1.18); filter: drop-shadow(0 0 6px rgba(255,80,80,0.9)); }
            100% { opacity: 1;   transform: scale(1);    filter: drop-shadow(0 0 0px rgba(255,80,80,0)); }
        }
        .voiceInputIcon.vi-listening svg {
            animation: micPulse 1s ease-in-out infinite;
            transform-origin: center;
            transform-box: fill-box;
        }
        .voice-overlay {
            padding: 14px 18px 12px;
            color: var(--theme-fontcolor, #fff);
            min-width: 220px;
        }
        .voice-overlay-status {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 5px;
        }
        .voice-overlay-hint {
            font-size: 11px;
            opacity: 0.72;
            line-height: 1.5;
            min-height: 16px;
        }
    `);

    app.desktop.taskbar.setStatusIcon({
        id:    "voiceInputIcon",
        class: "icon voiceInputIcon",
        svg:   "#ic-mic",
        title: _("Voice Input"),
        order: 1,
        click: function (e) {
            if (app.voiceinput.listening) {
                app.voiceinput.stopRecording();
                return;
            }

            app.ui.toggle.window({
                windowId:     "#voiceOverlay",
                iconSelector: ".voiceInputIcon",
                gap:          10,
                width:        "250px",
                height:       "80px",
                body: function () {
                    app.voiceinput.waitingForField = true;
                    return app.voiceinput.overlayHTML();
                }
            });
        }
    });

    app.voiceinput = Object.assign(app.voiceinput, {

        start: function () { return null; },

        overlayHTML: function () {
            return `
                <div class="voice-overlay">
                    <div class="voice-overlay-status" id="voiceOverlayStatus">${_("Ready")}</div>
                    <div class="voice-overlay-hint"   id="voiceOverlayHint">${_("Click on a text field to start speaking")}</div>
                </div>
            `;
        },

        setStatus: function (status, hint) {
            const statusEl = $("#voiceOverlayStatus");
            const hintEl   = $("#voiceOverlayHint");
            if (statusEl.length) statusEl.text(status);
            if (hintEl.length && hint !== undefined) hintEl.text(hint);
        },

        setPulse: function (active) {
            const icon = document.querySelector('.statusicons .voiceInputIcon');
            if (!icon) return;
            icon.classList.toggle('vi-listening', active);
        },

        closeOverlay: function (delay) {
            if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
            this.autoHideTimer = setTimeout(() => {
                const overlay = $("#voiceOverlay");
                if (overlay.length) overlay.remove();
            }, delay || 0);
        },

        stopRecording: function () {
            if (this.recognition) this.recognition.stop();
            this.listening      = false;
            this.waitingForField = false;
            this.setPulse(false);
            this.setStatus(_("Input completed"), "");
            this.closeOverlay(2500);
        },

        startRecognition: function () {
            if (this.listening) return;
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                this.setStatus(_("Not supported"), _("Your browser does not support speech recognition."));
                this.waitingForField = false;
                return;
            }

            this.recognition                = new SpeechRecognition();
            this.recognition.lang           = /* navigator.language ||  */"sv-SE";
            this.recognition.interimResults = true;
            this.recognition.continuous     = true;

            this.recognition.onstart = () => {
                this.listening       = true;
                this.waitingForField = false;
                this.setPulse(true);
                this.setStatus(_("Listening..."), _("Press S + P to stop recording."));
            };

            this.recognition.onresult = (event) => {
                let interim = "";
                let final   = "";
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const r = event.results[i];
                    if (r.isFinal) final   += r[0].transcript;
                    else           interim += r[0].transcript;
                }
                if (interim) this.setStatus(_("Listening..."), interim);
                if (final) {
                    this.finalTranscript += final;
                    this.insertText(final);
                }
            };

            this.recognition.onerror = (event) => {
                this.setStatus(_("Error"), event.error || "unknown");
            };

            this.recognition.onend = () => {
                if (this.listening) {
                    this.listening = false;
                    this.setPulse(false);
                    this.setStatus(_("Input completed"), "");
                    this.closeOverlay(2500);
                }
            };

            try {
                this.recognition.start();
            } catch (_err) {
                this.setStatus(_("Could not start"), _("Speech input could not be started."));
            }
        },

        insertText: function (text) {
            const field = this.activeField || document.activeElement;
            if (!field) return;

            if (field.isContentEditable) {
                const sel = document.getSelection();
                if (sel && sel.rangeCount) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(text));
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                } else {
                    field.textContent += text;
                }
                field.focus();
                return;
            }

            if (typeof field.selectionStart === "number") {
                const start  = field.selectionStart;
                const end    = field.selectionEnd;
                const before = field.value.slice(0, start);
                const after  = field.value.slice(end);
                field.value  = before + text + after;
                const pos    = before.length + text.length;
                field.setSelectionRange(pos, pos);
                field.focus();
            } else if (typeof field.value === "string") {
                field.value += text;
                field.focus();
            }
        },

        handleFieldClick: function (event) {
            if (!this.waitingForField) return;
            const field = event.target.closest(
                "input[type=text], input[type=search], input[type=url], " +
                "input[type=tel], input[type=email], textarea, [contenteditable='true']"
            );
            if (!field) return;
            this.activeField = field;
            field.focus();
            this.startRecognition();
        },

        handleKeyDown: function (event) {
            this.pressedKeys.add(event.key.toLowerCase());
            if (this.listening && this.pressedKeys.has("s") && this.pressedKeys.has("p")) {
                event.preventDefault();
                this.stopRecording();
            }
        },

        handleKeyUp: function (event) {
            this.pressedKeys.delete(event.key.toLowerCase());
        }
    });

    document.addEventListener("mousedown", (e) => app.voiceinput.handleFieldClick(e), true);
    document.addEventListener("keydown",   (e) => app.voiceinput.handleKeyDown(e));
    document.addEventListener("keyup",     (e) => app.voiceinput.handleKeyUp(e));
}
