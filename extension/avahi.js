'use strict';

/**
 * avahi
 * JavaScript Avahi mDNS discovery.
 * The code depends on avahi-browse installed.
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
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export function isAvahiBrowseInstalled() {
    return GLib.find_program_in_path('avahi-browse') !== null;
}

/**
 * https://gjs.guide/guides/gio/subprocesses.html#asynchronous-communication
 * 
 * @class Avahi
 * @constructor
 * @return {Object} object
 */
export const Avahi = GObject.registerClass({
    GTypeName: "SmartHomeAvahi",
    Properties: {
        "service": GObject.ParamSpec.string("service", "service", "service", GObject.ParamFlags.READWRITE, null),
    },
    Signals: {
        "service-found": {},
        "finished": {},
        "error": {},
    }
}, class Avahi extends GObject.Object {

    /**
     * Avahi class initialization
     * 
     * @method _init
     * @private
     */
    _init(props={}) {
        super._init(props);

        this._subprocess = null;
        this.error = null;

        this.discovered = {};
        this.discoverdHostname = null;
        this.discoverdIp = null;
        this.discoverdPort = null;
    }

    set service(value) {
        this._service = value;
    }

    get service() {
        return this._service;
    }

    /**
     * Parse line of text into discovered device.
     * 
     * @method _parseLine
     * @param {String} line to parse 
     * @private
     */
    _parseLine(line) {
        if (line === null) {
            return;
        }

        line = line.split(";");

        if (line.length > 9) {

            if (line[2] !== "IPv4") {
                return;
            }

            this.discoverdHostname = line[6];
            this.discoverdIp = line[7];
            this.discoverdPort = line[8];

            this.discovered[this.discoverdIp] = { "hostname": this.discoverdHostname, "port": this.discoverdPort };

            this.emit("service-found");
        }
    }

    /**
     * Reads command output.
     * 
     * @method _readOutput
     * @param {Object} stream 
     * @param {Array} lineBuffer 
     * @private
     */
    _readOutput(stream, lineBuffer) {
        stream.read_line_async(0, null, (stream, res) => {
            try {
                let line = stream.read_line_finish_utf8(res)[0];

                if (line !== null) {
                    this._parseLine(line);

                    lineBuffer.push(line);
                    this._readOutput(stream, lineBuffer);
                }
            } catch (e) {
                console.error(e);
            }
        });
    }

    /**
     * Discover mDNS devices via avahi-browse.
     * Emits signal when finished.
     *
     * Uses Gio.Subprocess instead of GLib.spawn_async_with_pipes because
     * the latter is wrapped by GNOME Shell to throw when a child setup
     * function is passed (and it is not async-signal-safe).
     *
     * @method discover
     */
    async discover() {
        if (this._subprocess) {
            return;
        }

        try {
            this._subprocess = Gio.Subprocess.new(
                ['avahi-browse', this._service, '-r', '-k', '-p', '-t'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            this.error = e;
            this._subprocess = null;
            this.emit("error");
            return;
        }

        let stdoutStream = new Gio.DataInputStream({
            base_stream: this._subprocess.get_stdout_pipe(),
            close_base_stream: true
        });

        this._readOutput(stdoutStream, []);

        this._subprocess.wait_async(null, (proc, res) => {
            let succeeded = false;

            try {
                proc.wait_finish(res);
                succeeded = proc.get_successful();
            } catch (e) {
                this.error = e;
            }

            try {
                stdoutStream.close(null);
            } catch (e) {
                console.error(e);
            }

            this._subprocess = null;

            if (succeeded) {
                this.emit("finished");
            } else {
                this.emit("error");
            }
        });
    }
})