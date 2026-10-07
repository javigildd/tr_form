/* Request Form — shared helpers, config schema, Trello REST wrapper and a
   demo-mode mock of the Trello Power-Up client (used by preview.html).

   Everything a person sees in the form (field labels, option names, hints,
   placeholders) comes from the board configuration. The code ships with
   neutral placeholders only; the real vocabulary is entered in the admin
   settings and stored on the board itself. */
(function (global) {
  'use strict';

  var APP_KEY = 'aeb7699b59456bf69ed953440b998eef';
  var APP_NAME = 'Request Form';
  var CFG_KEY = 'cfg';   // board/shared pluginData key for configuration
  var CFG_VERSION = 2;
  var MAX_LINKS = 4;

  var DEFAULTS = {
    v: CFG_VERSION,
    title: 'New request',
    name: { label: 'Request name', placeholder: 'e.g. Example request', hint: '' },
    category: {
      label: 'Category', hint: '',
      options: [
        { name: 'Category A', label: '', base: 100 },
        { name: 'Category B', label: '', base: 200 },
        { name: 'Category C', label: '', base: 300 }
      ]
    },
    type: { label: 'Type', options: [{ name: 'Type A', label: '' }, { name: 'Type B', label: '' }, { name: 'Type C', label: '' }] },
    links: [
      { label: 'Link 1', placeholder: 'https://…', required: true },
      { label: 'Link 2', placeholder: 'https://…', required: false }
    ],
    notes: { label: 'Notes', placeholder: 'Anything else? Paste links or images here.', required: false },
    listId: '',
    pattern: '{id}_{name}',
    admins: []
  };

  var LABEL_COLORS = {
    green: '#4bce97', yellow: '#f5cd47', orange: '#fea362', red: '#f87168', purple: '#9f8fef',
    blue: '#579dff', sky: '#6cc3e0', lime: '#94c748', pink: '#e774bb', black: '#8590a2',
    green_dark: '#1f845a', yellow_dark: '#946f00', orange_dark: '#c25100', red_dark: '#c9372c', purple_dark: '#6e5dc6',
    blue_dark: '#0c66e4', sky_dark: '#227d9b', lime_dark: '#5b7f24', pink_dark: '#ae4787', black_dark: '#626f86',
    green_light: '#baf3db', yellow_light: '#f8e6a0', orange_light: '#fedec8', red_light: '#ffd5d2', purple_light: '#dfd8fd',
    blue_light: '#cce0ff', sky_light: '#c6edfb', lime_light: '#d3f1a7', pink_light: '#fdd0ec', black_light: '#dcdfe4'
  };
  function labelHex(color) { return LABEL_COLORS[color] || '#dcdfe4'; }
  function labelInk(color) { return /_dark$/.test(color || '') ? '#ffffff' : '#172b4d'; }

  /* ---------- config ---------- */
  function str(v, def) { return typeof v === 'string' ? v : def; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* Merge whatever is stored on the board (or pasted in the settings) over the defaults, validating shapes. */
  function mergeConfig(stored) {
    var cfg = clone(DEFAULTS);
    if (!stored || typeof stored !== 'object') return cfg;
    cfg.title = str(stored.title, cfg.title);
    if (stored.name && typeof stored.name === 'object') {
      cfg.name.label = str(stored.name.label, cfg.name.label);
      cfg.name.placeholder = str(stored.name.placeholder, cfg.name.placeholder);
      cfg.name.hint = str(stored.name.hint, cfg.name.hint);
    }
    if (stored.category && typeof stored.category === 'object') {
      cfg.category.label = str(stored.category.label, cfg.category.label);
      cfg.category.hint = str(stored.category.hint, cfg.category.hint);
      if (Array.isArray(stored.category.options) && stored.category.options.length) {
        cfg.category.options = stored.category.options.map(function (o, i) {
          return { name: str(o && o.name, 'Option ' + (i + 1)), label: str(o && o.label, ''), base: baseOf(o, i) };
        });
      }
    }
    if (stored.type && typeof stored.type === 'object') {
      cfg.type.label = str(stored.type.label, cfg.type.label);
      if (Array.isArray(stored.type.options) && stored.type.options.length) {
        cfg.type.options = stored.type.options.map(function (o, i) { return { name: str(o && o.name, 'Option ' + (i + 1)), label: str(o && o.label, '') }; });
      }
    }
    if (Array.isArray(stored.links)) {
      cfg.links = stored.links.slice(0, MAX_LINKS).map(function (l, i) {
        return { label: str(l && l.label, 'Link ' + (i + 1)), placeholder: str(l && l.placeholder, 'https://…'), required: !!(l && l.required) };
      });
    }
    if (stored.notes && typeof stored.notes === 'object') {
      cfg.notes.label = str(stored.notes.label, cfg.notes.label);
      cfg.notes.placeholder = str(stored.notes.placeholder, cfg.notes.placeholder);
      cfg.notes.required = !!stored.notes.required;
    }
    cfg.listId = str(stored.listId, cfg.listId);
    cfg.pattern = str(stored.pattern, cfg.pattern) || DEFAULTS.pattern;
    if (Array.isArray(stored.admins)) cfg.admins = stored.admins.filter(function (s) { return typeof s === 'string'; });
    return cfg;
  }
  /* Tidy a config before saving: trim names, snap ID blocks to multiples of 100, never let two options share a block. */
  function normalizeConfig(cfg) {
    var used = {};
    cfg.category.options = cfg.category.options.filter(function (o) { return (o.name || '').trim(); });
    if (!cfg.category.options.length) cfg.category.options = clone(DEFAULTS.category.options);
    cfg.category.options.forEach(function (o, i) {
      o.name = o.name.trim();
      o.base = Math.max(100, Math.round((Number(o.base) || (i + 1) * 100) / 100) * 100);
      while (used[o.base]) o.base += 100;
      used[o.base] = true;
    });
    cfg.type.options = cfg.type.options.filter(function (o) { return (o.name || '').trim(); }).map(function (o) { o.name = o.name.trim(); return o; });
    if (!cfg.type.options.length) cfg.type.options = clone(DEFAULTS.type.options);
    cfg.links = cfg.links.filter(function (l) { return (l.label || '').trim(); }).slice(0, MAX_LINKS);
    ['title'].forEach(function (k) { cfg[k] = (cfg[k] || '').trim() || DEFAULTS[k]; });
    cfg.name.label = cfg.name.label.trim() || DEFAULTS.name.label;
    cfg.category.label = cfg.category.label.trim() || DEFAULTS.category.label;
    cfg.type.label = cfg.type.label.trim() || DEFAULTS.type.label;
    cfg.notes.label = cfg.notes.label.trim() || DEFAULTS.notes.label;
    cfg.pattern = cfg.pattern.trim() || DEFAULTS.pattern;
    cfg.v = CFG_VERSION;
    return cfg;
  }
  function loadConfig(t) { return t.get('board', 'shared', CFG_KEY, null).then(mergeConfig); }
  function saveConfig(t, cfg) { return t.set('board', 'shared', CFG_KEY, normalizeConfig(cfg)); }

  /* ---------- ids & names ---------- */
  /* Each category option owns a block of 100 IDs starting at its `base` (100, 200, …). */
  function baseOf(opt, i) { var b = Number(opt && opt.base); return b > 0 ? b : (i + 1) * 100; }
  function idOf(name) { var m = /^(\d{3,})[_\s.-]/.exec(name || ''); return m ? Number(m[1]) : null; }
  /* Next ID = highest ID already on the board within this option's block, plus one. */
  function nextIdFor(base, cardNames) {
    var hi = base - 1;
    (cardNames || []).forEach(function (n) { var v = idOf(n); if (v != null && v >= base && v < base + 100) hi = Math.max(hi, v); });
    return hi + 1;
  }
  function buildName(pattern, d) {
    return (pattern || DEFAULTS.pattern).replace(/\{(id|name|category|type)\}/g, function (_, key) { return d[key] == null ? '' : String(d[key]); }).trim();
  }
  function isUrl(s) { return /^https?:\/\/\S+$/i.test((s || '').trim()); }

  /* Card description: a summary line, then one section per filled-in link and the notes. */
  function buildDesc(cfg, d) {
    var out = ['**' + cfg.category.label + ':** ' + d.category + ' · **' + cfg.type.label + ':** ' + d.type, ''];
    (d.links || []).forEach(function (l) { if (l.value) { out.push('### ' + l.label); out.push(l.value); out.push(''); } });
    if (d.notes) { out.push('### ' + cfg.notes.label); out.push(d.notes); out.push(''); }
    return out.join('\n').trim();
  }

  /* ---------- who can open the settings ----------
     If the allow-list in the config is empty: board admins.
     If it is set: ONLY the listed usernames (board admins are not implied).
     Safeguard against locking everyone out (e.g. a typo): if none of the listed
     usernames is currently a member of the board, board admins can open it again. */
  function norm(s) { return String(s || '').replace(/^@/, '').trim().toLowerCase(); }
  function isAdmin(t, cfg) {
    return Promise.all([t.member('id', 'username'), t.board('memberships', 'members')]).then(function (r) {
      var me = r[0] || {}, ms = (r[1] && r[1].memberships) || [], members = (r[1] && r[1].members) || [];
      var mine = ms.filter(function (m) { return m.idMember === me.id; })[0];
      var boardAdmin = !!(mine && mine.memberType === 'admin');
      var allowed = (cfg.admins || []).map(norm).filter(Boolean);
      if (!allowed.length) return boardAdmin;
      if (allowed.indexOf(norm(me.username)) >= 0) return true;
      var onBoard = members.map(function (m) { return norm(m.username); });
      var anyListedOnBoard = allowed.some(function (u) { return onBoard.indexOf(u) >= 0; });
      return anyListedOnBoard ? false : boardAdmin;
    }).catch(function () { return false; });
  }

  /* ---------- Trello REST (real mode) ---------- */
  /* The authorize popup comes back to auth.html (same origin), which stores the token and closes itself. */
  function ensureAuth(t) {
    var api = t.getRestApi();
    return api.isAuthorized().then(function (ok) {
      if (ok) return;
      var base = global.location.href.replace(/[^/]*$/, '');
      return api.authorize({ scope: 'read,write', expiration: 'never', returnUrl: base + 'auth.html' });
    });
  }
  function rest(t, method, path, params, body) {
    return t.getRestApi().getToken().then(function (token) {
      var qs = Object.assign({ key: APP_KEY, token: token }, params || {});
      var url = 'https://api.trello.com/1' + path + '?' + Object.keys(qs).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(qs[k]);
      }).join('&');
      return fetch(url, { method: method, body: body }).then(function (res) {
        if (!res.ok) return res.text().then(function (tx) { throw new Error('Trello API ' + res.status + ': ' + tx); });
        return res.json();
      });
    });
  }

  /* Board operations, real or mock. */
  var ops = {
    cardNames: function (t) {
      if (t.__mock) return Promise.resolve(t.store.cards.map(function (c) { return c.name; }));
      return t.board('id').then(function (b) { return rest(t, 'GET', '/boards/' + b.id + '/cards/all', { fields: 'name' }); })
        .then(function (cards) { return cards.map(function (c) { return c.name; }); });
    },
    createCard: function (t, data) {
      if (t.__mock) {
        var card = { id: 'c' + Date.now(), name: data.name, desc: data.desc, idList: data.idList,
          idLabels: data.idLabels, attachments: [], cover: null, url: '#', shortUrl: '#', created: new Date().toISOString() };
        t.store.cards.unshift(card); t.persist();
        return Promise.resolve(card);
      }
      return rest(t, 'POST', '/cards', { idList: data.idList, name: data.name, desc: data.desc, idLabels: data.idLabels.join(','), pos: 'top' });
    },
    attachUrl: function (t, card, url, name) {
      if (t.__mock) { card.attachments.push({ name: name, url: url }); t.persist(); return Promise.resolve(); }
      return rest(t, 'POST', '/cards/' + card.id + '/attachments', { url: url, name: name });
    },
    attachFile: function (t, card, file) {
      if (t.__mock) {
        return new Promise(function (res) {
          var r = new FileReader(); r.onload = function () { var a = { id: 'a' + Date.now(), name: file.name, url: r.result, isImage: /^image\//.test(file.type) }; card.attachments.push(a); t.persist(); res(a); }; r.readAsDataURL(file);
        });
      }
      var fd = new FormData(); fd.append('file', file, file.name);
      return rest(t, 'POST', '/cards/' + card.id + '/attachments', {}, fd);
    },
    setCover: function (t, card, attachment) {
      if (t.__mock) { card.cover = attachment.url; t.persist(); return Promise.resolve(); }
      return rest(t, 'PUT', '/cards/' + card.id, { idAttachmentCover: attachment.id });
    },
    updateDesc: function (t, card, desc) {
      if (t.__mock) { card.desc = desc; t.persist(); return Promise.resolve(); }
      return rest(t, 'PUT', '/cards/' + card.id, { desc: desc });
    }
  };

  /* ---------- Mock Trello client for the preview ---------- */
  var MOCK_KEY = 'request-form-powerup.demo.v4';
  var MOCK_LABELS = [
    ['Category A', 'orange_dark'], ['Category B', 'lime_dark'], ['Category C', 'purple_dark'],
    ['Type A', 'red_light'], ['Type B', 'red'], ['Type C', 'blue']
  ].map(function (l, i) { return { id: 'lbl' + i, name: l[0], color: l[1] }; });
  var MOCK_LISTS = ['Inbox', 'Requests', 'In progress', 'Review', 'Done'].map(function (n, i) { return { id: 'lst' + i, name: n }; });

  function MockT() {
    this.__mock = true;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(MOCK_KEY) || 'null'); } catch (e) { saved = null; }
    this.store = saved || { data: {}, cards: [] };
    this.store.labels = MOCK_LABELS; this.store.lists = MOCK_LISTS;
    if (!this.store.data[CFG_KEY]) {
      // Demo defaults: map each option to the demo label with the same name.
      var cfg = mergeConfig(null);
      function byName(n) { return (MOCK_LABELS.filter(function (x) { return x.name === n; })[0] || {}).id || ''; }
      cfg.category.options.forEach(function (o) { o.label = byName(o.name); });
      cfg.type.options.forEach(function (o) { o.label = byName(o.name); });
      cfg.listId = 'lst1';
      this.store.data[CFG_KEY] = cfg;
    }
  }
  MockT.prototype.persist = function () { try { localStorage.setItem(MOCK_KEY, JSON.stringify({ data: this.store.data, cards: this.store.cards })); } catch (e) { /* demo only */ } };
  MockT.prototype.reset = function () { try { localStorage.removeItem(MOCK_KEY); } catch (e) {} };
  MockT.prototype.board = function () {
    var self = this, all = { id: 'demo-board', name: 'Demo board', labels: self.store.labels,
      memberships: [{ idMember: 'me', memberType: 'admin' }], members: [{ id: 'me', fullName: 'Demo admin', username: 'demo' }] };
    var out = {}; Array.prototype.forEach.call(arguments, function (f) { out[f] = all[f]; }); return Promise.resolve(out);
  };
  MockT.prototype.lists = function () { return Promise.resolve(this.store.lists); };
  MockT.prototype.member = function () { return Promise.resolve({ id: 'me', fullName: 'Demo admin', username: 'demo' }); };
  MockT.prototype.get = function (s, v, key, def) { var val = this.store.data[key]; return Promise.resolve(val === undefined ? def : val); };
  MockT.prototype.set = function (s, v, key, val) { this.store.data[key] = val; this.persist(); return Promise.resolve(); };
  MockT.prototype.closeModal = function () { global.dispatchEvent(new CustomEvent('rf:close')); return Promise.resolve(); };
  MockT.prototype.closePopup = MockT.prototype.closeModal;
  MockT.prototype.alert = function (o) { global.dispatchEvent(new CustomEvent('rf:alert', { detail: o })); return Promise.resolve(); };
  MockT.prototype.sizeTo = function () { return Promise.resolve(); };
  MockT.prototype.getRestApi = function () {
    return { isAuthorized: function () { return Promise.resolve(true); }, authorize: function () { return Promise.resolve(); },
      getToken: function () { return Promise.resolve('demo'); }, clearToken: function () { return Promise.resolve(); } };
  };

  /* Returns the real Trello client when the page runs inside Trello, the demo mock when the
     Trello library is not loaded at all (preview), and null when a real page is opened on its own.
     If the page was opened by the authorization popup (token in the URL fragment), the library
     stores the token and closes the window; we return null so nothing else renders. */
  function getT() {
    if (!global.TrelloPowerUp) return new MockT();
    var hasToken = /token=/.test(global.location.hash || '');
    if (global.parent === global && !hasToken) return null;
    try {
      var t = global.TrelloPowerUp.iframe({ appKey: APP_KEY, appName: APP_NAME });
      if (hasToken) { var api = t.getRestApi(); if (api && typeof api.init === 'function') api.init(); return null; }
      return t;
    } catch (e) { return null; }
  }
  function renderOutsideTrello(root) {
    var authed = /token=/.test(global.location.hash || '');
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'pu' }, [el('div', { class: authed ? 'notice ok' : 'notice info',
      text: authed ? 'Authorized. This window will close by itself.' : 'This page only works inside Trello. Open the board and use the button at the top.' })]));
  }

  /* tiny DOM helper */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === false || attrs[k] == null) {}
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c == null) return; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  global.RF = {
    APP_KEY: APP_KEY, APP_NAME: APP_NAME, DEFAULTS: DEFAULTS, MAX_LINKS: MAX_LINKS,
    labelHex: labelHex, labelInk: labelInk,
    loadConfig: loadConfig, saveConfig: saveConfig, mergeConfig: mergeConfig, normalizeConfig: normalizeConfig, idOf: idOf,
    baseOf: baseOf, nextIdFor: nextIdFor, buildName: buildName, buildDesc: buildDesc, isUrl: isUrl,
    isAdmin: isAdmin, ensureAuth: ensureAuth, rest: rest, ops: ops, getT: getT, renderOutsideTrello: renderOutsideTrello, MockT: MockT, el: el
  };
})(window);
