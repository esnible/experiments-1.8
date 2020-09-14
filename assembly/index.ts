/////////////////////////////////////////////////////////////////////////
// (c) Copyright 2020 IBM Corp. Licensed Materials - Property of IBM.
/////////////////////////////////////////////////////////////////////////


// See https://github.com/solo-io/proxy-runtime
// See https://github.com/envoyproxy/envoy/blob/master/include/envoy/http/filter.h

// TODO Why does Visual Studio Code object to the following line; note the directory doesn't exist.
export * from "@solo-io/proxy-runtime/proxy"; // this exports the required functions for the proxy to interact with us.
import { RootContext, Context, registerRootContext, 
  FilterHeadersStatusValues, FilterDataStatusValues, GrpcStatusValues,
  stream_context, send_local_response, continue_response,
  HeaderPair, Headers, WasmResultValues, LogLevelValues, log } from "@solo-io/proxy-runtime";
import { get_buffer_bytes, get_status } from "@solo-io/proxy-runtime/runtime";

// TODO REMOVE 418.  It is here for testing.
var failureStatuses = [402, 403, 404, 500, 501, 502, 503, 504, 418];

class ProxyPassRoot extends RootContext {

  // VisualCodeStudio complains about u32.  u32 is declared at 
  createContext(context_id: u32): Context {
      (LogLevelValues.warn, "ProxyPassRoot.createContext(context_id:" + this.context_id.toString() + ")");
    return new ProxyPass(context_id, this);
  }

  onStart(vm_configuration_size: usize): bool { 
    // With the default log levels, only the "warn" reaches the Kubernetes logs.  The context_id will be something like "2"
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPassRoot.onStart(vm_configuration_size:" + vm_configuration_size.toString() + ")");
    return super.onStart(vm_configuration_size);
  }

  onDone(): bool { 
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPassRoot.onDone()");
    return super.onDone();
  }
  onDelete(): void { 
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPassRoot.onDelete()");
    super.onDelete();
  }
}

class ProxyPass extends Context {
  httpStatus: i32 = 0;
  httpFailed: bool = false;
  overrideInProgress: bool = false;
  originalRequestHeaders: Headers = [];
  copiedRequestHeaders: Headers = [];


  constructor(context_id: u32, root_context:ProxyPassRoot){
    super(context_id, root_context);
  }

  // onRequestHeaders sees the regular headers plus :authority, :path, and :method
  onRequestHeaders(header_count: u32, end_of_stream: bool): FilterHeadersStatusValues {
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onRequestHeaders(" + header_count.toString() + ", " + end_of_stream.toString() + ")");

    this.originalRequestHeaders = stream_context.headers.request.get_headers()
    this.copiedRequestHeaders = new Array<HeaderPair>(stream_context.headers.request.get_headers().length)
    var request_headers = stream_context.headers.request.get_headers()
    for (var i = 0; i < request_headers.length; i++) {
      var pair = request_headers[i];
      this.copiedRequestHeaders[i] = request_headers[i];
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ":    " + String.UTF8.decode(pair.key) + ": " + String.UTF8.decode(pair.value));
    }

    this.overrideInProgress = false;

