/**
 * @file controlpanel/programs/customized.content.js
 * @description Background and Theme settings panel content — lazy-loaded on
 * first open of either panel via `customized.js`'s `panel.contentPath`.
 *
 * `setup(os)` is limited to deps/CSS — never `os.controlpanel.add()` or any
 * other boot-only registration, which lives exclusively in the manifest.
 *
 * @module components/controlpanel/programs/customized.content
 */

import { injectCSS as injectBackgroundPickerCSS, renderThumbnailPickerHTML, bindThumbnailPicker } from './backgroundpicker.js';

export async function setup(os) {
	injectBackgroundPickerCSS(os);
	await app.ui.ensureLoaded(os, ['dropmenu']);
}

export function renderBackground(os) {
	const bg = (os.desktop.backgroundOptions || []).slice(-1)[0] || {};
	const color = /^#[0-9a-f]{6}$/i.test(bg.color || "")
		? bg.color
		: "#000000";

	const sizeOpts = [
		{ value: "cover", label: _("Full Image (Cover)") },
		{ value: "contain", label: _("Fit (Contain)") },
		{ value: "auto", label: _("Original Size") },
		{ value: "100% 100%", label: _("Stretch") },
		{ value: "none", label: _("None") },
	];
	const repeatOpts = [
		{ value: "no-repeat", label: _("No Repeat") },
		{ value: "repeat", label: _("Repeat") },
		{ value: "repeat-x", label: _("Repeat Horizontally") },
		{ value: "repeat-y", label: _("Repeat Vertically") },
	];
	const posOpts = [
		{ value: "center center", label: _("Center") },
		{ value: "top left", label: _("Top Left") },
		{ value: "top center", label: _("Top Center") },
		{ value: "top right", label: _("Top Right") },
		{ value: "bottom left", label: _("Bottom Left") },
		{ value: "bottom center", label: _("Bottom Center") },
		{ value: "bottom right", label: _("Bottom Right") },
	];

	const layout = {
		container: {
			className: "cp-customizer",
			style:
				"margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:max-content;",
			subs: [
				{
					block: {
						style: "max-width:1024px;width:100%;",
						subs: [
							{ block: { className: "h1", html: _("Background") } },
							{
								block: {
									className: "p",
									html: _("Background settings for desktop"),
								},
							},
							{ block: { className: "line" } },
							{
								block: {
									className: "background-settings-container",
									subs: [
										// Row: thumbnail picker
										{
											block: {
												id: 'bg-image-wrap',
												style: 'display:contents;',
												search: { label: () => _('Background image'), keywords: ['background', 'image', 'wallpaper', 'photo', 'picture', 'thumbnail'] },
												html: renderThumbnailPickerHTML(os, { idPrefix: 'background', currentImage: bg.image, title: _("Background") }),
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'bg-noimage-wrap',
												style: 'display:contents;',
												search: { label: () => _('No background image'), keywords: ['no', 'background', 'image', 'none', 'disable', 'hide'] },
												subs: [os.ui.label(_("No background image"), "background-noimage-toggle", `<label class="switch-def"><input type="checkbox" id="background-noimage-toggle" class="lock" ${!bg.image ? "checked" : ""}><span class="slider"></span></label>`)]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'bg-color-wrap',
												style: 'display:contents;',
												search: { label: () => _('Background color'), keywords: ['background', 'color', 'colour', 'desktop color'] },
												subs: [os.ui.label(_("Background color"), "background-color", `<input type="color" id="background-color" value="${color}">`)]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'bg-size-wrap',
												style: 'display:contents;',
												search: { label: () => _('Background size'), keywords: ['size', 'cover', 'contain', 'stretch', 'background'] },
												subs: [os.ui.label(_("Size"), "background-size-selector", os.ui.dropmenu({ id: "background-size-selector", options: sizeOpts, selected: bg.size || "cover" }))]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'bg-repeat-wrap',
												style: 'display:contents;',
												search: { label: () => _('Background repeat'), keywords: ['repeat', 'tile', 'background', 'no-repeat'] },
												subs: [os.ui.label(_("Repeat"), "background-repeat-selector", os.ui.dropmenu({ id: "background-repeat-selector", options: repeatOpts, selected: bg.repeat || "no-repeat" }))]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'bg-position-wrap',
												style: 'display:contents;',
												search: { label: () => _('Background position'), keywords: ['position', 'center', 'top', 'bottom', 'background'] },
												subs: [os.ui.label(_("Position"), "background-position-selector", os.ui.dropmenu({ id: "background-position-selector", options: posOpts, selected: bg.position || "center center" }))]
											}
										},
									],
								},
							},
						],
					},
				},
			],
		},
	};

	const html = os.ui.body(layout, { programid: 'controlpanel', panelId: 'customize' }).render();

	// Just the persistence side (save settings + notify), no re-apply — used
	// after applyBackground() already did the real, awaited
	// os.desktop.setBackgroundImage() call itself. Calling the full
	// (debounced) saveBackground() right after applyBackground() used to
	// re-run setBackgroundImage() a second time for the exact same image —
	// harmless back when that function was a synchronous CSS-only write, but
	// now that it genuinely re-fetches + creates a new object URL, doing it
	// twice per click meant the background visibly swapped/re-painted twice
	// in a row for one user action.
	function persistBackgroundSettings() {
		if (typeof os.saveUserSettings === "function") os.saveUserSettings();
		app.desktop.taskbar.notify.success({ programid: "controlpanel", time: 2000 });
	}

	let saveTimeout;
	const saveBackground = () => {
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			const image =
				(os.desktop.backgroundOptions || [{}]).slice(-1)[0]?.image || "";
			const size = $("#background-size-selector").val() || "cover";
			const repeat = $("#background-repeat-selector").val() || "no-repeat";
			const position = $("#background-position-selector").val() || "center center";
			const color = $("#background-color").val() || "#000000";
			os.desktop.setBackgroundImage({ image, size, repeat, position, color });
			persistBackgroundSettings();
		}, 500);
	};

	setTimeout(() => {
		os.ui.dropmenu?.initAll();

		// Async and routed through the real os.desktop.setBackgroundImage
		// (not a direct document.body.style.backgroundImage write) so the
		// fade-out only starts once the new image has actually finished
		// loading — previously the overlay faded on a fixed 1s timer
		// regardless of how long the real image took to download, so on a
		// slow connection it revealed a still-blank/old background under a
		// fully-transparent overlay before the new image had painted.
		// (Thumbnail preview itself is already updated by bindThumbnailPicker
		// before onApply runs — this only handles the desktop-specific effects.)
		async function applyBackground(url) {
			const ov = document.createElement("div");
			ov.style.cssText =
				"position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;opacity:1;transition:opacity 1s ease;pointer-events:none;";
			document.body.appendChild(ov);

			const current = (os.desktop.backgroundOptions || []).slice(-1)[0] || {};
			await os.desktop.setBackgroundImage({
				image: url,
				size: current.size,
				repeat: current.repeat,
				position: current.position,
				color: current.color,
				blur: current.blur,
			});

			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					ov.style.opacity = "0";
				}),
			);
			setTimeout(() => ov.remove(), 1100);

			$("#background-noimage-toggle").prop("checked", false);
		}

		function clearBackgroundImage() {
			document.body.style.backgroundImage = '';
			const opts = (os.desktop.backgroundOptions || []).slice(-1)[0];
			if (opts) opts.image = '';
			$("#background-noimage-toggle").prop("checked", true);
		}

		$("#background-noimage-toggle")
			.on("change", (e) => {
				if (e.target.checked) {
					clearBackgroundImage();
					saveBackground();
				}
			});

		bindThumbnailPicker(os, {
			idPrefix: 'background',
			currentImage: bg.image,
			onApply: async (url) => { await applyBackground(url); persistBackgroundSettings(); },
			onClear: () => { clearBackgroundImage(); saveBackground(); },
		});

		// Live preview + autosave for dropdowns and color
		$("#background-size-selector")
			.on("change", (e) => {
				document.body.style.backgroundSize = e.target.value;

				if (e.target.value === "none") {
					document.body.style.backgroundImage = "none";
				} else {
					const currentImage = (os.desktop.backgroundOptions || []).slice(-1)[0]?.image;
					document.body.style.backgroundImage = currentImage ? `url(${currentImage})` : "";
				}
				saveBackground();
			});
		$("#background-repeat-selector")
			.on("change", (e) => {
				document.body.style.backgroundRepeat = e.target.value;
				saveBackground();
			});
		$("#background-position-selector")
			.on("change", (e) => {
				document.body.style.backgroundPosition = e.target.value;
				saveBackground();
			});
		$("#background-color")
			.on("input", (e) => {
				document.body.style.backgroundColor = e.target.value;
			})
			.on("change", () => saveBackground());
	}, 0);

	return html;
}

