# SPDX-License-Identifier: Apache-2.0
"""Run the published async health client against an in-process aiohttp substitute."""
import asyncio
import json
import time
from importlib.metadata import version
from unittest.mock import patch

if version("flop-sdk") != "0.2.0":
    raise RuntimeError("Expected flop-sdk 0.2.0")

from flop_sdk import FlopClient
from flop_sdk.types import FlopClientOptions

trace = []
start = time.monotonic()


class Response:
    def __init__(self, payload):
        self.payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def json(self):
        return {"jsonrpc": "2.0", "id": 1, "result": self.payload}


class Session:
    def post(self, url, *, json: dict, headers: dict):
        method = json["method"]
        if url != "https://gateway.sdkconf.invalid/rpc":
            raise RuntimeError("Unexpected origin")
        if method not in ("state_getRuntimeVersion", "system_health"):
            raise RuntimeError("Unscripted RPC")
        trace.append({"sequence": len(trace) + 1, "atMs": round((time.monotonic() - start) * 1000, 2),
                      "method": "POST", "url": url, "body": __import__("json").dumps(json),
                      "headers": headers, "status": 200, "responseHeaders": {}, "outcome": "synthetic response"})
        return Response({"specVersion": 1014011} if method == "state_getRuntimeVersion" else
                        {"isSyncing": False, "peers": 2, "shouldHavePeers": True})

    async def close(self):
        pass


async def main():
    with patch("aiohttp.ClientSession", Session):
        async with FlopClient(FlopClientOptions(rpc_url="https://gateway.sdkconf.invalid/rpc")) as client:
            health = await client.health()
    passed = health.peers == 2 and not health.is_syncing and health.should_have_peers
    print(json.dumps({"passed": passed, "trace": trace, "observed":
                      "flop-sdk 0.2.0 returned the synthetic health fields; no socket was opened."}))


asyncio.run(main())
