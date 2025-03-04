'use strict';

/**
 * extension smart-home
 * JavaScript Gnome extension this is a class for one plugin created as panel menu.
 *
 * @author Václav Chlumský
 * @copyright Copyright 2025, Václav Chlumský.
 */

 /**
 * @license
 * The MIT License (MIT)
 *
 * Copyright (c) 2025 Václav Chlumský
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import * as Utils from './utils.js';
import * as ColorPicker from './colorpicker.js';
import {Extension, gettext} from 'resource:///org/gnome/shell/extensions/extension.js';

const ShellVersion = parseFloat(Config.PACKAGE_VERSION)
const __ = gettext;

const IconSize = 20;

const DeviceTypes = ['device'];
const SceneTypes = ['scene'];

export const SmartHomeIconPack = {
    NONE: 0,
    BRIGHT: 1,
    DARK: 2
};

export const SmartHomeMenuPosition = {
    CENTER: 0,
    RIGHT: 1,
    LEFT: 2
};

export const SmartHomeRequest = {
    FULL: 0
};

export const SmartHomeItemType = {
    SINGLE: 0,
    GROUP_ALL: 1,
    GROUP_ANY: 2,
    GROUP: 3,
    DEVICE: 4,
    CONTROL: 5,
    SCENE: 6
};

export const SmartHomeUiType = {
    SWITCH: 0,
    BRIGHTNESS: 1,
    COLOR: 2,
    COLOR_TEMP: 3,
    POSITION: 4,
    UP: 5,
    DOWN: 6,
    ACTIVATE: 7,
    EXECUTE: 8
};

export const SmartHomeMenuLevel = {
    NONE: 0,
    MENU: 1,
    GROUPITEMS: 2,
    GROUPITEMSSELECTED: 3,
    DEVICEMENU: 4,
    DEVICEITEMS: 5,
    DEVICEITEMSSELECTED: 6
};

/**
 * Color structure is diferent based on gnome shell verison.
 * 
 * @method getColor
 * @param {Number} red part of color
 * @param {Number} green part of color
 * @param {Number} blue part of color
 * @param {Number} alpha part of color
 * @return {Object} color
 */
function getColor(red, green, blue, alpha = 255) {
    let color;

    if (ShellVersion >= 47) {
        color = new Cogl.Color();
    } else {
        color = new Clutter.Color();
    }

    color.red = red;
    color.green = green;
    color.blue = blue;
    color.alpha = alpha;

    return color;
}

/**
 * Main class for one plugin. This creates the icon on status panel.
 *
 * @class SmartHomePanelMenu
 * @constructor
 * @return {Object} instance
 */
