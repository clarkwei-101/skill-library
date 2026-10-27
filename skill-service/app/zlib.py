"""z-library search guidance.

MVP scope: we never scrape z-library.  We return a guidance payload plus
ready-to-open search URLs for the well known mirrors, and we record whether a
session cookie has been configured in the environment.

If a ``ZLIB_COOKIE`` is present the service is "cookie configured"; the
cookie itself is never echoed back to the client and never leaves the
process.  A future version may use it to perform a real authenticated
lookup behind the same contract.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote_plus

from . import config

COOKIE_PRESENT = bool(config.ZLIB_COOKIE)

# Path templates for the mirrors.  ``{q}`` is the URL-encoded query.
_SEARCH_PATHS = (
    "/s/{q}",
    "/search/{q}",
)


def _search_urls(query: str) -> list[dict[str, str]]:
    encoded = quote_plus(query)
    urls: list[dict[str, str]] = []
    for mirror in config.ZLIB_MIRRORS:
        for path in _SEARCH_PATHS:
            url = f"{mirror}{path.format(q=encoded)}"
            urls.append({"url": url, "mirror": mirror, "path": path.format(q=encoded)})
            break  # one canonical search path per mirror
    return urls


def guidance_payload(query: str) -> dict[str, Any]:
    """Return the guidance document describing how to search z-library."""
    return {
        "name": "Z-Library Search",
        "summary": (
            "按书名或作者搜索 Z-Library 资源。本 MVP 不进行任何抓取，"
            "只返回可直接打开的搜索链接与操作指引。"
        ),
        "steps": [
            {
                "step": 1,
                "title": "规范化关键词",
                "detail": (
                    "去掉书名中的标点与副标题噪音，保留作者名以便缩小范围。"
                    "例如《深入理解计算机系统》→ 深入理解计算机系统 Randal Bryant。"
                ),
            },
            {
                "step": 2,
                "title": "选择语言与年份",
                "detail": (
                    "在搜索结果页按语言（中文/英文/双语）、出版年份、"
                    "文件格式（PDF/EPUB/MOBI）过滤。"
                ),
            },
            {
                "step": 3,
                "title": "校验版本",
                "detail": (
                    "优先选择扫描质量高、目录完整、带书签的版本；"
                    "技术类书籍注意勘误表与版次。"
                ),
            },
            {
                "step": 4,
                "title": "导入本服务",
                "detail": (
                    "下载后通过 POST /api/convert/upload 上传，"
                    "服务会抽取正文并生成可检索的技能包。"
                ),
            },
        ],
        "queryTemplate": "https://z-lib.gs/s/{query}",
        "tips": [
            "书名加作者名可显著提升命中率。",
            "英文原版对技术类书籍的检索结果通常优于中译本。",
            "若某个镜像无法打开，直接切换到返回的其它镜像链接。",
        ],
        "notes": (
            "本服务不代理、不镜像、不绕过任何访问限制，"
            "所有下载行为都由用户在其浏览器中自行完成。"
        ),
    }


def search(query: str) -> dict[str, Any]:
    """Build the search response for ``query``."""
    query = (query or "").strip()
    if not query:
        return {
            "query": "",
            "status": "empty",
            "message": "缺少查询参数 q",
            "guidance": guidance_payload(""),
            "results": [],
            "links": [],
            "cookieConfigured": COOKIE_PRESENT,
        }

    links = _search_urls(query)

    return {
        "query": query,
        "status": "ok",
        "scraped": False,
        "message": (
            "MVP 模式：返回搜索指引与直达链接，不执行任何抓取。"
        ),
        "guidance": guidance_payload(query),
        "results": [],
        "links": links,
        "mirrors": list(config.ZLIB_MIRRORS),
        "cookieConfigured": COOKIE_PRESENT,
        "cookieNote": (
            "已配置 ZLIB_COOKIE（仅记录存在性，不会回传或外发）"
            if COOKIE_PRESENT
            else "未配置 ZLIB_COOKIE，按匿名模式提供链接"
        ),
    }
