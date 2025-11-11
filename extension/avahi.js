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
import GioUnix from 'gi://GioUnix';

export function isAvahiBrowseInstalled() {
    try {
        let [success, stdout, stderr, exitCode] = GLib.spawn_command_line_sync('which avahi-browse');

        if (success && exitCode === 0 && stdout.length > 0) {
            return true;
        }

        [success, stdout, stderr, exitCode] = GLib.spawn_command_line_sync('avahi-browse --help');

        return success && exitCode === 0;
    } catch {
        return false;
    }
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

        this._pid = null;
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
     * @method discover
     */
    async discover() {
        if(this._pid) {
            return;
        }

        try {

            let [, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
                null,
                ['avahi-browse', this._service, '-r', '-k', '-p', '-t'],
                null,
                GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                () => {
                    /* child_setup can not be null, but we do not need it */
                }
            );

            this._pid = pid;

            GLib.close(stdin);

            let stdoutStream = new Gio.DataInputStream({
                base_stream: new GioUnix.InputStream({
                    fd: stdout,
                    close_fd: true
                }),
                close_base_stream: true
            });

            let stdoutLines = [];
            this._readOutput(stdoutStream, stdoutLines);

            let stderrStream = new Gio.DataInputStream({
                base_stream: new GioUnix.InputStream({
                    fd: stderr,
                    close_fd: true
                }),
                close_base_stream: true
            });

            let stderrLines = [];
            this._readOutput(stderrStream, stderrLines);

            GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, pid, (pid, status) => {
                if (status === 0) {
                    this.emit("finished");
                } else {
                    console.error(new Error(stderrLines.join('\n')));
                }

                stdoutStream.close(null);
                stderrStream.close(null);
                GLib.spawn_close_pid(pid);

                this._pid = null;
            });

        } catch (e) {
            this.error = e;
            this.emit("error");
        }

    }
})