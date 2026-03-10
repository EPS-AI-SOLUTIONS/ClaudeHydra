// Jaskier Shared Pattern — Web Tools v2 — URL Validation, SSRF, HTTP Fetch, robots.txt, Sitemap

use sha2::{Digest, Sha256};
use std::net::IpAddr;
use std::time::Duration;
use url::Url;

use super::types::*;

const BLOCKED_HEADERS: &[&str] = &[
    "host",
    "authorization",
    "cookie",
    "proxy-authorization",
    "x-forwarded-for",
    "x-real-ip",
    "transfer-encoding",
    "content-length",
    "connection",
    "upgrade",
];

// ═══════════════════════════════════════════════════════════════════════════
//  URL Validation, Normalization & SSRF Prevention (#14, #33, #35)
// ═══════════════════════════════════════════════════════════════════════════

/// Validate URL, check SSRF, normalize
pub fn validate_and_check_url(raw: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw).map_err(|e| format!("Invalid URL '{}': {}", raw, e))?;
    match parsed.scheme() {
        "http" | "https" => {}
        other => return Err(format!("Unsupported scheme '{}' — only http/https", other)),
    }
    if is_ssrf_target(&parsed) {
        return Err(format!(
            "Blocked: URL '{}' targets a private/internal address",
            raw
        ));
    }
    Ok(parsed)
}

/// Normalize URL: strip tracking params, trailing slash, lowercase scheme+host (#14)
pub fn normalize_url(url: &Url) -> String {
    let mut normalized = url.clone();

    // Remove tracking parameters
    if normalized.query().is_some() {
        let pairs: Vec<(String, String)> = normalized
            .query_pairs()
            .filter(|(k, _)| !TRACKING_PARAMS.contains(&k.as_ref()))
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        if pairs.is_empty() {
            normalized.set_query(None);
        } else {
            let mut sorted = pairs;
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            let qs: Vec<String> = sorted
                .iter()
                .map(|(k, v)| {
                    if v.is_empty() {
                        k.clone()
                    } else {
                        format!("{}={}", k, v)
                    }
                })
                .collect();
            normalized.set_query(Some(&qs.join("&")));
        }
    }

    // Remove fragment
    normalized.set_fragment(None);

    let mut s = normalized.to_string();

    // Strip trailing slash (but keep root "/")
    if s.ends_with('/') && s.matches('/').count() > 3 {
        s.pop();
    }

    s
}

/// Check if URL targets a private/internal IP (SSRF prevention) (#33)
fn is_ssrf_target(url: &Url) -> bool {
    let host = match url.host_str() {
        Some(h) => h,
        None => return true,
    };

    // Check IP addresses
    if let Ok(ip) = host.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4) => {
                v4.is_loopback()
                    || v4.is_private()
                    || v4.is_link_local()
                    || v4.is_broadcast()
                    || v4.is_unspecified()
                    || v4.octets()[0] == 100 && v4.octets()[1] >= 64 && v4.octets()[1] <= 127
            }
            IpAddr::V6(v6) => {
                v6.is_loopback() || v6.is_unspecified() || {
                    let seg = v6.segments();
                    (seg[0] & 0xfe00) == 0xfc00 || (seg[0] & 0xffc0) == 0xfe80
                }
                // IPv4-mapped (::ffff:x.x.x.x)
                || match v6.to_ipv4_mapped() {
                    Some(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local()
                        || v4.is_broadcast() || v4.is_unspecified()
                        || (v4.octets()[0] == 169 && v4.octets()[1] == 254),
                    None => false,
                }
            }
        };
    }

    // Check hostnames
    let h = host.to_lowercase();
    h == "localhost"
        || h.ends_with(".local")
        || h.ends_with(".internal")
        || h.ends_with(".localhost")
        || h == "metadata.google.internal"
        || h.contains("169.254.169.254")
}

