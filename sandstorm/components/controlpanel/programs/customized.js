/**
 * @file controlpanel/programs/customized.js
 * @description Manifest for the Background and Theme settings panels.
 *
 * Boot-loaded (part of `load.js`'s eager `controlpanelPrograms` list): only
 * registers the launcher-tile SVG icons + the `front`/`searchItems` metadata
 * `os.controlpanel.add()` needs synchronously for the launcher grid and
 * Start Menu search to work before the panel is ever opened. The actual
 * settings UI (CSS, dep-loading, `render`) lives in the sibling
 * `customized.content.js`, loaded on first open via `panel.contentPath` —
 * see `controlpanel.js`'s `_renderPanel()`.
 *
 * @module components/controlpanel/programs/customized
 */

export function setup(os) {
	os.svg.global.load({
		id: "ic-cp-background",
		viewBox: "0 0 24 24",
		content: `<path fill="white" d="M4 4h7V2H4c-1.1 0-2 .9-2 2v7h2V4zm6 9-4 5h12l-3-4-2.03 2.71L10 13zm7-4.5c0-.83-.67-1.5-1.5-1.5S14 7.67 14 8.5s.67 1.5 1.5 1.5S17 9.33 17 8.5zM20 2h-7v2h7v7h2V4c0-1.1-.9-2-2-2zm0 18h-7v2h7c1.1 0 2-.9 2-2v-7h-2v7zM4 13H2v7c0 1.1.9 2 2 2h7v-2H4v-7z"/>`,
	});

	os.svg.global.load({
		id: "ic-cp-theme",
		viewBox: "0 0 24 24",
		content: `<path fill="white" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>`,
	});

	// ── Background tab ───────────────────────────────────────────────────────

	os.controlpanel.add({
		front: {
			name: "customize",
			icon: "#ic-cp-background",
			type: "svg",
			label: () => _("Background"),
			keywords: ["background", "wallpaper", "image", "desktop", "blur"],
		},
		panel: {
			id: "customize",
			name: () => _("Background"),
			searchItems: [
				{ id: 'bg-image-wrap', label: () => _('Background image'), keywords: ['background', 'image', 'wallpaper', 'photo', 'picture'] },
				{ id: 'bg-noimage-wrap', label: () => _('No background image'), keywords: ['no', 'background', 'image', 'none', 'disable', 'hide'] },
				{ id: 'bg-color-wrap', label: () => _('Background color'), keywords: ['background', 'color', 'colour'] },
				{ id: 'bg-size-wrap', label: () => _('Background size'), keywords: ['size', 'cover', 'contain', 'stretch', 'background'] },
				{ id: 'bg-repeat-wrap', label: () => _('Background repeat'), keywords: ['repeat', 'tile', 'background'] },
				{ id: 'bg-position-wrap', label: () => _('Background position'), keywords: ['position', 'center', 'top', 'bottom', 'background'] },
			],
			contentPath: 'controlpanel/programs/customized.content.js',
			renderExport: 'renderBackground',
		},
	});

	// ── Theme tab ────────────────────────────────────────────────────────────

	os.controlpanel.add({
		front: {
			name: "theme",
			icon: "#ic-cp-theme",
			type: "svg",
			label: () => _("Theme"),
			keywords: ["theme", "color", "colors", "appearance", "style", "css"],
		},
		panel: {
			id: "theme",
			name: () => _("Theme"),
			searchItems: [
				{ id: 'theme-palette-wrap', label: () => _('Color palette'), keywords: ['color', 'palette', 'theme', 'preset'] },
				{ id: 'theme-bg-color-wrap', label: () => _('Background color'), keywords: ['background', 'color', 'theme', 'window color'] },
				{ id: 'theme-font-color-wrap', label: () => _('Font color'), keywords: ['font', 'color', 'text', 'theme', 'foreground'] },
				{ id: 'theme-opacity-toggle-wrap', label: () => _('Enable Transparency'), keywords: ['transparency', 'enable', 'toggle', 'glass'] },
				{ id: 'theme-transparency-wrap', label: () => _('Transparency'), keywords: ['transparency', 'opacity', 'alpha'] },
				{ id: 'theme-border-radius-wrap', label: () => _('Border Radius'), keywords: ['border', 'radius', 'rounded', 'corners', 'theme'] },
				{ id: 'theme-blur-wrap', label: () => _('Blur Background'), keywords: ['blur', 'background', 'frosted', 'glass', 'theme'] },
				{ id: 'theme-radial-color-wrap', label: () => _('Radial gradient color'), keywords: ['radial', 'gradient', 'color', 'accent', 'button', 'glow'] },
			],
			contentPath: 'controlpanel/programs/customized.content.js',
			renderExport: 'renderTheme',
		},
	});
}

export function start() { }
