# AssemblyScript for Istio 1.8

An example of deploying Wasm using Istio 1.8.

![Diagram](diagram.png?raw=true "Diagram of pod, configmap, and envoyfilter")

## Build

To compile the AssemblyScript into _build/untouched.wasm_:

``` bash
npm install
npm run asbuild:untouched
```

## Deploy

First, deploy a pod.  This example uses an _httpbin_ pod, with special annotations to mount WASM files from a ConfigMap into the sidecar.

``` bash
kubectl apply -f deploy/httpbin.yaml
```

To deploy the Wasm compiled above onto that httpbin pod:

``` bash
./deploy/update-wasm.sh
```

## Test

Execute

```bash
kubectl exec -ti deploy/httpbin -c istio-proxy -- curl -v http://httpbin.default:8000/status/418
```

When this is working -- it currently isn't -- we want to see the status 418 and the body from `http://example.com`.

## Troubleshooting

- Ignore `WARNING AS201: Conversion from type 'usize' to 'u32' will require an explicit cast`; this is some problem with the Solo.io runtime.
- Use `istioctl pc log <pod> --level wasm:debug` to turn on debug logging.
  - Turn it off with `istioctl pc log <pod> --level wasm:warning`
- Use `istioctl proxy-status` and verify httpbin isn't **STALE**.
- Verify the mount worked using `kubectl exec deployment/httpbin -c istio-proxy -- ls -l /var/local/wasm`
- Some of the WASM fields in EnvoyFilter are a bit different than in Istio 1.5-1.7.  If you are porting old filters try to make them look like the example here.

## Learn more

- The spec for WebAssembly for Proxies is [here](https://github.com/proxy-wasm/spec).  This documents vNext, not the 0.2.0 used by this example.  There is no documentation for that.
- This project uses the Solo.io [Proxy Runtime](https://github.com/solo-io/proxy-runtime) to give the ABI an object-based feel.
- Both the spec and the AssemblyScript runtime docs are written for advanced Envoy extension developers.  They lack an explanation of what is going on.  See [Solo.io Runtime Issue 24](https://github.com/solo-io/proxy-runtime/issues/24) for links to Envoy docs and C++ header files.