/// Resolve hostname to IPs and validate against SSRF rules (DNS rebinding prevention).
/// Must be called AFTER `validate_and_check_url` but BEFORE making the HTTP request.
async fn resolve_and_validate_dns(host: &str, port: u16) -> Result<(), String> {
    // Skip for IP literals (already validated by is_ssrf_target)
    if host.parse::<std::net::IpAddr>().is_ok() {
        return Ok(());
    }

    let addrs = tokio::net::lookup_host(format!("{}:{}", host, port))
        .await
        .map_err(|e| format!("DNS resolution failed for '{}': {}", host, e))?;

    for addr in addrs {
        let ip = addr.ip();
        match ip {
            std::net::IpAddr::V4(v4) => {
                if v4.is_loopback()
                    || v4.is_private()
                    || v4.is_link_local()
                    || v4.is_broadcast()
                    || v4.is_unspecified()
                    || (v4.octets()[0] == 169 && v4.octets()[1] == 254)
                {
                    return Err(format!("Blocked: '{}' resolves to private IP {}", host, ip));
                }
            }
            std::net::IpAddr::V6(v6) => {
                if v6.is_loopback() || v6.is_unspecified() {
                    return Err(format!("Blocked: '{}' resolves to private IP {}", host, ip));
                }
                let seg = v6.segments();
                if (seg[0] & 0xfe00) == 0xfc00 || (seg[0] & 0xffc0) == 0xfe80 {
                    return Err(format!("Blocked: '{}' resolves to private IP {}", host, ip));
                }
                if let Some(v4) = v6.to_ipv4_mapped()
                    && (v4.is_loopback()
                        || v4.is_private()
                        || v4.is_link_local()
                        || v4.is_broadcast()
                        || v4.is_unspecified()
                        || (v4.octets()[0] == 169 && v4.octets()[1] == 254))
                {
                    return Err(format!(
                        "Blocked: '{}' resolves to private IPv4-mapped {}",
                        host, ip
                    ));
                }
            }
        }
    }
    Ok(())
}

/// Check if URL is suitable for crawling (not a binary/resource file) (#16)
pub fn is_crawlable_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    // Strip query string for extension check
    let path = lower.split('?').next().unwrap_or(&lower);
    !SKIP_EXTENSIONS.iter().any(|ext| path.ends_with(ext))
}

// ═══════════════════════════════════════════════════════════════════════════
//  robots.txt (#11)
// ═══════════════════════════════════════════════════════════════════════════

pub async fn fetch_robots_txt(
    client: &reqwest::Client,
    base_origin: &str,
    custom_headers: &[(String, String)],
) -> Option<RobotsRules> {
    let robots_url = format!("{}/robots.txt", base_origin);

    // DNS rebinding prevention for robots.txt fetch
    if let Ok(parsed) = Url::parse(&robots_url) {
        let host = parsed.host_str().unwrap_or("");
        let port = parsed.port_or_known_default().unwrap_or(443);
        if resolve_and_validate_dns(host, port).await.is_err() {
            return None;
        }
    }

    let mut req = client
        .get(&robots_url)
        .header("User-Agent", USER_AGENT)
        .timeout(Duration::from_secs(10));
    for (k, v) in custom_headers {
        if BLOCKED_HEADERS.contains(&k.to_lowercase().as_str()) {
            continue;
        }
        req = req.header(k.as_str(), v.as_str());
    }
    let resp = req.send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let text = resp.text().await.ok()?;
    Some(parse_robots_txt(&text))
}

