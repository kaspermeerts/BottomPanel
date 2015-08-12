// Bottom panel extension
// Copyright (C) 2014 Kasper Maurice Meerts
// License: GPLv2+
// Many inspiration gotten from the extensions by
// R.M. Yorston, gcampax and Mathematical Coffee

"use strict";

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Cogl = imports.gi.Cogl;

const Main = imports.ui.main;

const WindowButton = new Lang.Class({
	Name: "WindowButton",

	_init: function (metaWindow) {
		this.metaWindow = metaWindow;
		// A `WindowButton` is actored by an StButton containing
		// an StBoxLayout with an StLabel and an StBin
		this._itemBox = new St.BoxLayout();
		this.actor = new St.Button({ style_class: 'window-button',
		                             can_focus: true,
									 x_fill: true,
									 y_fill:true,
									 button_mask: St.ButtonMask.ONE |
									              St.ButtonMask.TWO,
		                             child: this._itemBox, });
		this.actor._delegate = this;

		// Window icon
		this._icon = new St.Bin({ style_class: 'window-icon' });
		this._itemBox.add(this._icon, {x_fill: false, y_fill: false});
		this._onIconChanged();

		// Window name
		this._label = new St.Label({style_class: 'window-label'});
		this._itemBox.add(this._label, {x_fill: true,  y_fill: false});
		this._onTitleChanged();
		this._onFocusChanged();

		// Signals
		let win = this.metaWindow;

		this._ID_notify_title = win.connect('notify::title',
				Lang.bind(this, this._onTitleChanged));
		this._ID_notify_icon = win.connect('notify::mini-icon',
				Lang.bind(this, this._onIconChanged));
		this._ID_notify_minimize = win.connect('notify::minimized',
				Lang.bind(this, this._onMinimizedChanged));
		this._ID_notify_focus = win.connect('notify::appears-focused',
				Lang.bind(this, this._onFocusChanged));

		this.actor.connect('allocation-changed',
		        Lang.bind(this, this._onAllocationChanged));
		this.actor.connect('clicked', Lang.bind(this, this._onClicked));
		this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
	},

	_onDestroy: function () {
		this.metaWindow.set_icon_geometry(null);
		this.metaWindow.disconnect(this._ID_notify_title);
		this.metaWindow.disconnect(this._ID_notify_icon);
		this.metaWindow.disconnect(this._ID_notify_minimize);
		this.metaWindow.disconnect(this._ID_notify_focus);
	},

	_onClicked: function (actor, button) {
		if (button === 1) {
			if (this.metaWindow.has_focus())
				this.metaWindow.minimize();
			else
				this.metaWindow.activate(global.get_current_time());
		} else if (button === 2) {
			this.metaWindow.delete(global.get_current_time());
		}
	},

	_onAllocationChanged: function () {
		let rect = new Meta.Rectangle();

		[rect.x,     rect.y     ] = this.actor.get_transformed_position();
		[rect.width, rect.height] = this.actor.get_transformed_size();

		this.metaWindow.set_icon_geometry(rect);
	},

	_onIconChanged: function () {
		let textureCache = St.TextureCache.get_default();
		let icon = textureCache.bind_cairo_surface_property(
			this.metaWindow, 'mini-icon');

		icon.set_content_scaling_filters(
			Clutter.ScalingFilter.TRILINEAR,
			Clutter.ScalingFilter.LINEAR);
		icon.set_content_gravity(Clutter.Gravity.NORTH_WEST);
		icon.set_size(icon.get_width(), icon.get_height());
		this._icon.destroy_all_children();
		this._icon.set_child(icon);
	},

	_onTitleChanged: function () {
		let formatString = this.metaWindow.minimized ? '[%s]' : '%s';
		this._label.set_text(formatString.format(this.metaWindow.title));
	},

	_onMinimizedChanged: function () {
		this._icon.set_opacity(this.metaWindow.minimized ? 64 : 255);
		this._onTitleChanged();
	},

	_onFocusChanged: function () {
		if (this.metaWindow.has_focus()) {
			this.actor.add_style_pseudo_class('focused');
		} else {
			this.actor.remove_style_pseudo_class('focused');
		}
	},

});

