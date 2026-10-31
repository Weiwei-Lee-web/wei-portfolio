/* wei-runtime.js — a small standalone renderer for the portfolio page.
 * Renders the page template (holes, <sc-for>, <sc-if>, events) with React 18 and drives the page
 * logic class (renderVals / setState / lifecycle), so the published site needs no editor runtime.
 * The template rules mirror the Design canvas format the page was authored in, so the site behaves
 * exactly like the board on the canvas.
 */
(function () {
  'use strict';
  var R = window.React, RD = window.ReactDOM, h = R.createElement, Frag = R.Fragment;

  /* ---------- expressions: {{ a.b }}, {{ !x }}, {{ a === 'b' }}, literals ---------- */
  var ID = /^[A-Za-z_$][A-Za-z0-9_$]*/, NUM = /^-?\d+(\.\d+)?$/;
  function wrapped(e) { var d = 0; for (var i = 0; i < e.length - 1; i++) { if (e[i] === '(') d++; else if (e[i] === ')') { d--; if (d === 0) return false; } } return true; }
  function findEq(t) {
    var d = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (c === '[' || c === '(') d++;
      else if (c === ']' || c === ')') d--;
      else if (d === 0 && (c === '=' || c === '!') && t[i + 1] === '=') {
        if ((i > 0 && (t[i - 1] === '=' || t[i - 1] === '!')) || !t.slice(0, i).trim()) continue;
        return { index: i, op: t[i + 2] === '=' ? c + '==' : c + '=' };
      }
    }
    return null;
  }
  function path(scope, s) {
    var m = s.match(ID); if (!m) return undefined;
    var v = scope == null ? undefined : scope[m[0]], i = m[0].length;
    while (i < s.length) {
      if (s[i] === '.') {
        var k = s.slice(i + 1).match(ID) || s.slice(i + 1).match(/^\d+/);
        if (!k) return undefined;
        v = v == null ? undefined : v[k[0]]; i += 1 + k[0].length;
      } else if (s[i] === '[') {
        var d = 1, j = i + 1;
        for (; j < s.length && d > 0; j++) { if (s[j] === '[') d++; else if (s[j] === ']') { d--; if (d === 0) break; } }
        if (d !== 0) return undefined;
        var key = ev(scope, s.slice(i + 1, j));
        v = v == null ? undefined : v[key]; i = j + 1;
      } else return undefined;
    }
    return v;
  }
  function ev(scope, src) {
    var e = String(src).trim();
    if (!e) return undefined;
    if (e[0] === '(' && e[e.length - 1] === ')' && wrapped(e)) return ev(scope, e.slice(1, -1));
    var q = findEq(e);
    if (q) {
      var a = ev(scope, e.slice(0, q.index)), b = ev(scope, e.slice(q.index + q.op.length));
      switch (q.op) { case '===': return a === b; case '!==': return a !== b; case '==': return a == b; default: return a != b; }
    }
    if (e[0] === '!') return !ev(scope, e.slice(1));
    if (e === 'true') return true;
    if (e === 'false') return false;
    if (e === 'null') return null;
    if (e === 'undefined') return undefined;
    if (NUM.test(e)) return Number(e);
    if (e.length >= 2 && (e[0] === '"' || e[0] === "'") && e[e.length - 1] === e[0]) return e.slice(1, -1);
    return path(scope, e);
  }
  function getter(text) {
    var whole = text.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (whole) { var x = whole[1]; return function (s) { return ev(s, x); }; }
    if (text.indexOf('{{') >= 0) {
      var parts = text.split(/\{\{([\s\S]+?)\}\}/g);
      return function (s) { return parts.map(function (p, i) { if (!(i & 1)) return p; var v = ev(s, p); return v == null ? '' : v; }).join(''); };
    }
    return function () { return text; };
  }

  /* ---------- template preprocessing (keep camelCase attributes through the HTML parser) ---------- */
  var CAMEL = 'sc-camel-';
  var RAW = { select: 'sc-raw-select', table: 'sc-raw-table', tbody: 'sc-raw-tbody', thead: 'sc-raw-thead', tfoot: 'sc-raw-tfoot', tr: 'sc-raw-tr', td: 'sc-raw-td', th: 'sc-raw-th', caption: 'sc-raw-caption' };
  var UNRAW = {}; Object.keys(RAW).forEach(function (k) { UNRAW[RAW[k]] = k; });
  var ATTRS = "(?:=\\s*\"[^\"]*\"|=\\s*'[^']*'|=(?!\\s*[\"'])|[^>=])*";
  var TAG = new RegExp("(<!---?>|<!--[\\s\\S]*?--!?>)|(<(script|style|textarea|title)(?=[\\s/>])" + ATTRS + ">)([\\s\\S]*?<\\/\\3(?=[\\s/>])[^>]*>)|<[a-zA-Z][^\\s/>]*(?=[\\s/>])" + ATTRS + ">", 'gi');
  var CAMEL_ATTR = /=\s*"[^"]*"|=\s*'[^']*'|(\s)([a-z]+[A-Z][A-Za-z0-9]*)(?=\s*=)/g;
  function keepCamel(t) {
    var fix = function (tag) { return tag.replace(CAMEL_ATTR, function (m, sp, name) { return name === undefined ? m : sp + CAMEL + name.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }); };
    return t.replace(TAG, function (m, comment, open, tagname, rest) { return comment !== undefined ? m : open ? fix(open) + rest : fix(m); });
  }
  function prep(t) {
    t = t.replace(/<(x-import|dc-import)((?:[^>"']|"[^"]*"|'[^']*')*)\/>/gi, function (m, a, b) { return '<' + a + b + '></' + a + '>'; });
    t = t.replace(/<helmet(\s|>)/gi, '<sc-helmet$1').replace(/<\/helmet\s*>/gi, '</sc-helmet>');
    t = keepCamel(t);
    Object.keys(RAW).forEach(function (k) { t = t.replace(new RegExp('(</?)' + k + '(?=[\\s>])', 'gi'), '$1' + RAW[k]); });
    return t;
  }
  function camel(s) { return s.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); }); }
  function cssName(p) {
    if (p.indexOf('--') === 0 || !/[a-z][A-Z]/.test(p)) return p;
    if (p === 'cssFloat') return 'float';
    var n = p.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); });
    return /^(webkit|moz|ms|o)-/.test(n) ? '-' + n : n;
  }
  function styleObj(t) {
    var o = {};
    t.split(';').forEach(function (d) { var i = d.indexOf(':'); if (i < 0) return; var k = d.slice(0, i).trim(); o[k.indexOf('--') === 0 ? k : camel(k)] = d.slice(i + 1).trim(); });
    return o;
  }
  /* normalise property names in an inline style string (camelCase -> kebab-case), leaving values alone */
  var WS = /[ \t\n\r\f]/, PROP = /-{0,2}[A-Za-z_][A-Za-z0-9_-]*/y, BAD = /^(?:behavior|-moz-binding)$/i;
  function normCss(t) {
    var out = '', i = 0, depth = 0, atDecl = true, n = t.length;
    while (i < n) {
      if (atDecl) {
        var a = i; while (a < n && WS.test(t[a])) a++;
        if (t[a] === '/' && t[a + 1] === '*') { var ce = t.indexOf('*/', a + 2), cz = ce < 0 ? n : ce + 2; out += t.slice(i, cz); i = cz; continue; }
        atDecl = false; PROP.lastIndex = a; var m = PROP.exec(t);
        if (m) {
          var l = a + m[0].length;
          for (;;) { while (l < n && WS.test(t[l])) l++; if (t[l] !== '/' || t[l + 1] !== '*') break; var c2 = t.indexOf('*/', l + 2); l = c2 < 0 ? n : c2 + 2; }
          if (t[l] === ':') { var nm = cssName(m[0]); out += t.slice(i, a) + (BAD.test(nm) ? m[0] : nm); i = a + m[0].length; continue; }
        }
      }
      var ch = t[i];
      if (ch === '"' || ch === "'") { var b = i + 1; while (b < n && t[b] !== ch) b += t[b] === '\\' ? 2 : 1; out += t.slice(i, b + 1); i = b + 1; continue; }
      if (ch === '/' && t[i + 1] === '*') { var e2 = t.indexOf('*/', i + 2), z = e2 < 0 ? n : e2 + 2; out += t.slice(i, z); i = z; continue; }
      if (ch === '\\') { out += t.slice(i, i + 2); i += 2; continue; }
      if (ch === '(' || ch === '{' || ch === '[') depth++; else if (ch === ')' || ch === '}' || ch === ']') depth = Math.max(0, depth - 1); else if (ch === ';' && depth === 0) atDecl = true;
      out += ch; i++;
    }
    return out;
  }
  /* inline style strings are written straight to element.style (only when the string changes), so
     properties set from script (e.g. el.style.setProperty) survive re-renders */
  var styleRefs = new Map();
  function noStyle() {}
  function styleRef(css) {
    if (css == null) return noStyle; /* no inline style in the template: leave element.style to script */
    var k = 'css:' + css;
    var f = styleRefs.get(k);
    if (f) return f;
    f = function (el) {
      if (!el || el.__weiCss === k) return;
      el.__weiCss = k;
      var st = el.style;
      st.cssText = css ? normCss(css) : '';
      for (var i = st.length; i-- > 0;) {
        var p = st[i]; if (!st.getPropertyPriority(p)) continue;
        var v = st.getPropertyValue(p); if (v) st.setProperty(p, v); if (st.getPropertyPriority(p)) st.removeProperty(p);
      }
    };
    if (styleRefs.size > 4096) styleRefs.clear();
    styleRefs.set(k, f);
    return f;
  }

  var BOOL = new Set('allowFullScreen async autoFocus autoPlay checked controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden itemScope loop multiple muted noModule noValidate open playsInline readOnly required reversed scoped seamless selected'.split(' '));
  var EVT = { onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onsubmit: 'onSubmit', onkeydown: 'onKeyDown', onkeyup: 'onKeyUp', onkeypress: 'onKeyPress', onmousedown: 'onMouseDown', onmouseup: 'onMouseUp', onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave', onfocus: 'onFocus', onblur: 'onBlur', ondoubleclick: 'onDoubleClick', oncontextmenu: 'onContextMenu', onmousemove: 'onMouseMove', onmouseover: 'onMouseOver', onmouseout: 'onMouseOut', onpointerdown: 'onPointerDown', onpointerup: 'onPointerUp', onpointermove: 'onPointerMove', onpointerenter: 'onPointerEnter', onpointerleave: 'onPointerLeave', onpointercancel: 'onPointerCancel', ontouchstart: 'onTouchStart', ontouchend: 'onTouchEnd', ontouchmove: 'onTouchMove', ontransitionend: 'onTransitionEnd', onanimationend: 'onAnimationEnd' };
  var INLINE = 'a abbr b bdi bdo br cite code del dfn em i ins kbd mark q s samp small span strike strong sub sup u var wbr'.split(' ');
  var NOT_INLINE = ':not(' + INLINE.join(',') + ')';
  var NOHASH = new Set('script style textarea option title select canvas iframe video audio'.split(' '));
  function shapeHash(el) {
    var c = el.cloneNode(true);
    c.querySelectorAll('*').forEach(function (x) { while (x.attributes.length) x.removeAttribute(x.attributes[0].name); });
    var s = c.innerHTML, hsh = 5381;
    for (var i = 0; i < s.length; i++) hsh = ((hsh << 5) + hsh + s.charCodeAt(i)) | 0;
    return s.length + '.' + (hsh >>> 0).toString(36);
  }

  /* ---------- compile template nodes to render functions ---------- */
  function compileKids(node) { var out = []; node.childNodes.forEach(function (c) { var f = compileNode(c); if (f) out.push(f); }); return out; }
  function compileNode(n) {
    if (n.nodeType === 3) return compileText(n);
    if (n.nodeType !== 1) return null;
    var tag = n.tagName.toLowerCase();
    if (tag === 'sc-for') return compileFor(n);
    if (tag === 'sc-if') return compileIf(n);
    if (tag === 'sc-helmet') return null; /* helmet content is already in <head> */
    return compileEl(n);
  }
  function compileText(n) {
    var t = n.nodeValue || '';
    if (t.indexOf('{{') < 0) return !t.trim() && t.indexOf(' ') < 0 ? null : function () { return t; };
    var parts = t.split(/\{\{([\s\S]+?)\}\}/g);
    return function (s, host, key) {
      return h.apply(null, [Frag, { key: key }].concat(parts.map(function (p, i) {
        if (!(i & 1)) return p;
        var v = ev(s, p);
        if (v === undefined || v === null || typeof v === 'boolean') return null;
        if (R.isValidElement(v) || Array.isArray(v)) return h(Frag, { key: i }, v);
        return h('span', { key: i, className: 'sc-interp' }, String(v));
      })));
    };
  }
  function compileFor(n) {
    var list = getter(n.getAttribute('list') || ''), as = n.getAttribute('as') || 'item', kids = compileKids(n);
    return function (s, host, key) {
      var arr = list(s); if (!Array.isArray(arr)) arr = [];
      return h(Frag, { key: key }, arr.map(function (it, i) {
        var sc = Object.assign({}, s); sc[as] = it; sc.$index = i;
        return h(Frag, { key: i }, kids.map(function (f, k) { return f(sc, host, k); }));
      }));
    };
  }
  function compileIf(n) {
    var val = getter(n.getAttribute('value') || ''), kids = compileKids(n);
    return function (s, host, key) { return val(s) ? h(Frag, { key: key }, kids.map(function (f, k) { return f(s, host, k); })) : null; };
  }
  function compileEl(n) {
    var tag = UNRAW[n.localName] || n.localName;
    var tpl = n.getAttribute('data-dc-tpl');
    var hashable = n.childNodes.length > 0 && !NOHASH.has(tag) && n.querySelector(NOT_INLINE) === null;
    var props = [];
    Array.prototype.slice.call(n.attributes).forEach(function (a) {
      var name = a.name, val = a.value;
      if (name === 'sc-name' || name === 'data-dc-tpl') return;
      if (name.indexOf(CAMEL) === 0) name = camel(name.slice(CAMEL.length));
      if (name === 'hint-size') return;
      if (name === 'class') name = 'className';
      else if (name === 'for') name = 'htmlFor';
      else if (name.indexOf('on') === 0) name = EVT[name] || ('on' + name[2].toUpperCase() + name.slice(3));
      else if (name === 'checked' && tag === 'input' && val.indexOf('{{') < 0) { props.push(['defaultChecked', function () { return true; }]); return; }
      else if (val === '' && BOOL.has(name)) { props.push([name, function () { return true; }]); return; }
      props.push([name, getter(val)]);
    });
    var shape = hashable ? '|' + shapeHash(n) : '';
    var kids = compileKids(n);
    return function (s, host, key) {
      var p = { key: key + shape, 'data-dc-tpl': tpl }, css = null;
      for (var i = 0; i < props.length; i++) {
        var nm = props[i][0], v = props[i][1](s);
        if (nm === 'style' && typeof v === 'string') { css = v; v = styleObj(v); }
        if ((nm === 'value' || nm === 'checked') && v === undefined) v = nm === 'checked' ? false : '';
        p[nm] = v;
      }
      p.ref = styleRef(css);
      return h.apply(null, [tag, p].concat(kids.map(function (f, k) { return f(s, host, k); })));
    };
  }
  function compileTemplate(html) {
    var t = document.createElement('template');
    t.innerHTML = prep(html);
    var n = 0;
    (function mark(x) { if (x.nodeType === 1) x.setAttribute('data-dc-tpl', String(n++)); x.childNodes.forEach(mark); })(t.content);
    var kids = compileKids(t.content);
    return function (s, host) { return kids.map(function (f, k) { return f(s || {}, host, k); }); };
  }

  /* ---------- logic base class + host component ---------- */
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (u, cb) { if (this.__host) this.__host.__setLogicState(u, cb); };
  DCLogic.prototype.forceUpdate = function () { if (this.__host) this.__host.forceUpdate(); };
  DCLogic.prototype.componentDidMount = function () {};
  DCLogic.prototype.componentDidUpdate = function () {};
  DCLogic.prototype.componentWillUnmount = function () {};
  DCLogic.prototype.renderVals = function () { return {}; };
  window.DCLogic = DCLogic;

  function mount(opts) {
    var tpl = compileTemplate(opts.template);
    var Logic = opts.logic;
    function Host(props) { R.Component.call(this, props); this.state = { v: 0 }; this.logic = new Logic(props); this.logic.__host = this; }
    Host.prototype = Object.create(R.Component.prototype);
    Host.prototype.constructor = Host;
    Host.prototype.__setLogicState = function (u, cb) {
      var prev = this.logic.state, next = typeof u === 'function' ? u(prev) : u;
      this.logic.state = Object.assign({}, prev, next);
      this.setState(function (s) { return { v: s.v + 1 }; }, cb);
    };
    Host.prototype.componentDidMount = function () { try { this.logic.componentDidMount(); } catch (e) { console.error(e); } };
    Host.prototype.componentDidUpdate = function (pp) { this.logic.props = this.props; try { this.logic.componentDidUpdate(pp); } catch (e) { console.error(e); } };
    Host.prototype.componentWillUnmount = function () { try { this.logic.componentWillUnmount(); } catch (e) { console.error(e); } };
    Host.prototype.render = function () {
      this.logic.props = this.props;
      var vals = Object.assign({}, this.props);
      try { Object.assign(vals, this.logic.renderVals() || {}); } catch (e) { console.error(e); }
      return h('div', { className: 'sc-host' }, tpl(vals, this));
    };
    var root = document.getElementById('dc-root');
    RD.createRoot(root).render(h(Host, opts.props || {}));
  }
  window.WeiRuntime = { mount: mount };
})();
