// Bottom panel extension
// Copyright (C) 2012 Kasper Maurice Meerts
// License: GPLv2+
// Based on the extension made by R.M. Yorston
// Many inspiration gotten from the extensions by
// gcampax and Mathematical Coffee

"use strict";

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const PopupMenu = imports.ui.popupMenu;

const WINDOW_OPTION_TYPES = {
	BUTTON: "Button",
	SWITCH: "Switch",
	SEPARATOR: "Separator"
};

const WINDOW_OPTIONS = {
	MINIMIZE:       {name: "Minimize",      type: WINDOW_OPTION_TYPES.BUTTON},
	RESTORE:        {name: "Restore",       type: WINDOW_OPTION_TYPES.BUTTON},
	MAXIMIZE:       {name: "Maximize",      type: WINDOW_OPTION_TYPES.BUTTON},
	CLOSE:          {name: "Close window",  type: WINDOW_OPTION_TYPES.BUTTON},
	QUIT:           {name: "Quit %s",       type: WINDOW_OPTION_TYPES.BUTTON},
	ALWAYS_ON_TOP:  {name: "Always on top", type: WINDOW_OPTION_TYPES.SWITCH},
	ALWAYS_ON_WORKSPACE:
	                {name: "Always on visible workspace",
					                        type: WINDOW_OPTION_TYPES.SWITCH},
	PREV_WORKSPACE: {name: "Move to previous workspace",
	                                        type: WINDOW_OPTION_TYPES.BUTTON},
	NEXT_WORKSPACE: {name: "Move to next workspace",
	                                        type: WINDOW_OPTION_TYPES.BUTTON},
	SEPARATOR:      {name: "Separator",     type: WINDOW_OPTION_TYPES.SEPARATOR}
};

const WINDOW_OPTIONS_MENU = [
	WINDOW_OPTIONS.MINIMIZE,
	WINDOW_OPTIONS.RESTORE,
	WINDOW_OPTIONS.MAXIMIZE,
	WINDOW_OPTIONS.SEPARATOR,
	WINDOW_OPTIONS.PREV_WORKSPACE,
	WINDOW_OPTIONS.NEXT_WORKSPACE,
	WINDOW_OPTIONS.SEPARATOR,
/*	WINDOW_OPTIONS.ALWAYS_ON_TOP,
	WINDOW_OPTIONS.ALWAYS_ON_WORKSPACE,
	WINDOW_OPTIONS.SEPARATOR,*/
	WINDOW_OPTIONS.CLOSE,
	WINDOW_OPTIONS.QUIT
];

let bottomPanel = null;

function MessageButton() {
	this._init();
}

MessageButton.prototype = {
	_init: function() {
		this.actor = new St.Button({name: 'messageButton',
		                            style_class: 'message-button',
		                            reactive: true});
		this.setText();
		this.actorAddedId = Main.messageTray._summary.connect('actor-added',
		        Lang.bind(this, this.setText));
		this.actorRemovedId = Main.messageTray._summary.connect('actor-removed',
		        Lang.bind(this, this.setText));
		this.actor.connect('clicked', Lang.bind(this, this._onClicked));
		this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
	},

	setText: function () {
		if (Main.messageTray._summary.get_children().length === 0)
			this.actor.set_label(' ');
		else
			this.actor.set_label('!');
	},

	_onClicked: function () {
		Main.messageTray.toggleState();
	},

	_onDestroy: function () {
		if (this.actorAddedId)
			Main.messageTray._summary.disconnect(this.actorAddedId);
		if (this.actorRemovedId)
			Main.messageTray._summary.disconnect(this.actorRemovedId);
	}
};

function WindowOptionsMenu(item) {
	this._init(item);
}