export const SmartHomePanelMenu = GObject.registerClass({
    GTypeName: 'SmartHomePanelMenu',
}, class SmartHomePanelMenu extends PanelMenu.Button {

    /**
     * SmartHomePanelMenu class initialization
     *  
     * @method _init
     * @param {String} id
     * @param {String} pluginName 
     * @param {Object} metadata 
     * @param {String} mainDir  
     * @param {Object} settings
     * @param {Object} openPref  
     * @private
     */
    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        super._init(0.0, metadata.name, false);

        this._ = Utils.checkGettextEnglish(__, settings);

        let signal;
        this.pluginID = `${id}_${pluginName}`;
        this.id = id;
        this.pluginName = pluginName;
        this.metadata = metadata;
        this.mainDir = mainDir.get_path();
        this._settings = settings;
        this.openPref = openPref;
        this.mediaDir = `${this.mainDir}/media`;
        this.pluginDir = `${this.mainDir}/plugins/${this.pluginName}`;
        this.pluginMediaDir = `${this.mainDir}/plugins/${this.pluginName}/media`;
        this._indicatorPositionBackUp = -1;
        this._hideUnavailable = Utils.ALL_DEFAULT_HIDE_UNAVAILABLE;
        this._indicatorPosition = SmartHomeMenuPosition.RIGHT;
        this._signals = {};
        this._networkClient = undefined;
        this._itemRefresher = {};
        this._iconPack = SmartHomeIconPack.BRIGHT;
        this._pluginSettings = {};
        this._timers = [];
        this._needsRebuild = true;
        this._menuObjects = {};
        this._allMenusSelected = {};
        this._menuSelected = {};

        this.readSettings();
        this.readSettingsMiscellaneous();

        signal = this.menu.connect(
            'open-state-changed',
            () => {
                /* opening main menu of the plugin always requests all data to update the UI */
                if (this.menu.isOpen) {
                    this.requestData();

                    if (this._openMenu){
                        this._openMenu.open(false);
                    }
                }
            }
        );
        this._appendSignal(signal, this.menu);

        let box = new St.BoxLayout({style_class: 'panel-status-menu-box'});

        let icon = new St.Icon({
            gicon : Gio.icon_new_for_string(`${this.pluginMediaDir}/main.svg`),
            style_class : 'system-status-icon',
        });

        this.style = `-natural-hpadding: 6px; -minimum-hpadding: 6px;`;

        let iconEffect = this._getIconBriConEffect(SmartHomeIconPack.BRIGHT);
        icon.add_effect(iconEffect);

        box.add_child(icon);
        this.add_child(box);

        signal = this._settings.connect(
            'changed',
            () => {
                this.readSettingsMiscellaneous();
                if (this.readSettings()) {
                    this.requestRebuild();
                }
            }
        );
        this._appendSignal(signal, this._settings);

        /* if the desktop is starting up, wait until starting is finished */
        this._startingUpSignal = undefined;
        if (Main.layoutManager._startingUp) {
            this._startingUpSignal = Main.layoutManager.connect(
                'startup-complete',
                () => {
                    Main.layoutManager.disconnect(this._startingUpSignal);
                    this._startingUpSignal = undefined;

                    this._networkClient = Main.panel.statusArea.quickSettings._network._client;
                    signal = this._networkClient.connect(
                        'notify::active-connections',
                        () => {
                            this.requestRebuild();
                        }
                    );
                    this._appendSignal(signal, this._networkClient);

                    this.preparePlugin();
                    this.requestRebuild();
                    this._setScreenChangeDetection(
                        this.requestRebuild.bind(this)
                    );
                }
            );
        } else {
            this._networkClient = Main.panel.statusArea.quickSettings._network._client;
            signal = this._networkClient.connect(
                'notify::active-connections',
                () => {
                    this.requestRebuild();
                }
            );
            this._appendSignal(signal, this._networkClient);

            this.preparePlugin();
            this.requestRebuild();
            this._setScreenChangeDetection(
                this.requestRebuild.bind(this)
            );
        }
    }

    /**
     * Reads all settings. If the changes
     * requires rebuild menu the true value is returned.
     * 
     * @method readSettings
     * @return {Boolean} true if menu needs rebuild.
     */
    readSettings() {
        let tmp;
        let needsRebuild = false;

        Utils.logDebug(`Settings changed ${this.id}.`);

        tmp = JSON.stringify(this._pluginSettings);
        this._pluginSettings = this._settings.get_value(
            this.pluginName
        ).deep_unpack();

        if (tmp !== JSON.stringify(this._pluginSettings)) {
            needsRebuild = true;
        }

        this._allMenusSelected = this._settings.get_value(
            Utils.SETTINGS_MENU_SELECTED
        ).deep_unpack();
        if (this._allMenusSelected[this.pluginID] !== undefined) {
            this._menuSelected = this._allMenusSelected[this.pluginID];
        }

        tmp = this._iconPack;
        this._iconPack = this._settings.get_enum(
            Utils.SETTINGS_ICONPACK
        );
        if (tmp !== this._iconPack) {
            needsRebuild = true;
        }

        if (Object.keys(this._pluginSettings).length > 0) {
            let id = this.id;

            if (Utils.PLUGIN_ALL_IN_ONE.includes(this.pluginName)) {
                id = '_general_';
            }

            if (this._pluginSettings[id]) {
                let indicatorPosition = this._pluginSettings[id]['indicator-position'];
                if (indicatorPosition !== undefined) {
                    this._indicatorPosition = Number(indicatorPosition);
                }

                let hideUnavailable = this._pluginSettings[id]['hide-unavailable'];
                if (hideUnavailable !== undefined) {
                    this._hideUnavailable = hideUnavailable === 'true' ? true : false;
                }
            }
        }

        let tmpVisible = this.visible;
        this.setPositionInPanel();
        this.visible = tmpVisible;


        if (this.settingRead) {
            this.settingRead(needsRebuild);
        }

        return needsRebuild;
    }

    /**
     * Wite setting for current selection in menu
     *
     * @method writeMenuSelectedSettings
     */
    writeMenuSelectedSettings() {
        this._allMenusSelected[this.pluginID] = {}
        if (this._menuSelected['group']) {
            this._allMenusSelected[this.pluginID]['group'] = this._menuSelected['group'];
        }
        if (this._menuSelected['device']) {
            this._allMenusSelected[this.pluginID]['device'] = this._menuSelected['device'];
        }
        this._settings.set_value(
            Utils.SETTINGS_MENU_SELECTED,
            new GLib.Variant(
                Utils.SETTINGS_MENU_SELECTED_TYPE,
                this._allMenusSelected
            )
        );
    }

    /**
     * Read miscellaneous part of settings.
     *
     * @method readSettingsMiscellaneous
     */
    readSettingsMiscellaneous() {
        this._miscellanousStorage = this._settings.get_value(
            Utils.SETTINGS_MISCELLANOUS_STORAGE
        ).deep_unpack();
    }

    /**
     * Write miscellaneous part of settings.
     *
     * @method writeSettingsMiscellaneous
     */
    writeSettingsMiscellaneous() {
        this._settings.set_value(
            Utils.SETTINGS_MISCELLANOUS_STORAGE,
            new GLib.Variant(
                Utils.SETTINGS_MISCELLANOUS_STORAGE_TYPE,
                this._miscellanousStorage
            )
        );
    }

    /**
     * Connects signals with change of displays
     * to rebuild menu and detect new displays or change display scale.
     * 
     * @method _setScreenChangeDetection
     * @param {() => void} function to be called on screen detection 
     * @private
     */
    _setScreenChangeDetection(screenChangeFunction = this.requestRebuild) {
        let signal;

        signal = Main.layoutManager.connect(
            'monitors-changed',
            () => {
                Utils.logDebug("Screen change detected.");
                screenChangeFunction();
            }
        );
        this._appendSignal(signal, Main.layoutManager);
    }

    /**
     * Returns effect that can be applied on icon
     * 
     * @method _getIconColorEffect
     * @private
     * @param {Enum} requested icon effect
     * @return {Object} effect
     */
    _getIconColorEffect(reqEffect) {

        let color;
        switch (reqEffect) {

            case SmartHomeIconPack.BRIGHT:
                color = getColor(237, 237, 237);
                break;

            case SmartHomeIconPack.DARK:
                color = getColor(40, 40, 40);
                break;

            default:
                return null;
        }

        let effect = new Clutter.ColorizeEffect({tint: color});
        return effect;
    }

    /**
     * Returns effect that can be applied on icon
     * 
     * @method _getIconBriConEffect
     * @private
     * @param {Enum} requested icon effect
     * @return {Object} effect
     */
    _getIconBriConEffect(reqEffect) {

        let bri = 0.0;
        let cont = 0.0;

        let effect = new Clutter.BrightnessContrastEffect();
        switch (reqEffect) {

            case SmartHomeIconPack.BRIGHT:

                bri = 0.8;
                cont = 0.2;
                break;

            case SmartHomeIconPack.DARK:

                bri = 0.2;
                cont = 0.2;
                break;

            default:
                return null;
        }

        effect.set_brightness(bri);
        effect.set_contrast(cont);
        return effect;
    }

    /**
     * Get gnome icon by name.
     * 
     * @method _getGnomeIcon
     * @private
     * @param {String} path to icon
     * @return {Object} icon or null if not found
     */
    _getGnomeIcon(iconName) {

        let icon = null;
        let themeContext = St.ThemeContext.get_for_stage(global.stage);

        if (this._iconPack === SmartHomeIconPack.NONE) {
            return null;
        }

        try {

            icon = new St.Icon({
                gicon : Gio.ThemedIcon.new(iconName),
                style_class : 'system-status-icon',
                y_expand: false,
                y_align: Clutter.ActorAlign.CENTER
            });

            icon.set_size(
                IconSize * themeContext.scaleFactor * 0.8,
                IconSize * themeContext.scaleFactor * 0.8
            );

            let iconEffect = this._getIconColorEffect(this._iconPack);
            icon.add_effect(iconEffect);

            iconEffect = this._getIconBriConEffect(this._iconPack);
            icon.add_effect(iconEffect);

        } catch (e) {
            Utils.logError(`Failed to get gnome icon: ${iconName}: ${e}`);
            return null;
        }

        return icon;
    }

    /**
     * Read icon from fs and return icon. Null if no icon pack selected.
     * 
     * @method _getIconByPath
     * @private
     * @param {String} path to icon
     * @return {Object} icon or null if not found
     */
    _getIconByPath(iconPath) {

        let icon = null;
        let themeContext = St.ThemeContext.get_for_stage(global.stage);

        if (this._iconPack === SmartHomeIconPack.NONE) {
            return null;
        }

        try {

            icon = new St.Icon({
                gicon : Gio.icon_new_for_string(iconPath),
                style_class : 'system-status-icon',
                y_expand: false,
                y_align: Clutter.ActorAlign.CENTER
            });

            icon.set_size(
                IconSize * themeContext.scaleFactor,
                IconSize * themeContext.scaleFactor
            );

            let iconEffect = this._getIconBriConEffect(this._iconPack);
            icon.add_effect(iconEffect);

        } catch(e) {
            Utils.logError(`Failed to get icon ${iconPath}: ${e}`);
            return null;
        }

        return icon;
    }

    /**
     * Check and change the status icon position in status panel.
     * 
     * @method setPositionInPanel
     */
    setPositionInPanel() {

        let children = null;

        if (! this.container.get_parent()) {
            /* not in the status area yet */
            return;
        }

        if (this._indicatorPositionBackUp === this._indicatorPosition) {
            return;
        }

        this.container.get_parent().remove_child(this.container);

        switch (this._indicatorPosition) {

            case SmartHomeMenuPosition.LEFT:

                children = Main.panel._leftBox.get_children();
                Main.panel._leftBox.insert_child_at_index(
                    this.container,
                    children.length
                );
                break;

            case SmartHomeMenuPosition.CENTER:

                children = Main.panel._centerBox.get_children();
                Main.panel._centerBox.insert_child_at_index(
                    this.container,
                    children.length
                );
                break;

            case SmartHomeMenuPosition.RIGHT:

                children = Main.panel._rightBox.get_children();
                Main.panel._rightBox.insert_child_at_index(
                    this.container,
                    0
                );
                break;

            default:
                children = Main.panel._rightBox.get_children();
                Main.panel._rightBox.insert_child_at_index(
                    this.container,
                    0
                );
        }

        this._indicatorPositionBackUp = this._indicatorPosition;
    }

    /**
     * Check if selected menu or group is available
     * or delete the request to select.
     *
     * @method _checkMenuSelectedFeasible
     * @private
     */
    _checkMenuSelectedFeasible() {
        let selectedGroup = this._menuSelected['group'];
        let selectedDevice = this._menuSelected['device'];

        if (this.data['groups'][selectedGroup] === undefined) {
            this._menuSelected['group'] = '_all_';
        }

        if (this.data['devices'][selectedDevice] === undefined) {
            delete(this._menuSelected['device']);
        }
    }

    /**
     * Inform this parent class the data are ready for refresh
     * or rebuild the menu.
     *
     * @method dataReady
     * @param {boolean} true if data are feasible for menu rebuild
     */
    dataReady(fullData = true) {
        if (this._needsRebuild && fullData) {
            this.rebuildMenuDo();
            this._needsRebuild = false;
        } else {
            this.refreshMenu();
        }
    }

    /**
     * Creates default/backup menu with settings and refresh.
     *
     * @method createDefaultMenu
     */
    createDefaultMenu() {
        let item;
        let icon;
        let signal;

        /**
         * Refresh menu item
         */
        item = new PopupMenu.PopupMenuItem(
            this._("Refresh menu")
        );

        if (this._iconPack !== this._iconPack.NONE) {
            icon = this._getGnomeIcon('emblem-synchronizing-symbolic');

            if (icon !== null){
                item.insert_child_at_index(icon, 1);
            }
        }
        signal = item.connect(
            'activate',
            () => {
                this.requestRebuild();
            }
        );
        this._appendSignal(signal, item, SmartHomeMenuLevel.MENU);

        this.menu.addMenuItem(item);

        item = new PopupMenu.PopupMenuItem(
            this._("Settings")
        );

        if (this._iconPack !== this._iconPack.NONE) {
            icon = this._getIconByPath(this.mainDir + '/media/HueIcons/tabbarSettings.svg');

            if (icon !== null) {
                item.insert_child_at_index(icon, 1);
            }
        }
        signal = item.connect(
            'activate',
            () => { this.openPref(); }
        );
        this._appendSignal(signal, item, SmartHomeMenuLevel.MENU);

        this.menu.addMenuItem(item);
    }

    /**
     * Connection broken, try rebuild.
     *
     * @method connectionClosed
     */
    connectionClosed() {
        this.requestRebuild();
    }

    /**
     * If status icon is set to hide in case of device unavailability,
     * try to reconnect the device regulary. The attmpt is prolongead with
     * each fail up to 10 minutes.
     *
     * @method _tryReconnect
     * @param {Number} seconds
     * @private 
     */
    _tryReconnect(seconds) {
        Utils.logDebug(`Trying reconnect ${this.pluginName} - ${this.id} in ${seconds} seconds.`);

        this._reconnectTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            if (! this._needsRebuild) {
                this._reconnectTimer = null;
                return GLib.SOURCE_REMOVE;
            }

            this.requestData(SmartHomeRequest.FULL);

            this._tryReconnect(
                seconds * 2 < 600 ? seconds * 2 : 600
            );

            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Start the process of menu rebuilding.
     * The menu is destoryed and created from scratch later.
     *
     * @method requestRebuild
     */
    requestRebuild() {
        Utils.logDebug(`Rebuilding menu ${this.pluginName} - ${this.id} requested.`);

        this.clearMenu();
        if (this._hideUnavailable) {
            this.visible = false;
            this._tryReconnect(10);
        } else {
            this.visible = true;
            this.createDefaultMenu();
        }
        this._needsRebuild = true;

        this.requestData(SmartHomeRequest.FULL);
    }

    /**
     * Actuall proces of menu rebuilding.
     *
     * @method rebuildMenuDo
     */
    rebuildMenuDo() {
        Utils.logDebug(`Actually rebuilding the menu ${this.pluginName} - ${this.id}.`);

        this._checkMenuSelectedFeasible();

        this.visible = true;
        this.clearMenu();

        let menuItems = this.createMenu();

        for (let item of menuItems) {
            this.menu.addMenuItem(item);
        }
    }

    /**
     * Once the menu is created, this function updates
     * UI elements based on actual data.
     *
     * @method refreshMenu
     */
    refreshMenu() {
        let ids;
        let itemType;
        let object;

        Utils.logDebug(`Refreshing UI elements in the menu ${this.pluginName} - ${this.id}.`);

        this._checkMenuSelectedFeasible();

        for (let uuid in this._itemRefresher) {
            ids = this._itemRefresher[uuid]['ids'];
            itemType = this._itemRefresher[uuid]['itemType'];

            object = this._itemRefresher[uuid]['text'];
            if (object !== undefined) {
                let text = this._getItemNameChange(ids, itemType);
                if (text){
                    object.text = this._getItemNameChange(ids, itemType);
                }
            }

            object = this._itemRefresher[uuid]['subtext'];
            if (object !== undefined) {
                let text = this._getItemSubNameChange(ids, itemType);
                if (text){
                    object.visible = true;
                    object.text = this._getItemSubNameChange(ids, itemType);
                } else  {
                    object.visible = false;
                }
            }

            object = this._itemRefresher[uuid]['icon'];
            if (object !== undefined) {
                this._updateItemIcon(object, ids, itemType);
            }

            object = this._itemRefresher[uuid]['brightness'];
            if (object !== undefined) {
                object.value = this._getGroupBrightnessValue(ids);
                this._setColorSlider(
                    object,
                    this._getGroupColor(ids)
                );
                object.visible = this._getGroupControllable(ids, 'brightness');
            }

            object = this._itemRefresher[uuid]['position'];
            if (object !== undefined) {
                object.value = this._getGroupPositionValue(ids);
            }

            object = this._itemRefresher[uuid]['switch'];
            if (object !== undefined) {
                object.state = this._getGroupSwitchValue(ids, itemType);
                this._setColorSwitch(
                    object,
                    this._getGroupColor(ids)
                );
            }

            object = this._itemRefresher[uuid]['color'];
            if (object !== undefined) {
                object.forEach(o => {
                    o.visible = this._getGroupControllable(ids, 'color');
                });
            }

            object = this._itemRefresher[uuid]['color_temperature'];
            if (object !== undefined) {
                object.forEach(o => {
                    o.visible = this._getGroupControllable(ids, 'color_temperature');
                });
            }
        }
    }

    /**
     * Clear and remove menu elements.
     * The menu is empty after this and can be recreated if needed.
     *
     * @method clearMenu
     */
    clearMenu() {
        Utils.logDebug(`Clearing menu ${this.pluginName} - ${this.id}.`);

        this.disconnectSignals([
            SmartHomeMenuLevel.MENU,
            SmartHomeMenuLevel.GROUPITEMS,
            SmartHomeMenuLevel.GROUPITEMSSELECTED,
            SmartHomeMenuLevel.DEVICEITEMS,
            SmartHomeMenuLevel.DEVICEMENU,
            SmartHomeMenuLevel.DEVICEITEMSSELECTED
        ]);

        this._menuObjects = {};
        this._itemRefresher = {};
        this._openMenu = undefined;

        this.menu._getMenuItems().forEach(item => {
            if (item instanceof PopupMenu.PopupSubMenuMenuItem) {
                item.menu.removeAll();
            }
        });
        this.menu.removeAll();

        if (this.clearTimers) {
            this.clearTimers();
        }

        if (this._reconnectTimer) {
            GLib.Source.remove(this._reconnectTimer);
            this._reconnectTimer = null;
        }

        for (let t of this._timers) {
            if (t) {
                GLib.Source.remove(t);
            }
        }

        this._timers = [];
    }

    /**
     * Append signal to the dictionary with signals with its level.
     * The signals are disconnected based on the appropriate level
     * when necessary.
     * 
     * @method _appendSignal
     * @private
     * @param {Number} signal number
     * @param {Object} object signal is connected
     * @param {Enum} level of the signal
     */
    _appendSignal(signal, object, menuLevel = SmartHomeMenuLevel.NONE, disconnectFce = null) {
        this._signals[signal] = {
            'object': object,
            'menuLevel': menuLevel,
            'disconnectFce': disconnectFce
        }
    }

    /**
     * Disconect signals based on levels.
     * 
     * @method disconnectSignals
     * @param {Array} levels of signals to be disconnected
     */
    disconnectSignals(levels = [SmartHomeMenuLevel.NONE]) {
        for (let id in this._signals) {
            if (levels.includes(this._signals[id]['menuLevel']) ||
                levels.includes(SmartHomeMenuLevel.NONE)) {

                if (this._signals[id]['disconnectFce']) {
                    this._signals[id]['disconnectFce']();
                } else {
                    this._signals[id]['object'].disconnect(id);
                }
                delete(this._signals[id]);
            }
        }
    }

    /**
     * Create item box for UI elements
     * 
     * @method createItemBox
     * @param {Boolean} true if box should be vertical
     */
    createItemBox(vertical) {
        let label = new St.Label();
        label.set_x_expand(true);

        let subLabel = new St.Label();
        subLabel.set_x_expand(true);
        subLabel.set_style("font-size: 12px;");
        subLabel.visible = false;

        let itemBox = new St.BoxLayout();
        itemBox.set_x_expand(true);
        itemBox.vertical = vertical;
        itemBox.add_child(label);
        itemBox.add_child(subLabel);
        return [itemBox, label, subLabel];
    }

    /**
     * Creates all menu items section by section
     * as array of objects.
     * 
     * @method createMenu
     * @return {Array} objects with menus
     */
    createMenu() {
        let items = [];

        items = items.concat(
            this._createStaticMenu()
        );

        items = items.concat(
            this._createMenuGroups()
        );

        items = items.concat(
            this._createMenuDevices()
        );

        items = items.concat(
            this._createMenuControl()
        );

        items = items.concat(
            this._createMenuScenes()
        );

        this.selectMenu(
            this._menuSelected['group'] ? this._menuSelected['group'] : '_all_',
            this._menuSelected['device'] ? this._menuSelected['device'] : null,
            true
        );

        return items;
    }

    /**
     * Sets icon on item in menu.
     * 
     * @method _setItemIcon
     * @param {Object} item of menu
     * @param {String} id of item
     * @param {Array} ids
     * @param {Enum} objectType device, group
     * @param {Enum} itemType 
     * @private
     * @return {Object} item box with icon
     */
    _setItemIcon(item, id, ids, objectType, itemType) {
        let icon;
        let iconPath;

        if (this._iconPack === SmartHomeIconPack.NONE) {
            return null;
        }

        switch (itemType) {
            case SmartHomeItemType.GROUP_ANY:
            case SmartHomeItemType.GROUP_ALL:
            case SmartHomeItemType.GROUP:

                if (id !== '_all_' && this.data['groups'][id]['icon']) {
                    iconPath = `${this.mediaDir}/${this.data['groups'][id]['icon']}`;
                } else {
                    iconPath = `${this.mediaDir}/HueIcons/bulbGroup.svg`;
                }

                icon = this._getIconByPath(iconPath);
                break;

            case SmartHomeItemType.SINGLE:

                if (ids[0] && this.data['devices'][ids[0]]['icon']) {
                    iconPath = `${this.mediaDir}/${this.data['devices'][id]['icon']}`;
                } else {
                    iconPath = `${this.mediaDir}/HueIcons/bulbsSultan.svg`;
                }

                icon = this._getIconByPath(iconPath);

                break;

            case SmartHomeItemType.DEVICE:

                if (this.data['devices'][id]['icon']) {
                    iconPath = `${this.mediaDir}/${this.data['devices'][id]['icon']}`;
                } else {
                    iconPath = `${this.mediaDir}/HueIcons/bulbsSultan.svg`;
                }

                icon = this._getIconByPath(iconPath);
            break;

            case SmartHomeItemType.CONTROL:

                break;

            case SmartHomeItemType.SCENE:

                break;

            default:
                return null;
        }

        if (icon) {
            let iconBox = new St.BoxLayout();
            iconBox.add_child(icon);

            item.insert_child_at_index(iconBox, 1);

            if (objectType) {
                this._menuObjects[objectType]['icon'] = iconBox;
            }

            return iconBox;
        }

        return null;
    }

    /**
     * Gets value for switch of multiple items based on ids.
     * Value can by true if any or all or for single item.
     * 
     * @method _getGroupSwitchValue
     * @param {Array} ids
     * @param {Enum} itemType 
     * @private
     * @return {Boolean}
     */
    _getGroupSwitchValue(ids, itemType) {
        let value = false;
        let deviceValue;

        if (itemType === SmartHomeItemType.GROUP_ANY) {
            value = false;
        }
        if (itemType === SmartHomeItemType.GROUP_ALL) {
            value = true;
        }
        for (let i of ids) {
            if (itemType === SmartHomeItemType.GROUP_ANY && this.data['devices'][i]['switch']) {
                return true;
            }

            deviceValue = this.data['devices'][i]['switch'];
            if (itemType === SmartHomeItemType.GROUP_ALL &&
                deviceValue !== undefined &&
                ! deviceValue) {
                return false;
            }

            if (itemType === SmartHomeItemType.SINGLE) {
                if (deviceValue !== undefined) {
                    return deviceValue;
                }
            }
        }

        return value;
    }

    /**
     * Gets value of brightness for up to multiple id.
     * An average value is returned.
     * 
     * @method _getGroupBrightnessValue
     * @param {Array} ids
     * @private
     * @return {Number}
     */
    _getGroupBrightnessValue(ids) {
        let value = 0.0;
        let count = 0;
        let deviceBrightness;
        let deviceSwitch;

        for (let i of ids) {
            deviceBrightness = this.data['devices'][i]['brightness'];
            deviceSwitch = this.data['devices'][i]['switch'];

            if (deviceBrightness === undefined) {
                continue;
            }
            if (deviceSwitch === undefined || deviceSwitch) {
                value += deviceBrightness;
                count ++;
            }
        }
        if (count === 0) {
            return 0;
        }

        return (value / count);
    }

    /**
     * Gets value of position for up to multiple id.
     * An average value is returned.
     * 
     * @method _getGroupBrightnessValue
     * @param {Array} ids
     * @private
     * @return {Number}
     */
    _getGroupPositionValue(ids) {
        let value = 0.0;
        let count = 0;
        let devicePosition;
        let deviceSwitch;

        for (let i of ids) {
            devicePosition = this.data['devices'][i]['position'];
            deviceSwitch = this.data['devices'][i]['switch'];

            if (devicePosition === undefined) {
                continue;
            }
            if (deviceSwitch === undefined || deviceSwitch) {
                value += devicePosition;
                count ++;
            }
        }
        if (count === 0) {
            return 0;
        }
        return (value / count);
    }

    /**
     * If label is changable on item (device/group)
     * this is how to get new value.
     * 
     * @method _getItemNameChange
     * @param {Array} ids (only first is used)
     * @param {Enum} itemType 
     * @private
     * @return {String}
     */
    _getItemNameChange(ids, itemType) {
        let id = ids[0];
        let text = null;

        switch (itemType) {
            case SmartHomeItemType.GROUP_ANY:
            case SmartHomeItemType.GROUP_ALL:
                break;

            case SmartHomeItemType.GROUP:
                text =  this.data['groups'][id]['name'];
                break;

            case SmartHomeItemType.SINGLE:
            case SmartHomeItemType.DEVICE:
            case SmartHomeItemType.CONTROL:
            case SmartHomeItemType.SCENE:
                text =  this.data['devices'][id]['name'];
                break;

            default:
                break;
        }

        return text;
    }

    /**
     * If sublabel is changable on item (device/group)
     * this is how to get new value.
     * 
     * @method _getItemSubNameChange
     * @param {Array} ids (only first is used)
     * @param {Enum} itemType 
     * @private
     * @return {String}
     */
    _getItemSubNameChange(ids, itemType) {
        let id = ids[0];
        let text = null;

        switch (itemType) {
            case SmartHomeItemType.GROUP_ANY:
            case SmartHomeItemType.GROUP_ALL:
                break;

            case SmartHomeItemType.GROUP:
                text =  this.data['groups'][id]['subname'];
                break;

            case SmartHomeItemType.SINGLE:
            case SmartHomeItemType.DEVICE:
            case SmartHomeItemType.CONTROL:
            case SmartHomeItemType.SCENE:
                text =  this.data['devices'][id]['subname'];
                break;

            default:
                break;
        }

        return text;
    }

    /**
     * Updates icon on menu item inside icon box.
     * 
     * @method _updateItemIcon
     * @param {Object} object icon box
     * @param {Array} ids (only first is used)
     * @param {Enum} itemType 
     * @private
     * @return {String}
     */
    _updateItemIcon(object, ids, itemType) {
        let id = ids[0];
        let icon;
        let iconPath = null;

        if (this._iconPack === SmartHomeIconPack.NONE) {
            return;
        }

        icon = object.get_children()[0];
        while (icon) {
            object.remove_child(icon);
            icon.destroy();
            icon = object.get_children()[0];
        }

        switch (itemType) {
            case SmartHomeItemType.GROUP_ANY:
            case SmartHomeItemType.GROUP_ALL:
                break;

            case SmartHomeItemType.GROUP:
                iconPath = `${this.mediaDir}/${this.data['groups'][id]['icon']}`;
                break;

            case SmartHomeItemType.SINGLE:
            case SmartHomeItemType.DEVICE:
            case SmartHomeItemType.CONTROL:
            case SmartHomeItemType.SCENE:
                iconPath = `${this.mediaDir}/${this.data['devices'][id]['icon']}`;
                break;

            default:
                break;
        }

        if (iconPath) {
            icon = this._getIconByPath(iconPath);

            if (icon) {
                object.add_child(icon);
            }
        }
    }

    /**
     * Checks if color or color temperature is avaiable on device
     * 
     * @method _checkColorOrColorTemp
     * @param {Array} ids
     * @private
     * @return {Array of Boolean}
     */
    _checkColorOrColorTemp(ids) {
        let hasColor = false;
        let hasColorTemp = false;
        let capabilities;

        for (let id of ids) {
            capabilities = this.data['devices'][id]['capabilities'];

            if (!capabilities) {
                continue;
            }

            if (capabilities.includes('color')) {
                hasColor = true
            }

            if (capabilities.includes('color_temperature')) {
                hasColorTemp = true
            }
        }

        return [hasColor, hasColorTemp];
    }

    /**
     * Gets average color based on multiple id.
     * 
     * @method _getGroupColor
     * @param {Array} ids
     * @private
     * @return {Array} color
     */
    _getGroupColor(ids) {
        let [r, g, b] = [0, 0, 0];
        let count = 0;
        let deviceSwitcher;
        let color;

        for (let i of ids) {
            deviceSwitcher = this.data['devices'][i]['switch'];

            color = undefined;

            if (this.data['devices'][i]['color_mode'] === 'color') {
                color = this.data['devices'][i]['color'];
            }

            if (this.data['devices'][i]['color_mode'] === 'temperature') {
                color = this.data['devices'][i]['color_temperature'];
            }

            if ((deviceSwitcher === undefined || deviceSwitcher) && color !== undefined) {
                [r, g, b] = [
                    r + color['red'],
                    g + color['green'],
                    b + color['blue']
                ];
                count ++;
            }
        }
        if (count === 0) {
            return null;
        }

        return [
            Math.round(r / count),
            Math.round(g / count),
            Math.round(b / count)
        ];
    }

    /**
     * If we want to have controls visible only 
     * for switched on devices, here is a function
     * that gets true/false if the control shoud be visible
     * for a particular capability.
     * 
     * @method _getGroupControllable
     * @param {Array} ids
     * @param {String} capability 
     * @private
     * @return {Boolean} color
     */
    _getGroupControllable(ids, capability) {
        let deviceSwitcher;
        if ((! this.data['config']) || (! this.data['config']['control-only-on'])) {
            return true;
        }

        for (let i of ids) {
            if (! this.data['devices'][i]['capabilities'].includes(capability)) {
                continue;
            }

            deviceSwitcher = this.data['devices'][i]['switch'];

            if (deviceSwitcher === undefined) { return true; }
            if (deviceSwitcher) { return true; }
        }

        return false;
    }

    /**
     * Sets color on item switch.
     * 
     * @method _setColorSwitch
     * @param {Object} object
     * @param {Array} color 
     * @private
     */
    _setColorSwitch(object, c) {
        if (!c) {
            object.clear_effects();
            return;
        }
        let [r, g, b] = c;
        let color = getColor(r, g, b);

        object.clear_effects();

        let colorEffect = new Clutter.ColorizeEffect({tint: color});
        object.add_effect(colorEffect);

        let briConEffect = new Clutter.BrightnessContrastEffect();
        briConEffect.set_brightness(0.4);
        briConEffect.set_contrast(0.4);
        object.add_effect(briConEffect);
    }

    /**
     * Sets color on item slider.
     * 
     * @method _setColorSwitch
     * @param {Object} object
     * @param {Array} color 
     * @private
     */
    _setColorSlider(object, c) {
        if (!c) {
            object.style = null;
            return;
        }
        let [r, g, b] = c;
        r = ('0' + r.toString(16)).slice(-2);
        g = ('0' + g.toString(16)).slice(-2);
        b = ('0' + b.toString(16)).slice(-2);

        let styleColor = `#${r}${g}${b}`;

        object.style = `-barlevel-active-background-color: ${styleColor}; -barlevel-active-border-color: ${styleColor}`;
    }

    /**
     * Creates switch for menu item
     * 
     * @method _createSwitch
     * @param {Enum} itemType
     * @param {Enum} menuLevel
     * @param {String} id 
     * @param {Array} ids
     * @param {Boolean} value
     * @param {Array} color  
     * @private
     * @return {Array}
     */
    _createSwitch(itemType, menuLevel, id, ids, value, color) {
        let signal;
        let switcher = new PopupMenu.Switch(value);
        switcher.reactive = false;
        let button = new St.Button({reactive: true, can_focus: true});
        button.set_x_align(Clutter.ActorAlign.END);
        button.set_x_expand(false);
        button.set_child(switcher);

        this._setColorSwitch(switcher, color);

        signal = button.connect(
            'clicked',
            () => {
                switcher.toggle();
            }
        );
        this._appendSignal(signal, button, menuLevel);

        signal = button.connect(
            'clicked',
            this._menuHandler.bind(
                this,
                {
                    'id': id,
                    'ids': ids,
                    'object': switcher,
                    'itemType': itemType,
                    'typeUi': SmartHomeUiType.SWITCH
                }
            )
        );
        this._appendSignal(signal, button, menuLevel);

        return [button, switcher];
    }

    /**
     * Creates execute button for menu item
     * 
     * @method _createExecute
     * @param {Enum} itemType
     * @param {Enum} menuLevel
     * @param {String} id 
     * @param {Array} ids
     * @private
     * @return {Object}
     */
    _createExecute(itemType, menuLevel, id, ids) {
        let signal;
        let icon;
        let iconPath;

        let button = new St.Button({reactive: true, can_focus: true});
        button.set_x_align(Clutter.ActorAlign.END);
        button.set_x_expand(false);
        iconPath = this.mainDir + `/media/execute.svg`
        icon = this._getIconByPath(iconPath);

        button.set_child(icon);

        signal = button.connect(
            'clicked',
            this._menuHandler.bind(
                this,
                {
                    'id': id,
                    'ids': ids,
                    'object': button,
                    'itemType': itemType,
                    'typeUi': SmartHomeUiType.EXECUTE
                }
            )
        );
        this._appendSignal(signal, button, menuLevel);

        return button;
    }

    /**
     * Creates slider for menu item
     * 
     * @method _createSlider
     * @param {Enum} itemType
     * @param {Enum} menuLevel
     * @param {Enum} typeUi 
     * @param {String} id 
     * @param {Array} ids
     * @param {Boolean} value
     * @param {Array} color  
     * @private
     * @return {Object}
     */
    _createSlider(itemType, menuLevel, typeUi, id, ids, value, color) {
        let signal;
        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        let slider = new Slider.Slider(0);
        slider.set_width(180 * themeContext.scaleFactor);
        slider.set_height(25 * themeContext.scaleFactor);
        slider.set_x_align(Clutter.ActorAlign.START);
        slider.set_x_expand(false);
        slider.value = value;

        this._setColorSlider(slider, color);

        signal = slider.connect(
            'drag-end',
            this._menuHandler.bind(
                this,
                {
                    'id': id,
                    'ids': ids,
                    'object': slider,
                    'itemType': itemType,
                    'typeUi': typeUi
                }
            )
        );
        this._appendSignal(signal, slider, menuLevel);

        signal = slider.connect(
            'scroll-event',
            this.runOnlyOnceInTime.bind(
                this,
                500,
                this._menuHandler.bind(
                    this,
                    {
                        'id': id,
                        'ids': ids,
                        'object': slider,
                        'itemType': itemType,
                        'typeUi': typeUi
                    }
                )
            )
        );
        this._appendSignal(signal, slider, menuLevel);

        return slider;
    }

    _enlargeOnHover(icon, hover) {
        if (this._iconPack === SmartHomeIconPack.NONE) {
            icon.style = hover ? 'font-size:220%; font-weight:bold;' : 'font-size:220%;';
        } else {
            let themeContext = St.ThemeContext.get_for_stage(global.stage);
            icon.set_size(
                IconSize * themeContext.scaleFactor * (hover ? 1.2: 1),
                IconSize * themeContext.scaleFactor * (hover ? 1.2: 1)
            );
        }
    }

    _createButton(uiType, itemType, menuLevel, id, ids) {
        let signal;
        let iconPath;
        let text;

        switch (uiType) {
            case SmartHomeUiType.UP:
                iconPath = this.mainDir + `/media/arrowup.svg`;
                text = '\u2191';
                break
            case SmartHomeUiType.DOWN:
                iconPath = this.mainDir + `/media/arrowdown.svg`;
                text = '\u2193';
                break
            default:
                return null;
        }

        let icon = this._getIconByPath(iconPath);

        if (!icon) {
            icon = new St.Label();
            icon.text = text;
            icon.style = 'font-size:220%;';
        }

        let button = new St.Button({reactive: true, can_focus: true});
        button.set_x_align(Clutter.ActorAlign.END);
        button.set_x_expand(true);
        button.set_child(icon);

        button.set_track_hover(true);
        signal = button.connect(
            'notify::hover',
            (object) => {
                this._enlargeOnHover(icon, object.hover);
            }
        );
        this._appendSignal(signal, button, menuLevel);

        signal = button.connect(
            'clicked',
            this._menuHandler.bind(
                this,
                {
                    'id': id,
                    'ids': ids,
                    'object': button,
                    'itemType': itemType,
                    'typeUi': uiType
                }
            )
        );
        this._appendSignal(signal, button, menuLevel);

        return button;
    }

    /**
     * Creates UP/DOWN button for menu item.
     * 
     * @method _createUpDownButton
     * @param {Enum} itemType
     * @param {Enum} menuLevel
     * @param {String} id 
     * @param {Array} ids
     * @private
     * @return {Object}
     */
    _createUpDownButton(itemType, menuLevel, id, ids) {
        let button;
        let itemBox = new St.BoxLayout();
        itemBox.set_x_expand(false);
        itemBox.set_x_align(Clutter.ActorAlign.END);

        button = this._createButton(SmartHomeUiType.UP, itemType, menuLevel, id, ids);
        if (button) {
            itemBox.add_child(button);
        }

        button = this._createButton(SmartHomeUiType.DOWN, itemType, menuLevel, id, ids);
        if (button) {
            itemBox.add_child(button);
        }

        return itemBox;
    }

    /**
     * Creates UI for one row of item menu.
     * 
     * @method _createDeviceItemUI
     * @param {Object} item 
     * @param {Object} itemBox 
     * @param {String} id 
     * @param {Array} ids
     * @param {Array} capabilities
     * @param {String} objectType 
     * @param {Enum} itemType
     * @param {Enum} menuLevel
     * @param {boolean} isSubmenu
     * @private
     * @return {Object}
     */
    _createDeviceItemUI(item, itemBox, id, ids, capabilities, objectType, itemType, menuLevel, isSubmenu = false) {
        let button;
        let switcher;
        let brightness;
        let position;
        let updown;
        let executer;
        if (! ids) {
            ids = [id];
        }

        let uuid = `${id}::${Utils.getUuid()}`;

        this._itemRefresher[uuid] = {
            'ids': ids,
            'itemType': itemType,
            'menuLevel': menuLevel
        };

        let iconBox = this._setItemIcon(item, id, ids, objectType, itemType);

        if (capabilities.includes('text')) {
            this._itemRefresher[uuid]['text'] = itemBox.get_children()[0]; // the label
        }

        if (capabilities.includes('subtext')) {
            this._itemRefresher[uuid]['subtext'] = itemBox.get_children()[1]; // the sublabel; hidden by default
        }

        if (capabilities.includes('icon') && iconBox) {
            this._itemRefresher[uuid]['icon'] = iconBox;
        }

        if (capabilities.includes('brightness') && itemType !== SmartHomeItemType.GROUP_ALL) {
            brightness = this._createSlider(
                itemType,
                menuLevel,
                SmartHomeUiType.BRIGHTNESS,
                id,
                ids,
                this._getGroupBrightnessValue(ids),
                this._getGroupColor(ids)
            );
            itemBox.add_child(brightness);
            if (objectType) {
                this._menuObjects[objectType]['brightness'] = brightness;
            }

            this._itemRefresher[uuid]['brightness'] = brightness;
        }

        if (capabilities.includes('position') && itemType !== SmartHomeItemType.GROUP_ALL) {
            position = this._createSlider(
                itemType,
                menuLevel,
                SmartHomeUiType.POSITION,
                id,
                ids,
                this._getGroupPositionValue(ids),
                null
            );
            itemBox.add_child(position);
            if (objectType) {
                this._menuObjects[objectType]['position'] = position;
            }

            this._itemRefresher[uuid]['position'] = position;
        }

        if (capabilities.includes('switch')) {
            [button, switcher] = this._createSwitch(
                itemType,
                menuLevel,
                id,
                ids,
                this._getGroupSwitchValue(ids, itemType),
                this._getGroupColor(ids)
            );
            item.insert_child_at_index(
                button,
                item.get_children().length - (isSubmenu ? 1 : 0)
            );
            if (objectType) {
                this._menuObjects[objectType]['switch'] = button;
            }

            this._itemRefresher[uuid]['switch'] = switcher;
        }

        if (capabilities.includes('up/down') && itemType !== SmartHomeItemType.GROUP_ALL) {
            updown = this._createUpDownButton(
                itemType,
                menuLevel,
                id,
                ids
            );
            item.insert_child_at_index(
                updown,
                item.get_children().length - (isSubmenu ? 1 : 0)
            );
            if (objectType) {
                this._menuObjects[objectType]['button-up-down'] = updown;
            }
        }

        if (capabilities.includes('execute')) {
            executer = this._createExecute(
                itemType,
                menuLevel,
                id,
                ids
            );
            item.insert_child_at_index(
                executer,
                item.get_children().length - (isSubmenu ? 1 : 0)
            );
            if (objectType) {
                this._menuObjects[objectType]['executer'] = executer;
            }
        }

        if (capabilities.includes('activate')) {
            item.itemActivate = item.activate;
            item.activate = (event) => {
                this._menuHandler(
                    {
                        'id': id,
                        'ids': ids,
                        'object': null,
                        'itemType': itemType,
                        'typeUi': SmartHomeUiType.ACTIVATE
                    }
                )
                return item.itemActivate(event);
            }
        }
    }

    /**
     * Creates Group item menu
     * 
     * @method _createGroup
     * @param {String} id 
     * @param {Array} ids
     * @param {Array} capabilities
     * @private
     * @return {Object}
     */
    _createGroup(ids, id, capabilities) {
        let item = new PopupMenu.PopupMenuItem('none');

        let l = item.label;
        item.remove_child(item.label);
        l.destroy();
        let [itemBox, label] = this.createItemBox(true);
        label.text = this.groups[id]['name'];
        item.insert_child_at_index(itemBox, 1);

        item.originalActivate = item.activate;
        item.activate = (event) => {
            let hiddenObject = this._menuObjects['groups']['hidden'];
            let devicesObject = this._menuObjects['devices']['object'];

            if (hiddenObject) {
                hiddenObject.visible = true;
            }

            item.visible = false;
            this._menuObjects['groups']['hidden'] = item;

            this.selectMenu(id, null);

            if (devicesObject) {
                devicesObject.menu.open(true);
            }

            return item.originalActivate(event);
        }

        this._createDeviceItemUI(
            item,
            itemBox,
            id,
            ids,
            capabilities,
            null,
            SmartHomeItemType.GROUP_ANY,
            SmartHomeMenuLevel.GROUPITEMS
        );

        return item;
    }

    /**
     * Creates Device item menu
     * 
     * @method _createDevice
     * @param {String} id 
     * @private
     * @return {Object}
     */
    _createDevice(id) {
        let item = new PopupMenu.PopupMenuItem('none');

        let l = item.label;
        item.remove_child(item.label);
        l.destroy();
        let [itemBox, label] = this.createItemBox(true);
        label.text = this.data['devices'][id]['name'];
        item.insert_child_at_index(itemBox, 1);

        item.originalActivate = item.activate;
        item.activate = (event) => {
            let hiddenObject = this._menuObjects['devices']['hidden'];
            let controlsObject = this._menuObjects['controls']['object'];

            if (hiddenObject) {
                hiddenObject.visible = true;
            }

            item.visible = false;
            this._menuObjects['devices']['hidden'] = item;

            this.selectMenu(this._menuSelected['group'], id);

            if (controlsObject) {
                controlsObject.menu.open(true);
            }

            return item.originalActivate(event);
        }

        this._createDeviceItemUI(
            item,
            itemBox,
            id,
            null,
            this.data['devices'][id]['capabilities'],
            null,
            SmartHomeItemType.SINGLE,
            SmartHomeMenuLevel.DEVICEITEMS
        );

        if (this._menuSelected['device'] === id) {
            this._menuObjects['devices']['hidden'] = item;
            this._menuObjects['devices']['hidden'].visible = false;
        }

        return item;
    }

    /**
     * Creates item menu with UI controls
     * to switch color or color temperature.
     * 
     * @method _createDeviceItemUI
     * @param {String} id 
     * @param {Array} ids
     * @param {Array} controlIds
     * @param {Enum} itemType
     * @param {Enum} menuLevel
     * @private
     * @return {Object}
     */
    _createControl(id, ids, controlIds, itemType, menuLevel) {
        let signal;
        let colorPickerBox;
        let items = [];
        let item = new PopupMenu.PopupMenuItem('');
        item.x_align = Clutter.ActorAlign.CENTER;
        let l = item.label;
        item.remove_child(item.label);
        l.destroy();
        let [hasColor, hasColorTemp] = this._checkColorOrColorTemp(controlIds);
        if (hasColor || hasColorTemp) {
            colorPickerBox = new ColorPicker.ColorPickerBox(
                this.mainDir,
                {
                    useColorWheel: hasColor,
                    useWhiteBox: hasColorTemp,
                }
            );
            item.add_child(colorPickerBox.createColorBox());
            items.push(item);

            this._appendSignal(
                Utils.getUuid(),
                colorPickerBox,
                menuLevel,
                colorPickerBox.disconnectSignals.bind(colorPickerBox)
            );
        }

        if (hasColor) {
            signal = colorPickerBox.connect(
                'color-picked',
                () => {
                    let color = {
                        'r': colorPickerBox.r,
                        'g': colorPickerBox.g,
                        'b': colorPickerBox.b,
                    }
                    this._menuHandler(
                        {
                            'id': id,
                            'ids': ids,
                            'object': color,
                            'itemType': itemType,
                            'typeUi': SmartHomeUiType.COLOR
                        }
                    )
                }
            );
            this._appendSignal(signal, colorPickerBox, menuLevel);
            
        }

        if (hasColorTemp) {
            signal = colorPickerBox.connect(
                'colortemp-picked',
                () => {
                    let color = {
                        'r': colorPickerBox.r,
                        'g': colorPickerBox.g,
                        'b': colorPickerBox.b,
                    }
                    this._menuHandler(
                        {
                            'id': id,
                            'ids': ids,
                            'object': color,
                            'itemType': itemType,
                            'typeUi': SmartHomeUiType.COLOR_TEMP
                        }
                    )
                }
            );
            this._appendSignal(signal, colorPickerBox, menuLevel);
        }

        return items;
    }

    /**
     * Creates scene item menu.
     * 
     * @method _createScene
     * @param {String} id 
     * @param {Array} ids
     * @param {Enum} itemType
     * @param {Enum} menuLevel
     * @private
     * @return {Object}
     */
    _createScene(id, ids, itemType, menuLevel, iconPath) {
        let signal;
        let icon = null;
        let item = new PopupMenu.PopupMenuItem(this.data['devices'][id]['name']);
        item.x_align = Clutter.ActorAlign.FILL;
        item.x_expand = true;
        item.label.x_align = Clutter.ActorAlign.CENTER;
        item.label.set_x_expand(true);

        if (iconPath) {
            icon = this._getIconByPath(`${this.mediaDir}/${iconPath}`);
        }

        if (icon) {
            item.insert_child_at_index(icon, 1);
        }

        signal = item.connect(
            'activate',
            this._menuHandler.bind(
                this,
                {
                    'id': id,
                    'ids': ids,
                    'object': {'sceneId': id},
                    'itemType': itemType,
                    'typeUi': SmartHomeUiType.ACTIVATE
                }
            )
        );
        this._appendSignal(signal, item, menuLevel);
        return item;
    }

    /**
     * Creates groups for group sub menu
     * 
     * @method _createGroups
     * @private
     * @return {Array}
     */
    _createGroups() {
        let items = [];
        this.groups = {};

        let allGroupName = this._("All groups");
        if (this.data['config']['_all_'] && this.data['config']['_all_']['name']) {
            allGroupName = this.data['config']['_all_']['name'];
        }

        this.groups['_all_'] = {'name': allGroupName, 'ids': [], 'capabilities': []};

        for (let id in this.data['groups']) {
            if (this.data['groups'][id]['section'] !== 'common') {
                continue;
            }

            this.groups[id] = {
                'name': this.data['groups'][id]['name'],
                'ids': [],
                'capabilities': []
            };
        }

        for (let id in this.data['devices']) {
            if (this.data['devices'][id]['groups'] === undefined) {
                continue;
            }

            if (this.data['devices'][id]['capabilities'] === undefined) {
                continue;
            }

            if (this.data['devices'][id]['section'] !== 'common') {
                continue;
            }

            switch (this.data['devices'][id]['type']) {
                case 'device':
                    this.groups['_all_']['ids'].push(id);
                    break;
                case 'scene':
                    if (this.data['devices'][id]['groups'].includes('_all_')) {
                        this.groups['_all_']['ids'].push(id);
                    }
                    break;
                default:
                    continue;
            }

            // merge arrays, no repeating
            this.groups['_all_']['capabilities'] = [
                ...new Set([
                    ...this.groups['_all_']['capabilities'],
                    ...this.data['devices'][id]['capabilities']
                ])
            ];

            for (let groupId of this.data['devices'][id]['groups']) {
                if (groupId === '_all_') {
                    continue;
                }

                this.groups[groupId]['ids'].push(id);
                if (this.data['groups'][groupId]['section'] === 'common') {
                    // merge arrays, no repeating
                    this.groups[groupId]['capabilities'] = [
                        ...new Set([
                            ...this.groups[groupId]['capabilities'],
                            ...this.data['devices'][id]['capabilities']
                        ])
                    ];
                }
            }
        }

        for (let id in this.groups) {
            let ids = this.groups[id]['ids'];

            if (ids.length === 0) {
                continue;
            }

            let item = this._createGroup(
                ids,
                id,
                this.groups[id]['capabilities']
            );
            item.id = id;
            items.push(item);

            if (id === this._menuSelected['group'] || ! this._menuSelected['group'] && id === '_all_') {
                this._menuObjects['groups']['hidden'] = item;
                this._menuObjects['groups']['hidden'].visible = false;
            }

            if (id === '_all_') {
                this._menuObjects['groups']['default'] = item;
            }
        }

        return items;
    }

    /**
     * Destroys <type> items of menu.
     * 
     * @method _clearMenuObject
     * @param {String} type 
     * @private
     */
    _clearMenuObject(type) {
        Utils.logDebug(`Clearing menu ${this.pluginName} - ${this.id}, type: ${type}.`);

        let object = this._menuObjects[type]['object'];
        let itemBox = this._menuObjects[type]['box'];

        if (this._menuObjects[type]['icon']) {
            object.remove_child(this._menuObjects[type]['icon']);
            this._menuObjects[type]['icon'].destroy()
        }
        if (this._menuObjects[type]['switch']) {
            object.remove_child(this._menuObjects[type]['switch']);
            this._menuObjects[type]['switch'].destroy();
        }
        if (this._menuObjects[type]['button-up-down']) {
            object.remove_child(this._menuObjects[type]['button-up-down']);
            this._menuObjects[type]['button-up-down'].destroy();
        }
        if (this._menuObjects[type]['executer']) {
            object.remove_child(this._menuObjects[type]['executer']);
            this._menuObjects[type]['executer'].destroy();
        }
        if (this._menuObjects[type]['brightness']) {
            itemBox.remove_child(this._menuObjects[type]['brightness']);
            this._menuObjects[type]['brightness'].destroy();
        }
        if (this._menuObjects[type]['position']) {
            itemBox.remove_child(this._menuObjects[type]['position']);
            this._menuObjects[type]['position'].destroy();
        }

        this._menuObjects[type]['icon'] = null;
        this._menuObjects[type]['switch'] = null;
        this._menuObjects[type]['button-up-down'] = null;
        this._menuObjects[type]['executer'] = null;
        this._menuObjects[type]['brightness'] = null;
        this._menuObjects[type]['position'] = null;
    }

    /**
     * Creates button for <type>.
     * Button is used to unselect current <type>.
     * 
     * @method _createUnselectButton
     * @param {String} type 
     * @private
     * @return {Array}
     */
    _createUnselectButton(type) {
        let signal;
        let button = new St.Button({reactive: true, can_focus: true});
        let content = this._getIconByPath(this.mainDir + '/media/HueIcons/uicontrolsLastState.svg');
        if (content) {
            content.set_y_align(Clutter.ActorAlign.CENTER);
            content.set_y_expand(true);
        } else {
            content = new St.Label();
            content.text = "<<";
        }
        button.set_child(content);

        this._menuObjects[type]['unselect'] = button;
        button.visible = false;

        signal = button.connect(
            'clicked',
            () => {
                button.visible = false;
                this._menuObjects[type]['hidden'].visible = true;
                switch (type) {
                    case 'groups':
                        this.selectMenu();
                        break;
                    case 'devices':
                        this.selectMenu(this._menuSelected['group']);
                        break;
                    default:
                        break;
                }
                this._menuObjects[type]['object'].menu.open(true);
            }
        );

        this._appendSignal(signal, button, SmartHomeMenuLevel.MENU);
        return button;
    }

    /**
     * Creates static part of the menu.
     * In this function, device of a group are created.
     * 
     * @method _createStaticItems
     * @param {String} groupId 
     * @private
     * @return {Array}
     */
    _createStaticItems(groupId) {
        let items = [];

        for (let id in this.data['devices']) {
            if (! this.data['devices'][id]['groups']) {
                continue;
            }

            if (! this.data['devices'][id]['groups'].includes(groupId)) {
                continue;
            }

            if (this.data['devices'][id]['section'] === 'static') {
                let item = new PopupMenu.PopupMenuItem(this.data['devices'][id]['name']);

                let l = item.label;
                item.remove_child(item.label);
                l.destroy();
                let [itemBox, label] = this.createItemBox(true);
                label.text = this.data['devices'][id]['name'];
                item.insert_child_at_index(itemBox, 1);

                this._createDeviceItemUI(
                    item,
                    itemBox,
                    id,
                    null,
                    this.data['devices'][id]['capabilities'],
                    null,
                    SmartHomeItemType.SINGLE,
                    SmartHomeMenuLevel.MENU
                );

                items.push(item);
            }
        }

        return items;
    }

    /**
     * Creates static part of the menu.
     * In this function, groups are created.
     * 
     * @method _createStaticItems
     * @private
     * @return {Array}
     */
    _createStaticMenu() {
        let signal;
        let items = [];
        let subItems;
        
        for (let id in this.data['groups']) {
            if (this.data['groups'][id]['section'] === 'static') {
                subItems = []

                let subMenu = new PopupMenu.PopupSubMenuMenuItem('none');

                /* disable closing menu on item activated */
                subMenu.menu.itemActivated = () => {};

                let l = subMenu.label;
                subMenu.remove_child(subMenu.label);
                l.destroy();
                let [itemBox, label] = this.createItemBox(true);
                label.text = this.data['groups'][id]['name'];
                subMenu.insert_child_at_index(itemBox, 1);

                this._createDeviceItemUI(
                    subMenu,
                    itemBox,
                    id,
                    null,
                    this.data['groups'][id]['capabilities'],
                    null,
                    SmartHomeItemType.GROUP,
                    SmartHomeMenuLevel.MENU
                );

                if (this._menuSelected['group'] === id) {
                    this._openMenu = subMenu.menu;
                }

                signal = subMenu.menu.connect(
                    'open-state-changed',
                    (menu, isOpen) => {
                        if (isOpen) {
                            this._openMenu = menu;
                            this._menuSelected['group'] = id;
                            this.writeMenuSelectedSettings();
                        }
                        this.requestData(SmartHomeRequest.FULL);
                    }
                );
                this._appendSignal(signal, subMenu.menu, SmartHomeMenuLevel.MENU);

                subItems = subItems.concat(
                    this._createStaticItems(id)
                );
        
                for (let i of subItems) {
                    subMenu.menu.addMenuItem(i);
                }
        
                items.push(subMenu);
            }
        }

        return items;
    }

    /**
     * Creates dynamic part of the menu.
     * In this function, menu item for groups is created.
     * 
     * @method _createMenuGroups
     * @private
     * @return {Array}
     */
    _createMenuGroups() {
        let signal;
        let items = [];
        let subItems = [];
        
        let subMenu = new PopupMenu.PopupSubMenuMenuItem('none');

        if (! this._openMenu) {
            this._openMenu = subMenu.menu;
        }

        /* disable closing menu on item activated */
        subMenu.menu.itemActivated = () => {};

        let l = subMenu.label;
        subMenu.remove_child(subMenu.label);
        l.destroy();
        let [itemBox, label] = this.createItemBox(true);
        label.text = this._("No group selected");
        subMenu.insert_child_at_index(itemBox, 1);

        this._menuObjects['groups'] = {};
        this._menuObjects['groups']['object'] = subMenu;
        this._menuObjects['groups']['box'] = itemBox;
        this._menuObjects['groups']['label'] = label;
        this._clearMenuObject('groups');

        subMenu.insert_child_at_index(
            this._createUnselectButton('groups'),
            subMenu.get_children().length - 1
        );

        signal = subMenu.connect(
            'activate',
            () => {
                this.requestData(SmartHomeRequest.FULL);
            }
        );
        this._appendSignal(signal, subMenu, SmartHomeMenuLevel.MENU);

        subItems = subItems.concat(
            this._createGroups()
        );

        for (let i of subItems) {
            subMenu.menu.addMenuItem(i);
        }

        if (subItems.length > 0) {
            items.push(subMenu);
        }

        return items;
    }

    /**
     * Creates dynamic part of the menu.
     * In this function, menu item for devices is created.
     * 
     * @method _createMenuDevices
     * @private
     * @return {Array}
     */
    _createMenuDevices() {
        let signal;
        let items = [];
       
        let subMenu = new PopupMenu.PopupSubMenuMenuItem('none');

        /* disable closing menu on item activated */
        subMenu.menu.itemActivated = () => {};

        let l = subMenu.label;
        subMenu.remove_child(subMenu.label);
        l.destroy();
        let [itemBox, label] = this.createItemBox(true);
        label.text = this._("No device selected");
        subMenu.insert_child_at_index(itemBox, 1);

        this._menuObjects['devices'] = {};
        this._menuObjects['devices']['object'] = subMenu;
        this._menuObjects['devices']['box'] = itemBox;
        this._menuObjects['devices']['label'] = label;
        this._clearMenuObject('devices');

        subMenu.insert_child_at_index(
            this._createUnselectButton('devices'),
            subMenu.get_children().length - 1
        );

        signal = subMenu.connect(
            'activate',
            () => {
                this.requestData(SmartHomeRequest.FULL);
            }
        );
        this._appendSignal(signal, subMenu, SmartHomeMenuLevel.MENU);

        subMenu.visible = false;

        items.push(subMenu);

        return items;
    }

    /**
     * Creates dynamic part of the menu.
     * In this function, menu item control
     * for color and temperature is created.
     * 
     * @method _createMenuControl
     * @private
     * @return {Array}
     */
    _createMenuControl() {
        let items = [];

        let subMenu = new PopupMenu.PopupSubMenuMenuItem(
            this._("Color & Temperature")
        );

        /* disable closing menu on item activated */
        subMenu.menu.itemActivated = () => {};

        let iconPath = this.mainDir + `/media/HueIcons/uicontrolsColorScenes.svg`
        let icon = this._getIconByPath(iconPath);
        if (icon) {
            subMenu.insert_child_at_index(icon, 1);
        }

        this._menuObjects['controls'] = {};
        this._menuObjects['controls']['object'] = subMenu;
        this._menuObjects['controls']['label'] = subMenu.label;
        this._clearMenuObject('controls');

        subMenu.visible = false;

        items.push(subMenu);

        return items;
    }

    /**
     * Creates dynamic part of the menu.
     * In this function, menu item scenes
     * is created.
     * 
     * @method _createMenuScenes
     * @private
     * @return {Array}
     */
    _createMenuScenes() {
        let items = [];

        let subMenu = new PopupMenu.PopupSubMenuMenuItem(
            this._("Scenes")
        );

        /* disable closing menu on item activated */
        subMenu.menu.itemActivated = () => {};

        let iconPath = this.mainDir + `/media/HueIcons/uicontrolsScenes.svg`
        let icon = this._getIconByPath(iconPath);

        if (icon !== null) {
            subMenu.insert_child_at_index(icon, 1);
        }

        this._menuObjects['scenes'] = {};
        this._menuObjects['scenes']['object'] = subMenu;
        this._menuObjects['scenes']['label'] = subMenu.label;
        this._clearMenuObject('scenes');

        subMenu.visible = false;

        items.push(subMenu);

        return items;
    }

    /**
     * Creates dynamic part of the menu.
     * In this function, devices menu item
     * are created.
     * 
     * @method _createDevices
     * @param {Array} ids 
     * @private
     * @return {Array}
     */
    _createDevices(ids) {
        let items = [];

        for (let id of ids) {
            if (! DeviceTypes.includes(this.data['devices'][id]['type'])) {
                continue;
            }
            items = items.concat(
                this._createDevice(id)
            );
        }
    
        return items;
    }

    /**
     * In the dynamic menu, the group
     * is selected based on menu selected
     * structure.
     * 
     * @method setSelectedGroup
     */
    setSelectedGroup() {
        let id = this._menuSelected['group'];
        if (! this.groups[id]) {
            this.selectMenu();
            return;
        }
        let ids = this.groups[id]['ids'];

        this._clearMenuObject('groups');

        this._menuObjects['groups']['label'].text = this.groups[id]['name'];
        let subMenu = this._menuObjects['groups']['object'];
        let itemBox = this._menuObjects['groups']['box'];

        this._createDeviceItemUI(
            subMenu,
            itemBox,
            id,
            ids,
            this.groups[id]['capabilities'],
            'groups',
            SmartHomeItemType.GROUP_ANY,
            SmartHomeMenuLevel.GROUPITEMSSELECTED,
            true
        );
    }

    /**
     * In the dynamic menu, device
     * is selected based on menu selected
     * structure.
     * 
     * @method setSelectedDevices
     * @param {Boolean} rebuildDevicesItems 
     */
    setSelectedDevices(rebuildDevicesItems) {
        let isGroup = this._menuSelected['device'] ? false : true;
        let subMenu = this._menuObjects['devices']['object'];
        let itemBox = this._menuObjects['devices']['box'];
        let id = isGroup ? this._menuSelected['group'] : this._menuSelected['device'];
        let devicesData = this.data['devices'][id];
        let selectedGroup = this._menuSelected['group'];

        this._clearMenuObject('devices');

        this._menuObjects['devices']['label'].text = isGroup ? this.groups[selectedGroup]['name'] : devicesData['name'];

        if (rebuildDevicesItems) {
            this._menuObjects['devices']['hidden'] = undefined;
            subMenu.menu.removeAll();
            let items = this._createDevices(this.groups[selectedGroup]['ids']);

            for (let i of items) {
                subMenu.menu.addMenuItem(i);
            }

            subMenu.visible = items.length > 0 ? true : false;
        }
        
        let capabilities = isGroup ? this.groups[selectedGroup]['capabilities'] : devicesData['capabilities'];

        this._createDeviceItemUI(
            subMenu,
            itemBox,
            id,
            isGroup ? this.groups[id]['ids'] : null,
            capabilities,
            'devices',
            isGroup ? SmartHomeItemType.GROUP_ALL : SmartHomeItemType.SINGLE,
            SmartHomeMenuLevel.DEVICEITEMSSELECTED,
            true
        );
    }

    /**
     * Creates controls item menu.
     * 
     * @method _createControls
     * @param {String} id 
     * @param {Array} ids
     * @param {Enum} itemType
     * @param {Enum} menuLevel
     * @private
     * @return {Array}
     */
    _createControls(id, ids, itemType, menuLevel) {
        let items = [];
        let controlIds = [];

        for (let id of ids) {
            let type = this.data['devices'][id]['type'];
            if (! DeviceTypes.includes(type)) {
                continue;
            }
            controlIds.push(id);
        }

        items = items.concat(
            this._createControl(id, ids, controlIds, itemType, menuLevel)
        );

        return items;
    }

    /**
     * In the dynamic menu, controls
     * is selected based on menu selected
     * structure.
     * 
     * @method setSelectedControls
     */
    setSelectedControls() {
        let uuid;

        let selectedDevice = this._menuSelected['device'];
        let selectedGroup = this._menuSelected['group'];

        let isGroup = selectedDevice ? false : true;

        if (! isGroup && ! DeviceTypes.includes(this.data['devices'][selectedDevice]['type'])) {
            isGroup = true;
        }

        let subMenu = this._menuObjects['controls']['object'];
        let id = isGroup ? selectedGroup : selectedDevice;

        this._menuObjects['controls']['label'].text = isGroup ? this.groups[selectedGroup]['name'] : this.data['devices'][id]['name'];

        subMenu.menu.removeAll();

        let items = this._createControls(
            isGroup ? selectedGroup : id,
            isGroup ? this.groups[id]['ids'] : [id],
            isGroup ? SmartHomeItemType.GROUP_ANY : SmartHomeItemType.SINGLE,
            SmartHomeMenuLevel.DEVICEITEMSSELECTED
        );

        for (let i of items) {
            subMenu.menu.addMenuItem(i);
        }

        subMenu.visible = items.length > 0 ? true : false;

        if (items.length > 0) {
            if (isGroup) {
                let idString = this.groups[id]['ids'].join('-');
                uuid = `${idString}::${Utils.getUuid()}`;
            } else {
                uuid = `${id}::${Utils.getUuid()}`;
            }
            this._itemRefresher[uuid] = {
                'ids': isGroup ? this.groups[id]['ids'] : [id],
                'itemType': isGroup ? SmartHomeItemType.GROUP_ANY : SmartHomeItemType.SINGLE,
                'menuLevel': SmartHomeMenuLevel.DEVICEITEMSSELECTED
            };

            this._itemRefresher[uuid]['color'] = items;
            this._itemRefresher[uuid]['color_temperature'] = items;
        }
    }

    /**
     * Creates scenes item menu based on selected group or device.
     * 
     * @method _createScenes
     * @private
     * @return {Array}
     */
    _createScenes() {
        let selectedGroup = this._menuSelected['group'];
        let selectedDevice = this._menuSelected['device'];
        let isGroup = selectedDevice ? false : true;
        let items = [];
        let device;
        let ids;
        let ignoreGroup = false;

        if (this._menuSelected['device']) {
            for (let id in this.data['devices']) {
                device = this.data['devices'][id];
                if (! SceneTypes.includes(device['type'])) {
                    continue;
                }

                if (device['associated'].includes(selectedDevice)) {
                    ignoreGroup = true;
                }
            }

            if (! ignoreGroup) {
                isGroup = true;
            }
        }

        for (let id in this.data['devices']) {
            device = this.data['devices'][id];
            if (! SceneTypes.includes(device['type'])) {
                continue;
            }

            if (ignoreGroup && device['section'] === 'group') {
                continue;
            }

            ids = {};

            let append = isGroup ? device['associated'].includes(selectedGroup) : device['associated'].includes(selectedDevice);

            if (append) {

                ids = (! isGroup && device['section'] === 'device') ? [selectedDevice] : this.groups[selectedGroup]['ids'];

                if (ids.length > 0) {
                    items = items.concat(
                        this._createScene(
                            id,
                            ids,
                            isGroup ? SmartHomeItemType.GROUP_ANY : SmartHomeItemType.SINGLE,
                            SmartHomeMenuLevel.DEVICEITEMSSELECTED,
                            device['icon']
                        )
                    );
                }
            }
        }

        return [isGroup, items];
    }

    /**
     * In the dynamic menu, scenes
     * is selected based on menu selected
     * structure.
     * 
     * @method setSelectedScenes
     */
    setSelectedScenes() {
        let isGroup;
        let items;
        let selectedGroup = this._menuSelected['group'];
        let selectedDevice = this._menuSelected['device'];

        let subMenu = this._menuObjects['scenes']['object'];

        subMenu.menu.removeAll();

        [isGroup, items] = this._createScenes();

        for (let i of items) {
            subMenu.menu.addMenuItem(i);
        }

        let id = isGroup ? selectedGroup : selectedDevice;

        this._menuObjects['scenes']['label'].text = isGroup ? this.groups[selectedGroup]['name'] : this.data['devices'][id]['name'];

        subMenu.visible = items.length > 0 ? true : false;
    }

    /**
     * Sets the dynamic menu to selected group and device
     * 
     * @method selectMenu
     * @param {String} groupId 
     * @param {String} deviceId
     * @param {Boolean} initMenu 
     */
    selectMenu(groupId = '_all_', deviceId = null, initMenu = false) {
        let toDelete = [];

        if (this.groups['_all_']['ids'].length === 0) {
            return;
        }

        Utils.logDebug(`Selecting menu ${this.pluginName} - ${this.id}, group: ${groupId}, device: ${deviceId}`);


        if (initMenu || groupId !== this._menuSelected['group']) {
            this._menuSelected['group'] = groupId;
            this._menuSelected['device'] = deviceId;
            this.writeMenuSelectedSettings();

            toDelete = [
                SmartHomeMenuLevel.GROUPITEMSSELECTED,
                SmartHomeMenuLevel.DEVICEITEMSSELECTED,
                SmartHomeMenuLevel.DEVICEITEMS,
                SmartHomeMenuLevel.DEVICEMENU
            ];
            this.disconnectSignals(toDelete);
            for (let uuid in this._itemRefresher) {

                if (toDelete.includes(this._itemRefresher[uuid]['menuLevel'])) {
                   delete(this._itemRefresher[uuid])
                }
            }

            this.setSelectedGroup();
            this.setSelectedDevices(true);
            this.setSelectedControls();
            this.setSelectedScenes();
        } else if (deviceId !== this._menuSelected['device']) {
            this._menuSelected['device'] = deviceId;
            this.writeMenuSelectedSettings();

            toDelete = [
                SmartHomeMenuLevel.DEVICEITEMSSELECTED
            ];
            this.disconnectSignals(toDelete);
            for (let uuid in this._itemRefresher) {
                if (toDelete.includes(this._itemRefresher[uuid]['menuLevel'])) {
                    delete(this._itemRefresher[uuid])
                }
            }

            this.setSelectedDevices(false);
            this.setSelectedControls();
            this.setSelectedScenes();
        }

        if (groupId === '_all_') {
            this._menuObjects['groups']['unselect'].visible = false;

            this._menuObjects['groups']['hidden'].visible = true;
            this._menuObjects['groups']['default'].visible = false;
            this._menuObjects['groups']['hidden'] = this._menuObjects['groups']['default'];
        } else {
            this._menuObjects['groups']['unselect'].visible = true;
        }
        if (deviceId) {
            this._menuObjects['devices']['unselect'].visible = true;
        } else {
            this._menuObjects['devices']['unselect'].visible = false;
        }

        let selectedGroup = this._menuSelected['group'];
        let selectedDevice = this._menuSelected['device'];

        this._openMenu = this._menuObjects['groups']['object'].menu;
        if (selectedGroup && selectedGroup !== '_all_') {
            this._openMenu = this._menuObjects['devices']['object'].menu;
        }
        if (selectedDevice && this._menuObjects['controls']['object']) {
            this._openMenu = this._menuObjects['controls']['object'].menu;
        }

        this.refreshMenu();
    }

    /**
     * Creates timer for delayed function e.g.: slider scroll handle.
     * Runs only one in specified time.
     * 
     * @method runOnlyOnceInTime
     * @private
     * @param {Number} delay
     * @param {Object} delayed function
     */
    runOnlyOnceInTime(delay, fnc) {
        if (this._runOnlyOnceInProgress) {
            return;
        }
        this._runOnlyOnceInProgress = true;

        /**
         * e.g. the slider value is being modified back by the device status while moving the slider,
         * so we can not do imminent change while scrolling. It would jump up and down.
         * This timer will ensure it runs only once in time to prevent the jumping.
         */
        let timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {

            fnc();

            this._runOnlyOnceInProgress = false;
            this._timers = Utils.removeFromArray(this._timers, timerId);
        });
        this._timers.push(timerId);
    }

    /**
     * Handles UI components of the menu.
     * 
     * @method _menuHandler
     * @param {Object} data 
     */
    _menuHandler(data) {
        let value;
        let id = data['id'];
        let ids = data['ids'];
        let object = data['object'];
        let itemType = data['itemType'];

        Utils.logDebug(`Menu ${this.pluginName} - ${this.id}, handler data: ${JSON.stringify(data)}`);

        switch(data['typeUi']) {
            case SmartHomeUiType.SWITCH:
                value = object.state;

                switch (itemType) {
                    case SmartHomeItemType.SINGLE:
                        this.switchSingle(id, value);
                        break;
                    case SmartHomeItemType.GROUP_ALL:
                    case SmartHomeItemType.GROUP_ANY:
                        this.switchGroup(id, ids, value);
                        break;
                }
                break;

            case SmartHomeUiType.COLOR:
                value = object;
                
                switch (itemType) {
                    case SmartHomeItemType.SINGLE:
                        this.colorSingle(id, value);
                        break;
                    case SmartHomeItemType.GROUP_ALL:
                    case SmartHomeItemType.GROUP_ANY:
                        this.colorGroup(id, ids, value);
                        break;
                }

                break;
            case SmartHomeUiType.COLOR_TEMP:
                value = object;

                switch (itemType) {
                    case SmartHomeItemType.SINGLE:
                        this.colorTemperatureSingle(id, value);
                        break;
                    case SmartHomeItemType.GROUP_ALL:
                    case SmartHomeItemType.GROUP_ANY:
                        this.colorTemperatureGroup(id, ids, value);
                        break;
                }

                break;
            case SmartHomeUiType.BRIGHTNESS:
                value = object.value;

                switch (itemType) {
                    case SmartHomeItemType.SINGLE:
                        this.brightnessSingle(id, value);
                        break;
                    case SmartHomeItemType.GROUP_ALL:
                    case SmartHomeItemType.GROUP_ANY:
                        this.brightnessGroup(id, ids, value);
                        break;
                }

                break;
            case SmartHomeUiType.POSITION:
                value = object.value;

                switch (itemType) {
                    case SmartHomeItemType.SINGLE:
                        this.positionSingle(id, value);
                        break;
                    case SmartHomeItemType.GROUP_ALL:
                    case SmartHomeItemType.GROUP_ANY:
                        this.positionGroup(id, ids, value);
                        break;
                }

                break;
            case SmartHomeUiType.UP:
                switch (itemType) {
                    case SmartHomeItemType.SINGLE:
                        this.upSingle(id);
                        break;
                    case SmartHomeItemType.GROUP_ALL:
                    case SmartHomeItemType.GROUP_ANY:
                        this.upGroup(id, ids);
                        break;
                }

                break;
            case SmartHomeUiType.DOWN:
                switch (itemType) {
                    case SmartHomeItemType.SINGLE:
                        this.downSingle(id);
                        break;
                    case SmartHomeItemType.GROUP_ALL:
                    case SmartHomeItemType.GROUP_ANY:
                        this.downGroup(id, ids);
                        break;
                }

                break;
            case SmartHomeUiType.ACTIVATE:
                switch (itemType) {
                    case SmartHomeItemType.SINGLE:
                        this.sceneSingle(id, ids);
                        break;
                    case SmartHomeItemType.GROUP_ALL:
                    case SmartHomeItemType.GROUP_ANY:
                        this.sceneGroup(id, ids);
                        break;
                }

                break;

            case SmartHomeUiType.EXECUTE:
                switch (itemType) {
                    case SmartHomeItemType.SINGLE:
                        this.executeSingle(id, ids);
                        break;
                    case SmartHomeItemType.GROUP_ALL:
                    case SmartHomeItemType.GROUP_ANY:
                        this.executeGroup(id, ids);
                        break;
                }

                break;

            default:
                Utils.logError(`Unknown UI type: ${data['typeUi']}`);
                break;
        }
    }
});
