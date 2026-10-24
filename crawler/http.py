from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT_SECONDS = 20


class CrawlError(RuntimeError):
    """API 가 정상 응답을 주지 않았다. 대체 데이터로 메우지 않고 크롤링을 멈춘다(fail-loud)."""


def get_json(url: str, params: dict, headers: dict | None = None) -> dict:
    full = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(full, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        # URL 에 키가 들어가는 API(YouTube)가 있으므로 오류에는 경로만 남긴다
        path = urllib.parse.urlparse(url).path
        raise CrawlError(f"{path} → HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}") from None
