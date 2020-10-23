// Bottom panel extension
// Copyright (C) 2020 Kasper Maurice Meerts
// License: GPLv2+
// Many inspiration gotten from the extensions by
// R.M. Yorston, gcampax and Mathematical Coffee

// TODO vfunc instead of signal handler

"use strict";

const {Clutter, GObject, Meta, St} = imports.gi;
const Main = imports.ui.main;

// A `WindowButton` is an StButton containing an StBoxLayout
// with an StLabel and an StIcon
let WindowButton = GObject.registerClass(
class WindowButton extends St.Button {
	_init(metaWindow) {
		let itemBox = new St.BoxLayout();
		super._init({
			style_class: 'window-button',
			can_focus: true,
			button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
			child: itemBox
		});
		this.metaWindow = metaWindow;
		// XXX What does x_align do here
		this._icon = new St.Icon({style_class: 'window-icon',
								 y_align: Clutter.ActorAlign.CENTER,
								 fallback_icon_name: 'application-x-executable'});
		itemBox.add(this._icon);
		this._onIconChanged();

		this._label = new St.Label({style_class: 'window-label',
									y_align: Clutter.ActorAlign.CENTER});
		itemBox.add(this._label);
		this._onTitleChanged();
		this._onFocusChanged();

		this._ID_notify_title = this.metaWindow.connect(
				'notify::title', this._onTitleChanged.bind(this));
		this._ID_notify_icon = this.metaWindow.connect(
				'notify::mini-icon', this._onIconChanged.bind(this));
		this._ID_notify_minimize = this.metaWindow.connect(
				'notify::minimized', this._onMinimizedChanged.bind(this));
		this._ID_notify_focus = this.metaWindow.connect(
				'notify::appears-focused', this._onFocusChanged.bind(this));

		this.connect(
				'notify::allocation', this._onAllocationChanged.bind(this));
		this.connect('clicked', this._onClicked.bind(this));
		this.connect('destroy', this._onDestroy.bind(this));
	}

	_onDestroy() {
		this.metaWindow.set_icon_geometry(null);
		this.metaWindow.disconnect(this._ID_notify_title);
		this.metaWindow.disconnect(this._ID_notify_icon);
		this.metaWindow.disconnect(this._ID_notify_minimize);
		this.metaWindow.disconnect(this._ID_notify_focus);
	}

	_onClicked(actor, button) {
		if (button === 1) {
			if (this.metaWindow.has_focus())
				this.metaWindow.minimize();
			else
				this.metaWindow.activate(global.get_current_time());
		} else if (button === 2) {
			this.metaWindow.delete(global.get_current_time());
		}
	}

	_onAllocationChanged() {
		let rect = new Meta.Rectangle();

		[rect.x,     rect.y     ] = this.get_transformed_position();
		[rect.width, rect.height] = this.get_transformed_size();

		this.metaWindow.set_icon_geometry(rect);
	}

	// XXX Check git history
	_onIconChanged() {
		let textureCache = St.TextureCache.get_default();
		let icon = textureCache.bind_cairo_surface_property(
				this.metaWindow, 'mini-icon'); // mini-icons are 16 pixels?
		// fucking undocumented APIs...
		// TODO These icons look terrible. Why don't scaling filters work? 

		this._icon.set_gicon(icon);
	}

	_onTitleChanged() {
		let formatString = this.metaWindow.minimized ? '[%s]' : '%s';
		this._label.set_text(formatString.format(this.metaWindow.title));
	}

	_onMinimizedChanged() {
		this._icon.set_opacity(this.metaWindow.minimized ? 64 : 255);
		this._onTitleChanged();
	}

	_onFocusChanged() {
		if (this.metaWindow.has_focus())
			this.add_style_pseudo_class('focused');
		else
			this.remove_style_pseudo_class('focused');
	}
});