fn parse_robots_txt(text: &str) -> RobotsRules {
    let mut rules = RobotsRules {
        disallowed: Vec::new(),
        allowed: Vec::new(),
        sitemaps: Vec::new(),
        crawl_delay: None,
    };
    let mut in_section = false;

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line_lower = line.to_lowercase();

        if line_lower.starts_with("user-agent:") {
            let agent = line[11..].trim();
            in_section = agent == "*"
                || agent.to_lowercase().contains("jaskier")
                || agent.to_lowercase().contains("bot");
        } else if line_lower.starts_with("disallow:") && in_section {
            let path = line[9..].trim();
            if !path.is_empty() {
                rules.disallowed.push(path.to_string());
            }
        } else if line_lower.starts_with("allow:") && in_section {
            let path = line[6..].trim();
            if !path.is_empty() {
                rules.allowed.push(path.to_string());
            }
        } else if line_lower.starts_with("crawl-delay:") && in_section {
            if let Ok(d) = line[12..].trim().parse::<u64>() {
                rules.crawl_delay = Some(d);
            }
        } else if line_lower.starts_with("sitemap:") {
            let url = line[8..].trim();
            if !url.is_empty() {
                rules.sitemaps.push(url.to_string());
            }
        }
    }
    rules
}

pub fn is_path_allowed(path: &str, rules: &RobotsRules) -> bool {
    // More specific rules win (longer path match)
    let mut allowed_match_len = 0usize;
    let mut disallowed_match_len = 0usize;

    for a in &rules.allowed {
        if path.starts_with(a) && a.len() > allowed_match_len {
            allowed_match_len = a.len();
        }
    }
    for d in &rules.disallowed {
        if path.starts_with(d) && d.len() > disallowed_match_len {
            disallowed_match_len = d.len();
        }
    }

    if disallowed_match_len == 0 {
        return true;
    }
    allowed_match_len >= disallowed_match_len
}

// ═══════════════════════════════════════════════════════════════════════════
//  Sitemap (#12)
// ═══════════════════════════════════════════════════════════════════════════

pub async fn fetch_sitemap_urls(
    client: &reqwest::Client,
    base_origin: &str,
    robots_rules: &Option<RobotsRules>,
    custom_headers: &[(String, String)],
) -> Vec<String> {
    let mut sitemap_locations = Vec::new();

    // From robots.txt
    if let Some(rules) = robots_rules {
        sitemap_locations.extend(rules.sitemaps.clone());
    }

    // Default location
    if sitemap_locations.is_empty() {
        sitemap_locations.push(format!("{}/sitemap.xml", base_origin));
    }

    let mut all_urls = Vec::new();

    for loc in sitemap_locations.iter().take(3) {
        // DNS rebinding prevention for sitemap fetch
        if let Ok(parsed) = Url::parse(loc) {
            let host = parsed.host_str().unwrap_or("");
            let port = parsed.port_or_known_default().unwrap_or(443);
            if resolve_and_validate_dns(host, port).await.is_err() {
                continue;
            }
        }

        let mut req = client
            .get(loc)
            .header("User-Agent", USER_AGENT)
            .timeout(Duration::from_secs(10));
        for (k, v) in custom_headers {
            if BLOCKED_HEADERS.contains(&k.to_lowercase().as_str()) {
                continue;
            }
            req = req.header(k.as_str(), v.as_str());
        }
        if let Ok(resp) = req.send().await
            && resp.status().is_success()
            && let Ok(text) = resp.text().await
        {
            let urls = parse_sitemap_xml(&text);
            // Check if it's a sitemap index (URLs end in .xml)
            let is_index = urls.iter().any(|u| u.ends_with(".xml"));
            if is_index {
                // Fetch first sub-sitemap only
                if let Some(sub_url) = urls.first() {
                    // DNS rebinding prevention for sub-sitemap fetch
                    if let Ok(sub_parsed) = Url::parse(sub_url) {
                        let sub_host = sub_parsed.host_str().unwrap_or("");
                        let sub_port = sub_parsed.port_or_known_default().unwrap_or(443);
                        if resolve_and_validate_dns(sub_host, sub_port).await.is_err() {
                            continue;
                        }
                    }

                    let mut sub_req = client
                        .get(sub_url)
                        .header("User-Agent", USER_AGENT)
                        .timeout(Duration::from_secs(10));
                    for (k, v) in custom_headers {
                        if BLOCKED_HEADERS.contains(&k.to_lowercase().as_str()) {
                            continue;
                        }
                        sub_req = sub_req.header(k.as_str(), v.as_str());
                    }
                    if let Ok(sub_resp) = sub_req.send().await
                        && sub_resp.status().is_success()
                        && let Ok(sub_text) = sub_resp.text().await
                    {
                        all_urls.extend(parse_sitemap_xml(&sub_text));
                    }
                }
            } else {
                all_urls.extend(urls);
            }
        }
    }

    all_urls
}

