/*
 * dc-lite.js — a tiny standalone renderer for the Design Component (.dc) template
 * format used by these prototype pages. It reads the page's template
 * (<script type="text/x-dc-template">) and logic (<script type="text/x-dc">),
 * and renders them with React 18.
 *
 * Supported: {{path}} holes in text and attributes, <sc-for>, <sc-if>,
 * event attributes (onClick, onChange, onKeyDown, ...), <helmet> head content,
 * and links between pages (*.dc.html → the page map below).
 */
(function () {
  'use strict';
  var R = window.React, RD = window.ReactDOM;
  if (!R || !RD) { document.body.textContent = 'Could not load React. Check your internet connection.'; return; }
  var h = R.createElement, Fragment = R.Fragment;

  // HTML attribute names → React prop names.
  var ATTR = { 'class': 'className', 'for': 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', colspan: 'colSpan', rowspan: 'rowSpan', autocomplete: 'autoComplete', autofocus: 'autoFocus', spellcheck: 'spellCheck', crossorigin: 'crossOrigin', enctype: 'encType', inputmode: 'inputMode', 'accept-charset': 'acceptCharset', 'http-equiv': 'httpEquiv' };
  function camel(s) { return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }
  function propName(nm, inSvg) {
    if (ATTR[nm]) return ATTR[nm];
    if (/^(aria|data)-/.test(nm)) return nm;
    if (inSvg && nm.indexOf('-') > 0) return camel(nm);
    if (inSvg && /^xlink:/.test(nm)) return 'xlink' + nm.charAt(6).toUpperCase() + nm.slice(7);
    return nm;
  }
  var styleCache = {};
  function styleObj(s) {
    if (styleCache[s]) return styleCache[s];
    var o = {};
    s.split(';').forEach(function (decl) {
      var c = decl.indexOf(':'); if (c < 0) return;
      var k = decl.slice(0, c).trim(), v = decl.slice(c + 1).trim(); if (!k) return;
      if (k.indexOf('--') === 0) { o[k] = v; return; }
      k = k.toLowerCase();
      if (/^-ms-/.test(k)) k = k.slice(1);
      k = camel(k.charAt(0) === '-' ? k.slice(1).replace(/^[a-z]/, function (x) { return x.toUpperCase(); }) : k);
      o[k] = v;
    });
    return (styleCache[s] = o);
  }

  // Links between artboards → hosted page names.
  var PAGES = { 'Main.dc.html': 'index.html', 'Portal.dc.html': 'portal.html', 'Review.dc.html': 'review.html', 'Blueprint.dc.html': 'blueprint.html' };

  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
  var RAW = { style: 1, script: 1, textarea: 1, title: 1 };

  var decoder = document.createElement('textarea');
  function decode(s) { if (s.indexOf('&') < 0) return s; decoder.innerHTML = s; return decoder.value; }

  // ---- Parser: strict HTML (every element closed, attributes quoted) ----
  function parse(src) {
    var root = { tag: '#root', name: '#root', attrs: [], children: [] };
    var stack = [root], i = 0, n = src.length;
    var reTag = /[a-zA-Z][\w:.-]*/y, reAttr = /[^\s=>\/]+/y, reUnq = /[^\s>]+/y, reWs = /\s*/y;
    function ws() { reWs.lastIndex = i; reWs.exec(src); i = reWs.lastIndex; }
    while (i < n) {
      var top = stack[stack.length - 1];
      if (src.charCodeAt(i) === 60 /* < */) {
        if (src.startsWith('<!--', i)) { var ce = src.indexOf('-->', i + 4); i = ce < 0 ? n : ce + 3; continue; }
        if (src[i + 1] === '/') {
          var e = src.indexOf('>', i); var cname = src.slice(i + 2, e).trim().toLowerCase();
          for (var k = stack.length - 1; k > 0; k--) { if (stack[k].tag === cname) { stack.length = k; break; } }
          i = e + 1; continue;
        }
        if (src[i + 1] === '!') { i = src.indexOf('>', i) + 1; continue; }
        reTag.lastIndex = i + 1;
        var m = reTag.exec(src);
        if (m) {
          var name = m[0], tag = name.toLowerCase(), attrs = [], selfClose = false;
          i = reTag.lastIndex;
          for (;;) {
            ws();
            if (i >= n) break;
            if (src[i] === '>') { i++; break; }
            if (src[i] === '/' && src[i + 1] === '>') { i += 2; selfClose = true; break; }
            reAttr.lastIndex = i; var am = reAttr.exec(src);
            if (!am) { i++; continue; }
            var an = am[0]; i = reAttr.lastIndex; ws();
            var val = null;
            if (src[i] === '=') {
              i++; ws();
              var q = src[i];
              if (q === '"' || q === "'") { var qe = src.indexOf(q, i + 1); val = src.slice(i + 1, qe); i = qe + 1; }
              else { reUnq.lastIndex = i; var um = reUnq.exec(src); val = um ? um[0] : ''; i = reUnq.lastIndex; }
            }
            attrs.push({ name: an, value: val == null ? '' : decode(val), bare: val == null });
          }
          var node = { tag: tag, name: name, attrs: attrs, children: [] };
          top.children.push(node);
          if (RAW[tag] && !selfClose) {
            var lower = src.toLowerCase(), re = lower.indexOf('</' + tag, i);
            if (re < 0) re = n;
            var raw = src.slice(i, re);
            if (raw) node.children.push(tag === 'style' || tag === 'script' ? raw : decode(raw));
            i = src.indexOf('>', re) + 1 || n;
          } else if (!VOID[tag] && !selfClose) {
            stack.push(node);
          }
          continue;
        }
      }
      var next = src.indexOf('<', i + 1);
      if (next < 0) next = n;
      top.children.push(decode(src.slice(i, next)));
      i = next;
    }
    return root;
  }

  // ---- Holes ----
  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  function compileStr(s) {
    var parts = [], last = 0, m;
    HOLE.lastIndex = 0;
    while ((m = HOLE.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      parts.push({ p: m[1] });
      last = HOLE.lastIndex;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  }
  function look(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (path === 'undefined' || path === '') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(path)) return +path;
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var ks = path.split('.'), v = scope[ks[0]];
    for (var k = 1; k < ks.length; k++) { if (v == null) return undefined; v = v[ks[k]]; }
    return v;
  }
  function str(v) { return v == null || v === false || v === true ? '' : String(v); }
  function evalParts(parts, scope, raw) {
    if (raw && parts.length === 1 && typeof parts[0] === 'object') return look(parts[0].p, scope);
    var out = '';
    for (var k = 0; k < parts.length; k++) out += typeof parts[k] === 'string' ? parts[k] : str(look(parts[k].p, scope));
    return out;
  }

  // ---- Compile the parsed tree once into render functions ----
  function compileNode(node, inSelect, inSvg) {
    if (typeof node === 'string') {
      if ((inSelect || inSvg) && !node.trim()) return null;
      if (node.indexOf('{{') < 0) return function () { return node; };
      var tp = compileStr(node);
      return function (scope) { return evalParts(tp, scope, false); };
    }
    var tag = node.tag, attrMap = {};
    node.attrs.forEach(function (a) { attrMap[a.name] = a; });
    var svg = inSvg || tag === 'svg';
    var kids = compileKids(node.children, inSelect || tag === 'select', svg);

    if (tag === 'sc-for') {
      var lp = compileStr((attrMap.list || {}).value || ''), as = (attrMap.as || {}).value || 'item';
      return function (scope) {
        var list = evalParts(lp, scope, true);
        if (!Array.isArray(list)) return null;
        return list.map(function (it, idx) {
          var s = Object.create(scope); s[as] = it; s.$index = idx;
          return h(Fragment, { key: idx }, kids(s));
        });
      };
    }
    if (tag === 'sc-if') {
      var vp = compileStr((attrMap.value || {}).value || '');
      return function (scope) { return evalParts(vp, scope, true) ? kids(scope) : null; };
    }

    var props = [];
    node.attrs.forEach(function (a) {
      var nm = a.name;
      if (/^hint-/.test(nm)) return;
      var isStyle = nm === 'style';
      nm = propName(nm, svg);
      if (a.bare) { props.push({ n: nm, c: true }); return; }
      var v = a.value;
      if (nm === 'href' && PAGES[v.split('#')[0]]) v = PAGES[v.split('#')[0]] + (v.indexOf('#') >= 0 ? v.slice(v.indexOf('#')) : '');
      if (v.indexOf('{{') < 0) { props.push({ n: nm, c: isStyle ? styleObj(v) : v }); return; }
      props.push({ n: nm, parts: compileStr(v), ev: /^on[A-Z]/.test(nm), style: isStyle });
    });
    var hasChange = node.attrs.some(function (a) { return /^on(Change|Input)$/.test(a.name); });
    // textarea text content → value
    var taText = null;
    if (tag === 'textarea' && !attrMap.value && node.children.length) taText = compileStr(node.children.join(''));
    var name = node.name;

    return function (scope) {
      var p = {};
      for (var k = 0; k < props.length; k++) {
        var pr = props[k];
        if ('c' in pr) { p[pr.n] = pr.c; continue; }
        var v = evalParts(pr.parts, scope, !pr.style);
        if (pr.ev && typeof v !== 'function') continue;
        p[pr.n] = pr.style ? styleObj(v) : v;
      }
      if (taText) p.value = evalParts(taText, scope, false);
      if ((tag === 'input' || tag === 'textarea' || tag === 'select') && 'value' in p && p.value == null) p.value = '';
      // Bound but with no change handler: display-only, like the original runtime.
      if (!hasChange && (tag === 'input' || tag === 'textarea') && ('value' in p || 'checked' in p)) p.readOnly = true;
      if (tag === 'textarea' || VOID[tag]) return h(name, p);
      return h(name, p, kids(scope));
    };
  }
  function compileKids(children, inSelect, inSvg) {
    var fns = [];
    children.forEach(function (c) { var f = compileNode(c, inSelect, inSvg); if (f) fns.push(f); });
    if (!fns.length) return function () { return null; };
    if (fns.length === 1) return fns[0];
    // Static positions: spread as separate children so React needs no keys.
    return function (scope) { return h.apply(null, [Fragment, null].concat(fns.map(function (f) { return f(scope); }))); };
  }

  // ---- Mount ----
  var tplEl = document.getElementById('dc-template');
  var logicEl = document.getElementById('dc-logic');
  var tree = parse(tplEl.textContent);
  var xdc = null;
  (function find(nd) { if (xdc || typeof nd === 'string') return; if (nd.tag === 'x-dc') { xdc = nd; return; } nd.children.forEach(find); })(tree);
  xdc = xdc || tree;

  var body = [];
  xdc.children.forEach(function (c) {
    if (c.tag === 'helmet') {
      c.children.forEach(function (hc) {
        if (typeof hc === 'string') return;
        var el = document.createElement(hc.tag);
        hc.attrs.forEach(function (a) { el.setAttribute(a.name, a.value); });
        if (hc.children.length) el.textContent = hc.children.join('');
        document.head.appendChild(el);
      });
    } else body.push(c);
  });
  var renderBody = compileKids(body, false, false);

  var defaults = {};
  try {
    var dp = JSON.parse(logicEl.getAttribute('data-props') || '{}');
    Object.keys(dp).forEach(function (k) { if (k.charAt(0) !== '$' && dp[k] && 'default' in dp[k]) defaults[k] = dp[k]['default']; });
  } catch (e) {}

  class DCLogic extends R.Component {
    renderVals() { return {}; }
    render() { return renderBody(this.renderVals() || {}); }
  }

  var Comp = new Function('DCLogic', logicEl.textContent + '\n;return Component;')(DCLogic);
  RD.createRoot(document.getElementById('app')).render(h(Comp, defaults));
})();