let WindowList = GObject.registerClass(
class WindowList extends St.BoxLayout {
	_init() {
		super._init({
			name: 'windowList',
			reactive: true });
		this._workspace = global.workspace_manager.get_active_workspace();

		this._reloadItems();

		// Signals
		this._ID_switch_workspace = global.window_manager.connect(
				'switch-workspace', this._onSwitchWorkspace.bind(this));
		this._onSwitchWorkspace();

		this.connect('scroll-event', this._onScroll.bind(this));
		this.connect('destroy', this._onDestroy.bind(this));
	}

	_onDestroy() {
		global.window_manager.disconnect(this._ID_switch_workspace);

		this._workspace.disconnect(this._ID_window_added);
		this._workspace.disconnect(this._ID_window_removed);
	}

	_onSwitchWorkspace() {
		// Start by disconnecting all signals from the old workspace
		if (this._ID_window_added)
			this._workspace.disconnect(this._ID_window_added);
		if (this._ID_window_removed)
			this._workspace.disconnect(this._ID_window_removed);

		// Now connect the new signals
		this._workspace = global.workspace_manager.get_active_workspace();

		this._ID_window_added = this._workspace.connect(
				'window-added', this._windowAdded.bind(this));
		this._ID_window_removed = this._workspace.connect(
				'window-removed', this._windowRemoved.bind(this));
		this._reloadItems();
	}

	_windowAdded(workspace, win) {
		if (workspace.index() !== global.workspace_manager.get_active_workspace_index())
			return;

		this._addWindow(win);
	}

	_windowRemoved(workspace, win) {
		if (workspace.index() !== global.workspace_manager.get_active_workspace_index())
			return;

		let child = this.get_children().find(w => w.metaWindow === win);
		if (child)
			child.destroy();
	}

	_onScroll(actor, event) {
		let diff = 0;
		if (event.get_scroll_direction() === Clutter.ScrollDirection.DOWN)
			diff = 1;
		else if (event.get_scroll_direction() === Clutter.ScrollDirection.UP)
			diff = -1;
		else
			return;

		let children = this.get_children();
		let focus_i = children.findIndex(w => w.metaWindow.has_focus());
		if (focus_i === -1)
			return;

		let new_i = Math.clamp(focus_i + diff, 0, children.length - 1);
		children[new_i].metaWindow.activate(global.get_current_time());
	}

	_addWindow(metaWindow) {
		if (metaWindow.is_skip_taskbar())
			return;

		let button = new WindowButton(metaWindow);
		this.add(button);
	}

	_reloadItems () {
		this.destroy_all_children();

		let metaWorkspace = global.workspace_manager.get_active_workspace();
		let windows = metaWorkspace.list_windows();
		windows.sort(
				(a, b) => a.get_stable_sequence() - b.get_stable_sequence());

		windows.forEach(this._addWindow, this);
	}
});

let BottomPanel = GObject.registerClass(
class BottomPanel extends St.Bin { // XXX Could be St.Widget?
	_init() {
		super._init({ name: 'bottomPanel' }); // XXX reactive?

		this._windowList = new WindowList();
		this.set_child(this._windowList);

		// Signals
		this._ID_monitors_changed = Meta.MonitorManager.get().connect(
		        'monitors-changed', this.relayout.bind(this));
		this._ID_overview_show = Main.overview.connect(
				'showing', () => this.hide());
		this._ID_overview_hide = Main.overview.connect(
				'hidden', () => this.show());

		this.connect('style-changed', this.relayout.bind(this));
		this.connect('destroy', this._onDestroy.bind(this));
	}

	relayout() {
		let prim = Main.layoutManager.primaryMonitor;
		let h = this.get_theme_node().get_height();

		// Only with these precise measurements will windows snap to it
		this.set_position(prim.x, prim.y + prim.height - h);
		this.set_size(prim.width, -1);
	}

	_onDestroy() {
		Meta.MonitorManager.get().disconnect(this._ID_monitors_changed);
		Main.overview.disconnect(this._ID_overview_show);
		Main.overview.disconnect(this._ID_overview_hide);
	}
});

let bottomPanel = null;

function init() {
	return;
}

function enable() {
	bottomPanel = new BottomPanel();

	Main.layoutManager.addChrome(bottomPanel,
			{affectsStruts: true, trackFullscreen: true});
	Main.ctrlAltTabManager.addGroup(bottomPanel,
			"Bottom Bar", 'start-here-symbolic');
	bottomPanel.relayout();
}

function disable() {
	Main.ctrlAltTabManager.removeGroup(bottomPanel);
	Main.layoutManager.removeChrome(bottomPanel);
	bottomPanel.destroy();
	bottomPanel = null;
}
