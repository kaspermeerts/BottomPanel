// Bottom panel extension
// Copyright (C) 2014 Kasper Maurice Meerts
// License: GPLv2+
// Many inspiration gotten from the extensions by
// R.M. Yorston, gcampax and Mathematical Coffee

"use strict";

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;

const OPTION_TYPES = {
	BUTTON: "Button",
	SWITCH: "Switch",
	SEPARATOR: "Separator"
};

// TODO Make a Class of all these singleton objects,
// hoist some of the _addItem logic in them
// TODO Sticky windows and Above all windows (Metawindow.sticky...)
const OPTIONS = {
	SEPARATOR: {
		type: OPTION_TYPES.SEPARATOR,
	},
	MINIMIZE: {
		title: "Minimize",
		type: OPTION_TYPES.BUTTON,
		callback: function (item, event, metaWindow) {
			metaWindow.minimize();
		},
	},
	RESTORE: {
		title: "Restore",
		type: OPTION_TYPES.BUTTON,
		callback: function (item, event, metaWindow) {
			metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL |
			                      Meta.MaximizeFlags.VERTICAL);
		},
	},
	MAXIMIZE: {
		title: "Maximize",
		type: OPTION_TYPES.BUTTON,
		callback: function (item, event, metaWindow) {
			metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL |
			                    Meta.MaximizeFlags.VERTICAL);
		},
	},
	MOVE_PREVIOUS: {
		title: "Move to previous workspace",
		type: OPTION_TYPES.BUTTON,
		callback: function(item, event, metaWindow) {
			metaWindow.change_workspace_by_index(
			        metaWindow.get_workspace().index() - 1,
					false,
					global.get_current_time());
		},
	},
	MOVE_NEXT: {
		title: "Move to next workspace",
		type: OPTION_TYPES.BUTTON,
		callback: function (item, event, metaWindow) {
			metaWindow.change_workspace_by_index(
			        metaWindow.get_workspace().index() + 1,
					false,
					global.get_current_time());
		},
	},
	CLOSE: {
		title: "Close window",
		type: OPTION_TYPES.BUTTON,
		callback: function (item, event, metaWindow) {
			metaWindow.delete(global.get_current_time());
		},
	},
	QUIT: {
		title: "Quit",
		type: OPTION_TYPES.BUTTON,
		callback: function(item, event, metaWindow) {
			this._app.request_quit();
		},
	},
};

const OPTION_MENU = [
	OPTIONS.MINIMIZE,
	OPTIONS.RESTORE,
	OPTIONS.MAXIMIZE,
	OPTIONS.SEPARATOR,
	OPTIONS.MOVE_PREVIOUS,
	OPTIONS.MOVE_NEXT,
	OPTIONS.SEPARATOR,
	OPTIONS.CLOSE,
	OPTIONS.QUIT,
];

const WindowOptionsMenu = new Lang.Class({
	Name: "WindowOptionsMenu",
	Extends: PopupMenu.PopupMenu,

	_init: function (windowlistitem) {
		this.parent(windowlistitem.actor, 0.0, St.Side.BOTTOM);

		let tracker = Shell.WindowTracker.get_default();
		this._app = tracker.get_window_app(windowlistitem.metaWindow);
		this._window = windowlistitem;

		OPTION_MENU.forEach(this._addItem, this);
	},

	_addItem: function (option) {
		let menu_item;

		if (option === OPTIONS.SEPARATOR) {
			menu_item = new PopupMenu.PopupSeparatorMenuItem();
		} else {
			let appName = this._app.get_name();
			let item_name = option.title;
			if (option === OPTIONS.QUIT)
				item_name += " " + appName;

			menu_item = new PopupMenu.PopupMenuItem(item_name);
			menu_item.connect('activate',
					Lang.bind(this, option.callback, this._window.metaWindow));
		}

		/* Some special cases */
		if (option === OPTIONS.MOVE_PREVIOUS)
			if (global.screen.get_active_workspace_index() === 0)
				menu_item.setSensitive(false);
		if (option === OPTIONS.MOVE_NEXT)
			if (global.screen.get_active_workspace_index() === global.screen.n_workspaces)
				menu_item.setSensitive(false);

		this.addMenuItem(menu_item);
	},
});

