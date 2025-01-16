'use strict';

/**
 * extension smart-home
 * JavaScript Philips Hue bridge API
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

import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Utils from '../../utils.js';
import * as Avahi from '../../avahi.js';

export const DiscoveryPhilipsHueBridges = GObject.registerClass({
    GTypeName: 'SmartHomeDiscoveryPhilipsHueBridges',
    Signals: {
        'discoverFinished': {},
    }
}, class DiscoveryPhilipsHueBridges extends GObject.Object {

    _init(props={}) {
        super._init(props);
        this.discoveredBridges = [];
    }

    /**
     * Run discover bridges procedures.
     *
     * @method discover
     */
    discover() {
        this.discoverBridgesCloud();
        this.discoverBridgesAvahi();
    }

    /**
     * Add bridge as discovered.
     * 
     * @method _insertDiscoveredBridge
     * @private
     * @param {Object} bridge to be inserted
     */
    _insertDiscoveredBridge(bridge) {
        if (bridge['mac'] === undefined)
            return;

        for (let i in this.discoveredBridges) {
            if (this.discoveredBridges[i]['internalipaddress'] === bridge['internalipaddress']) {
                return;
            }
        }

        this.discoveredBridges.push(bridge);
    }

    /**
     * Get info about bridge on local network.
     * 
     * @method _getBridge
     * @private
     * @param {String} ip address
     * @return {Object} json with bridge info or null
     */
    _getBridge(ip) {
        let bridge = {};
        let session = Soup.Session.new();
        session.timeout = 3;

        let msg = Soup.Message.new('GET', `http://${ip}/api/config`);

        try {
            let bytes = session.send_and_read(msg, null);

            if (msg.status_code !== Soup.Status.OK) {
                return null;
            }

            let decoder = new TextDecoder();
            let data = decoder.decode(bytes.get_data());

            bridge = JSON.parse(data);
        } catch(e) {
            Utils.logError(`Failed to discover info about bridge ${ip}: ${e}`);
            return null;
        }

        return bridge;
    }

    /**
     * Check all bridges on the local network using cloud discovery.
     * 
     * @method discoverBridgesCloud
     * @return {Object} dictionary with bridges in local network
     */
    discoverBridgesCloud() {
        let session = Soup.Session.new();
        session.timeout = 3;

        let msg = Soup.Message.new('GET', 'https://discovery.meethue.com/');

        try {
            let bytes = session.send_and_read(msg, null);

            if (msg.status_code !== Soup.Status.OK) {
                return [];
            }

            let decoder = new TextDecoder();
            let data = decoder.decode(bytes.get_data());

            let discovered = JSON.parse(data);

            for (let i in discovered) {
                let bridge = this._getBridge(discovered[i]['internalipaddress']);
                if (bridge !== null) {
                    bridge['internalipaddress'] = discovered[i]['internalipaddress'];
                    Utils.logDebug(`Bridge ${bridge['name']} dicovered on ip ${bridge['internalipaddress']} via cloud.`);
                    this._insertDiscoveredBridge(bridge);
                }
            }

        } catch(e) {
            Utils.logError(`Failed to discover bridges via cloud: ${e}`);
            return [];
        }
    }

    /**
     * Check all bridges in the local network using avahi discovery.
     * 
     * @method discoverBridgesAvahi
     */
    discoverBridgesAvahi() {
        this._avahi = new Avahi.Avahi({ service: '_hue._tcp'});
        this._avahi.connect(
            'finished',
            () => {
                for (let ip in this._avahi.discovered) {
                    let bridge = this._getBridge(ip);
                    if (bridge !== null) {
                        bridge['internalipaddress'] = ip;
                        Utils.logDebug(`Bridge ${bridge['name']} dicovered on ip ${bridge['internalipaddress']} via avahi.`);
                        this._insertDiscoveredBridge(bridge);
                    }
                }
                this.emit('discoverFinished');
            }
        );
        this._avahi.connect(
            'error',
            () => {
                this.emit('discoverFinished');
            }
        );
        this._avahi.discover();
    }
})

export const RequestType = {
    NO_RESPONSE_NEED: 0,
    CHANGE_OCCURRED: 1,
    ALL_DATA: 2,
    LIGHTS_DATA: 3,
    GROUPS_DATA: 4,
    GROUPZERO_DATA: 5,
    CONFIG_DATA: 6,
    SCHEDULES_DATA: 7,
    SCENES_DATA: 8,
    RULES_DATA: 9,
    SENSORS_DATA: 10,
    RESOURCE_LINKS_DATA: 11,
    ENTERTAIMENT_DATA: 12,
    ENTERTAIMENT_STREAM_ENABLED: 13,
    ENTERTAIMENT_STREAM_DISABLED: 14,
    NEW_USER: 15,
    EVENT: 16
};

