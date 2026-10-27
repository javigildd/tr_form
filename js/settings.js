/* Request Form — admin settings. Only board admins (or allow-listed usernames) can edit.
   Everything the form shows is edited here and stored on the board; nothing is hard-coded. */
(function (global) {
  'use strict';
  var R = global.RF, el = R.el;

  function render(root, t, opts) {
    opts = opts || {};
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'pu' }, [el('p', { class: 'muted' }, [el('span', { class: 'spin' }), 'Loading settings…'])]));

    Promise.all([R.loadConfig(t), t.board('labels', 'name'), t.lists('id', 'name'), R.ops.cards(t).catch(function () { return []; }), t.member('id', 'username', 'fullName')])
      .then(function (r) {
        var cfg = r[0], labels = r[1].labels || [], lists = r[2] || [], names = r[3], me = r[4] || {};
        return R.isAdmin(t, cfg).then(function (admin) {
          if (!admin) return renderDenied(root, t, me);
          renderEditor(root, t, cfg, labels, lists, names, me, opts);
        });
      }).catch(function (e) {
        console.error(e);
        root.innerHTML = ''; root.appendChild(el('div', { class: 'pu' }, [el('div', { class: 'notice warn', text: 'Could not load settings: ' + e.message })]));
      });
  }

  function renderDenied(root, t, me) {
    root.innerHTML = '';
    var close = el('button', { type: 'button', class: 'btn primary', text: 'Close' });
    close.addEventListener('click', function () { t.closeModal(); });
    root.appendChild(el('div', { class: 'pu' }, [
      el('h1', { text: 'Form settings' }),
      el('div', { class: 'notice info', text: 'Only board admins can change these settings. Ask an admin if you need an option, label or required field changed.' }),
      el('p', { class: 'muted', text: 'Signed in as ' + (me.fullName || me.username || 'member') + '.' }),
      el('div', { class: 'actions' }, [close])
    ]));
  }

  function labelPicker(labels, value, onChange) {
    var sel = el('select', {}, [el('option', { value: '', text: '— no label —' })]);
    labels.forEach(function (l) { sel.appendChild(el('option', { value: l.id, text: (l.name || '(unnamed)') + ' · ' + l.color })); });
    sel.value = labels.some(function (l) { return l.id === value; }) ? value : '';
    var sw = el('span', { class: 'swatch' });
    function paint() { var l = labels.filter(function (x) { return x.id === sel.value; })[0]; sw.style.background = l ? R.labelHex(l.color) : ''; }
    sel.addEventListener('change', function () { paint(); onChange(sel.value); });
    paint();
    return el('div', { class: 'labelpick' }, [sw, sel]);
  }
  function textInput(obj, key, attrs) {
    var inp = el('input', Object.assign({ type: 'text', value: obj[key] || '' }, attrs || {}));
    inp.addEventListener('input', function () { obj[key] = inp.value; });
    return inp;
  }
  function reqSelect(obj, key, aria) {
    var sel = el('select', { 'aria-label': aria, class: 'fixed' }, [el('option', { value: 'req', text: 'Required' }), el('option', { value: 'opt', text: 'Optional' })]);
    sel.value = obj[key] ? 'req' : 'opt';
    sel.addEventListener('change', function () { obj[key] = sel.value === 'req'; });
    return sel;
  }
  function labelled(text, control) { return el('div', { class: 'field' }, [el('span', { class: 'lbl', text: text }), control]); }

  /* Accepts the editor's own JSON, or the { cfg: … } wrapper Trello's pluginData holds. Throws when it is not a configuration. */
  function parseConfigJson(text) {
    var p = JSON.parse(text);
    if (p && typeof p === 'object' && !Array.isArray(p) && p.cfg && typeof p.cfg === 'object' && !p.category) p = p.cfg;
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('expected an object with the form configuration');
    if (!['category', 'type', 'name', 'links', 'pattern', 'listId'].some(function (k) { return k in p; })) throw new Error('no form settings found in it');
    return R.mergeConfig(p);
  }

  function renderEditor(root, t, cfg, labels, lists, cards, me, opts, flash) {
    var wrap = el('div', { class: 'pu' });
    function counted() { return R.countedCards(cards, cfg); }
    wrap.appendChild(el('h1', { text: 'Form settings' }));
    wrap.appendChild(el('p', { class: 'lede', text: 'Changes apply to everyone on this board as soon as you save. Nothing here is stored outside Trello.' }));
    if (flash && flash.text) {
      var fl = el('div', { class: 'notice ' + (flash.kind || 'ok'), id: 's-flash', text: flash.text });
      wrap.appendChild(fl);
      if ((flash.kind || 'ok') === 'ok') setTimeout(function () { fl.style.display = 'none'; }, 8000);
    }

    /* Form text */
    wrap.appendChild(el('h2', { text: 'Form text' }));
    wrap.appendChild(labelled('Form title', textInput(cfg, 'title')));
    wrap.appendChild(el('div', { class: 'two' }, [
      labelled('Name field label', textInput(cfg.name, 'label')),
      labelled('Name placeholder', textInput(cfg.name, 'placeholder'))
    ]));
    var hint = el('textarea', { id: 's-hint', style: 'min-height:56px' }); hint.value = cfg.name.hint;
    hint.addEventListener('input', function () { cfg.name.hint = hint.value; });
    wrap.appendChild(labelled('Note shown under the name field', hint));

    /* Category options (the selector that decides the ID block) */
    wrap.appendChild(el('h2', { text: 'Selector options' }));
    wrap.appendChild(el('div', { class: 'two' }, [
      labelled('Selector label', textInput(cfg.category, 'label')),
      labelled('Note under the selector', textInput(cfg.category, 'hint'))
    ]));
    wrap.appendChild(el('p', { class: 'hint', text: 'The name is what people see in the selector; the label is what gets applied to the card. Each option owns a block of 100 IDs starting at “IDs from”. By default the next ID is the highest one already on the board in that block, plus one; see Next IDs below. An option can carry a sub-list: a second selector (e.g. one entry per client) whose entries own their own ID blocks.' }));
    var cRows = el('div', { class: 'grid-rows' });
    /* First block of 100 from `from` upwards that no option or sub-list entry uses yet. */
    function freeBlock(from) {
      var used = {};
      cfg.category.options.forEach(function (o, i) { used[R.baseOf(o, i)] = true; (o.sub ? o.sub.options : []).forEach(function (s) { if (s.base > 0) used[s.base] = true; }); });
      var b = Math.max(100, Math.round(from / 100) * 100); while (used[b]) b += 100; return b;
    }
    cfg.category.options.forEach(function (o, i) { (o.sub ? o.sub.options : []).forEach(function (s) { if (!(s.base > 0)) s.base = freeBlock(R.baseOf(o, i) + 100); }); });
    function numInput(o, fallback, aria, title) {
      var inp = el('input', { type: 'number', class: 'small', min: '100', step: '100', value: String(o.base || fallback), 'aria-label': aria, title: title });
      inp.addEventListener('input', function () { o.base = Number(inp.value) || fallback; drawNextIds(); });
      return inp;
    }
    /* Editor for an option's sub-list: entries with an on/off switch, a name, an optional label and their own ID block. */
    function subPanel(o, i) {
      var sub = o.sub, rows = el('div', { class: 'grid-rows' });
      var lbl = textInput(sub, 'label', { 'aria-label': 'Sub-list label for ' + (o.name || 'option ' + (i + 1)), placeholder: 'e.g. Which one?' });
      sub.options.forEach(function (s, j) {
        var on = el('input', { type: 'checkbox', 'aria-label': 'Enable ' + (s.name || 'entry ' + (j + 1)) + ' under ' + (o.name || 'option ' + (i + 1)) });
        on.checked = !!s.enabled;
        on.addEventListener('change', function () { s.enabled = on.checked; drawNextIds(); });
        var name = textInput(s, 'name', { 'aria-label': 'Entry ' + (j + 1) + ' name under ' + (o.name || 'option ' + (i + 1)) });
        name.addEventListener('input', drawNextIds);
        var rm = el('button', { type: 'button', class: 'btn small danger fixed', text: 'Remove' });
        rm.addEventListener('click', function () { sub.options.splice(j, 1); drawCategories(); });
        rows.appendChild(el('div', { class: 'row' }, [
          el('span', { class: 'idx', text: (i + 1) + '.' + (j + 1) }),
          el('label', { class: 'chk fixed' }, [on, el('span', { text: 'On' })]),
          name,
          labelPicker(labels, s.label, function (v) { s.label = v; }),
          el('span', { class: 'fixed row' }, [el('span', { class: 'muted', text: 'IDs from' }), numInput(s, R.baseOf(o, i) + (j + 1) * 100, 'ID block for entry ' + (j + 1) + ' under ' + (o.name || 'option ' + (i + 1)), 'ID block (first ID of the range)')]),
          rm
        ]));
      });
      var add = el('button', { type: 'button', class: 'btn small', text: '+ Add entry' });
      add.addEventListener('click', function () { sub.options.push({ name: 'Entry ' + (sub.options.length + 1), label: '', base: freeBlock(R.baseOf(o, i) + 100), enabled: true }); drawCategories(); });
      var drop = el('button', { type: 'button', class: 'btn small link', text: 'Remove sub-list' });
      drop.addEventListener('click', function () { delete o.sub; drawCategories(); });
      rows.appendChild(el('div', { class: 'row' }, [el('span', { class: 'fixed' }, [add]), el('span', { class: 'fixed' }, [drop])]));
      return el('div', { class: 'subpanel' }, [
        el('div', { class: 'row' }, [el('span', { class: 'muted fixed', text: 'Sub-list label' }), lbl]),
        el('p', { class: 'hint', text: 'When someone picks “' + (o.name || 'this option') + '”, the form shows this second selector with the entries that are On. Each entry owns its own block of 100 IDs; the option’s own block is not used.' }),
        rows
      ]);
    }
    function drawCategories() {
      cRows.innerHTML = '';
      cfg.category.options.forEach(function (o, i) {
        var name = textInput(o, 'name', { 'aria-label': 'Option ' + (i + 1) + ' name' });
        name.addEventListener('input', drawNextIds);
        var rm = el('button', { type: 'button', class: 'btn small danger fixed', text: 'Remove', disabled: cfg.category.options.length <= 1 ? 'disabled' : false });
        rm.addEventListener('click', function () { cfg.category.options.splice(i, 1); drawCategories(); });
        var subBtn = el('button', { type: 'button', class: 'btn small fixed', text: '+ Sub-list', title: 'Add a second selector under this option, e.g. one entry per client', 'aria-label': 'Add sub-list to ' + (o.name || 'option ' + (i + 1)) });
        subBtn.addEventListener('click', function () { o.sub = { label: 'Which one?', options: [{ name: 'Entry 1', label: '', base: freeBlock(R.baseOf(o, i) + 100), enabled: true }] }; drawCategories(); });
        cRows.appendChild(el('div', { class: 'row' }, [
          el('span', { class: 'idx', text: String(i + 1) }), name,
          labelPicker(labels, o.label, function (v) { o.label = v; }),
          el('span', { class: 'fixed row' }, [el('span', { class: 'muted', text: 'IDs from' }), numInput(o, (i + 1) * 100, 'ID block for option ' + (i + 1), 'ID block (first ID of the range)')]),
          o.sub ? null : subBtn, rm
        ]));
        if (o.sub) cRows.appendChild(subPanel(o, i));
      });
      var add = el('button', { type: 'button', class: 'btn small', text: '+ Add option' });
      add.addEventListener('click', function () {
        var used = cfg.category.options.map(function (o, i) { return R.baseOf(o, i); }), b = 100;
        while (used.indexOf(b) >= 0) b += 100;
        cfg.category.options.push({ name: 'New option', label: '', base: b }); drawCategories();
      });
      cRows.appendChild(el('div', {}, [add]));
      drawNextIds();
    }

    /* Next IDs: what the form will assign next for each option (or sub-list entry), with a counter the admin can reset. */
    var nRows = el('div', { class: 'grid-rows' });
    function nextRow(o, i, title, idx, pool) {
      var base = R.baseOf(o, i), hi = R.highestIdIn(base, pool), orig = R.resetOf(o);
      var inBlock = pool.filter(function (c) { var v = R.idOf(c.name); return v != null && v >= base && v < base + 100; });
      var archived = cards.filter(function (c) { var v = R.idOf(c.name); return c.closed && v != null && v >= base && v < base + 100; }).length;   // from every card, so ignored ones are still reported
      var effective = R.nextIdOf(o, i, pool);   // what the form hands out right now
      var inp = el('input', { type: 'number', class: 'small', min: String(base), max: String(base + 99), step: '1', value: String(effective), 'aria-label': 'Next ID for ' + title });
      var eff = el('span', { class: 'readonly fixed' });
      var reset = el('button', { type: 'button', class: 'btn small fixed', text: 'Reset to ' + base, title: 'Start again from the first number of the block' });
      function paint() {
        var v = Math.floor(Number(inp.value)), ok = v >= base && v < base + 100;
        // A different number is a new counter reset, stamped with the current time; otherwise keep what was stored.
        if (ok && v !== effective) { o.next = v; o.since = Math.floor(Date.now() / 1000); }
        else if (orig) { o.next = orig.next; o.since = orig.since; }
        else { delete o.next; delete o.since; }
        var n = R.nextIdOf(o, i, pool);
        var above = (ok && v !== effective) ? inBlock.filter(function (c) { return R.idOf(c.name) >= v; }).length : 0;
        eff.textContent = !ok ? 'use ' + base + '–' + (base + 99) : 'will use ' + n + (above ? ' · ' + above + ' higher card' + (above === 1 ? '' : 's') + ' ignored' : '');
        eff.title = above ? above + ' card' + (above === 1 ? '' : 's') + ' in this block already carr' + (above === 1 ? 'ies ' : 'y ') + v + ' or higher. From now on they do not count, so numbers can repeat unless you delete or rename them.' : '';
        eff.style.color = (!ok || above) ? 'var(--danger)' : '';
      }
      inp.addEventListener('input', paint); paint();
      reset.addEventListener('click', function () { inp.value = String(base); paint(); });
      var bits = [hi == null ? 'nothing on the board yet (' + base + '–' + (base + 99) + ')' : 'highest on the board: ' + hi];
      if (archived) bits.push(archived + ' archived ' + (cfg.ids.countArchived ? 'counted' : 'ignored'));
      if (orig) {
        var before = inBlock.filter(function (c) { return R.createdAt(c) < orig.since; }).length;
        bits.push('reset to ' + orig.next + (orig.since ? ' on ' + new Date(orig.since * 1000).toLocaleDateString() : '') + (before ? ', ' + before + ' earlier card' + (before === 1 ? '' : 's') + ' ignored' : ''));
      }
      return el('div', { class: 'row' }, [
        el('span', { class: 'idx', text: idx }),
        el('span', { class: 't-name', text: title }),
        el('span', { class: 'muted', text: bits.join(' · '), style: 'font-size:12px' }),
        el('span', { class: 'fixed row' }, [el('span', { class: 'muted', text: 'Next ID' }), inp]),
        eff, reset
      ]);
    }
    function drawNextIds() {
      nRows.innerHTML = '';
      var pool = counted();
      cfg.category.options.forEach(function (o, i) {
        var title = o.name || 'Option ' + (i + 1);
        if (!o.sub) { nRows.appendChild(nextRow(o, i, title, String(i + 1), pool)); return; }
        var subs = R.enabledSubs(o);
        if (!subs.length) {
          nRows.appendChild(el('div', { class: 'row' }, [el('span', { class: 'idx', text: String(i + 1) }), el('span', { class: 't-name', text: title }),
            el('span', { class: 'muted', text: 'no entry of its sub-list is On, so the form hides this option', style: 'font-size:12px;color:var(--danger)' })]));
          return;
        }
        subs.forEach(function (s) { nRows.appendChild(nextRow(s, i, title + ' › ' + s.name, String(i + 1) + '.' + (o.sub.options.indexOf(s) + 1), pool)); });
      });
    }
    drawCategories();
    wrap.appendChild(cRows);

    wrap.appendChild(el('h2', { text: 'Next IDs' }));
    wrap.appendChild(el('p', { class: 'hint', text: 'By default the next ID is the highest one already on the board in that block, plus one. Type another number to reset the counter: the next card gets exactly that number and numbering continues from there. Cards created before a reset no longer count, so their numbers can come up again unless you delete or rename them.' }));
    var arch = el('select', { 'aria-label': 'Archived cards', class: 'fixed' }, [el('option', { value: 'count', text: 'Count archived cards' }), el('option', { value: 'ignore', text: 'Ignore archived cards' })]);
    arch.value = cfg.ids.countArchived ? 'count' : 'ignore';
    arch.addEventListener('change', function () { cfg.ids.countArchived = arch.value === 'count'; drawNextIds(); paintEx(); });
    wrap.appendChild(el('div', { class: 'toggle', style: 'margin-bottom:8px' }, [el('div', {}, [el('div', { class: 't-name', text: 'Archived cards' }), el('div', { class: 't-desc', text: 'Counting them keeps old numbers reserved. Ignoring them frees their IDs, e.g. after archiving test cards.' })]), arch]));
    wrap.appendChild(nRows);

    /* Types */
    wrap.appendChild(el('h2', { text: 'Type buttons' }));
    wrap.appendChild(labelled('Type label', textInput(cfg.type, 'label')));
    wrap.appendChild(el('p', { class: 'hint', text: 'Options shown as buttons and the label each one applies.' }));
    var tRows = el('div', { class: 'grid-rows' });
    function drawTypes() {
      tRows.innerHTML = '';
      cfg.type.options.forEach(function (ty, i) {
        var name = textInput(ty, 'name', { 'aria-label': 'Type ' + (i + 1) + ' name' });
        var rm = el('button', { type: 'button', class: 'btn small danger fixed', text: 'Remove', disabled: cfg.type.options.length <= 1 ? 'disabled' : false });
        rm.addEventListener('click', function () { cfg.type.options.splice(i, 1); drawTypes(); });
        tRows.appendChild(el('div', { class: 'row' }, [el('span', { class: 'idx', text: String(i + 1) }), name, labelPicker(labels, ty.label, function (v) { ty.label = v; }), rm]));
      });
      var add = el('button', { type: 'button', class: 'btn small', text: '+ Add type' });
      add.addEventListener('click', function () { cfg.type.options.push({ name: 'New type', label: '' }); drawTypes(); });
      tRows.appendChild(el('div', {}, [add]));
    }
    drawTypes();
    wrap.appendChild(tRows);

    /* Links */
    wrap.appendChild(el('h2', { text: 'Link fields' }));
    wrap.appendChild(el('p', { class: 'hint', text: 'Each link is validated as a URL, attached to the card and listed in its description. Up to ' + R.MAX_LINKS + '.' }));
    var lRows = el('div', { class: 'grid-rows' });
    function drawLinks() {
      lRows.innerHTML = '';
      cfg.links.forEach(function (l, i) {
        var rm = el('button', { type: 'button', class: 'btn small danger fixed', text: 'Remove' });
        rm.addEventListener('click', function () { cfg.links.splice(i, 1); drawLinks(); });
        lRows.appendChild(el('div', { class: 'row' }, [
          el('span', { class: 'idx', text: String(i + 1) }),
          textInput(l, 'label', { 'aria-label': 'Link ' + (i + 1) + ' label', placeholder: 'Field label' }),
          textInput(l, 'placeholder', { 'aria-label': 'Link ' + (i + 1) + ' placeholder', placeholder: 'Placeholder (e.g. https://…)' }),
          reqSelect(l, 'required', 'Link ' + (i + 1) + ' requirement'), rm
        ]));
      });
      if (cfg.links.length < R.MAX_LINKS) {
        var add = el('button', { type: 'button', class: 'btn small', text: '+ Add link field' });
        add.addEventListener('click', function () { cfg.links.push({ label: 'Link ' + (cfg.links.length + 1), placeholder: 'https://…', required: false }); drawLinks(); });
        lRows.appendChild(el('div', {}, [add]));
      }
    }
    drawLinks();
    wrap.appendChild(lRows);

    /* Notes */
    wrap.appendChild(el('h2', { text: 'Notes field' }));
    wrap.appendChild(el('div', { class: 'row' }, [
      labelled('Label', textInput(cfg.notes, 'label')),
      labelled('Placeholder', textInput(cfg.notes, 'placeholder')),
      labelled('Requirement', reqSelect(cfg.notes, 'required', 'Notes requirement'))
    ]));
    wrap.appendChild(el('p', { class: 'hint', text: 'Name, selector and type are always required. Thumbnail is always optional.' }));

    /* Card */
    wrap.appendChild(el('h2', { text: 'Card' }));
    var listSel = el('select', { id: 's-list' });
    lists.forEach(function (l) { listSel.appendChild(el('option', { value: l.id, text: l.name })); });
    listSel.value = lists.some(function (l) { return l.id === cfg.listId; }) ? cfg.listId : (lists.filter(function (l) { return /^requests?$/i.test(l.name); })[0] || lists[0] || {}).id || '';
    cfg.listId = listSel.value;
    listSel.addEventListener('change', function () { cfg.listId = listSel.value; });
    wrap.appendChild(labelled('New cards go to', listSel));

    var pat = el('input', { type: 'text', id: 's-pattern', value: cfg.pattern });
    var ex = el('p', { class: 'hint' });
    function paintEx() {
      var o = cfg.category.options[0] || {}, ty = cfg.type.options[0] || {};
      ex.textContent = 'Example: ' + R.buildName(pat.value, { id: R.nextIdOf(o, 0, counted()), name: 'Example request', category: o.name || '', type: ty.name || '' });
    }
    pat.addEventListener('input', function () { cfg.pattern = pat.value; paintEx(); });
    paintEx();
    wrap.appendChild(el('div', { class: 'field' }, [el('span', { class: 'lbl', text: 'Card name pattern' }), pat, el('p', { class: 'hint', text: 'Placeholders: {id} {name} {category} {sub} {type}' }), ex]));

    /* Access */
    wrap.appendChild(el('h2', { text: 'Who can open these settings' }));
    var adm = el('input', { type: 'text', id: 's-admins', value: cfg.admins.join(', '), placeholder: 'username1, username2' });
    adm.addEventListener('input', function () { cfg.admins = adm.value.split(/[,\s]+/).map(function (s) { return s.replace(/^@/, '').trim(); }).filter(Boolean); });
    wrap.appendChild(el('div', { class: 'field' }, [
      el('span', { class: 'lbl', text: 'Only these Trello usernames (leave empty to allow every board admin):' }), adm,
      el('p', { class: 'hint', text: 'You are signed in as @' + (me.username || '?') + '. When this list is set, board admins who are not on it cannot open the settings. If nobody on the list is a member of the board any more, board admins regain access.' })
    ]));

    /* Import / export */
    wrap.appendChild(el('h2', { text: 'Import / export' }));
    wrap.appendChild(el('p', { class: 'hint', text: 'Copy the whole configuration as JSON to keep a backup or reuse it on another board. Paste a JSON here and click Load to review it in the editor, or Save straight away to apply it to the board.' }));
    var json = el('textarea', { id: 's-json', style: 'min-height:120px;font-family:var(--mono);font-size:12px' });
    var jsonShown = '';
    function refreshJson() { jsonShown = JSON.stringify(R.normalizeConfig(JSON.parse(JSON.stringify(cfg))), null, 2); json.value = jsonShown; }
    refreshJson();
    /* Text in the box that differs from what the editor put there: a paste waiting to be applied. */
    function pastedJson() { var v = json.value.trim(); return v && v !== jsonShown.trim() ? v : null; }
    var copy = el('button', { type: 'button', class: 'btn small', text: 'Copy JSON' });
    copy.addEventListener('click', function () {
      refreshJson();
      json.select();
      try { navigator.clipboard.writeText(json.value); copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy JSON'; }, 1500); } catch (e) { /* user can copy manually */ }
    });
    var load = el('button', { type: 'button', class: 'btn small', text: 'Load JSON into editor' });
    var jsonMsg = el('div', { class: 'notice warn', id: 's-json-msg', style: 'display:none' });
    load.addEventListener('click', function () {
      try {
        var next = parseConfigJson(json.value);
        renderEditor(root, t, next, labels, lists, cards, me, opts, { kind: 'ok', text: 'Loaded from JSON. Review the editor, then click Save settings to apply it to the board.' });
        root.scrollTop = 0;
      } catch (e) { jsonMsg.textContent = 'Not valid JSON: ' + e.message; jsonMsg.style.display = 'block'; }
    });
    json.addEventListener('input', function () { jsonMsg.style.display = 'none'; });
    wrap.appendChild(el('div', { class: 'field' }, [json, el('div', { class: 'row' }, [el('span', { class: 'fixed' }, [copy]), el('span', { class: 'fixed' }, [load])]), jsonMsg]));

    /* Actions */
    var msg = el('div', { class: 'notice ok', style: 'display:none' });
    var save = el('button', { type: 'button', class: 'btn primary', id: 's-save', text: 'Save settings' });
    var cancel = el('button', { type: 'button', class: 'btn link', text: 'Cancel' });
    cancel.addEventListener('click', function () { t.closeModal(); });
    save.addEventListener('click', function () {
      var pasted = pastedJson(), toSave = cfg;
      if (pasted) {
        try { toSave = parseConfigJson(pasted); } catch (e) {
          msg.className = 'notice warn'; msg.textContent = 'Not saved: the Import / export box holds text that is not a valid configuration (' + e.message + '). Fix it, or click Copy JSON to discard it.'; msg.style.display = 'block';
          jsonMsg.textContent = 'Not valid JSON: ' + e.message; jsonMsg.style.display = 'block';
          return;
        }
      }
      save.disabled = true; save.innerHTML = '<span class="spin"></span>Saving…';
      R.saveConfig(t, toSave).then(function () {
        if (opts.onSaved) opts.onSaved(toSave);
        if (pasted) {
          renderEditor(root, t, toSave, labels, lists, cards, me, opts, { kind: 'ok', text: 'Loaded the pasted JSON and saved it. The form now uses these settings.' });
          root.scrollTop = 0;
          return;
        }
        save.disabled = false; save.textContent = 'Save settings';
        msg.className = 'notice ok'; msg.textContent = 'Saved. The form now uses these settings.'; msg.style.display = 'block';
        refreshJson();
        setTimeout(function () { msg.style.display = 'none'; }, 3500);
      }).catch(function (e) {
        save.disabled = false; save.textContent = 'Save settings';
        msg.className = 'notice warn'; msg.textContent = 'Could not save: ' + e.message; msg.style.display = 'block';
      });
    });
    wrap.appendChild(el('div', { class: 'actions' }, [msg, el('span', { class: 'spacer' }), cancel, save]));

    root.innerHTML = ''; root.appendChild(wrap);
  }

  global.RFSettings = { render: render };
})(window);