const WindowListItem = new Lang.Class({
	Name: "WindowListItem",

	_init: function (metaWindow) {
		this.metaWindow = metaWindow;
		// A `WindowListItem` is actored by an StButton containing
		// an StBoxLayout with an StLabel and an StBin
		this._itemBox = new St.BoxLayout({});
		this.actor = new St.Button({ style_class: 'window-button',
		                             can_focus: true,
									 x_fill: true,
									 y_fill:true,
									 button_mask: St.ButtonMask.ONE |
									              St.ButtonMask.TWO |
												  St.ButtonMask.THREE,
		                             child: this._itemBox, });
		this.actor._delegate = this;

		this.menu = new WindowOptionsMenu(this);
		Main.uiGroup.add_actor(this.menu.actor);
		this.menu.actor.hide();

		// Window icon
		let mini_icon = this.metaWindow.icon;
		let icon = new Clutter.Texture();
		icon.set_from_rgb_data(mini_icon.get_pixels(),
							   mini_icon.get_has_alpha(),
							   mini_icon.get_width(),
							   mini_icon.get_height(),
							   mini_icon.get_rowstride(),
							   4, // BPP
							   0); // Textureflags, none handled yet
		this._icon = new St.Bin({ style_class: 'window-icon',
		                          child: icon });
		this._itemBox.add(this._icon, {x_fill: false, y_fill: false});

		// Window name
		this._label = new St.Label({style_class: 'window-label'});
		this._itemBox.add(this._label, {x_fill: true,  y_fill: false});
		this._onTitleChanged();

		// Signals
		this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
		this.actor.connect('clicked',
		        Lang.bind(this, this._onClicked));
		this.actor.connect('allocation-changed',
		        Lang.bind(this, this._onAllocationChanged));

		this._ID_notify_title =
		        this.metaWindow.connect('notify::title',
		               Lang.bind(this, this._onTitleChanged));
		this._ID_notify_minimize =
		        this.metaWindow.connect('notify::minimized',
				        Lang.bind(this, this._onMinimizedChanged));
		this._ID_notify_focus =
				global.display.connect('notify::focus-window',
				        Lang.bind(this, this._onFocusChanged));
	},

	_onDestroy: function () {
		this.metaWindow.set_icon_geometry(null);
		this.metaWindow.disconnect(this._ID_notify_title);
		this.metaWindow.disconnect(this._ID_notify_minimize);
		global.display.disconnect( this._ID_notify_focus);
		this.menu.destroy();
	},

	_onClicked: function (actor, button) {
		if (this.menu.isOpen) {
			this.menu.close();
			return;
		}

		if (button === 1) {
			if (this.metaWindow.has_focus())
				this.metaWindow.minimize();
			else
				this.metaWindow.activate(global.get_current_time());
		} else if (button === 2) {
			this.metaWindow.delete(global.get_current_time());
		} else if (button === 3) {
			this.menu.open();
		}
	},

	_onAllocationChanged: function () {
		let rect = new Meta.Rectangle();

		[rect.x,     rect.y     ] = this.actor.get_transformed_position();
		[rect.width, rect.height] = this.actor.get_transformed_size();

		this.metaWindow.set_icon_geometry(rect);
	},

	_onTitleChanged: function () {
		let formatString = this.metaWindow.minimized ? '[%s]' : '%s';
		this._label.text = formatString.format(this.metaWindow.title);
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

	_init: function (menuManager) {
		this._menuManager = menuManager;
		this._ws = {workspace: undefined, _ID_window_added: 0,
		                                  _ID_window_removed: 0};
		this._windows = [];

		this.actor = new St.BoxLayout({name: 'windowList',
	                                   reactive: true});
		this.actor._delegate = this;

		// Signals
		this.actor.connect('destroy',
		        Lang.bind(this, this._onDestroy));
		this.actor.connect('scroll-event',
		        Lang.bind(this, this._onScrollEvent));

		let wm = global.window_manager;
		this._ID_switch_workspace = wm.connect('switch-workspace',
		        Lang.bind(this, this._onSwitchWorkspace));

		this._ID_screen_notify = global.screen.connect('notify::n-workspaces',
		        Lang.bind(this, this._onSwitchWorkspace));
		this._onSwitchWorkspace();
	},

	_onDestroy: function () {
		let screen = global.screen;
		screen.disconnect(this._ID_screen_notify);

		let wm = global.window_manager;
		wm.disconnect(this._ID_switch_workspace);

		let ws = this._ws;
		ws.workspace.disconnect(ws._ID_window_added);
		ws.workspace.disconnect(ws._ID_window_removed);
	},

	_onSwitchWorkspace: function () {
		// Start by disconnecting all signals from the old workspace
		let ws = this._ws;

		if (ws._ID_window_added)
			ws.workspace.disconnect(ws._ID_window_added);

		if (ws._ID_window_removed)
			ws.workspace.disconnect(ws._ID_window_removed);

		// Now connect the new signals
		ws.workspace = global.screen.get_active_workspace();

		ws._ID_window_added = ws.workspace.connect('window-added',
		        Lang.bind(this, this._windowAdded));
		ws._ID_window_removed = ws.workspace.connect('window-removed',
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

	_onScrollEvent: function (actor, event) {
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
		let tracker = Shell.WindowTracker.get_default();
		// Interesting windows exclude stuff like docks, desktop, etc...
		if (!metaWindow || !tracker.is_window_interesting(metaWindow))
			return;
		let item = new WindowListItem(metaWindow);
		this._windows.push(item);
		this.actor.add(item.actor);
		this._menuManager.addMenu(item.menu);
	},

	_reloadItems: function () {
		this.actor.destroy_all_children();
		this._windows = [];

		let metaWorkspace = global.screen.get_active_workspace();
		let windows = metaWorkspace.list_windows();
		windows.sort(function (w1, w2) {
			return w1.get_stable_sequence() - w2.get_stable_sequence();
		});

		for (let i = 0; i < windows.length; i++) {
			this._addWindow(windows[i]);
		}
	}
});

const BottomPanel = new Lang.Class({
	Name: "BottomPanel",

	_init: function () {
		// Layout
		this.actor = new St.BoxLayout({name: 'bottomPanel'});
		this.actor._delegate = this;

		// PopupMenuManager needs this.actor to be defined
		this.menus = new PopupMenu.PopupMenuManager(this);

		this._windowList = new WindowList(this.menus);
		this.actor.add(this._windowList.actor, {expand: true});

		// Signals
		this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
		this.actor.connect('style-changed', Lang.bind(this, this.relayout));
		this._ID_monitors_changed = global.screen.connect(
		        'monitors-changed', Lang.bind(this, this.relayout));
		this._ID_fullscreen_changed = global.screen.connect(
		        'in-fullscreen-changed', Lang.bind(this, this._updateAnchor));
		this._ID_overview_show = Main.overview.connect('showing',
				Lang.bind(this, this._showOverview));
		this._ID_overview_hide = Main.overview.connect('hidden',
				Lang.bind(this,this._hideOverview));
	},

	relayout: function () {
		let prim = Main.layoutManager.primaryMonitor;
		let h = this.actor.get_theme_node().get_height();

		// Only with these precise measurements will windows snap to it
		this.actor.set_position(prim.x, prim.y + prim.height - h);
		this.actor.set_size(prim.width, -1);

		this._updateAnchor();
	},

	_showOverview: function () {
		this.actor.hide();
		this._updateAnchor();
	},

	_hideOverview: function () {
		if (!Main.layoutManager.primaryMonitor.inFullscreen)
			this.actor.show();
		this._updateAnchor();
	},

	_updateAnchor: function () {
		let h = this.actor.visible ? this.actor.height : 0;

		Main.messageTray.actor.anchor_y = h;
		Main.messageTray._notificationWidget.anchor_y = h;
	},

	_onDestroy: function () {
		global.screen.disconnect(this._ID_monitors_changed);
		global.screen.disconnect(this._ID_fullscreen_changed);
		Main.overview.disconnect(this._ID_overview_show);
		Main.overview.disconnect(this._ID_overview_hide);

		Main.messageTray.actor.anchor_y = 0;
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