    return super.onRequestHeaders(header_count, end_of_stream)
  }

  // onResponseHeaders sees the regular headers plus :status
  onResponseHeaders(headerCount: u32, end_of_stream: bool): FilterHeadersStatusValues {
    // return super.onResponseHeaders()

    // This logs something like "wasm log: context id: 2: ProxyPass.onResponseHeaders(9, false)"
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders(" + headerCount.toString() + ", " + end_of_stream.toString() + ")");

    // This logs something like "[object ArrayBuffer]:[object ArrayBuffer],[object ArrayBuffer]:[object ArrayBuffer]"
    // log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ":    " + stream_context.headers.response.get_headers().toString());

    var response_headers = stream_context.headers.response.get_headers()
    for (var i = 0; i < response_headers.length; i++) {
      var pair = response_headers[i]
      // This logs something like "[object ArrayBuffer]:[object ArrayBuffer]"
      // log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ":    " + pair.toString());

      // This does what is expected
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ":    " + String.UTF8.decode(pair.key) + ": " + String.UTF8.decode(pair.value));
    }

    if (this.overrideInProgress) {
      // Prevent infinite recursion
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders(" + headerCount.toString() + ", " + end_of_stream.toString() + ") continuing in-progress body override");
      return FilterHeadersStatusValues.Continue;
    }

    // Get HTTP status
    this.httpStatus = <i32>parseInt(stream_context.headers.response.get(":status"));
    this.httpFailed = (failureStatuses.indexOf(this.httpStatus) >= 0);

    if (this.httpFailed) {
      this.overrideInProgress = true

      // TODO verify this isn't JSON according to the headers

      // let cluster = this.root_context.getConfiguration();
      let cluster = "outbound|80||example.com"
      // var cluster = "outbound|8000||httpbin.default.svc.cluster.local";
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() will request replacement body from " + cluster);

      let callHeaders: Headers = [];
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() created callHeaders");

      // let callHeaders = stream_context.headers.request.get_headers()
      callHeaders.push(new HeaderPair(String.UTF8.encode(":method"), String.UTF8.encode("GET")));
      callHeaders.push(new HeaderPair(String.UTF8.encode(":path"), String.UTF8.encode("/")));
      callHeaders.push(new HeaderPair(String.UTF8.encode(":authority"), String.UTF8.encode("example.com")));

      let result = this.root_context.httpCall(cluster,
        callHeaders,
        // no need for body/trailers?
        new ArrayBuffer(0), [],
        // 5 seconds timout
        5000,
        // ourselves as callback
        this,
        // http callback: called when there's a response. if the request failed, headers will be 0
        (origin_context: Context, headerCount: u32, body_size: usize, trailerCount: u32) => {
          log(LogLevelValues.warn, "ProxyPass.onResponseHeaders() in callback!!!");

          let context = origin_context as ProxyPass;

          log(LogLevelValues.warn, "context id: " + origin_context.context_id.toString() + ": ProxyPass httpGet callback(..., " + 
            headerCount.toString() + ", " +
            body_size.toString() + ", " +
            trailerCount.toString() + ")");

          let status = "<none>"
          if (headerCount > 0) {
            status = stream_context.headers.http_callback.get(":status");
          }

          var callback_headers = stream_context.headers.http_callback.get_headers()
          for (var i = 0; i < callback_headers.length; i++) {
            var pair = callback_headers[i]
            log(LogLevelValues.warn, "context id: " + origin_context.context_id.toString() + ":    " + String.UTF8.decode(pair.key) + ": " + String.UTF8.decode(pair.value));
          }
      
          // TODO this isn't working.  I wanted the body, this shows 0 and the empty string
          var swd = get_status();
          log(LogLevelValues.warn, "context id: " + origin_context.context_id.toString() + ": ProxyPass httpGet callback() get_status() got status:\n" + swd.status.toString());
          var body = String.UTF8.decode(swd.data)
          log(LogLevelValues.warn, "context id: " + origin_context.context_id.toString() + ": ProxyPass httpGet callback() get_status() got body:\n" + body);

          // let WasmBufferType_HttpRequestBody = 0
          let WasmBufferType_HttpCallResponseBody = 4
          var abbody = get_buffer_bytes(WasmBufferType_HttpCallResponseBody, 0, <u32>body_size)
          log(LogLevelValues.warn, "context id: " + origin_context.context_id.toString() + "   : ProxyPass httpGet callback() past get_buffer_bytes invocation")
          var body2 = String.UTF8.decode(abbody)
          log(LogLevelValues.warn, "context id: " + origin_context.context_id.toString() + ": ProxyPass httpGet callback() get_buffer_bytes() got body:\n" + body2);

          context.overrideInProgress = false;
          // @@@ TODO real body.  See the note on onResponseBody() about the C++ example doing it.
          var newBody = String.UTF8.encode("Call yielded status " + status + " and a buffer of " + body_size.toString() + " bytes that I don't know how to extract.\n");
          log(LogLevelValues.warn, "@@@ ecs will now send local response 'from' example.com")
          send_local_response(context.httpStatus, 
            // details
            "", 
            newBody, 
            // Additional headers
            [], 
            // status
            GrpcStatusValues.Ok);

            // When I didn't call this, Envoy crashed with
            // envoy assert	assert failure: !state_.codec_saw_local_complete_.
            log(LogLevelValues.warn, "@@@ ecs sent local response; will now attempt to continue")
            continue_response()
            log(LogLevelValues.warn, "@@@ ecs continued response")
      });

      if (result != WasmResultValues.Ok) {
        this.overrideInProgress = false;
        log(LogLevelValues.warn, "ProxyPass.onResponseHeaders() failed http call: " + result.toString());

        var newBody = String.UTF8.encode("Error invoking both real and UI microservice.  Real failed with " + this.httpStatus.toString() + ", invocation of UI failed with " + result.toString() + "\n");
        send_local_response(this.httpStatus, "Failed/WASM", newBody, [], GrpcStatusValues.Unknown);

        log(LogLevelValues.warn, "@@@ ecs sent local response")

        // @@@ TODO restore? return FilterHeadersStatusValues.StopIteration;
      } else {
        log(LogLevelValues.warn, "ProxyPass.onResponseHeaders() succeeded http call: " + result.toString());
      }
      return FilterHeadersStatusValues.StopIteration;

    }
    return FilterHeadersStatusValues.Continue;
  }

  onResponseBody(body_buffer_length: usize, end_of_stream: bool): FilterDataStatusValues {
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseBody(" + body_buffer_length.toString() + ", " + end_of_stream.toString() + ")");
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : when the headers went by, we saw HTTP Status " + this.httpStatus.toString());
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : when the headers went by, we failed: " + this.httpFailed.toString());
    if (!this.overrideInProgress) {
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : an override is in progress");
    } else {
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : no body override now");
    }

    // To see the body itself, there is a C++ example at
    // envoy/envoy-wasm/examples/wasm/envoy_filter_http_wasm_example.cc
    // which does 
    // auto body = getBufferBytes(WasmBufferType::HttpRequestBody, 0, body_buffer_length);
    // LOG_ERROR(std::string("onRequestBody ") + std::string(body->view()));
    // The definition of WasmBufferType::HttpRequestBody is in
    // https://github.com/proxy-wasm/proxy-wasm-cpp-sdk/blob/master/proxy_wasm_common.h
    /*
    let WasmBufferType_HttpRequestBody = 0
    var body = get_buffer_bytes(WasmBufferType_HttpRequestBody, 0, <u32>body_buffer_length)
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : past get_buffer_bytes invocation")
    // log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : has body " + String.UTF8.decode(body))
*/

    // Calls here to send_local_response() trigger another invocation of onResponseHeaders() and
    // onResponseBody(), and infinite recursion is possible.

    // The base class just returns Continue
    // return super.onResponseBody(body_buffer_length, end_of_stream);

    // It is possible to stop, for example returning StopIterationNoBuffer, but nothing will get sent to the
    // client unless continue_response() is called.

    if (!this.overrideInProgress) {
      return FilterDataStatusValues.Continue;
    }

    // Wait until the override is done before using the buffer.
    // This is the only option to not use the buffer
    return FilterDataStatusValues.StopIterationNoBuffer
  }

  onDone(): bool { 
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onDone()");
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : when the headers went by, we saw HTTP Status " + this.httpStatus.toString())
    return super.onDone();
  }
  onDelete(): void { 
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onDelete()");
    super.onDelete();
  }
}

registerRootContext((context_id: u32) => { return new ProxyPassRoot(context_id); }, "experiment-1.8");
