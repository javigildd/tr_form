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

  function renderEditor(root, t, cfg, labels, lists, cards, me, opts) {
    var wrap = el('div', { class: 'pu' });
    function names() { return R.countedNames(cards, cfg); }
    wrap.appendChild(el('h1', { text: 'Form settings' }));
    wrap.appendChild(el('p', { class: 'lede', text: 'Changes apply to everyone on this board as soon as you save. Nothing here is stored outside Trello.' }));

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
    wrap.appendChild(el('p', { class: 'hint', text: 'The name is what people see in the selector; the label is what gets applied to the card. Each option owns a block of 100 IDs starting at “IDs from”. The next ID is always the highest one already on the board in that block, plus one.' }));
    var cRows = el('div', { class: 'grid-rows' });
    function drawCategories() {
      cRows.innerHTML = '';
      cfg.category.options.forEach(function (o, i) {
        var name = textInput(o, 'name', { 'aria-label': 'Option ' + (i + 1) + ' name' });
        var base = el('input', { type: 'number', class: 'small', min: '100', step: '100', value: String(R.baseOf(o, i)), 'aria-label': 'ID block for option ' + (i + 1), title: 'ID block (first ID of the range)' });
        name.addEventListener('input', drawNextIds);
        base.addEventListener('input', function () { o.base = Number(base.value) || (i + 1) * 100; drawNextIds(); });
        var rm = el('button', { type: 'button', class: 'btn small danger fixed', text: 'Remove', disabled: cfg.category.options.length <= 1 ? 'disabled' : false });
        rm.addEventListener('click', function () { cfg.category.options.splice(i, 1); drawCategories(); });
        cRows.appendChild(el('div', { class: 'row' }, [
          el('span', { class: 'idx', text: String(i + 1) }), name,
          labelPicker(labels, o.label, function (v) { o.label = v; }),
          el('span', { class: 'fixed row' }, [el('span', { class: 'muted', text: 'IDs from' }), base]),
          rm
        ]));
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

    /* Next IDs: what the form will assign next for each option, with an optional "start from" value. */
    var nRows = el('div', { class: 'grid-rows' });
    function drawNextIds() {
      nRows.innerHTML = '';
      var ns = names();
      cfg.category.options.forEach(function (o, i) {
        var base = R.baseOf(o, i), hi = R.highestIdIn(base, ns), used = R.usedIdsIn(base, ns);
        var archivedInBlock = cards.filter(function (c) { return c.closed; }).map(function (c) { return R.idOf(c.name); }).filter(function (v) { return v != null && v >= base && v < base + 100; }).length;
        var auto = R.nextIdFor(base, ns);   // what the form uses with no start value: highest + 1
        var inp = el('input', { type: 'number', class: 'small', min: String(base), max: String(base + 99), step: '1', value: String(o.next >= base ? o.next : auto), 'aria-label': 'Next ID for ' + (o.name || 'option ' + (i + 1)) });
        var eff = el('span', { class: 'readonly fixed' });
        var reset = el('button', { type: 'button', class: 'btn small fixed', text: 'Reset to ' + base, title: 'Start again from the first number of the block' });
        function paint() {
          var v = Math.floor(Number(inp.value));
          // Store a start value only when it changes the outcome; otherwise keep the default rule (highest + 1).
          if (v >= base && v < base + 100 && R.nextIdFor(base, ns, v) !== auto) o.next = v; else delete o.next;
          var n = R.nextIdOf(o, i, ns);
          eff.textContent = 'will use ' + n;
          eff.title = (v >= base && v !== n) ? v + ' is already used, so the first free number from ' + v + ' upwards is ' + n : '';
          eff.style.color = (v >= base && v !== n) ? 'var(--danger)' : '';
        }
        inp.addEventListener('input', paint); paint();
        reset.addEventListener('click', function () { inp.value = String(base); paint(); });
        var state = hi == null ? 'nothing on the board yet (' + base + '–' + (base + 99) + ')' : 'highest on the board: ' + hi + (archivedInBlock ? ' · ' + archivedInBlock + ' archived ' + (cfg.ids.countArchived ? 'counted' : 'ignored') : '');
        nRows.appendChild(el('div', { class: 'row' }, [
          el('span', { class: 'idx', text: String(i + 1) }),
          el('span', { class: 't-name', text: o.name || 'Option ' + (i + 1) }),
          el('span', { class: 'muted', text: state, style: 'font-size:12px' }),
          el('span', { class: 'fixed row' }, [el('span', { class: 'muted', text: 'Next ID' }), inp]),
          eff, reset
        ]));
      });
    }
    drawCategories();
    wrap.appendChild(cRows);

    wrap.appendChild(el('h2', { text: 'Next IDs' }));
    wrap.appendChild(el('p', { class: 'hint', text: 'By default the next ID is the highest one already on the board in that block, plus one. Type any number of the block to start from there: the form takes the first free number from it upwards, so an ID that is in use is never handed out twice. To reuse numbers, archive or delete the cards that hold them.' }));
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
      ex.textContent = 'Example: ' + R.buildName(pat.value, { id: R.nextIdOf(o, 0, names()), name: 'Example request', category: o.name || '', type: ty.name || '' });
    }
    pat.addEventListener('input', function () { cfg.pattern = pat.value; paintEx(); });
    paintEx();
    wrap.appendChild(el('div', { class: 'field' }, [el('span', { class: 'lbl', text: 'Card name pattern' }), pat, el('p', { class: 'hint', text: 'Placeholders: {id} {name} {category} {type}' }), ex]));

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
    wrap.appendChild(el('p', { class: 'hint', text: 'Copy the whole configuration as JSON to keep a backup or reuse it on another board. Paste a JSON here and click Load to fill the editor; nothing changes until you Save.' }));
    var json = el('textarea', { id: 's-json', style: 'min-height:120px;font-family:var(--mono);font-size:12px' });
    json.value = JSON.stringify(R.normalizeConfig(JSON.parse(JSON.stringify(cfg))), null, 2);
    var copy = el('button', { type: 'button', class: 'btn small', text: 'Copy JSON' });
    copy.addEventListener('click', function () {
      json.value = JSON.stringify(R.normalizeConfig(JSON.parse(JSON.stringify(cfg))), null, 2);
      json.select();
      try { navigator.clipboard.writeText(json.value); copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy JSON'; }, 1500); } catch (e) { /* user can copy manually */ }
    });
    var load = el('button', { type: 'button', class: 'btn small', text: 'Load JSON into editor' });
    var jsonMsg = el('span', { class: 'hint' });
    load.addEventListener('click', function () {
      try {
        var parsed = JSON.parse(json.value);
        var next = R.mergeConfig(parsed);
        jsonMsg.textContent = '';
        renderEditor(root, t, next, labels, lists, cards, me, opts);
        root.scrollTop = 0;
      } catch (e) { jsonMsg.textContent = 'Not valid JSON: ' + e.message; }
    });
    wrap.appendChild(el('div', { class: 'field' }, [json, el('div', { class: 'row' }, [el('span', { class: 'fixed' }, [copy]), el('span', { class: 'fixed' }, [load]), jsonMsg])]));

    /* Actions */
    var msg = el('div', { class: 'notice ok', style: 'display:none' });
    var save = el('button', { type: 'button', class: 'btn primary', id: 's-save', text: 'Save settings' });
    var cancel = el('button', { type: 'button', class: 'btn link', text: 'Cancel' });
    cancel.addEventListener('click', function () { t.closeModal(); });
    save.addEventListener('click', function () {
      save.disabled = true; save.innerHTML = '<span class="spin"></span>Saving…';
      R.saveConfig(t, cfg).then(function () {
        save.disabled = false; save.textContent = 'Save settings';
        msg.className = 'notice ok'; msg.textContent = 'Saved. The form now uses these settings.'; msg.style.display = 'block';
        json.value = JSON.stringify(cfg, null, 2);
        if (opts.onSaved) opts.onSaved(cfg);
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