/// Extract <loc> URLs from sitemap XML (simple string parsing, no XML dep)
fn parse_sitemap_xml(xml: &str) -> Vec<String> {
    let mut urls = Vec::new();
    let mut pos = 0;
    while let Some(start) = xml[pos..].find("<loc>") {
        let start = pos + start + 5;
        if let Some(end) = xml[start..].find("</loc>") {
            let url = xml[start..start + end].trim();
            if !url.is_empty() {
                urls.push(url.to_string());
            }
            pos = start + end + 6;
        } else {
            break;
        }
    }
    urls
}

// ═══════════════════════════════════════════════════════════════════════════
//  HTTP Fetch with Retry (#25, #26, #35, #36, #39, #40, #44)
// ═══════════════════════════════════════════════════════════════════════════

pub async fn fetch_url_with_retry(
    client: &reqwest::Client,
    url: &str,
    custom_headers: &[(String, String)],
) -> Result<FetchResult, String> {
    let parsed = validate_and_check_url(url)?;

    // DNS rebinding prevention: resolve hostname and validate all IPs before connecting
    let host = parsed.host_str().unwrap_or("");
    let port = parsed.port_or_known_default().unwrap_or(443);
    resolve_and_validate_dns(host, port).await?;

    for attempt in 0..=MAX_RETRY_ATTEMPTS {
        let mut req = client
            .get(parsed.as_str())
            .header("User-Agent", USER_AGENT)
            .header("Accept", "text/html,application/xhtml+xml,*/*;q=0.8")
            .header("Accept-Language", "en-US,en;q=0.9,pl;q=0.8")
            .timeout(FETCH_TIMEOUT);

        for (k, v) in custom_headers {
            if BLOCKED_HEADERS.contains(&k.to_lowercase().as_str()) {
                continue;
            }
            req = req.header(k.as_str(), v.as_str());
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();

                // Retry on server errors and 429 (#39)
                if (status.is_server_error() || status.as_u16() == 429)
                    && attempt < MAX_RETRY_ATTEMPTS
                {
                    let delay = if status.as_u16() == 429 {
                        resp.headers()
                            .get("retry-after")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<u64>().ok())
                            .unwrap_or(2u64.pow(attempt))
                    } else {
                        2u64.pow(attempt)
                    };
                    tokio::time::sleep(Duration::from_secs(delay.min(10))).await;
                    continue;
                }

                if !status.is_success() {
                    return Err(format!("HTTP {} for '{}'", status, url));
                }

                // Content-Type check (#16)
                let content_type = resp
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("text/html")
                    .to_string();

                // Content-Length pre-check (#36)
                if let Some(len) = resp.content_length()
                    && len as usize > MAX_PAGE_SIZE
                {
                    return Err(format!(
                        "Response too large: {} bytes (max {})",
                        len, MAX_PAGE_SIZE
                    ));
                }

                let final_url = Url::parse(resp.url().as_str()).unwrap_or(parsed.clone());

                // SSRF: validate final URL after redirects
                if is_ssrf_target(&final_url) {
                    return Err(format!(
                        "Blocked: redirect to private/internal address '{}'",
                        final_url
                    ));
                }

                let bytes = resp
                    .bytes()
                    .await
                    .map_err(|e| format!("Failed to read body from '{}': {}", url, e))?;

                if bytes.len() > MAX_PAGE_SIZE {
                    return Err(format!(
                        "Response too large: {} bytes (max {})",
                        bytes.len(),
                        MAX_PAGE_SIZE
                    ));
                }

                let html = String::from_utf8_lossy(&bytes).to_string();

                return Ok(FetchResult {
                    html,
                    final_url,
                    _status: status.as_u16(),
                    content_type,
                });
            }
            Err(e) => {
                // Retry on transient errors (#39)
                if attempt < MAX_RETRY_ATTEMPTS && (e.is_timeout() || e.is_connect()) {
                    tokio::time::sleep(Duration::from_secs(2u64.pow(attempt))).await;
                    continue;
                }
                return Err(format!("Failed to fetch '{}': {}", url, e));
            }
        }
    }

    Err(format!(
        "Failed to fetch '{}' after {} retries",
        url, MAX_RETRY_ATTEMPTS
    ))
}

