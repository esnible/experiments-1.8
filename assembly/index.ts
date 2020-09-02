/////////////////////////////////////////////////////////////////////////
// (c) Copyright 2020 IBM Corp. Licensed Materials - Property of IBM.
/////////////////////////////////////////////////////////////////////////


// See https://github.com/solo-io/proxy-runtime
// See https://github.com/envoyproxy/envoy/blob/master/include/envoy/http/filter.h

// TODO Why does Visual Studio Code object to the following line; note the directory doesn't exist.
export * from "@solo-io/proxy-runtime/proxy"; // this exports the required functions for the proxy to interact with us.
import { RootContext, Context, registerRootContext,
  FilterHeadersStatusValues, FilterMetadataStatusValues, FilterDataStatusValues, FilterTrailersStatusValues, GrpcStatusValues,
  stream_context, send_local_response,
  HeaderPair, Headers, WasmResultValues, LogLevelValues, log } from "@solo-io/proxy-runtime";
// import { get_current_time_nanoseconds, set_tick_period_milliseconds } from "@solo-io/proxy-runtime/runtime";

// TODO REMOVE: This doesn't work to tell Visual Code Studio about "u32"
// (recommended by https://github.com/AssemblyScript/assemblyscript/issues/390 )
/// <reference path="../node_modules/assemblyscript/index.d.ts" />

// TODO REMOVE 418.  It is here for testing.
var failureStatuses = [402, 403, 404, 500, 501, 502, 503, 504, 418];

class ProxyPassRoot extends RootContext {

  // VisualCodeStudio complains about u32.  u32 is declared at 
  createContext(context_id: u32): Context {
    log(LogLevelValues.warn, "ProxyPassRoot.createContext(context_id:" + this.context_id.toString() + ")");
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
  httpFailed: bool = false

  constructor(context_id: u32, root_context:ProxyPassRoot){
    super(context_id, root_context);
  }

  // onRequestHeaders sees the regular headers plus :authority, :path, and :method
  onRequestHeaders(header_count: u32, end_of_stream: bool): FilterHeadersStatusValues {
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onRequestHeaders(" + header_count.toString() + ", " + end_of_stream.toString() + ")");
    var request_headers = stream_context.headers.request.get_headers()
    for (var i = 0; i < request_headers.length; i++) {
      var pair = request_headers[i]
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ":    " + String.UTF8.decode(pair.key) + ": " + String.UTF8.decode(pair.value));
    }

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

    // Get HTTP status
    this.httpStatus = <i32>parseInt(stream_context.headers.response.get(":status"));
    this.httpFailed = (failureStatuses.indexOf(this.httpStatus) >= 0);

    // TODO verify this isn't JSON according to the headers
    if (this.httpStatus) {
      // let cluster = this.root_context.getConfiguration();
      // let cluster = "http://example.com/"
      let cluster = "outbound|80||example.com"
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() will request replacement body from " + cluster);

      /*
      let callHeaders: Headers = [];
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() created callHeaders");
      // callHeaders.push(new HeaderPair(String.UTF8.encode(":authority"), String.UTF8.encode("example.com")));
      var abPath = String.UTF8.encode(":path");
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() created path ArrayBuffer");
      var abSlash = String.UTF8.encode("/");
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() created slash ArrayBuffer");
      var hpPath: HeaderPair = new HeaderPair(abPath, abSlash);
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() created headerPair");
      callHeaders.push(hpPath);
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() pushed headerPair");
      // callHeaders.push(new HeaderPair(String.UTF8.encode(":path"), String.UTF8.encode("/")));
      var abMethod = String.UTF8.encode(":method");
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() created method ArrayBuffer");
      var abGet = String.UTF8.encode("GET");
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() created get ArrayBuffer");
      var hpMethod: HeaderPair = new HeaderPair(abMethod, abGet);
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() created headerPair");
      callHeaders.push(hpMethod);
      log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseHeaders() pushed headerPair");
      */

      let callHeaders = stream_context.headers.request.get_headers()
      // callHeaders.push(new HeaderPair(String.UTF8.encode(":method"), String.UTF8.encode("GET")));
      // TODO httpCall is not returning, it is logging "critical	envoy wasm	wasm log:  at: ~lib/rt/tlsf.ts(580:3)"
      // which is a checkUsedBlock() assert that a memory block is valid, if I use 
      // callHeaders.push(new HeaderPair(String.UTF8.encode(":method"), String.UTF8.encode("GET")));
      // callHeaders.push(new HeaderPair(String.UTF8.encode(":path"), String.UTF8.encode("/")));
      // callHeaders.push(new HeaderPair(String.UTF8.encode(":authority"), String.UTF8.encode("example.com")));
      // var cluster = "outbound|8000||httpbin.default.svc.cluster.local";
      let result = this.root_context.httpCall(cluster,
        callHeaders,
        // no need for body/trailers?
        new ArrayBuffer(0), [],
        // 5 seconds timout
        5000,
        // ourselves as callback
        this,
        // http callback: called when there's a response. if the request failed, headers will be 0
        (origin_context: Context, headers: u32, body_size: usize, trailers: u32) => {
          log(LogLevelValues.warn, "ProxyPass.onResponseHeaders() in callback!!!");
          /*
          let context = origin_context as ProxyPass;
          let allow = false;

          send_local_response(context.httpStatus, 
            // details
            "", 
            // body
            new ArrayBuffer(0), 
            // Additional headers
            [], 
            // status
            GrpcStatusValues.Ok);
            */
      });

      if (result != WasmResultValues.Ok) {
        log(LogLevelValues.warn, "ProxyPass.onResponseHeaders() failed http call: " + result.toString());

        // send_local_response(500, "internal server error", new ArrayBuffer(0), [], GrpcStatusValues.Internal);

        // @@@ TODO restore? return FilterHeadersStatusValues.StopIteration;
      } else {
        log(LogLevelValues.warn, "ProxyPass.onResponseHeaders() succeeded http call: " + result.toString());
      }
    }
    return FilterHeadersStatusValues.Continue;
  }

