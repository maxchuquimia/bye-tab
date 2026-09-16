const DEFAULTS = {
  enabled: true,
  seconds: 5,
  patterns: [],
  pauseWhenHidden: false,
};

function escapeRegExp(text) {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function wildcard(text, star) {
  return text.split('*').map(escapeRegExp).join(star);
}

// Each part of the URL gets its own wildcard so a pattern can't match a site
// that only mentions the target domain, like `https://other.test/?next=https://example.com/`.
function patternToRegExp(pattern) {
  const trimmed = pattern.trim();
  if (!trimmed) return null;

  const schemeEnd = trimmed.indexOf('://');
  const scheme = schemeEnd === -1 ? '*' : trimmed.slice(0, schemeEnd);
  const rest = schemeEnd === -1 ? trimmed : trimmed.slice(schemeEnd + 3);
  const pathStart = rest.indexOf('/');
  const host = pathStart === -1 ? rest : rest.slice(0, pathStart);
  const path = pathStart === -1 ? '' : rest.slice(pathStart);

  let hostSource;
  if (/^\*+$/.test(host)) {
    // A bare `*` host means any site, including whatever path follows it.
    hostSource = '.*';
  } else if (!path && host.endsWith('*')) {
    // `example.com*` with no path should still cover every page on the site.
    hostSource = wildcard(host.slice(0, -1), '[^/?#]*') + '.*';
  } else {
    hostSource = wildcard(host, '[^/?#]*');
  }

  const source =
    (scheme === '*' ? '[a-z][a-z0-9+.-]*' : wildcard(scheme, '[a-z0-9+.-]*')) +
    '://' +
    hostSource +
    wildcard(path, '.*');
  return new RegExp('^' + source + '$', 'i');
}

function matchesAny(url, patterns) {
  return patterns.some((pattern) => patternToRegExp(pattern)?.test(url));
}