// ═══════════════════════════════════════════════════════════════════════════
//  Utility (#18, #47, #50)
// ═══════════════════════════════════════════════════════════════════════════

/// SHA-256 hash of content for duplicate detection (#18, #50)
pub fn content_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Safe UTF-8 text truncation (#47)
pub fn truncate_text(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        return text.to_string();
    }
    text.char_indices()
        .take_while(|(i, _)| *i < max_len)
        .map(|(_, c)| c)
        .collect::<String>()
        + "\u{2026}"
}

// ═══════════════════════════════════════════════════════════════════════════
//  Tool: fetch_webpage
// ═══════════════════════════════════════════════════════════════════════════

pub async fn tool_fetch_webpage(
    input: &serde_json::Value,
    client: &reqwest::Client,
) -> Result<String, String> {
    let url = input
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or("Missing required argument: url")?;
    let extract_links = input
        .get("extract_links")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let extract_meta = input
        .get("extract_metadata")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let include_images = input
        .get("include_images")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let output_format = input
        .get("output_format")
        .and_then(|v| v.as_str())
        .unwrap_or("text");
    let max_text_length = input
        .get("max_text_length")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize);
    let custom_headers: Vec<(String, String)> = input
        .get("headers")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string()))
                .collect()
        })
        .unwrap_or_default();

    let options = ExtractionOptions { include_images };

    let fetch_result = fetch_url_with_retry(client, url, &custom_headers).await?;

    // Check content type (#16)
    if !fetch_result.content_type.contains("text/html")
        && !fetch_result.content_type.contains("application/xhtml")
        && !fetch_result.content_type.contains("text/plain")
    {
        return Err(format!(
            "Not an HTML page: Content-Type is '{}'",
            fetch_result.content_type
        ));
    }

    let text =
        super::html::extract_text_from_html(&fetch_result.html, &fetch_result.final_url, &options);
    let text = if let Some(max_len) = max_text_length {
        truncate_text(&text, max_len)
    } else {
        text
    };

    let metadata = if extract_meta {
        Some(super::html::extract_metadata(
            &fetch_result.html,
            &fetch_result.final_url,
        ))
    } else {
        None
    };

    let links = if extract_links {
        let raw_links =
            super::html::extract_links_from_html(&fetch_result.html, &fetch_result.final_url);
        let domain = fetch_result.final_url.domain().unwrap_or("");
        Some(super::html::categorize_links(
            &raw_links,
            domain,
            fetch_result.final_url.as_ref(),
        ))
    } else {
        None
    };

    match output_format {
        "json" => Ok(super::format_fetch_json(
            &fetch_result.final_url,
            &text,
            metadata.as_ref(),
            links.as_deref(),
        )),
        _ => Ok(super::format_fetch_text(
            &fetch_result.final_url,
            &text,
            metadata.as_ref(),
            links.as_deref(),
        )),
    }
}
