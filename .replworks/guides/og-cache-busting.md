# OG URL cache busting

The development-only `og-bust` middleware appends a cache-busting query parameter to Open Graph URLs in served HTML. This makes the URL different; it does not clear or purge Kakao's cache for the original URL. A changed preview is not guaranteed. Kakao's response to an unchanged or parameter-modified URL is an external behavior and is recorded by the live share probe in T-006.

## Canonical URL

Open Graph defines `og:url` as the object's canonical URL and permanent ID. If the middleware changes `og:url`, the shared object's URL identity changes as well. The middleware does not change a page's separate `<link rel="canonical">`. Decide whether both should identify the parameterized URL or whether the `og:url` variation is intentionally temporary, and verify the rendered metadata before sharing. Crawlers can apply their own canonicalization behavior; a `rel="canonical"` declaration is a signal, not a guarantee that every consumer will treat URLs identically.

References: [Open Graph protocol](https://ogp.me/), [Google Search canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization).

## Analytics

The cache-busting parameter is part of the URL query string. Analytics systems may expose URLs with query strings separately; for example, GA4 has a “Landing page + query string” dimension. If reports should combine these visits with the stable page URL, exclude or normalize the cache-busting parameter in the analytics setup. Check the actual analytics configuration because query handling differs by tool.

Reference: [GA4 landing page report](https://support.google.com/analytics/answer/12931766).
