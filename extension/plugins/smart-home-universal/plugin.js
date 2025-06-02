'use strict';

/**
 * extension smart-home
 * JavaScript Smart Home universal plugin.
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
import * as Utils from '../../utils.js';
import * as Semaphore from '../../semaphore.js';
import * as SmartHomePanelMenu from '../../smarthome-panelmenu.js';

/**
 * Smart Home class for controlling Universal plugin.
 *
 * @class Plugin
 * @constructor
 * @return {Object} instance
 */
export const Plugin =  GObject.registerClass({
    GTypeName: 'SmartHomeUniversal',
}, class Plugin extends SmartHomePanelMenu.SmartHomePanelMenu {

    _init(id, pluginName, metadata, mainDir, settings, openPref) {
        this.id = id;
        this._prepared = false;
        this._plugins = {};
        this._pluginsSignal = {};
        this._initialized = {};
        this._pluginRebuild = {};
        this._semaphore = new Semaphore.Semaphore(1);
        super._init(id, pluginName, metadata, mainDir, settings, openPref);
    }

    settingRead(needsRebuild) {
        for (let id in this._pluginSettings) {
            if (id === '_general_') {
                continue;
            }

            if (!this._pluginSettings[id]) {
                return; //device is being removed
            }
        }

        if (needsRebuild && this._prepared) {
            this.preparePlugin(true);
        }
    }

    addPlugin(pluginID, plugin) {
        let signal;

        this._plugins[pluginID] = plugin;
        this._pluginsSignal[pluginID] = [];

        signal = this._plugins[pluginID].connect(
            'data-ready',
            this._parseData.bind(this, pluginID)
        );
        this._pluginsSignal[pluginID].push(signal);

        signal = this._plugins[pluginID].connect(
            'rebuild',
            () => {
                this._pluginRebuild[pluginID] = false;

                if (this.data['groups']) {
                    for (let id in this.data['groups']) {
                        if (id.startsWith(pluginID)) {
                            delete(this.data['groups'][id]);
                        }
                    }
                }

                if (this.data['devices']) {
                    for (let id in this.data['devices']) {
                        if (id.startsWith(pluginID)) {
                            delete(this.data['devices'][id]);
                        }
                    }
                }

                this.requestRebuild();
            }
        );
        this._pluginsSignal[pluginID].push(signal);
    }

    removePlugin(pluginID) {
        this.disconnectPluginSignals(pluginID);

        delete(this._pluginsSignal[pluginID]);
        delete(this._plugins[pluginID]);
    }

    preparePlugin(settingsRead = false) {
        this._initialized = {};
        this._pluginRebuild = {};

        this.data = {'config': {}, 'devices': {}, 'groups': {}};
        this.data['config'] = {'_all_': {'name': this._("All rooms")}};
        this.data['groups'] = {};
        this.data['devices'] = {};

        this._prepared = true;
        Utils.logDebug(`Smart Home Universal plugin is ready.`);
    }

    disconnectPluginSignals(pluginID) {
        while (this._pluginsSignal[pluginID].length > 0) {
            let signal = this._pluginsSignal[pluginID].pop();
            this._plugins[pluginID].disconnect(signal);
        }
    }

    clearInstance(settingsRead = false) {
        Utils.logDebug(`Smart Home universal plugin clearing.`);

        for ( let pluginID in this._plugins) {
            this.removePlugin(pluginID);
        }

        if (!settingsRead) {
            this._semaphore.clear();
            this._semaphore = null;
        }
    }

    _findNewGroupId(pluginID, origGroupID) {
        for (let groupName in this.data['groups']) {
            if (this.data['groups'][groupName]['groupsIds'].indexOf(`${pluginID}::${origGroupID}`) !== -1) {
                return groupName;
            }
        }

        return null;
    }

    _parseData(pluginID) {
        for (let c in this._plugins[pluginID].data['config']) {
            if (c === '_all_') {
                continue;
            }

            this.data['groups'][`${pluginID}::${c}`] = this._plugins[pluginID].data['config'][c];
        }
        for (let id in this._plugins[pluginID].data['groups']) {
            if (id === '_all_') {
                continue;
            }

            let groupName = this._plugins[pluginID].data['groups'][id]['name'];
            let groupID = `${pluginID}::${id}`;

            if (! this.data['groups'][groupName]) {
                this.data['groups'][groupName] = {
                    'name': groupName,
                    'groupsIds': [],
                    'section': 'common',
                    'services': [],
                    'lights': [],
                };
            }

            if (! this.data['groups'][groupName]['icon'] && this._plugins[pluginID].data['groups'][id]['icon']) {
                this.data['groups'][groupName]['icon'] = this._plugins[pluginID].data['groups'][id]['icon'];
            }

            if (this.data['groups'][groupName]['groupsIds'].indexOf(groupID) === -1) {
                this.data['groups'][groupName]['groupsIds'].push(groupID);
            }

            for (let deviceID in this._plugins[pluginID].data['groups'][id]['services']) {
                this.data['groups'][groupName]['services'].push(
                    `${pluginID}::${deviceID}`
                );
            }

            for (let deviceID in this._plugins[pluginID].data['groups'][id]['lights']) {
                this.data['groups'][groupName]['lights'].push(
                    `${pluginID}::${deviceID}`
                );
            }

        }

        for (let deviceID in this._plugins[pluginID].data['devices']) {
            if (this._plugins[pluginID].data['devices'][deviceID]['type'] !== 'device') {
                continue;
            }

            let newDeviceID = `${pluginID}::${deviceID}`;
            this.data['devices'][newDeviceID] = this._plugins[pluginID].data['devices'][deviceID];

            if (this.data['devices'][newDeviceID]['groups']) {
                for (let i in this.data['devices'][newDeviceID]['groups']) {
                    let origGroupID = this.data['devices'][newDeviceID]['groups'][i];
                    let newGroupID = this._findNewGroupId(pluginID, origGroupID);

                    newGroupID !== null ?
                        this.data['devices'][newDeviceID]['groups'][i] = newGroupID : null;
                }
            }
        }

        for (let deviceID in this._plugins[pluginID].data['devices']) {
            if (this._plugins[pluginID].data['devices'][deviceID]['type'] !== 'scene') {
                continue;
            }

            let newDeviceID = `${pluginID}::${deviceID}`;

            if (! this.data['devices'][newDeviceID]) {
                this.data['devices'][newDeviceID] = {
                    'type': 'scene',
                    'section': this._plugins[pluginID].data['devices'][deviceID]['section'],
                    'name': this._plugins[pluginID].data['devices'][deviceID]['name'],
                    'capabilities': this._plugins[pluginID].data['devices'][deviceID]['capabilities'],
                    'associated': []
                }
            }

            for (let origAssociated of this._plugins[pluginID].data['devices'][deviceID]['associated']) {
                let newAssociated = this._findNewGroupId(pluginID, origAssociated);
                newAssociated = newAssociated === null && origAssociated === '_all_' ? origAssociated : newAssociated;
                newAssociated = newAssociated !== null ? newAssociated : `${pluginID}::${origAssociated}`;

                if (this.data['devices'][newDeviceID]['associated'].indexOf(newAssociated) === -1) {
                    this.data['devices'][newDeviceID]['associated'].push(newAssociated);
                }
            }
        }

        if (this._initialized[pluginID] && this._pluginRebuild[pluginID]) {
            this.dataReady();
        } else {
            this._initialized[pluginID] = true;
            this._pluginRebuild[pluginID] = true;
            this.rebuildMenuDo();
        }
    }

    async _requestAllData() {
        for (let id in this._plugins) {
            if (this._initialized[id]) {
                this._plugins[id].requestData();
            }
        }
    }

    requestData() {
        this._semaphore.callFunction(this._requestAllData.bind(this));
    }

    _getGroupIds(id) {
        let groupsIds = [];
        if (id === '_all_') {
            for (let i in this.data['groups']) {
                groupsIds = groupsIds.concat(this.data['groups'][i]['groupsIds']);
            }
        } else {
            groupsIds =  this.data['groups'][id]['groupsIds']
        }
        return groupsIds;
    }

    _getParsedActionId(origID) {
        let pluginName, pluginID, id;

        let num = origID.split('::').length;
        if (num === 2) {
            [pluginID, id] = origID.split('::');
            return [pluginID, id];
        }

        if (num === 3) {
            [pluginName, pluginID, id] = origID.split('::');
            return [`${pluginName}::${pluginID}`, id];
        }
        
        return [];
    }

    _getOrigPluginIds(origPluginID, ids) {
        let origIds = [];

        for (let id of ids) {
            let [pluginID, deviceID] = this._getParsedActionId(id);
            if (pluginID === origPluginID) {
                origIds.push(deviceID);
            }
        }

        return origIds;
    }

    switchSingle(id, value) {
        let [pluginID, deviceID] = this._getParsedActionId(id);
        Utils.logDebug(id);
        this._plugins[pluginID].switchSingle ? this._plugins[pluginID].switchSingle(deviceID, value) : null;
    }

    switchGroup(id, ids, value) {
        let groupIds = this._getGroupIds(id);

        for (let i of groupIds) {
            let [pluginID, groupID] = this._getParsedActionId(i);

            let origIds = this._getOrigPluginIds(pluginID, ids);
            this._plugins[pluginID].switchGroup ? this._plugins[pluginID].switchGroup(groupID, origIds, value) : null;
        }
    }

    brightnessSingle(id, value) {
        let [pluginID, deviceID] = this._getParsedActionId(id);
        this._plugins[pluginID].brightnessSingle ? this._plugins[pluginID].brightnessSingle(deviceID, value) : null;
    }

    brightnessGroup(id, ids, value) {
        let groupIds = this._getGroupIds(id);

        for (let i of groupIds) {
            let [pluginID, groupID] = this._getParsedActionId(i);

            let origIds = this._getOrigPluginIds(pluginID, ids);
            this._plugins[pluginID].brightnessGroup ? this._plugins[pluginID].brightnessGroup(groupID, origIds, value) : null;
        }
    }

    colorSingle(id, value) {
        let [pluginID, deviceID] = this._getParsedActionId(id);
        this._plugins[pluginID].colorSingle ? this._plugins[pluginID].colorSingle(deviceID, value) : null;
    }

    colorGroup(id, ids, value) {
        let groupIds = this._getGroupIds(id);

        for (let i of groupIds) {
            let [pluginID, groupID] = this._getParsedActionId(i);

            let origIds = this._getOrigPluginIds(pluginID, ids);
            this._plugins[pluginID].colorGroup ? this._plugins[pluginID].colorGroup(groupID, origIds, value) : null;
        }
    }

    colorTemperatureSingle(id, value) {
        let [pluginID, deviceID] = this._getParsedActionId(id);
        this._plugins[pluginID].colorTemperatureSingle ? this._plugins[pluginID].colorTemperatureSingle(deviceID, value) : null;
    }

    colorTemperatureGroup(id, ids, value) {
        let groupIds = this._getGroupIds(id);

        for (let i of groupIds) {
            let [pluginID, groupID] = this._getParsedActionId(i);

            let origIds = this._getOrigPluginIds(pluginID, ids);
            this._plugins[pluginID].colorTemperatureGroup ? this._plugins[pluginID].colorTemperatureGroup(groupID, origIds, value) : null;
        }
    }

    positionSingle(id, value) {
        let [pluginID, deviceID] = this._getParsedActionId(id);
        this._plugins[pluginID].positionSingle ? this._plugins[pluginID].positionSingle(deviceID, value) : null;
    }

    positionGroup(id, ids, value) {
        let groupIds = this._getGroupIds(id);

        for (let i of groupIds) {
            let [pluginID, groupID] = this._getParsedActionId(i);

            let origIds = this._getOrigPluginIds(pluginID, ids);
            this._plugins[pluginID].positionGroup ? this._plugins[pluginID].positionGroup(groupID, origIds, value) : null;
        }
    }

    upSingle(id) {
        let [pluginID, deviceID] = this._getParsedActionId(id);
        this._plugins[pluginID].upSingle ? this._plugins[pluginID].upSingle(deviceID) : null;
    }

    upGroup(id, ids) {
        let groupIds = this._getGroupIds(id);

        for (let i of groupIds) {
            let [pluginID, groupID] = this._getParsedActionId(i);

            let origIds = this._getOrigPluginIds(pluginID, ids);
            this._plugins[pluginID].upGroup ? this._plugins[pluginID].upGroup(groupID, origIds) : null;
        }
    }

    downSingle(id) {
        let [pluginID, deviceID] = this._getParsedActionId(id);
        this._plugins[pluginID].downSingle ? this._plugins[pluginID].downSingle(deviceID) : null;
    }

    downGroup(id, ids) {
        let groupIds = this._getGroupIds(id);

        for (let i of groupIds) {
            let [pluginID, groupID] = this._getParsedActionId(i);

            let origIds = this._getOrigPluginIds(pluginID, ids);
            this._plugins[pluginID].downGroup ? this._plugins[pluginID].downGroup(groupID, origIds) : null;
        }
    }

    sceneSingle(id, ids) {
        let origDeviceIDs = [];

        let [origPluginID, sceneID] = this._getParsedActionId(id);

        for (let i of ids ) {
            let [pluginID, deviceID] = this._getParsedActionId(i);

            if (pluginID === origPluginID) {
                origDeviceIDs.push(deviceID);
            }
        }

        this._plugins[origPluginID].sceneSingle ? this._plugins[origPluginID].sceneSingle(sceneID, origDeviceIDs) : null;
    };

    sceneGroup(id, ids) {
        let origDeviceIDs = [];

        let [origPluginID, sceneID] = this._getParsedActionId(id);

        for (let i of ids ) {
            let [pluginID, deviceID] = this._getParsedActionId(i);

            if (pluginID === origPluginID) {
                origDeviceIDs.push(deviceID);
            }
        }

        this._plugins[origPluginID].sceneGroup ? this._plugins[origPluginID].sceneGroup(sceneID, origDeviceIDs) : null;
    };
});
