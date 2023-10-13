/*
 * Copyright 2017-2019 Marcel Ball
 * https://github.com/Marus/cortex-debug
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

import * as vscode from 'vscode';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { AddrRange, AddressRangesUtils } from './addrranges';

/** Has utility functions to read memory in chunks into a storage space */
export class MemUtils {
    /**
     * Make one or more memory reads and update values. For the caller, it should look like a single
     * memory read but, if one read fails, all reads are considered as failed.
     *
     * @param startAddr The start address of the memory region. Everything else is relative to `startAddr`
     * @param specs The chunks of memory to read and and update. Addresses should be >= `startAddr`, Can have gaps, overlaps, etc.
     * @param storeTo This is where read-results go. The first element represents item at `startAddr`
     */
    public static async readMemoryChunks(
        session: vscode.DebugSession, startAddr: number, specs: AddrRange[], storeTo: number[]): Promise<Error[]>{
        const errors: Error[] = [];
        for (const spec of specs) {
            const memoryReference = '0x' + spec.base.toString(16);
            const request: DebugProtocol.ReadMemoryArguments = {
                memoryReference,
                count: spec.length
            };

            try {
                const responseBody = await session.customRequest('readMemory', request);
                if (responseBody && responseBody.data) {
                    const bytes = Buffer.from(responseBody.data, 'base64');
                    let dst = spec.base - startAddr;
                    for (const byte of bytes) {
                        storeTo[dst++] = byte;
                    }
                }
            } catch (e: unknown) {
                const err = e ? e.toString() : 'Unknown error';
                errors.push(new Error(`peripheral-viewer: readMemory failed @ ${memoryReference} for ${request.count} bytes: ${err}, session=${session.id}`));
            }
        }
        return errors;

        /*
        const promises = specs.map(async r => {
            try {
                const memoryReference = '0x' + r.base.toString(16);
                const request: DebugProtocol.ReadMemoryArguments = {
                    memoryReference,
                    count: r.length
                };

                const response: Partial<DebugProtocol.ReadMemoryResponse> = {};
                response.body = await session.customRequest('readMemory', request);

                if (response.body && response.body.data) {
                    const bytes = Buffer.from(response.body.data, 'base64');
                    let dst = r.base - startAddr;
                    for (const byte of bytes) {
                        storeTo[dst++] = byte;
                    }
                }

                return true;
            } catch(e) {
                let dst = r.base - startAddr;
                // tslint:disable-next-line: prefer-for-of
                for (let ix = 0; ix < r.length; ix++) {
                    storeTo[dst++] = 0xff;
                }

                throw (e);
            }
        });

        const results = await Promise.all(promises.map((p) => p.catch((e) => e)));
        const errs: string[] = [];
        results.map((e) => {
            if (e instanceof Error) {
                errs.push(e.message);
            }
        });

        if (errs.length !== 0) {
            throw new Error(errs.join('\n'));
        }

        return true;
        */
    }

    public static readMemory(session: vscode.DebugSession, startAddr: number, length: number, storeTo: number[]): Promise<Error[]> {
        const maxChunk = (4 * 1024);
        const ranges = AddressRangesUtils.splitIntoChunks([new AddrRange(startAddr, length)], maxChunk);
        return MemUtils.readMemoryChunks(session, startAddr, ranges, storeTo);
    }

    public static async writeMemory(session: vscode.DebugSession, startAddr: number, value: number, length: number): Promise<boolean> {
        const memoryReference = '0x' + startAddr.toString(16);
        const numbytes = length / 8;
        const bytes = new Uint8Array(numbytes);

        // Assumes little endian?
        value = value >>> 0;
        for (let i = 0; i < numbytes; i++) {
            const byte = value & 0xFF;
            bytes[i] = byte;
            value = value >>> 8;
        }

        const data = Buffer.from(bytes).toString('base64');
        const request: DebugProtocol.WriteMemoryArguments = {
            memoryReference,
            data
        };

        try {
            await session.customRequest('writeMemory', request);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to write @ ${memoryReference}: ${e.toString()}`);
            return false;
        }
        return true;
    }
}