const WindowList = new Lang.Class({
	Name: "WindowList",

	_init: function () {
		this._workspace = global.screen.get_active_workspace();
		this._windows = [];

		this.actor = new St.BoxLayout({name: 'windowList',
	                                   reactive: true});
		this.actor._delegate = this;

		this._reloadItems();

		// Signals
		this._ID_switch_workspace =
				global.window_manager.connect('switch-workspace',
						Lang.bind(this, this._onSwitchWorkspace));
		this._onSwitchWorkspace();

		this.actor.connect('scroll-event', Lang.bind(this, this._onScroll));
		this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
	},

	_onDestroy: function () {
		global.window_manager.disconnect(this._ID_switch_workspace);

		this._workspace.disconnect(this._ID_window_added);
		this._workspace.disconnect(this._ID_window_removed);
	},

	_onSwitchWorkspace: function () {
		// Start by disconnecting all signals from the old workspace
		if (this._ID_window_added)
			this._workspace.disconnect(this._ID_window_added);
		if (this._ID_window_removed)
			this._workspace.disconnect(this._ID_window_removed);

		// Now connect the new signals
		this._workspace = global.screen.get_active_workspace();

		this._ID_window_added = this._workspace.connect('window-added',
		        Lang.bind(this, this._windowAdded));
		this._ID_window_removed = this._workspace.connect('window-removed',
		        Lang.bind(this, this._windowRemoved));
		this._reloadItems();
	},

	_windowAdded: function (workspace, window) {
		if (workspace.index() !== global.screen.get_active_workspace_index())
			return;

		this._addWindow(window);
	},

	_windowRemoved: function (workspace, window) {
		if (workspace.index() !== global.screen.get_active_workspace_index())
			return;

		for (let i = 0; i < this._windows.length; i++) {
			let w = this._windows[i];
			if (w.metaWindow === window) {
				this.actor.remove_actor(w.actor);
				w.actor.destroy();
				this._windows.splice(i, 1);
				break;
			}
		}
	},

	_onScroll: function (actor, event) {
		let diff = 0;
		if (event.get_scroll_direction() === Clutter.ScrollDirection.DOWN)
			diff = 1;
		else if (event.get_scroll_direction() === Clutter.ScrollDirection.UP)
			diff = -1;
		else
			return;

		let ws = this._windows;
		let focus_i = -1;
		for (let i = 0; i < ws.length; i++) {
			if (ws[i].metaWindow.has_focus()) {
				focus_i = i;
			}
		}
		if (focus_i === -1)
			return;

		let new_i = focus_i + diff;
		if (new_i < 0)
			new_i = 0;
		else if (new_i >= ws.length)
			new_i = ws.length - 1;

		ws[new_i].metaWindow.activate(global.get_current_time());
	},

	_addWindow: function (metaWindow) {
		if (metaWindow.is_skip_taskbar())
			return;

		let button = new WindowButton(metaWindow);
		this._windows.push(button);
		this.actor.add(button.actor);
	},

	_reloadItems: function () {
		this.actor.destroy_all_children();
		this._windows = [];

		let metaWorkspace = global.screen.get_active_workspace();
		let windows = metaWorkspace.list_windows();
		windows.sort(function (w1, w2) {
			return w1.get_stable_sequence() - w2.get_stable_sequence();
		});

		windows.forEach(this._addWindow, this);
	}
});

const BottomPanel = new Lang.Class({
	Name: "BottomPanel",

	_init: function () {
		// Layout
		this.actor = new St.BoxLayout({name: 'bottomPanel'});
		this.actor._delegate = this;

		this._windowList = new WindowList();
		this.actor.add(this._windowList.actor, {expand: true});

		// Signals
		this._ID_monitors_changed = global.screen.connect(
		        'monitors-changed', Lang.bind(this, this.relayout));
		this._ID_overview_show = Main.overview.connect('showing',
				Lang.bind(this, this._showOverview));
		this._ID_overview_hide = Main.overview.connect('hidden',
				Lang.bind(this,this._hideOverview));

		this.actor.connect('style-changed', Lang.bind(this, this.relayout));
		this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
	},

	relayout: function () {
		let prim = Main.layoutManager.primaryMonitor;
		let h = this.actor.get_theme_node().get_height();

		// Only with these precise measurements will windows snap to it
		this.actor.set_position(prim.x, prim.y + prim.height - h);
		this.actor.set_size(prim.width, -1);
	},

	_showOverview: function () {
		this.actor.hide();
	},

	_hideOverview: function () {
		if (!Main.layoutManager.primaryMonitor.inFullscreen)
			this.actor.show();
	},

	_onDestroy: function () {
		global.screen.disconnect(this._ID_monitors_changed);
		global.screen.disconnect(this._ID_fullscreen_changed);
		Main.overview.disconnect(this._ID_overview_show);
		Main.overview.disconnect(this._ID_overview_hide);
	}
});

let bottomPanel = null;

function init(extensionMeta) {
	return;
}

function enable() {
	bottomPanel = new BottomPanel();

	Main.layoutManager.addChrome(bottomPanel.actor, {affectsStruts: true,
	                                                 trackFullscreen: true});
	Main.ctrlAltTabManager.addGroup(bottomPanel.actor,
	        "Bottom Bar", 'start-here-symbolic');
	bottomPanel.relayout();
}

function disable() {
	Main.ctrlAltTabManager.removeGroup(bottomPanel.actor);
	Main.layoutManager.removeChrome(bottomPanel.actor);
	bottomPanel.actor.destroy();
	bottomPanel = null;
}