const TlsDatabaseBridge = GObject.registerClass({
    Implements: [Gio.TlsFileDatabase],
    Properties: {
        'anchors': GObject.ParamSpec.override('anchors', Gio.TlsFileDatabase),
    },
}, class TlsDatabaseBridge extends Gio.TlsDatabase {

    vfunc_verify_chain(chain, purpose, identity, interaction, flags, cancellable) {
        return 0;
    }
});

const Message = class Message extends Soup.Message {

    constructor(params) {

        super(params);

        this.requestType = RequestType.NO_RESPONSE_NEED;

        Object.assign(this, params);
    }
};

export const PhilipsHueBridge =  GObject.registerClass({
    GTypeName: 'SmartHomePhilipsHueBridgeApi',
    Properties: {
        'ip': GObject.ParamSpec.string('ip', 'ip', 'ip', GObject.ParamFlags.READWRITE, null),
        'username': GObject.ParamSpec.string('username', 'username', 'username', GObject.ParamFlags.READWRITE, null),
        'clientkey': GObject.ParamSpec.string('clientkey', 'clientkey', 'clientkey', GObject.ParamFlags.READWRITE, null),
    },
    Signals: {
        'new-user': {},
        'change-occurred': {},
        'all-data': {},
        'lights-data': {},
        'groups-data': {},
        'group-zero-data': {},
        'config-data': {},
        'schedules-data': {},
        'scenes-data': {},
        'rules-data':{},
        'sensors-data': {},
        'resource-links-data': {},
        'entertainment-data': {},
        'stream-enabled': {},
        'stream-disabled': {},
        'connection-problem': {},
        'event-stream-started': {},
        'event-stream-stopped': {},
        'event-stream-data': {},
    }
}, class PhilipsHueBridge extends GObject.Object {

    _init(props={}) {
        super._init(props);

        this.timers = [];

        this._connected = false;
        this._session = Soup.Session.new();
        this._session.timeout = Utils.PHILIPSHUEBRIDGE_DEFAULT_TIMEOUT;

        let tlsDatabase =  new TlsDatabaseBridge();
        this._session.tls_database  = tlsDatabase;

        this._enableEventStream();
    }

    set ip(value) {
        this._ip = value;
        this._url = `https://${this._ip}/clip/v2`;
        this._eventStreamUrl = `https://${this._ip}/eventstream/clip/v2`;
    }

    get ip() {
        return this._ip;
    }

    set username(value) {
        this._userName = value;
    }

    get username() {
        return this._userName;
    }

    set clientkey(value) {
        this._clientKey = value;
    }
    
    get clientkey() {
        return this._clientKey;
    }

    setConnectionTimeout(value) {
        this._session.timeout = value;
    }

    _POST(url, requestType, data) {

        return this._request("POST", url, requestType, data);
    }

    _PUT(url, requestType, data) {

        return this._request("PUT", url, requestType, data);
    }

    _GET(url, requestType) {

        return this._request("GET", url, requestType, null);
    }

    _parseResponse(method, url, requestType, data) {
        Utils.logDebug(`Philips Hue API: ${method} responded, url: ${url}`);

        try {
            this._connected = true;
            this.data = JSON.parse(data);
        } catch {
            Utils.logDebug(`Philips Hue API: ${method}, url: ${url}, failed to parse JSON.`);
            this.data = [];
            return;
        }

        switch (requestType) {

            case RequestType.CHANGE_OCCURRED:
                this.emit('change-occurred');
                break;

            case RequestType.ALL_DATA:
                this.emit('all-data');
                break;

            case RequestType.NEW_USER:
                if (this.data[0] && this.data[0]['success']) {
                    this.username = this.data[0]['success']['username'];
                    this.clientkey = this.data[0]['success']['clientkey'];
                    this.emit('new-user');
                } else {
                    this.emit('connection-problem');
                }
                break;

            case RequestType.ENTERTAIMENT_DATA:
                this.emit('entertainment-data');
                break;

            case RequestType.ENTERTAIMENT_STREAM_ENABLED:
                this.emit('stream-enabled');
                break;

            case RequestType.ENTERTAIMENT_STREAM_DISABLED:
                this.emit('stream-disabled');
                break;

            case RequestType.EVENT:
                this.emit('event-stream-data');
                break;

            case RequestType.NO_RESPONSE_NEED:
                break;

            default:
                break;
        }
    }

    _request(method, url, requestType, data, counter = 0) {
        if (this._ip === null) {
            Utils.logError(`Philips Hue API is missing IP address.`);
            return;
        }

        if (counter > 2) {
            return;
        }

        Utils.logDebug(`Philips Hue API: ${method} request, url: ${url} data: ${JSON.stringify(data)}`);

        let msg = Message.new(method, url);

        msg.requestType = requestType;

        if (this._userName) {
            msg.request_headers.append("ssl", "False");
            msg.request_headers.append("hue-application-key", this._userName);
        }

        if (data !== null) {
            msg.set_request_body_from_bytes(
                "application/json",
                new GLib.Bytes(JSON.stringify(data))
            );
        }

        this._session.send_and_read_async(
            msg,
            Soup.MessagePriority.NORMAL,
            null,
            (session, res) => {
                let statusCode;
                try {
                    statusCode = msg.get_status();
                } catch {
                    // Soap does not know status code 429, try resend later...
                    Utils.logDebug("Too many requests sent to bridge...");
                    let timerId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT,
                        Math.round((Math.random() * 300) + 100),
                        () => {
                            this._request(method, url, requestType, data, ++counter);

                            this.timers = Utils.removeFromArray(this.timers, timerId);
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                    this.timers.push(timerId);

                    return;
                }
                switch (statusCode) {
                    case Soup.Status.OK:
                        try {
                            const bytes = session.send_and_read_finish(res);
                            let decoder = new TextDecoder();
                            let response = decoder.decode(bytes.get_data());
                            this._parseResponse(method, url, requestType, response);
                        } catch {
                            this._connectionProblem(requestType);
                        }
                        break;
                    case Soup.Status.NONE:
                        break;

                    default:
                    case Soup.Status.CANCELLED:
                        this._connectionProblem(requestType);
                        break;
                }
            }
        );
    }

    async keepEventStreamRequest() {
        let runRequests = false;

        if (! this._eventStreamCancelleable) {
            this._eventStreamCancelleable = new Gio.Cancellable();
            runRequests = true;
        }

        if (this._eventStreamCancelleable.is_cancelled()) {
            this._eventStreamCancelleable.reset();
            runRequests = true;
        }

        if (! runRequests) {
            return;
        }

        while (true) {
            try {
                await this._requestEventStreamData();
            } catch {
                this.stopEventStreamRequest();
                break;
            }
        }
    }

    stopEventStreamRequest() {
        if (! this._sessionEventstream) {
            return;
        }

        if (! this._eventStreamCancelleable) {
            return;
        }

        Utils.logDebug(`Stopping event stream on: ${this._eventStreamUrl}`);

        this._eventStreamCancelleable.cancel();
        this._sessionEventstream.abort();

        this._eventStreamCancelleable = null;

        this.emit('event-stream-stopped');
    }

    _requestEventStreamData() {
        return new Promise((resolve, reject) => {
            let method = "GET";
            let requestType = RequestType.EVENT;

            Utils.logDebug(`Philips Hue event stream: ${method} requested, url: ${this._eventStreamUrl}`);

            let msg = Message.new(method, this._eventStreamUrl);

            msg.requestHueType = requestType;
            msg.request_headers.append("ssl", "False");
            msg.request_headers.append("Accept", "text/event-stream");
            msg.request_headers.append("hue-application-key", this._userName);

            this._eventBuffer = "";

            this._sessionEventstream.send_async(
                msg,
                Soup.MessagePriority.NORMAL,
                this._eventStreamCancelleable,
                async (session, res) => {
                    let statusCode;
                    let inputStream;

                    try {
                        inputStream = session.send_finish(res);
                    } catch {
                        reject(`Failed to get input stream.`);
                    }

                    try {
                        statusCode = msg.get_status();
                    } catch {
                        /* Soap does not know status code 429, try reread... */
                        resolve();
                        return;
                    }

                    switch (statusCode) {
                        case Soup.Status.OK:
                            while (true) {
                                try {
                                    await this._readEventStream(inputStream, requestType);
                                } catch {
                                    reject("Reading event stream ended.");
                                    break;
                                }
                            }
                            break;

                        default:
                        case Soup.Status.NONE:
                        case Soup.Status.CANCELLED:
                            reject(`Event stream ${this._eventStreamUrl} status code ${statusCode}`);
                            break;
                    }
                }
            );
        });
    }

    _readEventStream(inputStream, requestType) {
        return new Promise((resolve, reject) => {
            inputStream.read_bytes_async(
                1024,
                GLib.PRIORITY_DEFAULT,
                this._eventStreamCancelleable,
                (stream, res) => {
                    let bytes;
                    let decoder;
                    let response;
                    try {
                        bytes = stream.read_bytes_finish(res);
                    } catch {
                        reject("Stream reading not finished.");
                        return;
                    }
                    decoder = new TextDecoder();
                    response = decoder.decode(bytes.get_data());

                    this._eventBuffer += response;

                    let messages = this._eventBuffer.split('\n');

                    /* save incomplete message */
                    this._eventBuffer = messages.pop();

                    messages.forEach(message => {
                        /* split by first colon */
                        let msg = message.split(/:(.*)/s);
                        switch (msg[0].trim()) {
                            case 'data':
                                this._parseResponse('GET', this._eventStreamUrl, requestType, msg[1].trim());
                                break;
                            default:
                                break;
                        }
                    });

                    resolve();
                }
            );
        });
    }

    _enableEventStream() {
        if (! this._userName) {
            return;
        }

        if (this._sessionEventstream) {
            return;
        }

        Utils.logDebug(`Enabling event stream on: ${this._eventStreamUrl}`);

        this._sessionEventstream = Soup.Session.new();

        const tlsDatabase = new TlsDatabaseBridge();
        this._sessionEventstream.tls_database  = tlsDatabase;
        this._sessionEventstream.timeout = 0;

        this.emit('event-stream-started');
    }

    getEntertainment() {
        let url = `${this._url}/resource/entertainment_configuration`;
        let requestType = RequestType.ENTERTAIMENT_DATA;

        this._GET(url, requestType)
    }

    enableStream(id, requestType = RequestType.ENTERTAIMENT_STREAM_ENABLED) {
        let url = `${this._url}/resource/entertainment_configuration/${id}`;
        let data = {"action": "start"}

        this._PUT(url, requestType, data)
    }

    disableStream(id, requestType = RequestType.ENTERTAIMENT_STREAM_DISABLED) {
        let url = `${this._url}/resource/entertainment_configuration/${id}`;
        let data = {"action": "stop"}

        this._PUT(url, requestType, data)
    }

    createUser() {
        let username = "";

        let hostname = GLib.get_host_name();
        hostname = hostname.split(".")[0];

        /* trim hostname to evoid too long username */
        if (hostname.length > 10) {
            hostname = hostname.slice(0, 10);
        }

        username = `gnome-smart-home#${hostname}`;

        let data = {
            "devicetype": username,
            "generateclientkey": true
        }

        Utils.logDebug(`New Philips Hue bridge username: ${username}`);

        this._POST(`http://${this._ip}/api`, RequestType.NEW_USER, data)
    }

    getAll() {
        this._GET(`${this._url}/resource`, RequestType.ALL_DATA);
    }

    setLight(id, data, change = true) {
        this._PUT(`${this._url}/resource/light/${id}`, change ? RequestType.CHANGE_OCCURRED : RequestType.NO_RESPONSE_NEED, data)
    }

    setGroup(id, data, change = true) {
        this._PUT(`${this._url}/resource/grouped_light/${id}`, change ? RequestType.CHANGE_OCCURRED : RequestType.NO_RESPONSE_NEED, data)
    }

    setScene(id, data, change = true) {
        this._PUT(`${this._url}/resource/scene/${id}`, change ? RequestType.CHANGE_OCCURRED : RequestType.NO_RESPONSE_NEED, data)
    }

    _connectionProblem(requestType) {
        this.data = [];
        if (! this._connected) {
            return;
        }
        this._connected = false;
        if (requestType !== RequestType.NO_RESPONSE_NEED) {
            this.emit('connection-problem');
        }
    }

    /**
     * Remove timers created by GLib.timeout_add
     * 
     * @method clearTimers
     */
    clearTimers() {
        for (let t of this.timers) {
            if (t) {
                GLib.Source.remove(t);
            }
        }

        this.timers = [];
    }

    clear() {
        this.stopEventStreamRequest();
        this.clearTimers();
    }
});
