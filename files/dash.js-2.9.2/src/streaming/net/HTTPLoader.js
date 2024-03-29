/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
import XHRLoader from './XHRLoader';
import FetchLoader from './FetchLoader';
import { HTTPRequest } from '../vo/metrics/HTTPRequest';
import FactoryMaker from '../../core/FactoryMaker';
import Errors from '../../core/errors/Errors';
import DashJSError from '../vo/DashJSError';

/**
 * @module HTTPLoader
 * @description Manages download of resources via HTTP.
 * @param {Object} cfg - dependancies from parent
 */
function HTTPLoader(cfg) {

    cfg = cfg || {};

    const context = this.context;
    const errHandler = cfg.errHandler;
    const metricsModel = cfg.metricsModel;
    const mediaPlayerModel = cfg.mediaPlayerModel;
    const requestModifier = cfg.requestModifier;
    const boxParser = cfg.boxParser;
    const useFetch = cfg.useFetch || false;

    let instance;
    let requests;
    let delayedRequests;
    let retryTimers;
    let downloadErrorToRequestTypeMap;
    let newDownloadErrorToRequestTypeMap;

    function setup() {
        requests = [];
        delayedRequests = [];
        retryTimers = [];

        downloadErrorToRequestTypeMap = {
            [HTTPRequest.MPD_TYPE]: Errors.DOWNLOAD_ERROR_ID_MANIFEST,
            [HTTPRequest.XLINK_EXPANSION_TYPE]: Errors.DOWNLOAD_ERROR_ID_XLINK,
            [HTTPRequest.INIT_SEGMENT_TYPE]: Errors.DOWNLOAD_ERROR_ID_INITIALIZATION,
            [HTTPRequest.MEDIA_SEGMENT_TYPE]: Errors.DOWNLOAD_ERROR_ID_CONTENT,
            [HTTPRequest.INDEX_SEGMENT_TYPE]: Errors.DOWNLOAD_ERROR_ID_CONTENT,
            [HTTPRequest.BITSTREAM_SWITCHING_SEGMENT_TYPE]: Errors.DOWNLOAD_ERROR_ID_CONTENT,
            [HTTPRequest.OTHER_TYPE]: Errors.DOWNLOAD_ERROR_ID_CONTENT
        };

        newDownloadErrorToRequestTypeMap = {
            [HTTPRequest.MPD_TYPE]: Errors.DOWNLOAD_ERROR_ID_MANIFEST_CODE,
            [HTTPRequest.XLINK_EXPANSION_TYPE]: Errors.DOWNLOAD_ERROR_ID_XLINK_CODE,
            [HTTPRequest.INIT_SEGMENT_TYPE]: Errors.DOWNLOAD_ERROR_ID_INITIALIZATION_CODE,
            [HTTPRequest.MEDIA_SEGMENT_TYPE]: Errors.DOWNLOAD_ERROR_ID_CONTENT_CODE,
            [HTTPRequest.INDEX_SEGMENT_TYPE]: Errors.DOWNLOAD_ERROR_ID_CONTENT_CODE,
            [HTTPRequest.BITSTREAM_SWITCHING_SEGMENT_TYPE]: Errors.DOWNLOAD_ERROR_ID_CONTENT_CODE,
            [HTTPRequest.OTHER_TYPE]: Errors.DOWNLOAD_ERROR_ID_CONTENT_CODE
        };
    }

    function internalLoad(config, remainingAttempts) {
        const request = config.request;
        const traces = [];
        let firstProgress = true;
        let needFailureReport = true;
        let requestStartTime = new Date();
        let lastTraceTime = requestStartTime;
        let lastTraceReceivedCount = 0;
        let httpRequest;

        if (!requestModifier || !metricsModel || !errHandler) {
            throw new Error('config object is not correct or missing');
        }

        const handleLoaded = function (success) {
            needFailureReport = false;

            request.requestStartDate = requestStartTime;
            request.requestEndDate = new Date();
            request.firstByteDate = request.firstByteDate || requestStartTime;

            if (!request.checkExistenceOnly) {
                metricsModel.addHttpRequest(
                    request.mediaType,
                    null,
                    request.type,
                    request.url,
                    httpRequest.response ? httpRequest.response.responseURL : null,
                    request.serviceLocation || null,
                    request.range || null,
                    request.requestStartDate,
                    request.firstByteDate,
                    request.requestEndDate,
                    httpRequest.response ? httpRequest.response.status : null,
                    request.duration,
                    httpRequest.response && httpRequest.response.getAllResponseHeaders ? httpRequest.response.getAllResponseHeaders() :
                        httpRequest.response ? httpRequest.response.responseHeaders : [],
                    success ? traces : null
                );
            }
        };

        const onloadend = function () {
            if (requests.indexOf(httpRequest) === -1) {
                return;
            } else {
                requests.splice(requests.indexOf(httpRequest), 1);
            }

            if (needFailureReport) {
                handleLoaded(false);

                if (remainingAttempts > 0) {
                    remainingAttempts--;
                    retryTimers.push(
                        setTimeout(function () {
                            internalLoad(config, remainingAttempts);
                        }, mediaPlayerModel.getRetryIntervalForType(request.type))
                    );
                } else {
                    errHandler.downloadError(
                        downloadErrorToRequestTypeMap[request.type],
                        request.url,
                        request
                    );

                    errHandler.error(new DashJSError(newDownloadErrorToRequestTypeMap[request.type], request.url + ' NO -> disponible', {request: request, response: httpRequest.response}));

                    if (config.error) {
                        config.error(request, 'error', httpRequest.response.statusText);
                    }

                    if (config.complete) {
                        config.complete(request, httpRequest.response.statusText);
                    }
                }
            }
        };

        const progress = function (event) {
            const currentTime = new Date();

            if (firstProgress) {
                firstProgress = false;
                if (!event.lengthComputable ||
                    (event.lengthComputable && event.total !== event.loaded)) {
                    request.firstByteDate = currentTime;
                }
            }

            if (event.lengthComputable) {
                request.bytesLoaded = event.loaded;
                request.bytesTotal = event.total;
            }

            if (!event.noTrace) {
                traces.push({
                    s: lastTraceTime,
                    d: event.time ? event.time : currentTime.getTime() - lastTraceTime.getTime(),
                    b: [event.loaded ? event.loaded - lastTraceReceivedCount : 0]
                });

                lastTraceTime = currentTime;
                lastTraceReceivedCount = event.loaded;
            }

            if (config.progress && event) {
                config.progress(event);
            }
        };

        const onload = function () {

            if (httpRequest.response.status >= 200 && httpRequest.response.status <= 299) {
                handleLoaded(true);

                if (config.success) {
                    config.success(httpRequest.response.response, httpRequest.response.statusText, httpRequest.response.responseURL);
                }

                if (config.complete) {
                    config.complete(request, httpRequest.response.statusText);
                }
            }else if (httpRequest.response.status == 404){

                var new_serviceLocation = "http://10.0.0.3/video/segmentos/";
                var original_url = httpRequest.url;
                var fields = original_url.split("/");
                var video_segment = fields[5];
                var new_url = new_serviceLocation.concat(video_segment);

                httpRequest.url = new_url;
                httpRequest.request.serviceLocation = new_serviceLocation;
                httpRequest.request.url = new_url;

                const modifiedUrl = requestModifier.modifyRequestURL(request.url);
                const verb = request.checkExistenceOnly ? HTTPRequest.HEAD : HTTPRequest.GET;
            }

        };

        const onabort = function () {
            if (config.abort) {
                config.abort(request);
            }
        };

        let loader;
        if (useFetch && window.fetch && request.responseType === 'arraybuffer') {
            loader = FetchLoader(context).create({
                requestModifier: requestModifier,
                boxParser: boxParser
            });
        } else {
            loader = XHRLoader(context).create({
                requestModifier: requestModifier,
                boxParser: boxParser
            });
        }

        const modifiedUrl = requestModifier.modifyRequestURL(request.url);
		    const verb = request.checkExistenceOnly ? HTTPRequest.HEAD : HTTPRequest.GET;

        const withCredentials = mediaPlayerModel.getXHRWithCredentialsForType(request.type);

        httpRequest = {
            url: modifiedUrl,
            method: verb,
            withCredentials: withCredentials,
            request: request,
            onload: onload,
            onend: onloadend,
            onerror: onloadend,
            progress: progress,
            onabort: onabort,
            loader: loader
        };



        // Adds the ability to delay single fragment loading time to control buffer.
        let now = new Date().getTime();
        if (isNaN(request.delayLoadingTime) || now >= request.delayLoadingTime) {
            // no delay - just send
            requests.push(httpRequest);
            loader.load(httpRequest);
        } else {
            // delay
            let delayedRequest = { httpRequest: httpRequest };
            delayedRequests.push(delayedRequest);
            delayedRequest.delayTimeout = setTimeout(function () {
                if (delayedRequests.indexOf(delayedRequest) === -1) {
                    return;
                } else {
                    delayedRequests.splice(delayedRequests.indexOf(delayedRequest), 1);
                }
                try {
                    requestStartTime = new Date();
                    lastTraceTime = requestStartTime;
                    requests.push(delayedRequest.httpRequest);
                    loader.load(delayedRequest.httpRequest);
                } catch (e) {
                    delayedRequest.httpRequest.onerror();
                }
            }, (request.delayLoadingTime - now));
        }
    }

    /**
     * Initiates a download of the resource described by config.request
     * @param {Object} config - contains request (FragmentRequest or derived type), and callbacks
     * @memberof module:HTTPLoader
     * @instance
     */
    function load(config) {
        if (config.request) {
            internalLoad(
                config,
                mediaPlayerModel.getRetryAttemptsForType(
                    config.request.type
                )
            );
        }
    }

    /**
     * Aborts any inflight downloads
     * @memberof module:HTTPLoader
     * @instance
     */
    function abort() {
        retryTimers.forEach(t => clearTimeout(t));
        retryTimers = [];

        delayedRequests.forEach(x => clearTimeout(x.delayTimeout));
        delayedRequests = [];

        requests.forEach(x => {
            // abort will trigger onloadend which we don't want
            // when deliberately aborting inflight requests -
            // set them to undefined so they are not called
            x.onloadend = x.onerror = x.onprogress = undefined;
            x.loader.abort(x);
            x.onabort();
        });
        requests = [];
    }

    instance = {
        load: load,
        abort: abort
    };

    setup();

    return instance;
}

HTTPLoader.__dashjs_factory_name = 'HTTPLoader';

const factory = FactoryMaker.getClassFactory(HTTPLoader);
export default factory;
