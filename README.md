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

To deploy the Wasm compiled above onto that pod pod:

``` bash
./deploy/update-wasm.sh
```

## Test

Execute

```bash
kubectl exec -ti deploy/httpbin -c istio-proxy -- curl -v http://httpbin.default:8000/status/418
```

When this is working -- it currently isn't -- we want to see the status 418 and the body from http://example.com .

## Troubleshooting

- Ignore `WARNING AS201: Conversion from type 'usize' to 'u32' will require an explicit cast`; this is some problem with the Solo.io runtime.
- Use `istioctl proxy-status` and verify httpbin isn't **STALE**.
- Verify the mount worked using `kubectl exec deployment/httpbin -c istio-proxy -- ls -l /var/local/wasm`