WindowOptionsMenu.prototype = {
	__proto__: PopupMenu.PopupMenu.prototype,

	_init: function (windowlistitem) {
		this._items = [];
		this._window = windowlistitem;
		PopupMenu.PopupMenu.prototype._init.call(this, this._window.actor, 0.0,
		        St.Side.BOTTOM);

		this._fillMenu();
	},

	_fillMenu: function () {
		for (let i in WINDOW_OPTIONS_MENU) {
			let option = WINDOW_OPTIONS_MENU[i];
			let menu_item;
			let item_name = option.name.format(this._window.appName);
			switch (option.type) {
			case WINDOW_OPTION_TYPES.BUTTON:
				menu_item = new PopupMenu.PopupMenuItem(item_name);
				menu_item.connect('activate',
				        Lang.bind(this, this._onActivate,
						          option, this._window.metaWindow));
				break;
			case WINDOW_OPTION_TYPES.SWITCH:
				menu_item = new PopupMenu.PopupSwitchMenuItem(item_name);
				menu_item.connect('toggled',
				        Lang.bind(this, this._onActivate,
						          option, this._window.metaWindow));
				break;
			case WINDOW_OPTION_TYPES.SEPARATOR:
				menu_item = new PopupMenu.PopupSeparatorMenuItem(item_name);
				break;
			default:
				global.log("Unknown WINDOW_OPTIONS_MENU option: " +
				        WINDOW_OPTIONS_MENU[i]);
				// XXX: Abort everthing?
				return;
				break;
			}
			/* Some special cases */
			if (option === WINDOW_OPTIONS.PREV_WORKSPACE)
				if (global.screen.get_active_workspace_index() === 0)
					menu_item.setSensitive(false);
			if (option === WINDOW_OPTIONS.NEXT_WORKSPACE)
				if (global.screen.get_active_workspace_index() === global.screen.n_workspaces)
					menu_item.setSensitive(false);

			this._items[i] = menu_item;
			this.addMenuItem(menu_item);
		}
	},

	_onActivate: function(menu_item, event, option, metaWindow) {
		switch(option) {
		case WINDOW_OPTIONS.MINIMIZE:
			metaWindow.minimize();
			break;
		case WINDOW_OPTIONS.RESTORE:
			metaWindow.unmaximize(
			    Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
			break;
		case WINDOW_OPTIONS.MAXIMIZE:
			metaWindow.maximize(
			    Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
			break;
		case WINDOW_OPTIONS.ALWAYS_ON_TOP:
		case WINDOW_OPTIONS.ALWAYS_ON_WORKSPACE:
			global.log("Not yet implemented function: " + option.name);
			break;
		case WINDOW_OPTIONS.PREV_WORKSPACE:
			metaWindow.change_workspace_by_index(
			        metaWindow.get_workspace().index() - 1,
					false,
					global.get_current_time());
			break;
		case WINDOW_OPTIONS.NEXT_WORKSPACE:
			metaWindow.change_workspace_by_index(
			        metaWindow.get_workspace().index() + 1,
					false,
					global.get_current_time());
			break;
		case WINDOW_OPTIONS.CLOSE:
			metaWindow.delete(global.get_current_time());
			break;
		case WINDOW_OPTIONS.QUIT:
			let tracker = Shell.WindowTracker.get_default();
			let app = tracker.get_window_app(metaWindow);
			app.request_quit();
			break;
		default:
			global.log("Unknown WINDOW_OPTIONS option: " + option.name);
			break;
		}
	}
};

function WindowListItem(metaWindow) {
	this._init(metaWindow);
}

WindowListItem.prototype = {
	_init: function (metaWindow) {
		// Shortcut
		let tracker = Shell.WindowTracker.get_default();
		let app = tracker.get_window_app(metaWindow);

		this.appName = app.get_name();
		this.metaWindow = metaWindow;
		/* A `WindowListItem` is actored by an StBoxLayout which envelops
		 * an StLabel and a ClutterTexture */
		this._itemBox = new St.BoxLayout({style_class: 'window-list-item-box',
		                                  reactive: 'true'});
		this.actor = this._itemBox;
		this.actor._delegate = this;

		this._menu = new WindowOptionsMenu(this);
		Main.uiGroup.add_actor(this._menu.actor);
		this._menu.actor.hide();

		/* Application icon */
		this._icon = app.create_icon_texture(16);
		this._itemBox.add(this._icon,  {x_fill: false, y_fill: false});

		/* Application name */
		this._label = new St.Label({style_class: 'window-list-item-label'});
		this._itemBox.add(this._label, {x_fill: true,  y_fill: false});
		this._onTitleChanged();

		/* Signals */
		this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
		this.actor.connect('button-press-event',
		                           Lang.bind(this, this._onButtonPress));

		this._notifyTitleId = metaWindow.connect('notify::title',
		                      Lang.bind(this, this._onTitleChanged));
	},

	_onTitleChanged: function () {
		let title;
		if (this.metaWindow.showing_on_its_workspace())
			title =       this.metaWindow.title;
		else
			title = '[' + this.metaWindow.title + ']';
		this._label.set_text(title);
	},

	_onDestroy: function () {
		// The actor is getting destroyed soon, no need to disconnect his
		// signals
		this.metaWindow.disconnect(this._notifyTitleId);
		this._menu.destroy();
	},

	_onButtonPress: function (actor, event) {
		let but = event.get_button();
		if (but === 1) {
			this._menu.close();
			// The timestamp is necessary for window activation, so outdated 
			// requests can be ignored. This isn't necessary for minimization
			if (this.metaWindow.has_focus())
				this.metaWindow.minimize();
			else
				this.metaWindow.activate(global.get_current_time());
		} else if (but === 3) {
			this._menu.toggle();
		}
	},

	// Public methods

	// I would just point this to _onTitleChanged. However, while the window is
	// minimizing, it's not technically minimized yet and thus the title would
	// be inaccurate.
	onMinimize: function () {
		this._label.set_text('[' + this.metaWindow.title + ']');
		this._icon.set_opacity(64);
	},

	onMap: function () {
		this._label.set_text(      this.metaWindow.title      );
		this._icon.set_opacity(255);
	},

	onFocus: function () {
		if (this.metaWindow.has_focus()) {
			this._itemBox.add_style_pseudo_class('focused');
		} else {
			this._itemBox.remove_style_pseudo_class('focused');
		}
	},
};

function WindowList(panel) {
	this._init(panel);
}

WindowList.prototype = {
	_init: function (panel) {
		this._panel = panel;
		this._ws = {workspace: undefined, _windowAddedId: 0,
		                                  _windowRemovedId: 0};
		this._windows = [];

		this.actor = new St.BoxLayout({name: 'windowList',
		                               style_class: 'window-list-box',
	                                   reactive: true});
		this.actor._delegate = this;

		// Signals
		this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent));

		let tracker = Shell.WindowTracker.get_default();
		tracker.connect('notify::focus-app', Lang.bind(this, this._onFocus));

		let wm = global.window_manager;
		wm.connect('minimize', Lang.bind(this, this._onMinimize));
		wm.connect('map', Lang.bind(this, this._onMap));
		wm.connect('switch-workspace', Lang.bind(this, this._onSwitchWorkspace));

		global.screen.connect('notify::n-workspaces',
		        Lang.bind(this, this._onSwitchWorkspace));
		this._onSwitchWorkspace();
	},

	_onSwitchWorkspace: function () {
		// Start by disconnecting all signals from the old workspace
		let ws = this._ws.workspace; // Shortcut

		if (this._ws._windowAddedId)
			ws.disconnect(this._ws._windowAddedId);

		if (this._ws._windowRemovedId)
			ws.disconnect(this._ws._windowRemovedId);

		// Now connect the new signals
		this._ws.workspace = global.screen.get_active_workspace();
		let ws = this._ws.workspace; // Shortcut

		this._ws._windowAddedId = ws.connect('window-added',
		        Lang.bind(this, this._windowAdded));
		this._ws._windowRemovedId = ws.connect('window-removed',
		        Lang.bind(this, this._windowRemoved));
		this._reloadItems();
	},

	_windowAdded: function (metaWorkspace, metaWindow) {
		if (metaWorkspace.index() !== global.screen.get_active_workspace_index())
			return;

		this._addWindow(metaWindow)
	},

	_windowRemoved: function (metaWorkspace, metaWindow) {
		if (metaWorkspace.index() !== global.screen.get_active_workspace_index())
			return;

		for (let i in this._windows) {
			let w = this._windows[i];
			if (w.metaWindow === metaWindow) {
				this.actor.remove_actor(w.actor);
				w.actor.destroy();
				this._windows.splice(i, 1);
				break;
			}
		}
	},

	// I delegate all signals to their respective windows here.
	// The `focus` signal is trickier since no defocus signal is emitted
	// I just warn every window and let them figure it out themselves
	// Bug in Mutter!
	_onFocus: function () {
		for (let i in this._windows) {
			this._windows[i].onFocus();
		}
	},

	_onMinimize: function (shellwm, actor) {
		for (let i in this._windows) {
			if (this._windows[i].metaWindow === actor.get_meta_window()) {
				this._windows[i].onMinimize();
				return;
			}
		}
	},

	_onMap: function (shellwm, actor) {
		for (let i in this._windows) {
			if (this._windows[i].metaWindow === actor.get_meta_window()) {
				this._windows[i].onMap();
				return;
			}
		}
	},

	_onScrollEvent: function (actor, event) {
		let diff = 0;
		if (event.get_scroll_direction() === Clutter.ScrollDirection.DOWN)
			diff = 1;
		else
			diff = -1;

		let ws = this._windows;
		let focus_i = -1;
		// I can't use the for(..in..) construction because that makes `i`
		// into a String. I don't get it either.
		for (let i = 0; i < ws.length; i++)
			if (ws[i].metaWindow.has_focus())
				focus_i = i;
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
		let app = tracker.get_window_app(metaWindow);
		if (!app)
			return;
		let item = new WindowListItem(metaWindow);
		this._windows.push(item);
		this.actor.add(item.actor);
		this._panel.menus.addMenu(item._menu);
	},

	_reloadItems: function () {
		this.actor.destroy_children();
		this._windows = [];

		let metaWorkspace = global.screen.get_active_workspace();
		let windows = metaWorkspace.list_windows();
		windows.sort(function (w1, w2) {
			return w1.get_stable_sequence() - w2.get_stable_sequence();
		});

		for (let i = 0; i < windows.length; i++) {
			this._addWindow(windows[i]);
		}

		// To highlight the currently focused window
		this._onFocus();
	}
};

