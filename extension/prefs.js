'use strict';

/**
 * prefs smart-home
 * JavaScript Gnome extension for Smart Home.
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
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SmartHome extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const resource = Gio.Resource.load(GLib.build_filenamev([this.path, 'preferences.gresource']));
        Gio.resources_register(resource);

        window.set_default_size(1024, 768);

        const dummyPage = new Adw.PreferencesPage();
        window.add(dummyPage);

        const { PreferencesPage } = await import('./prefs/prefs_page.js');

        GObject.type_ensure(PreferencesPage);

        window.remove(dummyPage);

        let prefs = new PreferencesPage(
            this.metadata,
            this.dir,
            this.getSettings(),
            this.path
        );
        window.set_default_size(1000, 800);
        window.add(prefs);
    }
}
