'use strict';

/**
 * prefs smart-home
 * JavaScript Gnome extension Smart Home - main preference page.
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

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as Utils from '../utils.js';
import * as SmartHomeAddDevice from './prefs_add_device.js';

import * as PhilipsHueBridgeApi from '../plugins/philipshue-bridge/api.js';
import * as PhilipsHueSyncboxApi from '../plugins/philipshue-syncbox/api.js';
import * as NanoleafApi from '../plugins/nanoleaf/api.js';
import * as IkeaDirigeraApi from '../plugins/ikea-dirigera/api.js';

export const PreferencesMain = GObject.registerClass({
    GTypeName: 'SmartHomeMain',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_main.ui',
    InternalChildren: [
        "comboIconPack",
        "switchForceEnglish",
        "switchDebug",
        "philipsHueBridgeRows",
        "philipsHueDesktopSyncRows",
        "philipsHueSyncboxRows",
        "hideUnavailableNanoleaf",
        "comboIndicatorPositionNanoleaf",
        "nanoleafRows",
        "ikeaDirigeraRows",
    ],
}, class PreferencesMain extends Adw.NavigationPage {
    static _classInit(klass) {
        super._classInit(klass);

        klass.install_action('add-device-philipshue-bridge.run', null, (widget, actionName, parameter) => {
            widget.addDialogPhilipsHueBridge();
        });

        klass.install_action('add-device-philipshue-syncbox.run', null, (widget, actionName, parameter) => {
            widget.addDialogPhilipsHueSyncbox();
        });

        klass.install_action('add-device-nanoleaf.run', null, (widget, actionName, parameter) => {
            widget.addDialogNanoleaf();
        });

        klass.install_action('add-device-ikea-dirigera.run', null, (widget, actionName, parameter) => {
            widget.addDialogIkeaDirigera();
        });

        klass.install_action('discover.run', null, (widget, actionName, parameter) => {
            widget.discoverAll();
        });

        klass.install_action('about.run', null, (widget, actionName, parameter) => {
            widget.aboutDialog();
        });

        return klass;
    }

    _init(metadata, mainDir, settings, path) {
        super._init();
        this._metadata = metadata;
        this._mainDir = mainDir;
        this._settings = settings;
        this._settingsLoaded = {};
        this._rows = {};
        this._pages = {};
    }

    writeSettings() {

        for (let pluginName of Utils.PLUGIN_LIST) {
            this._settings.set_value(
                pluginName,
                new GLib.Variant(
                    Utils.SETTINGS_PLUGIN_TYPE,
                    this._settingsLoaded[pluginName]
                )
            );
        }
    }

    async updateUI(settingsLoaded, preferencesPage) {
        this._settingsLoaded = settingsLoaded;
        this._comboIconPack.selected = this._settingsLoaded[Utils.SETTINGS_ICONPACK];
        this._switchForceEnglish.active = this._settingsLoaded[Utils.SETTINGS_FORCE_ENGLISH];
        this._switchDebug.active = this._settingsLoaded[Utils.SETTINGS_DEBUG];

        for (let pluginName of Utils.PLUGIN_LIST) {
            for (let id of Object.keys(this._settingsLoaded[pluginName])) {
                if (id === '_general_') {
                    continue;
                }

                let pluginID = `${pluginName}_${id}`;

                if ((! this._rows[pluginID]) || (! this._pages[pluginID])) {
                    await this.createDeviceUI(id, pluginName, preferencesPage);
                }
            }
        }

        let nanoleafSettings = this._settingsLoaded[Utils.SETTINGS_NANOLEAF];
        let nanoleafhideUnavailable = Utils.ALL_DEFAULT_HIDE_UNAVAILABLE;
        let nanoleafIndicatorPosition = 1;
        if (nanoleafSettings['_general_']) {
            if (nanoleafSettings['_general_']['hide-unavailable'] !== undefined) {
                nanoleafhideUnavailable = nanoleafSettings['_general_']['hide-unavailable'] === 'true';
            }
            if (nanoleafSettings['_general_']['indicator-position'] !== undefined) {
                nanoleafIndicatorPosition = Number(nanoleafSettings['_general_']['indicator-position']);
            }
        }
        this._hideUnavailableNanoleaf.active = nanoleafhideUnavailable;
        this._comboIndicatorPositionNanoleaf.selected = nanoleafIndicatorPosition;
    }

    _iconPackSelected(object) {
        this._settings.set_enum(
            Utils.SETTINGS_ICONPACK,
            object.selected
        );
    }

    _forceEnglichSwitched(object) {
        this._settings.set_boolean(
            Utils.SETTINGS_FORCE_ENGLISH,
            object.active
        );
    }

    _hideUnavailableNanoleafSwitched(object) {
        let pluginSettings = this._settings.get_value(
            Utils.SETTINGS_NANOLEAF
        ).deep_unpack();

        if (! pluginSettings['_general_']) {
            pluginSettings['_general_'] = {};
        }

        pluginSettings['_general_']['hide-unavailable'] = String(object.active);

        this._settings.set_value(
            Utils.SETTINGS_NANOLEAF,
            new GLib.Variant(
                Utils.SETTINGS_PLUGIN_TYPE,
                pluginSettings
            )
        );
    }

    _indicatorPositionNanoleafSelected(object) {
        let pluginSettings = this._settings.get_value(
            Utils.SETTINGS_NANOLEAF
        ).deep_unpack();

        if (! pluginSettings['_general_']) {
            pluginSettings['_general_'] = {};
        }

        pluginSettings['_general_']['indicator-position'] = String(object.selected);

        this._settings.set_value(
            Utils.SETTINGS_NANOLEAF,
            new GLib.Variant(
                Utils.SETTINGS_PLUGIN_TYPE,
                pluginSettings
            )
        );
    }

    _debugSwitched(object) {
        this._settings.set_boolean(
            Utils.SETTINGS_DEBUG,
            object.active
        );
    }

    async createDeviceUI(id, pluginName, preferencesPage) {
        let devicePage;
        let rowsObject;
        let pluginID = `${pluginName}_${id}`;

        try {
            const { SmartHomeDeviceRow } = await import('./prefs_device_row.js');
            const { SmartHomePhilipsHueBridge } = await import('./prefs_philipshue-bridge.js');
            const { SmartHomePhilipsHueDesktopSync } = await import('./prefs_philipshue-desktopsync.js');
            const { SmartHomePhilipsHueSyncbox } = await import('./prefs_philipshue-syncbox.js');
            const { SmartHomeNanoleaf } = await import('./prefs_nanoleaf.js');
            const { SmartHomeIkeaDirigera } = await import('./prefs_ikea-dirigera.js');

            GObject.type_ensure(SmartHomeDeviceRow);
            GObject.type_ensure(SmartHomePhilipsHueBridge);
            GObject.type_ensure(SmartHomePhilipsHueDesktopSync);
            GObject.type_ensure(SmartHomePhilipsHueSyncbox);
            GObject.type_ensure(SmartHomeNanoleaf);
            GObject.type_ensure(SmartHomeIkeaDirigera);

            let deviceSettings = this._settingsLoaded[pluginName][id];
            let addDialog = this._checkForAddDialog(pluginName, deviceSettings);
            let deviceRow = new SmartHomeDeviceRow(pluginName, pluginID, id, deviceSettings, addDialog, this);

            switch (pluginName) {
                case Utils.SETTINGS_PHILIPSHUEBRIDGE:
                    rowsObject = this._philipsHueBridgeRows;
                    devicePage = new SmartHomePhilipsHueBridge(pluginID, id, this._settings);
                    break;

                case Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC:
                    rowsObject = this._philipsHueDesktopSyncRows;
                    devicePage = new SmartHomePhilipsHueDesktopSync(pluginID, id, this._settings);
                    break;

                case Utils.SETTINGS_PHILIPSHUESYNCBOX:
                    rowsObject = this._philipsHueSyncboxRows;
                    devicePage = new SmartHomePhilipsHueSyncbox(pluginID, id, this._settings);
                    break;

                case Utils.SETTINGS_NANOLEAF:
                    rowsObject = this._nanoleafRows;
                    devicePage = new SmartHomeNanoleaf(pluginID, id, this._settings);
                    break;

                case Utils.SETTINGS_IKEADIRIGERA:
                    rowsObject = this._ikeaDirigeraRows;
                    devicePage = new SmartHomeIkeaDirigera(pluginID, id, this._settings);
                    break;
                default:
                    return;
            }

            this._removeTmpRow(rowsObject, deviceRow.pluginName, deviceRow.ip);

            this._rows[pluginID] = deviceRow;
            this._rows[pluginID].connect(
                'trashMe',
                (object) => {
                    let alert = new Adw.AlertDialog({
                        heading: "Remove device?", 
                        body: "This can not be undone. Settings related to the device will be lost."
                    });
                    alert.add_response('cancel', _('_Cancel'));
                    alert.add_response('remove', _('_Remove'));

                    alert.set_response_appearance(
                        'remove',
                        Adw.ResponseAppearance.DESTRUCTIVE
                    );

                    alert.present(this);
                    alert.choose(this, null,
                        (dialog, response) => {
                            if (dialog.choose_finish(response) === 'remove') {
                                rowsObject.remove(object);
                                preferencesPage.remove(this._pages[pluginID]);
                                this._pages[pluginID].clear();
                                delete(this._pages[pluginID]);
                                delete(this._rows[pluginID]);
                                delete(this._settingsLoaded[pluginName][id]);
                                this.writeSettings();
                            }
                        }
                    );
                }
            );

            this._pages[pluginID] = devicePage;
            rowsObject.add_row(this._rows[pluginID]);
            preferencesPage.add(devicePage);
        } catch (e) {
            Utils.logError(`${e}\n${e.stack}`)
        }
    }

    async createDeviceTmpUI(id, pluginName, settings) {
        let rowsObject;
        let pluginID = `${pluginName}_${id}`;

        try {
            const { SmartHomeDeviceRow } = await import('./prefs_device_row.js');

            GObject.type_ensure(SmartHomeDeviceRow);

            let deviceSettings = settings;
            let addDialog = this._checkForAddDialog(pluginName, deviceSettings);
            let deviceRow = new SmartHomeDeviceRow(pluginName, pluginID, id, deviceSettings, addDialog, this);

            switch (pluginName) {
                case Utils.SETTINGS_PHILIPSHUEBRIDGE:
                    rowsObject = this._philipsHueBridgeRows;
                    break;

                case Utils.SETTINGS_PHILIPSHUEDESKTOPSYNC:
                    rowsObject = this._philipsHueDesktopSyncRows;
                    break;

                case Utils.SETTINGS_PHILIPSHUESYNCBOX:
                    rowsObject = this._philipsHueSyncboxRows;
                    break;

                case Utils.SETTINGS_NANOLEAF:
                    rowsObject = this._nanoleafRows;
                    break;

                case Utils.SETTINGS_IKEADIRIGERA:
                    rowsObject = this._ikeaDirigeraRows;
                    break;
                default:
                    return;
            }

            this._removeTmpRow(rowsObject, deviceRow.pluginName, deviceRow.ip);

            this._rows[pluginID] = deviceRow;
            this._rows[pluginID].connect(
                'trashMe',
                (object) => {
                    rowsObject.remove(object);
                    delete(this._rows[pluginID]);
                }
            );

            rowsObject.add_row(this._rows[pluginID]);
        } catch (e) {
            Utils.logError(`${e}\n${e.stack}`)
        }
    }

    _removeTmpRow(rowsObject, pluginName, ip) {
        for (let pluginID in this._rows) {
            let existingRow = this._rows[pluginID];

            if (Object.keys(this._pages).includes(pluginID)) {
                continue;
            }

            if (existingRow.pluginName === pluginName && existingRow.ip === ip) {
                rowsObject.remove(this._rows[pluginID]);
                delete(this._rows[pluginID]);
            }
        }
    }

    _checkForAddDialog(pluginName, deviceSettings) {
        let hasAccess = this.hasAccess(pluginName, deviceSettings);
        let addDialog = null;
        if (! hasAccess) {
            switch(pluginName) {
                case Utils.SETTINGS_PHILIPSHUEBRIDGE:
                    addDialog = this.addDialogPhilipsHueBridge;
                    break;
                case Utils.SETTINGS_PHILIPSHUESYNCBOX:
                    addDialog = this.addDialogPhilipsHueSyncbox;
                    break;
                case Utils.SETTINGS_NANOLEAF:
                    addDialog = this.addDialogNanoleaf;
                    break;
                case Utils.SETTINGS_IKEADIRIGERA:
                    addDialog = this.addDialogIkeaDirigera;
                    break;
                default:
                    break;
            }
        }

        return addDialog;
    }

    hasAccess(pluginName, deviceSettings) {
        let hasAccess = false;
        if (!deviceSettings) {
            return false;
        }

        switch(pluginName) {
            case Utils.SETTINGS_PHILIPSHUEBRIDGE:
                if (deviceSettings['username'] !== undefined && deviceSettings['username'].length > 0) {
                    hasAccess = true;
                }
                break;
            case Utils.SETTINGS_PHILIPSHUESYNCBOX:
                if (deviceSettings['accessToken'] !== undefined && deviceSettings['accessToken'].length > 0) {
                    hasAccess = true;
                }
                break;
            case Utils.SETTINGS_NANOLEAF:
                if (deviceSettings['auth_token'] !== undefined && deviceSettings['auth_token'].length > 0) {
                    hasAccess = true;
                }
                break;
            case Utils.SETTINGS_IKEADIRIGERA:
                if (deviceSettings['accessToken'] !== undefined && deviceSettings['accessToken'].length > 0) {
                    hasAccess = true;
                }
                break;
            default:
                break;
        }
        
        return hasAccess;
    }

    checkIpExists(pluginName, ip) {
        for (let i in this._rows) {
            if (this._rows[i].ip === ip && this._rows[i].pluginName === pluginName && Object.keys(this._pages).includes(i)) {
                let toast = Adw.Toast.new("IP address already registered.");
                toast.set_timeout(3);
                this.get_root().add_toast(toast);
                return true;
            }
        }
        return false;
    }

    addDialogPhilipsHueBridge(ipAddress = null) {
        let add = new SmartHomeAddDevice.SmartHomeAddDevice(
            "Philips Hue bridge",
            "Press the button on the bridge and click 'Add'.",
            ipAddress
        );
        add.connect(
            'ipAdded',
            this._addDialogPhilipsHueBridgeCallback.bind(this)
        );

        add.present(this);
    }

    addDialogPhilipsHueSyncbox(ipAddress = null) {
        let add = new SmartHomeAddDevice.SmartHomeAddDevice(
            "Philips Hue syncbox",
            "Insert IP and press 'Add'.",
            ipAddress
        );
        add.connect(
            'ipAdded',
            this._addDialogPhilipsHueSyncboxCallback.bind(this)
        );

        add.present(this);
    }

    addDialogNanoleaf(ipAddress = null) {
        let add = new SmartHomeAddDevice.SmartHomeAddDevice(
            "Nanoleaf",
            "On the Nanoleaf controller, hold the on-off button for 5-7 seconds until the LED starts flashing. Alternatively, allow the API pairing in the app. Depends on your light. While the LED is flashing, press the 'Add' button.",
            ipAddress
        );
        add.connect(
            'ipAdded',
            this._addDialogNanoleafCallback.bind(this)
        );

        add.present(this);
    }

    addDialogIkeaDirigera(ipAddress = null) {
        let add = new SmartHomeAddDevice.SmartHomeAddDevice(
            "Ikea Dirigera",
            "Insert IP and press 'Add'.",
            ipAddress
        );
        add.connect(
            'ipAdded',
            this._addDialogIkeaDirigeraCallback.bind(this)
        );

        add.present(this);
    }

    _addDialogPhilipsHueBridgeCallback(object) {
        if (this.checkIpExists(Utils.SETTINGS_PHILIPSHUEBRIDGE, object.ip)) {
            return;
        }

        let bridge = new PhilipsHueBridgeApi.PhilipsHueBridge({
            ip: object.ip
        });

        bridge.connect(
            'new-user',
            (object) => {
                object.getAll();
            }
        );

        bridge.connect(
            'all-data',
            (object) => {
                let id;
                let bridgeId;
                let name;

                for (let i of object.data['data']) {
                    if (i['type'] === 'bridge') {
                        id = i['owner']['rid'];
                        bridgeId = i['bridge_id'];
                    }
                }

                for (let i of object.data['data']) {
                    if (i['id'] === id) {
                        name = i['metadata']['name'];
                    }
                }

                this._settingsLoaded[Utils.SETTINGS_PHILIPSHUEBRIDGE][bridgeId] = {
                    'ip': object.ip,
                    'username': object.username,
                    'clientkey': object.clientkey,
                    'name': name
                }

                let toast = Adw.Toast.new("Connected");
                toast.set_timeout(3);
                this.get_root().add_toast(toast);

                this.writeSettings();
            }
        )

        bridge.connect(
            'connection-problem',
            () => {
                let toast = Adw.Toast.new("Failed to connect to the device.");
                toast.set_timeout(3);
                this.get_root().add_toast(toast);
            }
        )

        bridge.createUser();

        object.close();
    }

    _addDialogPhilipsHueSyncboxCallback(object) {
        if (this.checkIpExists(Utils.SETTINGS_PHILIPSHUESYNCBOX, object.ip)) {
            return;
        }

        object.close();

        let alert = new Adw.AlertDialog();
        alert.heading = "Philips Hue syncbox";
        alert.body = "While this dialog is shown, hold the button on HDMI sync box until the led blinks green (~3 seconds) and release.";

        let syncbox = new PhilipsHueSyncboxApi.PhilipsHueSyncBox ({
            ip: object.ip,
            cert: this._mainDir + "/crypto/hsb_cacert.pem"
        });

        alert.connect(
            'response',
            syncbox.stopRegistration.bind(syncbox)
        );

        alert.present(this);

        syncbox.connect(
            'registration-complete',
            (object) => {
                object.getDeviceState();
            }
        );

        syncbox.connect(
            'device-state',
            (object) => {
                let id = object.data["device"]["uniqueId"];
                let name = object.data["device"]["name"];

                this._settingsLoaded[Utils.SETTINGS_PHILIPSHUESYNCBOX][id] = {
                    'ip': object.ip,
                    'registrationId': object.registrationId,
                    'accessToken': object.token,
                    'name': name
                }

                let toast = Adw.Toast.new("Connected");
                toast.set_timeout(3);
                this.get_root().add_toast(toast);

                this.writeSettings();
                alert.close();
            }
        );

        const failed = () => {
            let toast = Adw.Toast.new("Failed to connect to the device.");
            toast.set_timeout(3);
            this.get_root().add_toast(toast);
            alert.close();
        }

        syncbox.connect(
            'registration-failed',
            failed
        )

        syncbox.createRegistration();
    }

    _addDialogNanoleafCallback(object) {
        if (this.checkIpExists(Utils.SETTINGS_NANOLEAF, object.ip)) {
            return;
        }

        let device = new NanoleafApi.NanoLightsDevice({
            ip: object.ip
        });

        device.connect(
            'authorized',
            (object) => {
                object.getDeviceInfo();
            }
        );

        device.connect(
            'all-data',
            (object) => {
                let id = object.data["serialNo"];
                let name = object.data["name"];

                this._settingsLoaded[Utils.SETTINGS_NANOLEAF][id] = {
                    'ip': object.ip,
                    'port': object.port,
                    'auth_token': object.token,
                    'name': name,
                    'group': "undefined"
                }

                let toast = Adw.Toast.new("Connected");
                toast.set_timeout(3);
                this.get_root().add_toast(toast);

                this.writeSettings();
            }
        );

        device.connect(
            'connection-problem',
            () => {
                let toast = Adw.Toast.new("Failed to connect to the device.");
                toast.set_timeout(3);
                this.get_root().add_toast(toast);
            }
        )

        device.authorizate();

        object.close();
    }

    _addDialogIkeaDirigeraCallback(object) {
        if (this.checkIpExists(Utils.SETTINGS_IKEADIRIGERA, object.ip)) {
            return;
        }

        let alert = new Adw.AlertDialog();
        alert.heading = "Ikea Dirigera";
        alert.body = "Press the button on the bridge.";

        let bridge = new IkeaDirigeraApi.IkeaDirigeraBridge({
            ip: object.ip,
        });

        bridge.connect(
            'code-challenge',
            (object) => {
                const code = object.data['code'];
                alert.present(this);
                object.getAuthorized(code);
            }
        );

        bridge.connect(
            'authorization-succeed',
            (object) => {
                alert.close();
                object.getAll();
            }
        );

        bridge.connect(
            'all-data',
            (object) => {
                let bridgeId = "";
                let name = "";
                for (let i of object.data) {
                    if (i['type'] === 'gateway') {
                        bridgeId = i['attributes']['serialNumber'];
                        name = i['attributes']['customName'];
                    }
                }

                this._settingsLoaded[Utils.SETTINGS_IKEADIRIGERA][bridgeId] = {
                    'ip': object.ip,
                    'accessToken': object.token,
                    'name': name
                }

                let toast = Adw.Toast.new("Connected");
                toast.set_timeout(3);
                this.get_root().add_toast(toast);

                this.writeSettings();
            }
        );

        const failed = () => {
            let toast = Adw.Toast.new("Failed to connect to the device.");
            toast.set_timeout(3);
            this.get_root().add_toast(toast);
            alert.close();
        }

        bridge.connect(
            'authorization-failed',
            failed
        );

        bridge.createCodeChallenge();

        object.close();
    }

    discoverAll() {
        try {
            let discoveryPhilipsHueBridges = new PhilipsHueBridgeApi.DiscoveryPhilipsHueBridges();
            discoveryPhilipsHueBridges.connect(
                'discoverFinished',
                this._discoveryPhilipsHueBridgesCallback.bind(this)
            );
            discoveryPhilipsHueBridges.discover();

            let discoveryPhilipsHueSyncBoxes = new PhilipsHueSyncboxApi.DiscoveryPhilipsSyncBox(this._mainDir);
            discoveryPhilipsHueSyncBoxes.connect(
                'discoverFinished',
                this.discoveryPhilipsHueSyncBoxesCallback.bind(this)
            )
            discoveryPhilipsHueSyncBoxes.discover();

            let discoverNanoleafs = new NanoleafApi.DiscoveryNanoleafs();
            discoverNanoleafs.connect(
                'discoverFinished',
                this._discoverNanoleafsCallback.bind(this)
            )
            discoverNanoleafs.discover();

            let discoverIkeaDirigeraBridges = new IkeaDirigeraApi.DiscoveryIkeaDirigera();
            discoverIkeaDirigeraBridges.connect(
                'discoverFinished',
                this._discoverIkeaDirigeraBridgesCallback.bind(this)
            )
            discoverIkeaDirigeraBridges.discover();

        } catch (e) {
            Utils.logError(`${e}\n${e.stack}`);
        }
    }

    async _discoveryPhilipsHueBridgesCallback(object) {
        for (let bridge of object.discoveredBridges) {
            let pluginName = Utils.SETTINGS_PHILIPSHUEBRIDGE;
            let id = bridge['bridgeid'];
            let ip = bridge['internalipaddress'];

            let found = false;
            for (let i in this._rows) {
                if (this._rows[i].ip === ip && this._rows[i].pluginName === pluginName) {
                    found = true;
                    break;
                }
            }
            if (found) { continue; }

            await this.createDeviceTmpUI(
                id,
                pluginName,
                { 'ip': ip, 'name': bridge['name'] }
            );
        }
    }

    async discoveryPhilipsHueSyncBoxesCallback(object) {
        for (let syncbox of object.discoveredSyncBox) {
            let pluginName = Utils.SETTINGS_PHILIPSHUESYNCBOX;
            let id = syncbox['uniqueId'];
            let ip = syncbox['ipAddress'];

            let found = false;
            for (let i in this._rows) {
                if (this._rows[i].ip === ip && this._rows[i].pluginName === pluginName) {
                    found = true;
                    break;
                }
            }
            if (found) { continue; }

            await this.createDeviceTmpUI(
                id,
                pluginName,
                { 'ip': ip, 'name': syncbox['name'] }
            );
        }
    }

    async _discoverNanoleafsCallback(object) {
        let discovered = object.discoveredDevices;
        for (let ip in discovered) {
            let pluginName = Utils.SETTINGS_NANOLEAF;
            let id = discovered[ip]['hostname'];

            let found = false;
            for (let i in this._rows) {
                if (this._rows[i].ip === ip && this._rows[i].pluginName === pluginName) {
                    found = true;
                    break;
                }
            }
            if (found) { continue; }

            await this.createDeviceTmpUI(
                id,
                pluginName,
                { 'ip': ip, 'name': discovered[ip]['hostname'] }
            );
        }
    }

    async _discoverIkeaDirigeraBridgesCallback(object) {
        let discovered = object.discoveredBridges;
        for (let ip in discovered) {
            let pluginName = Utils.SETTINGS_IKEADIRIGERA;
            let id = discovered[ip]['hostname'];

            let found = false;
            for (let i in this._rows) {
                if (this._rows[i].ip === ip && this._rows[i].pluginName === pluginName) {
                    found = true;
                    break;
                }
            }
            if (found) { continue; }

            await this.createDeviceTmpUI(
                id,
                pluginName,
                { 'ip': ip, 'name': discovered[ip]['hostname'] }
            );
        }
    }

    aboutDialog() {
        let about = new Adw.AboutDialog({
            application_name: this._metadata.name,
            developer_name: "Václav Chlumský",
            copyright: "© 2025 Václav Chlumský",
            license_type: Gtk.License.MIT_X11,
            version: `Version: ${this._metadata.version}`,
            website: "https://github.com/vchlum/smart-home",
            issue_url: "https://github.com/vchlum/smart-home/issues",
            developers: ["Václav Chlumský <chlumskyvaclav@gmail.com>"],
            /*
            designers: [""],
            artists: [""]*/
        });
        /*
        about.add_credit_section("Contributors", [""]);*/
        about.present(this);
    }
 });