function BottomPanel() {
	this._init();
}

BottomPanel.prototype = {
	_init: function () {
		this.menus = new PopupMenu.PopupMenuManager(this);

		// Layout
		this.actor = new St.BoxLayout({style_class: 'bottom-panel',
		                               name: 'bottomPanel'});
		this.actor._delegate = this;

		this._windowList = new WindowList(this);
		this.actor.add(this._windowList.actor, {expand: true});

		this._messageButton = new MessageButton();
		this.actor.add(this._messageButton.actor);

		// Signals
		this.actor.connect('style-changed', Lang.bind(this, this.relayout));
		global.screen.connect('monitors-changed', Lang.bind(this,
		                                                    this.relayout));
	},

	relayout: function () {
		let prim = Main.layoutManager.primaryMonitor;
		let h = this.actor.get_theme_node().get_height();

		/* Only with these precise measurements will windows snap to it
		 * like a real panel. */
		this.actor.set_position(prim.x, prim.y + prim.height - h);
		this.actor.set_size(prim.width, -1);
	}
};

let myShowTray, origShowTray;
let myHideTray, origHideTray;
let myToggleState, origToggleState;

function init(extensionMeta) {
	// For some fucked up reason, the (x,y) coordinates here are relative to
	// the bottom-left corner. That means that positive x-coordinates work
	// as expected, yet positive y-coordinates fall off the screen!

	// The first `MessageTray` is the namespace, the second is the actual Object
	origShowTray = MessageTray.MessageTray.prototype._showTray;
	myShowTray = function() {
		let h = bottomPanel.actor.get_theme_node().get_height();
		this._tween(this.actor, '_trayState', MessageTray.State.SHOWN,
		            { y: -this.actor.height - h,
					  time: MessageTray.ANIMATION_TIME,
					  transition: 'easeOutQuad'
					});
	};

	origHideTray = MessageTray.MessageTray.prototype._hideTray;
	myHideTray = function() {
		let h = bottomPanel.actor.get_theme_node().get_height();
		this._tween(this.actor, '_trayState', MessageTray.State.HIDDEN,
		            { y: this.actor.height,
					  time: MessageTray.ANIMATION_TIME,
					  transition: 'easeOutQuad'
					});
	};

	// ToggleState is not defined at the moment, but it doesn't hurt to be
	// futureproof.
	origToggleState = MessageTray.MessageTray.prototype.toggleState;
	// I'll be honest, I don't really know what's going on here.
	// The code in messageTray.js is an absolute mess!
	myToggleState = function() {
		if (this._summaryState === MessageTray.State.SHOWN ||
		    this._summaryState === MessageTray.State.SHOWING)
			this._pointerInSummary = false;
		else
			this._pointerInSummary = true;
		this._updateState();
	};
}

function enable() {
	MessageTray.MessageTray.prototype._showTray = myShowTray;
	MessageTray.MessageTray.prototype._hideTray = myHideTray;
	MessageTray.MessageTray.prototype.toggleState = myToggleState;

	bottomPanel = new BottomPanel();

	Main.layoutManager.addChrome(bottomPanel.actor, {affectsStruts: true});
	bottomPanel.relayout();
}

function disable() {
	MessageTray.MessageTray.prototype._showTray = origShowTray;
	MessageTray.MessageTray.prototype._hideTray = origHideTray;
	MessageTray.MessageTray.prototype.toggleState = origToggleState;

	Main.layoutManager.removeChrome(bottomPanel.actor);
	bottomPanel.actor.destroy();
	bottomPanel = null;
}
