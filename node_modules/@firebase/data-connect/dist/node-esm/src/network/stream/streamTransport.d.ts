/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { DataConnectOptions, TransportOptions } from '../../api/DataConnect';
import { AppCheckTokenProvider } from '../../core/AppCheckTokenProvider';
import { Code } from '../../core/error';
import { AuthTokenProvider } from '../../core/FirebaseAuthProvider';
import { AbstractDataConnectTransport, CallerSdkType, DataConnectResponse, SubscribeObserver } from '../transport';
import { DataConnectStreamRequest } from './wire';
/**
 * A promise returned to the user when invoking an operation via {@linkcode AbstractDataConnectStreamTransport.invokeQuery | invokeQuery}
 * or {@linkcode AbstractDataConnectStreamTransport.invokeMutation | invokeMutation} and the functions
 * that resolve/reject it.
 * @internal
 */
export interface InvokeOperationPromise<Data> {
    responsePromise: Promise<DataConnectResponse<Data>>;
    resolveFn: (response: DataConnectResponse<Data>) => void;
    rejectFn: (reason: any) => void;
}
/**
 * The base class for all Stream Transport implementations.
 * Handles management of logical streams (requests), authentication, data routing to query layer,
 * request optimizations, etc.
 * @internal
 */
export declare abstract class AbstractDataConnectStreamTransport extends AbstractDataConnectTransport {
    protected apiKey?: string | undefined;
    protected appId?: (string | null) | undefined;
    protected authProvider?: AuthTokenProvider | undefined;
    protected appCheckProvider?: AppCheckTokenProvider | undefined;
    protected _isUsingGen: boolean;
    protected _callerSdkType: CallerSdkType;
    /** Optional callback invoked when the stream closes (gracefully or fatally). */
    onCloseCallback?: () => void;
    /** True if the physical stream connection is fully open and ready to transmit data. */
    abstract get streamIsReady(): boolean;
    /** Is the stream currently waiting to close connection? */
    get isPendingClose(): boolean;
    /** True if the transport is unable to connect to the server */
    isUnableToConnect: boolean;
    /** True if there are active subscriptions on the stream */
    get hasActiveSubscriptions(): boolean;
    /** True if there are active execute or mutation requests on the stream */
    get hasActiveExecuteRequests(): boolean;
    constructor(options: DataConnectOptions, apiKey?: string | undefined, appId?: (string | null) | undefined, authProvider?: AuthTokenProvider | undefined, appCheckProvider?: AppCheckTokenProvider | undefined, transportOptions?: TransportOptions | undefined, _isUsingGen?: boolean, _callerSdkType?: CallerSdkType);
    /**
     * Register event listeners for browser-specific events like online/offline and visibility changes.
     */
    private registerBrowserEventListeners;
    /**
     * Remove event listeners registered by {@linkcode AbstractDataConnectStreamTransport.registerBrowserEventListeners | registerBrowserEventListeners()}
     * for browser-specific events like online/offline and visibility changes.
     */
    private cleanupBrowserEventListeners;
    /**
     * Disposes of the transport instance, cleaning up event listeners and timers,
     * and closing the connection.
     */
    cleanupAndTerminate(code?: Code, reason?: string): Promise<void>;
    /**
     * Open a physical connection to the server.
     * @returns a promise which resolves when the connection is ready, or rejects if it fails to open.
     */
    protected abstract openConnection(): Promise<void>;
    /**
     * Close the physical connection with the server. Handles no cleanup - simply closes the
     * implementation-specific connection. On failure to close, the connection is still considered closed.
     * @returns a promise which resolves when the connection is closed, or rejects if it fails to close.
     */
    protected abstract closeConnection(): Promise<void>;
    /**
     * Queue a {@linkcode DataConnectStreamRequest} to be sent over the stream.
     * @param requestBody The body of the message to be sent.
     * @throws DataConnectError if sending fails.
     */
    protected abstract sendMessage<Variables>(requestBody: DataConnectStreamRequest<Variables>): Promise<void>;
    /**
     * Ensures that that there is an open connection. If there is none, it initiates a new one.
     * If a connection attempt is already in progress, it returns the existing connection promise.
     * @returns A promise that resolves when the stream is open and ready.
     */
    protected abstract ensureConnection(): Promise<void>;
    /** The Request ID of the next message to be sent. Monotonically increasing sequence number starting at {@linkcode FIRST_REQUEST_ID}. */
    private requestNumber;
    /**
     * Generates and returns the next Request ID. Starts at {@linkcode FIRST_REQUEST_ID} and increments
     * for each request sent.
     */
    private nextRequestId;
    /**
     * Map of query/variables to their active {@linkcode ExecuteStreamRequest} or {@linkcode ResumeStreamRequest}
     * request bodies. These requests are de-duplicated by query/variables so that there is only one active
     * request for each query/variables combination.
     */
    private activeInvokeQueryRequests;
    /**
     * Map of query/variables to the promises returned to the user, for invokeQuery requests which are
     * queued and waiting for active request to resolve.
     */
    private queuedInvokeQueryRequests;
    /**
     * Map of mutation/variables to their active {@linkcode ExecuteStreamRequest} request bodies. Mutations
     * can have more than one active request at a time as they are not idempotent, and therefore should
     * not be de-duplicated.
     */
    private activeInvokeMutationRequests;
    /**
     * Map of query/variables to their active {@linkcode SubscribeStreamRequest} request bodies. There
     * may only be one active request for each query/variables combination.
     */
    private activeInvokeSubscribeRequests;
    /**
     * Map of active {@linkcode ExecuteStreamRequest} RequestIds from {@linkcode invokeQuery} and {@linkcode invokeMutation},
     * and their corresponding {@linkcode InvokeOperationPromise}.
     */
    private executeRequestPromises;
    /**
     * Map of active {@linkcode ResumeStreamRequest} RequestIds from {@linkcode invokeQuery}, and their
     * corresponding {@linkcode InvokeOperationPromise}.
     */
    private resumeRequestPromises;
    /**
     * Map of active {@linkcode invokeSubscribe} RequestIds and their corresponding {@linkcode SubscribeObserver}.
     */
    private subscribeObservers;
    /**
     * Map of subscribe RequestIds to deferred unsubscription requests. Used when a client unsubscribes
     * while a resume request is actively pending.
     */
    private pendingCancellations;
    /** current idle timeout, if any */
    private idleTimeout;
    /** current auth uid. used to detect if a different user logs in */
    private authUid;
    /** Flag to ensure we wait for the initial auth state once per connection attempt. */
    private hasWaitedForInitialAuth;
    /**
     * Tracks an {@linkcode invokeMutation} request, storing the request body and creating and storing a
     * response promise that will be resolved when the response is received.
     * @returns The tracked {@linkcode InvokeOperationPromise}.
     *
     * @remarks
     * This method returns a promise, but is synchronous.
     */
    private trackInvokeMutationRequest;
    /**
     * Tracks an {@linkcode invokeSubscribe} request, storing the request body and the {@linkcode SubscribeObserver}.
     * @remarks
     * This method is synchronous.
     */
    private trackInvokeSubscribeRequest;
    /**
     * Cleans up the query execute request tracking data structures, deleting the tracked request and
     * it's associated promise.
     */
    private cleanupInvokeQueryRequest;
    /**
     * Cleans up the mutation execute request tracking data structures, deleting the tracked request and
     * it's associated promise.
     */
    private cleanupInvokeMutationRequest;
    /**
     * Cleans up the subscribe request tracking data structures, deleting the tracked request and
     * it's associated promise.
     */
    private cleanupInvokeSubscribeRequest;
    /** Delay for next reconnection attempt in ms */
    private reconnectDelayMs;
    /** Timer for reconnection */
    private reconnectTimer;
    /** Number of consecutive reconnection attempts */
    private reconnectAttempts;
    /** Callback to remove online event listener */
    private removeOnlineEventListener;
    /** Callback to remove visibility change event listener */
    private removeVisibilityChangeEventListener;
    /**
     * Short-circuit a reconnection attempt, if one is pending. Triggered when an online event is
     * dispatched.
     */
    onOnlineEventListener: () => void;
    /**
     * Short-circuit a reconnection attempt, if one is pending. Triggered when a visibility change
     * event is dispatched.
     */
    onVisibilityChangeEventListener: () => void;
    /**
     * Cancel reconnecting.
     */
    private cancelReconnect;
    /**
     * Starts the backoff timer for reconnection attempts. We use an exponential backoff with randomized
     * jitter to prevent overwhelming the backend with connection attempts.
     */
    private startReconnectBackoff;
    private attemptReconnect;
    /**
     * Retriggers all active requests on the stream connection - first subscribes, then query executions,
     * and skip mutations. Used after a successful reconnection.
     */
    private retriggerActiveRequests;
    /**
     * Tracks if the next message to be sent is the first message of the stream.
     */
    private isFirstStreamMessage;
    /**
     * Tracks the last auth token sent to the server.
     * Used to detect if the token has changed and needs to be resent.
     */
    private lastSentAuthToken;
    /**
     * Indicates whether we should include the auth token in the next message.
     * Only true if there is an auth token and it is different from the last sent auth token, or this
     * is the first message.
     */
    private get shouldIncludeAuth();
    /**
     * Called by the concrete transport implementation when the physical connection is ready.
     */
    protected onConnectionReady(): void;
    /**
     * Begin closing the connection. Waits for {@linkcode IDLE_CONNECTION_TIMEOUT_MS} without cleaning up
     * any requests (meaning it will not close after the timeout unless the requests are closed first).
     * This is a graceful close - it will be called when there are no more active subscriptions, so
     * there's no need to cleanup.
     */
    private startIdleCloseTimeout;
    /**
     * Cancel closing the connection.
     */
    private cancelClose;
    /**
     * Reject all active execute promises and notify all subscribe observers with the given error.
     * Clear active request tracking maps without cancelling or re-invoking any requests.
     */
    private rejectAllRequests;
    /**
     * Reject all mutation execute promises.
     * Clear active request tracking maps without cancelling or re-invoking any requests.
     */
    private rejectAllMutationsOnReconnect;
    /**
     * Called by concrete implementations when the stream is successfully closed, gracefully or otherwise.
     */
    protected onStreamClose(code: number, reason: string): void;
    /**
     * Prepares a stream request message by adding necessary headers and metadata.
     * If this is the first message on the stream, it includes the resource name, auth token, and App Check token.
     * If the auth token has refreshed since the last message, it includes the new auth token.
     *
     * This method is called by the concrete transport implementation before sending a message.
     *
     * @returns the requestBody, with attached headers and initial request fields
     */
    protected prepareMessage<Variables, StreamBody extends DataConnectStreamRequest<Variables>>(requestBody: StreamBody): StreamBody;
    /**
     * Sends a request message to the server via the concrete implementation.
     * Ensures the connection is ready and prepares the message before sending.
     * @returns A promise that resolves when the request message has been sent.
     */
    private sendRequestMessage;
    /**
     * Helper to generate a consistent string key for the request tracking maps.
     */
    private getMapKey;
    /**
     * Recursively sorts the keys of an object.
     */
    private sortObjectKeys;
    /**
     * @inheritdoc
     * @remarks
     * This method synchronously updates the request tracking data structures before sending any message.
     * If any asynchronous functionality is added to this function, it MUST be done in a way that
     * preserves the synchronous update of the tracking data structures before the method returns.
     */
    invokeQuery<Data, Variables>(queryName: string, variables?: Variables): Promise<DataConnectResponse<Data>>;
    /**
     * Queue a new query execute request to be executed after the currently active query execute
     * request resolves, and track + return a promise associated with the queued request. If there is
     * already a queued request for this mapKey, return the existing queued request's promise instead.
     */
    private queueInvokeQueryRequest;
    /**
     * Executes or resumes a query. Does not check for any active requests which may be overwritten by
     * this request - this should be handled by the caller.
     */
    private executeOrResumeQuery;
    /**
     * When a query invoke request is fulfilled, clean up and trigger the next queued
     * request if one exists.
     */
    private onInvokeQueryRequestFulfilled;
    /**
     * @inheritdoc
     * @remarks
     * This method synchronously updates the request tracking data structures before sending any message.
     * If any asynchronous functionality is added to this function, it MUST be done in a way that
     * preserves the synchronous update of the tracking data structures before the method returns.
     */
    invokeMutation<Data, Variables>(mutationName: string, variables?: Variables): Promise<DataConnectResponse<Data>>;
    /**
     * @inheritdoc
     * @remarks
     * This method synchronously updates the request tracking data structures before sending any message
     * or cancelling the closing of the stream. If any asynchronous functionality is added to this function,
     * it MUST be done in a way that preserves the synchronous update of the tracking data structures
     * before the method returns.
     */
    invokeSubscribe<Data, Variables>(observer: SubscribeObserver<Data>, queryName: string, variables: Variables): void;
    /**
     * @inheritdoc
     * @remarks
     * This method synchronously updates the request tracking data structures before sending any message.
     * If any asynchronous functionality is added to this function, it MUST be done in a way that
     * preserves the synchronous update of the tracking data structures before the method returns.
     */
    invokeUnsubscribe<Variables>(queryName: string, variables: Variables): void;
    /**
     * Cancels a subscription, cleans up the request tracking data structures, and checks to see if we
     * should close the stream due to inactivity.
     */
    private cancelSubscription;
    onAuthTokenChanged(newToken: string | null): void;
    /**
     * Handle a response message from the server. Called by the connection-specific implementation after
     * it's transformed a message from the server into a {@linkcode DataConnectResponse}.
     * @param requestId the Request ID associated with this response.
     * @param response the response from the server.
     */
    protected handleResponse<Data>(requestId: string, response: DataConnectResponse<Data>): Promise<void>;
    /**
     * Handles an invoke operation response, resolving or rejecting the promise returned to the user
     * Does not handle any cleanup for requests - this should be handled by the caller or the promise's
     * finally() block.
     */
    private handleInvokeOperationResponse;
}
