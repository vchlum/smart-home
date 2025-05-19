'use strict';

/**
 * prefs smart-home
 * JavaScript Smart home prefs
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

import * as SmartHomeAddNotification from './prefs_add_notification.js';
import * as SmartHomeDeviceLight from './prefs_device_light.js';
import * as Utils from '../utils.js';

export const notifSplitter = ':::';

export const NotificationItem = GObject.registerClass({
    Properties: {
        name: GObject.ParamSpec.string('name', 'name', 'name', GObject.ParamFlags.READWRITE, ''),
        id: GObject.ParamSpec.string('id', 'id', 'id', GObject.ParamFlags.READWRITE, ''),
        brightness: GObject.ParamSpec.boolean('brightness', 'brightness', 'brightness', GObject.ParamFlags.READWRITE, false),
        color: GObject.ParamSpec.boolean('color', 'color', 'color', GObject.ParamFlags.READWRITE, false)
    },
}, class NotificationItem extends GObject.Object {});

export function createNotificationLight(widget, notifId, id, title, brightness, color) {
        let device = new SmartHomeDeviceLight.SmartHomeDeviceLight(
            'light',
            id,
            title,
            brightness,
            color,
            true,
            true
        );

        device.setUI(
            widget._notificationSettings[notifId]
        );

        device.connect(
            'state-changed',
            (object) => {
                widget._notificationSettings[notifId] = object.state;

                widget._pluginSettings[widget._id]['notification'] = JSON.stringify(widget._notificationSettings);
                widget._writeDevicesSettings();
            }
        );

        device.connect(
            'delete-me',
            (object) => {
                delete(widget._notificationSettings[notifId]);
                widget._pluginSettings[widget._id]['notification'] = JSON.stringify(widget._notificationSettings);
                widget._writeDevicesSettings();

                widget._devicesNotification.remove(object);
            }
        );

        return device;
    }

export function addNotificationDialog(widget) {
    let stringList = new Gio.ListStore();
    for (let i of widget._notificationDeviceList) {
        stringList.append(
            new NotificationItem({ name: i.title, id: i.id , brightness: i.brightness, color: i.color })
        );
    }

    let notificationDialog = new SmartHomeAddNotification.SmartHomeAddNotification(
        stringList
    );

    notificationDialog.connect(
        'added',
        (object) => {
            let notifId = `${object.state['id']}${notifSplitter}${Utils.getUuid()}`;

            widget._notificationSettings[notifId] = object.state;

            widget._pluginSettings[widget._id]['notification'] = JSON.stringify(widget._notificationSettings);
            widget._writeDevicesSettings();

            let light = createNotificationLight(
                widget,
                notifId,
                object.state['id'],
                object.state['name'],
                object.state['brightness'] !== undefined,
                object.state['color'] !== undefined
            );

            widget._devicesNotification.add_row(light);

            notificationDialog.close();
        }
    );

    notificationDialog.present(widget);
}