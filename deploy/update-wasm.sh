#!/bin/bash
#
# Copyright 2020 IBM Corporation
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.


# set -x
set -o errexit

SCRIPTDIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

# TODO Make an optional parameter
WASMFILE="$SCRIPTDIR/../build/untouched.wasm"
# TODO Make a required parameter
TARGET=deployment/httpbin
# TODO make a required parameter
FILTERFILE="$SCRIPTDIR/../deploy/httpbin-ef.yaml"

# STEP 1.  Update the 'new-filter' config map holding the WASM
if kubectl get configmap new-filter > /dev/null ; then
    kubectl patch configmap new-filter --type=json --patch="[{\"op\": \"replace\", \"path\": \"/binaryData/new-filter.wasm\", \"value\": \"$(cat "$WASMFILE" | base64)\" }]"
else
    kubectl create configmap new-filter --from-file=new-filter.wasm=build/untouched.wasm
fi

# STEP 2. Wait until the pod has the value from the configmap
echo "Waiting for binary to be loaded upon sidecar"
until diff "$WASMFILE" <(kubectl exec "$TARGET" -c istio-proxy -- cat /var/local/wasm/new-filter.wasm) > /dev/null
do
   sleep 5; echo continuing to wait...
done

echo binary is loaded upon "$TARGET"

# STEP 3. Envoy won't reload .wasm if it changes; but it will if the XDS removes and returns
kubectl delete -f "$FILTERFILE" > /dev/null 2> /dev/null || true
kubectl apply -f "$FILTERFILE"