export function renderTheme(os) {
	const defaultTheme = {
		backgruondColorA_RGBA: "#2525254d",
		backgruondColorB_RGBA: "#0a0a0a33",
		backgruondColorC_RGBA: "#00000040",
		blur: "10",
		borderRadius: "20",
		fontColor: "#ffffff",
		opacity: "10",
		opactiyTrue: true,
		backgroundRadialColor: "#ffc107",
	};

	if (!os.config.user.settings.theme) {
		os.config.user.settings.theme = JSON.parse(JSON.stringify(defaultTheme));
	}

	const theme = os.config.user.settings.theme;

	const extractColorFromRgba = (rgba) => {
		if (!rgba) return "#000000";
		if (rgba.startsWith("#")) {
			return rgba.length === 9 ? rgba.substring(0, 7)
				: rgba.length === 5 ? `#${rgba[1]}${rgba[1]}${rgba[2]}${rgba[2]}${rgba[3]}${rgba[3]}`
					: rgba;
		}
		const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if (match) {
			return "#" + [match[1], match[2], match[3]]
				.map(n => parseInt(n).toString(16).padStart(2, "0")).join("");
		}
		return "#000000";
	};

	const bgColor = extractColorFromRgba(theme.backgruondColorA_RGBA || defaultTheme.backgruondColorA_RGBA);
	const fontColor = theme.fontColor || defaultTheme.fontColor;
	const opacity = theme.opacity || defaultTheme.opacity;
	const blur = parseInt(theme.blur) || 10;
	const radius = parseInt(theme.borderRadius) || 20;
	const opacityOn = theme.opactiyTrue !== false;
	const radialColor = theme.backgroundRadialColor || defaultTheme.backgroundRadialColor;

	const defaultBgColor = extractColorFromRgba(defaultTheme.backgruondColorA_RGBA);
	const paletteColors = [defaultBgColor, "#bbdefb", "#01579b", "#26c6da", "#43A047", "#66bb6a", "#fff176", "#ffc107", "#e64a19", "#ec407a", "#f8bbd0", "#e1bee7", "#7b1fa2", "#d7ccc8", "#8d6e63", "#9e9e9e", "#fafafa"];

	const layout = {
		container: {
			className: "cp-customizer",
			style: "margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:max-content;",
			subs: [
				{
					block: {
						style: "max-width:1024px;width:100%;",
						subs: [
							{ block: { className: "h1", html: _("Theme") } },
							{ block: { className: "p", html: _("Change the color of your window borders, Start menu, and taskbar") } },
							{
								block: {
									id: 'theme-palette-wrap',
									style: 'display:contents;',
									search: { label: () => _('Color palette'), keywords: ['color', 'palette', 'theme', 'preset', 'scheme'] },
									html: `<div class="color-palette">${paletteColors.map((c, i) =>
										`<div class="def-box-black${i === 0 ? ' def-box-default' : ''}" title="${i === 0 ? _('Default') : c}"><div class="color-option" data-color="${c}" style="--bg-palette:${c};"></div></div>`
									).join("")
										}</div>`
								}
							},
							{ block: { className: "line" } },
							{
								block: {
									className: "background-settings-container",
									subs: [
										{
											block: {
												id: 'theme-bg-color-wrap',
												style: 'display:contents;',
												search: { label: () => _('Background color'), keywords: ['background', 'color', 'theme', 'window color'] },
												subs: [os.ui.label(_("Background color"), "cp-theme-bg-color", `<input type="color" id="cp-theme-bg-color" value="${bgColor}">`)]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'theme-font-color-wrap',
												style: 'display:contents;',
												search: { label: () => _('Font color'), keywords: ['font', 'color', 'text', 'theme', 'foreground'] },
												subs: [os.ui.label(_("Font color"), "cp-theme-font-color", `<input type="color" id="cp-theme-font-color" value="${fontColor}">`)]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'theme-opacity-toggle-wrap',
												style: 'display:contents;',
												search: { label: () => _('Enable Transparency'), keywords: ['transparency', 'enable', 'toggle', 'opaque', 'glass'] },
												subs: [os.ui.label(_("Enable Transparency"), "cp-opacity-toggle", `<label class="switch-def"><input type="checkbox" id="cp-opacity-toggle" class="lock" ${opacityOn ? "checked" : ""}><span class="slider"></span></label>`)]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'theme-transparency-wrap',
												style: 'display:contents;',
												search: { label: () => _('Transparency'), keywords: ['transparency', 'opacity', 'alpha', 'see-through'] },
												subs: [os.ui.label(_("Transparency"), "cp-theme-transparency", `<input type="range" id="cp-theme-transparency" min="0" max="100" value="${opacity}">`)]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'theme-border-radius-wrap',
												style: 'display:contents;',
												search: { label: () => _('Border Radius'), keywords: ['border', 'radius', 'rounded', 'corners', 'theme'] },
												subs: [os.ui.label(_("Border Radius"), "cp-theme-border-radius", `<input type="range" id="cp-theme-border-radius" min="0" max="40" value="${radius}">`)]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'theme-blur-wrap',
												style: 'display:contents;',
												search: { label: () => _('Blur Background'), keywords: ['blur', 'background', 'frosted', 'glass', 'theme'] },
												subs: [os.ui.label(_("Blur Background"), "cp-theme-blur-slider", `<input type="range" id="cp-theme-blur-slider" min="1" max="30" value="${blur}">`)]
											}
										},
										{ block: { className: "line" } },
										{
											block: {
												id: 'theme-radial-color-wrap',
												style: 'display:contents;',
												search: { label: () => _('Radial gradient color'), keywords: ['radial', 'gradient', 'color', 'accent', 'button', 'glow'] },
												subs: [os.ui.label(_("Radial gradient color"), "cp-theme-radial-color", `<input type="color" id="cp-theme-radial-color" value="${radialColor}">`)]
											}
										},
									],
								},
							},
						],
					},
				},
			],
		},
	};

	const html = os.ui.body(layout, { programid: 'controlpanel', panelId: 'theme' }).render();

	let isInitializing = true;

	const generateRelatedColors = (baseHex, originalB, currentC) => {
		const fixedBOpacity = originalB.slice(-2);
		const fixedCOpacity = currentC.slice(-2);
		const r = parseInt(baseHex.slice(1, 3), 16);
		const g = parseInt(baseHex.slice(3, 5), 16);
		const b = parseInt(baseHex.slice(5, 7), 16);
		const darken = (r, g, b, pct) => {
			const f = 1 - pct / 100;
			return { r: Math.round(r * f), g: Math.round(g * f), b: Math.round(b * f) };
		};
		const toHex = (r, g, b) => "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
		const cB = darken(r, g, b, 20);
		const cC = darken(r, g, b, 60);
		return {
			colorA: baseHex + defaultTheme.backgruondColorA_RGBA.slice(-2),
			colorB: toHex(cB.r, cB.g, cB.b) + fixedBOpacity,
			colorC: toHex(cC.r, cC.g, cC.b) + fixedCOpacity,
		};
	};

	const applyRadialGradient = (hex) => {
		const r = parseInt(hex.slice(1, 3), 16) || 0;
		const g = parseInt(hex.slice(3, 5), 16) || 0;
		const b = parseInt(hex.slice(5, 7), 16) || 0;
		const dh = n => Math.round(n * 0.92).toString(16).padStart(2, '0');
		const gradient = `radial-gradient(circle, ${hex} 0%, #${dh(r)}${dh(g)}${dh(b)} 100%)`;
		os.setCSSVariable("--background-radial", gradient);
		$('.tasks .after:not([data-custom-color])').css('background', 'var(--background-radial)');
		return hex;
	};

	let saveTimeout;
	const saveWithDelay = (updateRadial = false) => {
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			const bg = $("#cp-theme-bg-color").val() || bgColor;
			const fc = $("#cp-theme-font-color").val() || fontColor;
			const _cssInt = (name) => parseInt(os.config.local?.cssVariables?.[name] || "");
			const _cssOp = () => Math.round(parseFloat(os.config.local?.cssVariables?.["--theme-opacity"] || "NaN") * 100);
			const _opHandle = document.querySelector(".cp-customizer #cp-theme-transparency .slider-handle");
			const _opSlider = _opHandle ? parseInt(_opHandle.getAttribute("data-value"), 10) : NaN;
			const _opTheme = parseInt(os.config.user.settings.theme.opacity);
			const _opCss = _cssOp();
			const _op = !isNaN(_opSlider) ? _opSlider
				: (!isNaN(_opTheme) && _opTheme > 0) ? _opTheme
					: (!isNaN(_opCss) && _opCss > 0) ? _opCss
						: NaN;
			const _radTheme = parseInt(os.config.user.settings.theme.borderRadius);
			const _radCss = _cssInt("--theme-borderradius");
			const _rad = !isNaN(_radTheme) ? _radTheme : !isNaN(_radCss) ? _radCss : NaN;
			const _blTheme = parseInt(os.config.user.settings.theme.blur);
			const _blCss = _cssInt("--theme-blur");
			const _bl = (!isNaN(_blTheme) && _blTheme > 0) ? _blTheme
				: (!isNaN(_blCss) && _blCss > 0) ? _blCss
					: NaN;
			const opVal = isNaN(_op) ? 10 : _op;
			const radVal = isNaN(_rad) ? 20 : _rad;
			const blurVal = isNaN(_bl) ? 10 : _bl;
			const _toggleChecked = $("#cp-opacity-toggle").prop("checked");
			const opOn = _toggleChecked === true || (_toggleChecked === undefined && os.config.user.settings.theme.opactiyTrue !== false);
			const cur = os.config.user.settings.theme;
			const colors = generateRelatedColors(
				bg,
				cur.backgruondColorB_RGBA || defaultTheme.backgruondColorB_RGBA,
				cur.backgruondColorC_RGBA || defaultTheme.backgruondColorC_RGBA,
			);
			os.config.user.settings.theme = {
				...cur,
				backgruondColorA_RGBA: colors.colorA,
				backgruondColorB_RGBA: colors.colorB,
				backgruondColorC_RGBA: colors.colorC,
				blur: String(blurVal),
				borderRadius: String(radVal),
				fontColor: fc,
				opacity: opVal.toString(),
				opactiyTrue: opOn,
			};
			os.setCSSVariable("--theme-backgruondcolora", colors.colorA);
			os.setCSSVariable("--theme-backgruondcolorb", colors.colorB);
			const _parseHex = c => {
				if (!c || !c.startsWith('#')) return null;
				const h = c.length === 9 ? c.slice(0, 7) : c;
				return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
			};
			const _opVal = opOn ? opVal / 100 : 1;
			const _rgbA = _parseHex(colors.colorA) || { r: 37, g: 37, b: 37 };
			const _rgbB = _parseHex(colors.colorB) || { r: 10, g: 10, b: 10 };
			os.setCSSVariable("--theme-backgruondcolora-o", `rgba(${_rgbA.r},${_rgbA.g},${_rgbA.b},${_opVal})`);
			os.setCSSVariable("--theme-backgruondcolorb-o", `rgba(${_rgbB.r},${_rgbB.g},${_rgbB.b},${_opVal})`);
			os.setCSSVariable("--theme-blur", `${blurVal}px`);
			os.setCSSVariable("--theme-borderradius", `${radVal}px`);
			os.setCSSVariable("--theme-fontcolor", fc);
			os.setCSSVariable("--theme-opacity", opOn ? (opVal / 100).toString() : "1");
			if (updateRadial) {
				const pickerHex = $("#cp-theme-radial-color").val();
				if (pickerHex) {
					os.config.user.settings.theme.backgroundRadialColor = pickerHex;
					applyRadialGradient(pickerHex);
				}
			} else {
				os.config.user.settings.theme.backgroundRadialColor = bg;
				applyRadialGradient(bg);
				const radialPicker = document.getElementById("cp-theme-radial-color");
				if (radialPicker) radialPicker.value = bg;
			}
			if (typeof os.saveUserSettings === "function") os.saveUserSettings();
			app.desktop.taskbar.notify.success({ programid: "controlpanel", time: 2000 });
		}, 500);
	};

	// Sliders + event listeners — inside setTimeout to guarantee HTML is in DOM first
	setTimeout(async () => {
		const _cssInt2 = (name) => parseInt(os.config.local?.cssVariables?.[name] || "");
		const _cssOp2 = () => Math.round(parseFloat(os.config.local?.cssVariables?.["--theme-opacity"] || "NaN") * 100);

		const _sOpRaw = parseInt(os.config.user.settings.theme.opacity);
		const _sRadRaw = parseInt(os.config.user.settings.theme.borderRadius);
		const _sBlRaw = parseInt(os.config.user.settings.theme.blur);

		const _sOp = (!isNaN(_sOpRaw) && _sOpRaw > 0) ? _sOpRaw : _cssOp2();
		const _sRad = !isNaN(_sRadRaw) ? _sRadRaw : _cssInt2("--theme-borderradius");
		const _sBl = (!isNaN(_sBlRaw) && _sBlRaw > 0) ? _sBlRaw : _cssInt2("--theme-blur");

		await os.ui.slider({
			handle1: { start: isNaN(_sOp) ? 10 : _sOp },
			onUpdate(values) {
				if (isInitializing) return;
				os.config.user.settings.theme.opacity = values.handle1.toString();
				saveWithDelay();
			},
		}, ".cp-customizer #cp-theme-transparency");

		await os.ui.slider({
			handle1: { start: isNaN(_sRad) ? 20 : _sRad },
			onUpdate(values) {
				if (isInitializing) return;
				os.config.user.settings.theme.borderRadius = String(values.handle1);
				saveWithDelay();
			},
		}, ".cp-customizer #cp-theme-border-radius");

		await os.ui.slider({
			min: 1,
			handle1: { start: (isNaN(_sBl) || _sBl <= 0) ? 10 : _sBl },
			onUpdate(values) {
				if (isInitializing) return;
				os.config.user.settings.theme.blur = String(values.handle1);
				saveWithDelay();
			},
		}, ".cp-customizer #cp-theme-blur-slider");

		$("#cp-theme-bg-color").on("change", () => saveWithDelay(false));
		$("#cp-theme-font-color").on("change", () => saveWithDelay(false));
		$("#cp-opacity-toggle").on("change", () => saveWithDelay(false));
		$("#cp-theme-radial-color").on("change", () => saveWithDelay(true));

		document.querySelectorAll(".color-option").forEach(el => {
			el.addEventListener("click", () => {
				const color = el.dataset.color;
				const input = $("#cp-theme-bg-color")[0];
				if (input) { input.value = color; input.dispatchEvent(new Event("change")); }
			});
		});

		isInitializing = false;
	}, 0);

	return html;
}