  onResponseMetadata(a: u32): FilterMetadataStatusValues {
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseMetadata(" + a.toString() + ")")
    return FilterMetadataStatusValues.Continue;
  }

  onResponseBody(body_buffer_length: usize, end_of_stream: bool): FilterDataStatusValues {
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseBody(" + body_buffer_length.toString() + ", " + end_of_stream.toString() + ")")
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : when the headers went by, we saw HTTP Status " + this.httpStatus.toString())
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : when the headers went by, we failed: " + this.httpFailed.toString())
    // TODO Send a hard coded hello world as the body
    // send_local_response(403, "not authorized", new ArrayBuffer(0), [], GrpcStatusValues.Unknown);
    // The C++ spec https://github.com/proxy-wasm/proxy-wasm-cpp-sdk/blob/master/proxy_wasm_enums.h defines
    // The AssemblyScript spec defines https://github.com/solo-io/proxy-runtime/blob/master/assembly/runtime.ts
    // The meanings are giving in https://github.com/envoyproxy/envoy/blob/master/include/envoy/http/filter.h
    // FilterDataStatusValues.Continue,
    // FilterDataStatusValues.StopIterationAndBuffer
    // FilterDataStatusValues.StopIterationAndWatermark
    // FilterDataStatusValues.StopIterationNoBuffer
    // if (this.httpFailed) {
    //  return FilterDataStatusValues.StopIterationNoBuffer;  
    // }
    return FilterDataStatusValues.Continue;
  }
  onResponseTrailers(s: u32): FilterTrailersStatusValues {
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onResponseTrailers(" + s.toString() + ")")
    return FilterTrailersStatusValues.Continue;
  }
  onDone(): bool { 
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onDone()");
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : when the headers went by, we saw HTTP Status " + this.httpStatus.toString())
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + "   : when the headers went by, we failed: " + this.httpFailed.toString())
    return super.onDone();
  }
  onDelete(): void { 
    log(LogLevelValues.warn, "context id: " + this.context_id.toString() + ": ProxyPass.onDelete()");
    super.onDelete();
  }
}

registerRootContext((context_id: u32) => { return new ProxyPassRoot(context_id); }, "experiment-1.8");
// Note: calling "log()" here causes Envoy to segfault?
