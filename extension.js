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

const WindowOptionsMenu = new Lang.Class({
	Name: "WindowOptionsMenu",
	Extends: PopupMenu.PopupMenu,

	_init: function (windowlistitem) {
		this.parent(windowlistitem.actor, 0.0, St.Side.BOTTOM);
		this._items = [];
		this._window = windowlistitem;

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
});

const WindowListItem = new Lang.Class({
	Name: "WindowListItem",

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
		this.metaWindow.disconnect(this._ID_notify_title);
		this.metaWindow.disconnect(this._ID_notify_minimize);
		global.display.disconnect( this._ID_notify_focus);
		this._menu.destroy();
	},

	_onButtonPress: function (actor, event) {
		let but = event.get_button();
		if (but === 1) {
			this._menu.close();
			if (this.metaWindow.has_focus())
				this.metaWindow.minimize();
			else
				this.metaWindow.activate(global.get_current_time());
		} else if (but === 3) {
			this._menu.toggle();
		}
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
			this._itemBox.add_style_pseudo_class('focused');
		} else {
			this._itemBox.remove_style_pseudo_class('focused');
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
		                               style_class: 'window-list-box',
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

		this._addWindow(window)
	},

	_windowRemoved: function (workspace, window) {
		if (workspace.index() !== global.screen.get_active_workspace_index())
			return;

		for (let i in this._windows) {
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
		this._menuManager.addMenu(item._menu);
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
		this.actor = new St.BoxLayout({style_class: 'bottom-panel',
		                               name: 'bottomPanel'});
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
		this._ID_overview_show = Main.overview.connect('showing',
				Lang.bind(this, this._showOverview));
		this._ID_overview_hide = Main.overview.connect('hidden',
				Lang.bind(this,this._hideOverview));
	},

	relayout: function () {
		let prim = Main.layoutManager.primaryMonitor;
		let h = this.actor.get_theme_node().get_height();

		/* Only with these precise measurements will windows snap to it
		 * like a real panel. */
		this.actor.set_position(prim.x, prim.y + prim.height - h);
		this.actor.set_size(prim.width, -1);
	},

	_showOverview: function() {
		this.actor.hide();
	},

	_hideOverview: function() {
		this.actor.show();
	},

	_onDestroy: function () {
		global.screen.disconnect(this._ID_monitors_changed);
		Main.overview.disconnect(this._ID_overview_show);
		Main.overview.disconnect(this._ID_overview_hide);
	}
});

let myShowTray, origShowTray;
let myHideTray, origHideTray;
let myUpdateShowingNotification, origUpdateShowingNotification;
let myOnNotificationExpanded, origOnNotificationExpanded;
let myToggleState, origToggleState;

function init(extensionMeta) {
	// For some fucked up reason, the (x,y) coordinates here are relative to
	// the bottom-left corner. That means that positive x-coordinates work
	// as expected, yet positive y-coordinates fall off the screen!

	// The first `MessageTray` is the namespace, the second is the actual Object
	origShowTray = MessageTray.MessageTray.prototype._showTray;
	myShowTray = function() {
		if (!this._grabHelper.grab({ actor: this.actor,
		                             modal: true,
									 onUngrab: Lang.bind(this, this._escapeTray) })) {
			this._traySummoned = false;
			return false;
		}

		this.emit('showing');
		let h = bottomPanel.actor.get_theme_node().get_height();
		this.actor.y = -h;
		this._tween(this.actor, '_trayState', MessageTray.State.SHOWN,
		            { y: -this.actor.height - h,
					  time: MessageTray.ANIMATION_TIME,
					  transition: 'easeOutQuad'
					});

		this._lightbox.show();

		return true;
	};

	origHideTray = MessageTray.MessageTray.prototype._hideTray;
	myHideTray = function() {
		this._summaryBoxPointer.actor.hide();

		this.emit('hiding');
		let h = bottomPanel.actor.get_theme_node().get_height();
		this._tween(this.actor, '_trayState', MessageTray.State.HIDDEN,
		            { y: -h,
					  time: MessageTray.ANIMATION_TIME,
					  transition: 'easeOutQuad',
					  onComplete: function(){this.actor.y = 0},
					  onCompleteScope: this,
					});

		this._grabHelper.ungrab({actor: this.actor});
		this._lightbox.hide();
	};

	origUpdateShowingNotification =
		MessageTray.MessageTray.prototype._updateShowingNotification;
	myUpdateShowingNotification = function() {
		this._notification.acknowledged = true;

		if (this._notification.urgency === MessageTray.Urgency.CRITICAL)
			this._expandNotification(true);

		let tweenParams = { opacity: 255,
		                    time: MessageTray.ANIMATION_TIME,
		                    transition: 'easeOutQuad',
		                    onComplete: this._showNotificationCompleted,
		                    onCompleteScope: this
		                  };
		if (!this._notification.expanded) {
			let h = bottomPanel.actor.get_theme_node().get_height();
			tweenParams.y = -this._notificationWidget.height - h;
		}

		this._tween(this._notificationWidget, '_notificationState',
				MessageTray.State.SHOWN, tweenParams);
	};

    origOnNotificationExpanded =
        MessageTray.MessageTray.prototype._onNotificationExpanded;
    myOnNotificationExpanded = function() {
        let h = bottomPanel.actor.get_theme_node().get_height();
        let expandedY = - this._notificationWidget.height - h;
        // Using the close button causes a segfault when the tray is next
        // invoked.  So don't display the close button.
        //this._closeButton.show();

        // Don't animate the notification to its new position if it has shrunk:
        // there will be a very visible "gap" that breaks the illusion.
        if (this._notificationWidget.y < expandedY) {
            this._notificationWidget.y = expandedY;
        } else if (this._notification.y != expandedY) {
            this._tween(this._notificationWidget, '_notificationState', MessageTray.State.SHOWN,
                        { y: expandedY,
                          opacity: 255,
                          time: MessageTray.ANIMATION_TIME,
                          transition: 'easeOutQuad'
                        });
        }
    };

	// ToggleState is not defined at the moment, but it doesn't hurt to be
	// futureproof.
	origToggleState = MessageTray.MessageTray.prototype.toggleState;
	// I'll be honest, I don't really know what's going on here.
	// The code in messageTray.js is an absolute mess!
	myToggleState = function() {
		if (this._summaryState === MessageTray.State.SHOWN) {
			this._pointerInSummary = false;
			this._traySummoned = false;
		}
		else {
			this._pointerInSummary = true;
			this._traySummoned = true;
		}
		this._updateState();
	};
}

function enable() {
	MessageTray.MessageTray.prototype._showTray = myShowTray;
	MessageTray.MessageTray.prototype._hideTray = myHideTray;
	MessageTray.MessageTray.prototype.toggleState = myToggleState;
    MessageTray.MessageTray.prototype._updateShowingNotification =
        myUpdateShowingNotification;
    MessageTray.MessageTray.prototype._onNotificationExpanded =
        myOnNotificationExpanded;

	bottomPanel = new BottomPanel();

	Main.layoutManager.addChrome(bottomPanel.actor, {affectsStruts: true, trackFullscreen: true});
	bottomPanel.relayout();
}

function disable() {
	MessageTray.MessageTray.prototype._showTray = origShowTray;
	MessageTray.MessageTray.prototype._hideTray = origHideTray;
	MessageTray.MessageTray.prototype.toggleState = origToggleState;
    MessageTray.MessageTray.prototype._updateShowingNotification =
        origUpdateShowingNotification;
    MessageTray.MessageTray.prototype._onNotificationExpanded =
        origOnNotificationExpanded;

	Main.layoutManager.removeChrome(bottomPanel.actor);
	bottomPanel.actor.destroy();
	bottomPanel = null;
}
