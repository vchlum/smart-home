'use strict';

/**
 * extension smart-home
 * JavaScript Gnome extension Smart Home.
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
import * as Utils from './utils.js';
import * as Semaphore from './semaphore.js';

/**
 * SmartHome class - main class of the extension.
 *
 * @class SmartHome
 * @constructor
 * @return {Object} instance
 */
export const SmartHome = GObject.registerClass({
    GTypeName: 'SmartHome',
    Signals: {
        'plugin-ready': {
            param_types: [GObject.TYPE_STRING],
        },
    }
}, class SmartHome extends GObject.Object {

    /**
     * SmartHome class initialization
     * This class creates and destoroys all plugins
     *  
     * @method _init
     * @param {Object} metadata of the extension
     * @param {String} path to extension directory
     * @param {Object} settings object
     * @param {Object} preferences object to access extension preferences
     * @private
     */
    _init(metadata, mainDir, settings, openPref) {
        super._init();

        this._metadata = metadata;
        this._mainDir = mainDir;
        this._settings = settings;
        this._openPref = openPref;
        this.instances = {};
        this._semaphore = new Semaphore.Semaphore(1);

        this.signal = this._settings.connect(
            'changed',
            () => {
                this.readSettings();
                this._semaphore.callFunction(this.refreshPlugins.bind(this));
            }
        );

        this.readSettings();
    }

    /**
     * Reads settings necessary for this class.
     * 
     * @method readSettings
     */
    readSettings() {
        Utils.setDebug(this._settings.get_boolean(
            Utils.SETTINGS_DEBUG
        ));
    }

    /**
     * Dynamically imports plugin module.
     * 
     * @method _importModule
     * @param {String} module name of the 
     * @private
     * @return {Object} imported module or null if error
     */
    async _importModule(moduleName) {
        try {
            const plugin = await import(`./plugins/${moduleName}/plugin.js`);
            return plugin;
        } catch (e) {
            Utils.logError(`Plugin not loaded: ${e}:\n${e.stack}`);
        }
        return null;
    }

    /**
     * Creates plugin instance, e.g. 'philips hue bridge' instance.
     * Created plugin is appended to instance structure and signal ready is emitted.
     * 
     * @method createPlugin
     * @param {String} pluginID unique ID
     * @param {String} id of apropriate device
     * @param {String} pluginName is name of the plugin, a general one 
     */
    async createPlugin(pluginID, id, pluginName) {
        try {
            let plugin = await this._importModule(pluginName);

            const pluginInstance = new plugin.Plugin(
                id,
                pluginName,
                this._metadata,
                this._mainDir,
                this._settings,
                this._openPref
            );
            this.instances[pluginID] = pluginInstance;
            Utils.logDebug(`Device ${pluginName}: ${id} loaded.`);
            this.emit('plugin-ready', pluginID);
        } catch (e) {
            Utils.logError(`Device ${pluginName}: ${id} failed to load with error ${e}:\n${e.stack}`);
        }
    }

    /**
     * Fully remove/destory/clear plugin instance. 
     * 
     * @method removePlugin
     * @param {String} pluginID unique ID
     */
    removePlugin(pluginID) {
        if (! this.instances[pluginID]) {
            return;
        }

        this.instances[pluginID].disconnectSignals();
        this.instances[pluginID].clearInstance();
        this.instances[pluginID].clearMenu();
        this.instances[pluginID].destroy();
        this.instances[pluginID] = null;
        delete(this.instances[pluginID]);

        Utils.logDebug(`Device ${pluginID} removed.`);
    }

    /**
     * Updates current plugins - adds or remove plugin.
     * Usually, based on settings changed.
     * Function concurrency is not supported. It must by called only
     * once at the time. A samaphore or something is adviced to use.
     * 
     * @method refreshPlugins
     */
    async refreshPlugins() {
        let pluginID;
        let shouldBe = [];

        Utils.logDebug(`Trying to load or refresh new devices.`);

        for (let pluginName of Utils.PLUGIN_LIST) {
            let pluginSettings = this._settings.get_value(
                pluginName
            ).deep_unpack();

            if (Utils.PLUGIN_ALL_IN_ONE.includes(pluginName)) {
                if (Object.keys(pluginSettings).length === 0) {
                    continue;
                }

                if (Object.keys(pluginSettings).length === 1 &&
                    Object.keys(pluginSettings).includes('_general_')) {
                    continue;
                }

                pluginID = `${pluginName}_${pluginName}`;
                shouldBe.push(pluginID);
                if (Object.keys(this.instances).includes(pluginID)) {
                    continue;
                }

                Utils.logDebug(`New device discovered ${pluginID} ${pluginName} ${pluginName}.`);

                await this.createPlugin(pluginID, pluginName, pluginName);
            } else {
                for (let id in pluginSettings) {
                    pluginID = `${pluginName}_${id}`;
                    shouldBe.push(pluginID);
                    if (Object.keys(this.instances).includes(pluginID)) {
                        continue;
                    }

                    Utils.logDebug(`New device discovered ${pluginID} ${id} ${pluginName}.`);

                    await this.createPlugin(pluginID, id, pluginName);
                }
            }
        }

        for (let pluginID in this.instances) {
            if (shouldBe.includes(pluginID)) {
                continue;
            }

            Utils.logDebug(`Removing device ${pluginID}.`);

            this.removePlugin(pluginID);
        }
    }

    /**
     * Clear class, so it can be safely forgotten.
     * 
     * @method clear
     */
    clear() {
        Utils.logDebug(`Clearing.`);

        this._settings.disconnect(this.signal);

        this._semaphore.clear();
        this._semaphore = null;
    }
});
