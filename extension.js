// Bottom panel extension
// Copyright (C) 2023 Kasper Maurice Meerts
// License: GPLv2+
// Much inspiration gotten from the extensions by
// R.M. Yorston, gcampax and Mathematical Coffee

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// A `WindowButton` is an StButton containing an StBoxLayout
// with an StLabel and an StIcon
class WindowButton extends St.Button {
	static { GObject.registerClass(this); }

	constructor(metaWindow) {
		let itemBox = new St.BoxLayout();
		super({
			style_class: 'window-button',
			can_focus: true,
			button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
			child: itemBox
		});
		this.metaWindow = metaWindow;
		// XXX What does x_align do here
		this._icon = new St.Icon({
			style_class: 'window-icon',
			y_align: Clutter.ActorAlign.CENTER,
			fallback_icon_name: 'application-x-executable'
		});
		itemBox.add(this._icon);
		this._onIconChanged();

		this._label = new St.Label({style_class: 'window-label',
									y_align: Clutter.ActorAlign.CENTER});
		itemBox.add(this._label);
		this._onTitleChanged();
		this._onFocusChanged();

		this.metaWindow.connectObject(
			'notify::title', () => this._onTitleChanged(),
			'notify::mini-icon', () => this._onIconChanged(),
			'notify::minimized', () => this._onMinimizedChanged(),
			'notify::appears-focused', () => this._onFocusChanged(),
			this);

		this.connect(
				'notify::allocation', this._onAllocationChanged.bind(this));
		this.connect('destroy', this._onDestroy.bind(this));
	}

	_onDestroy() {
		this.metaWindow.set_icon_geometry(null);
	}

	vfunc_clicked(button) {
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
		let rect = new Mtk.Rectangle();

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
}

class WindowList extends St.BoxLayout {
	static { GObject.registerClass(this); }

	constructor() {
		super({
			name: 'windowList',
			reactive: true });
		this._workspace = global.workspace_manager.get_active_workspace();

		global.window_manager.connectObject(
			'switch-workspace', () => this._onSwitchWorkspace(),
			this);
		this._onSwitchWorkspace();

		this.connect('destroy', this._onDestroy.bind(this));
	}

	_onDestroy() {
		this._workspace.disconnect(this._ID_window_added);
		this._workspace.disconnect(this._ID_window_removed);
	}

	vfunc_scroll_event(scrollEvent) {
		let diff = 0;
		if (scrollEvent.get_scroll_direction() === Clutter.ScrollDirection.DOWN)
			diff = 1;
		else if (scrollEvent.get_scroll_direction() === Clutter.ScrollDirection.UP)
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

	_onSwitchWorkspace() {
		if (this._ID_window_added)
			this._workspace.disconnect(this._ID_window_added);
		if (this._ID_window_removed)
			this._workspace.disconnect(this._ID_window_removed);

		this._workspace = global.workspace_manager.get_active_workspace();

		this._ID_window_added = this._workspace.connect(
				'window-added', this._addWindow.bind(this));
		this._ID_window_removed = this._workspace.connect(
				'window-removed', this._removeWindow.bind(this));
		this._reloadItems();
	}

	_addWindow(workspace, metaWindow) {
		if (metaWindow.skip_taskbar)
			return;

		this.add(new WindowButton(metaWindow));
	}

	_removeWindow(workspace, metaWindow) {
		this.get_children().find(w => w.metaWindow === metaWindow)?.destroy();
	}

	_reloadItems () {
		this.destroy_all_children();

		let metaWorkspace = global.workspace_manager.get_active_workspace();
		metaWorkspace.list_windows()
			.sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence())
			.forEach(win => this._addWindow(metaWorkspace, win));
	}
}

class BottomPanel extends St.Bin { // XXX Could be St.Widget?
	static { GObject.registerClass(this); }

	constructor() {
		super({ name: 'bottomPanel' }); // XXX reactive?

		this.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);

		Main.layoutManager.addChrome(this, {
			affectsStruts: true,
			trackFullscreen: true
		});
		Main.ctrlAltTabManager.addGroup(this,
				"Bottom Bar", 'start-here-symbolic');
		//Main.uiGroup.set_child_above_sibling(this.actor, Main.layoutManager.panelBox);

		this._windowList = new WindowList();
		this.set_child(this._windowList);

		// Signals
		global.backend.get_monitor_manager().connectObject(
			'monitors-changed', () => this.relayout(),
			this);
		Main.overview.connectObject(
			'showing', () => this.hide(),
			'hidden', () => this.show(),
			this);

		this.connect('style-changed', this.relayout.bind(this));
		this.connect('destroy', this._onDestroy.bind(this));
		this.relayout();
	}

	_onDestroy() {
		Main.layoutManager.removeChrome(this);
		Main.ctrlAltTabManager.removeGroup(this);
	}

	relayout() {
		let prim = Main.layoutManager.primaryMonitor; // bottomMonitor?
		let h = this.get_theme_node().get_height();

		// Only with these precise measurements will windows snap to it
		this.set_position(prim.x, prim.y + prim.height - h);
		this.set_size(prim.width, -1);
		this._windowList._reloadItems();
	}
}

export default class BottomPanelExtension extends Extension {
	enable() {
		this._bottomPanel = new BottomPanel();
	}

	disable() {
		this._bottomPanel.destroy();
		delete this._bottomPanel;
	}
}
