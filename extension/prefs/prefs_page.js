'use strict';

/**
 * prefs smart-home
 * JavaScript Gnome extension Smart Home - preference page.
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
import GObject from 'gi://GObject';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as Utils from './../utils.js';
import * as Semaphore from './../semaphore.js';


export const PreferencesPage = GObject.registerClass({
    GTypeName: 'SmartHomePrefsPage',
    Template: 'resource:///org/gnome/Shell/Extensions/smart-home/ui/prefs_page.ui',
    InternalChildren: [
        'preferencesPage',
    ],
}, class PreferencesPage extends Adw.PreferencesPage {

    _init(metadata, mainDir, settings, path) {
        super._init();
        this.metadata = metadata;
        this.mainDir = mainDir;
        this._settings = settings;
        this._settingsLoaded = {};
        this.path = path;
        this._prefsPlugins = {};
        this._initialized = false;
        this._semaphore = new Semaphore.Semaphore(1);

        this._settings.connect("changed", () => {
            if (! this._initialized) {
                return;
            }

            this.readSettings();
            this._semaphore.callFunction(this.updatePreferences.bind(this));
        });

        this.readSettings();
        this.initPreferences();
    }

    async initPreferences() {
        const { PreferencesMain } = await import('./prefs_main.js');
        GObject.type_ensure(PreferencesMain);

        this._prefsMain = new PreferencesMain(this.metadata, this.mainDir, this._settings, this.path);
        this._preferencesPage.add(this._prefsMain);

        await this.updatePreferences();
        this._initialized = true;
    }

    readSettings() {
        this._settingsLoaded[Utils.SETTINGS_FORCE_ENGLISH] = this._settings.get_boolean(Utils.SETTINGS_FORCE_ENGLISH);
        this._settingsLoaded[Utils.SETTINGS_REMEMBER_OPENED_SUBMENU] = this._settings.get_boolean(Utils.SETTINGS_REMEMBER_OPENED_SUBMENU);
        this._settingsLoaded[Utils.SETTINGS_REDUCED_PADDING] = this._settings.get_boolean(Utils.SETTINGS_REDUCED_PADDING);
        this._settingsLoaded[Utils.SETTINGS_DEBUG] = this._settings.get_boolean(Utils.SETTINGS_DEBUG);
        this._settingsLoaded[Utils.SETTINGS_ICONPACK] = this._settings.get_enum(Utils.SETTINGS_ICONPACK);

        for (let pluginName of Utils.PLUGIN_LIST) {
            this._settingsLoaded[pluginName] = this._settings.get_value(pluginName).deep_unpack();
        }

        Utils.setDebug(this._settingsLoaded[Utils.SETTINGS_DEBUG]);
    }

    async updatePreferences() {
        await this._prefsMain.updateUI(this._settingsLoaded, this._preferencesPage);
    }
});

