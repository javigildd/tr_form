/* Request Form — the request form. Renders into a root element with a Trello t (real or mock).
   Every label, option and hint comes from the board configuration (see common.js DEFAULTS). */
(function (global) {
  'use strict';
  var R = global.RF, el = R.el;

  function render(root, t, opts) {
    opts = opts || {};
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'pu' }, [el('p', { class: 'muted' }, [el('span', { class: 'spin' }), 'Loading form…'])]));

    Promise.all([R.loadConfig(t), t.board('labels', 'name'), t.lists('id', 'name'), R.ops.cardNames(t).catch(function () { return []; })]).then(function (r) {
      var cfg = r[0], labels = r[1].labels || [], lists = r[2] || [];
      var labelById = {}; labels.forEach(function (l) { labelById[l.id] = l; });
      var destList = lists.filter(function (l) { return l.id === cfg.listId; })[0]
        || lists.filter(function (l) { return /^requests?$/i.test(l.name); })[0] || lists[0];
      var cats = cfg.category.options, types = cfg.type.options;

      var state = { category: -1, type: -1, cover: null, coverUrl: null, files: [] };
      var wrap = el('div', { class: 'pu' });

      /* ID shown while the form is being filled: first digits of the block + XX (1XX, 9XX), or XXX with nothing chosen. */
      function idMask() { return state.category < 0 ? 'XXX' : String(R.baseOf(cats[state.category], state.category)).slice(0, -2) + 'XX'; }
      function linkValues() { return linkFields.map(function (f) { return { label: f.def.label, value: f.input.value.trim() }; }); }
      function draft() {
        var cat = state.category >= 0 ? cats[state.category] : null, ty = state.type >= 0 ? types[state.type] : null;
        var name = nameIn.value.trim();
        return {
          name: name, category: cat ? cat.name : '', type: ty ? ty.name : '', idMask: idMask(),
          categoryLabel: cfg.category.label, typeLabel: cfg.type.label, notesLabel: cfg.notes.label,
          cardName: R.buildName(cfg.pattern, { id: idMask(), name: name || cfg.name.label, category: cat ? cat.name : '', type: ty ? ty.name : '' }),
          labels: [cat && cat.label, ty && ty.label].map(function (id) { return id && labelById[id]; }).filter(Boolean),
          coverUrl: state.coverUrl, links: linkValues(), notes: notes.value.trim(),
          files: state.files.map(function (f) { return { name: f.name, isImage: /^image\//.test(f.type), url: f.__url }; }),
          list: destList ? destList.name : ''
        };
      }
      function emit() { if (opts.onChange) opts.onChange(draft()); }

      /* --- Thumbnail / cover (top) --- */
      var coverIn = el('input', { type: 'file', accept: 'image/*' });
      var coverImg = el('img', { alt: 'Thumbnail preview' });
      var coverEmpty = el('div', {}, [
        el('div', { class: 'ico', text: '🖼' }),
        el('div', { class: 't', text: 'Thumbnail' }),
        el('div', { class: 's', html: 'Drag an image here or <b>browse your computer</b>' })
      ]);
      var coverTools = el('div', { class: 'tools' });
      var replaceBtn = el('button', { type: 'button', text: 'Replace' });
      var removeBtn = el('button', { type: 'button', text: 'Remove' });
      replaceBtn.addEventListener('click', function (e) { e.stopPropagation(); coverIn.click(); });
      removeBtn.addEventListener('click', function (e) { e.stopPropagation(); setCover(null); });
      coverTools.appendChild(replaceBtn); coverTools.appendChild(removeBtn);
      var cover = el('div', { class: 'cover', role: 'button', tabindex: '0', 'aria-label': 'Add a thumbnail image' }, [coverEmpty, coverIn]);
      cover.addEventListener('click', function () { if (!state.cover) coverIn.click(); });
      cover.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coverIn.click(); } });
      coverIn.addEventListener('change', function () { if (coverIn.files[0]) setCover(coverIn.files[0]); coverIn.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) { cover.addEventListener(ev, function (e) { e.preventDefault(); cover.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { cover.addEventListener(ev, function (e) { e.preventDefault(); cover.classList.remove('over'); }); });
      cover.addEventListener('drop', function (e) {
        var f = Array.prototype.filter.call(e.dataTransfer.files, function (x) { return /^image\//.test(x.type); })[0];
        if (f) setCover(f); else toast('Drop an image file (PNG, JPG, GIF, WebP).');
      });
      function setCover(file) {
        if (file && !/^image\//.test(file.type)) { toast('The thumbnail must be an image.'); return; }
        if (file && file.size > 10 * 1024 * 1024) { toast('Image is over 10 MB. Please use a smaller file.'); return; }
        if (state.coverUrl) { try { URL.revokeObjectURL(state.coverUrl); } catch (e) {} }
        state.cover = file || null; state.coverUrl = file ? URL.createObjectURL(file) : null;
        cover.innerHTML = ''; cover.appendChild(coverIn);
        if (file) { coverImg.src = state.coverUrl; cover.appendChild(coverImg); cover.appendChild(coverTools); cover.classList.add('has'); }
        else { cover.appendChild(coverEmpty); cover.classList.remove('has'); }
        emit();
      }
      var fCover = field('Thumbnail', false, cover, 'Shown as the card cover on the board.');

      /* --- Name (left) + category (right) --- */
      var nameIn = el('input', { type: 'text', id: 'f-name', maxlength: '120', placeholder: cfg.name.placeholder });
      nameIn.addEventListener('input', function () { clearInvalid(fName); emit(); });
      var fName = field(cfg.name.label, true, nameIn, cfg.name.hint, 'A name is required.');

      var cSel = el('select', { id: 'f-category' }, [el('option', { value: '', text: 'Select…' })]);
      cats.forEach(function (o, i) { cSel.appendChild(el('option', { value: String(i), text: o.name })); });
      cSel.addEventListener('change', function () { state.category = cSel.value === '' ? -1 : Number(cSel.value); clearInvalid(fCategory); emit(); });
      var fCategory = field(cfg.category.label, true, cSel, cfg.category.hint, 'Pick one.');
      var twoCol = el('div', { class: 'two' }, [fName, fCategory]);

      /* --- Type --- */
      var seg = el('div', { class: 'seg', role: 'group', 'aria-label': cfg.type.label });
      types.forEach(function (ty, i) {
        var b = el('button', { type: 'button', 'aria-pressed': 'false', text: ty.name });
        b.addEventListener('click', function () {
          state.type = i; Array.prototype.forEach.call(seg.children, function (c, j) { c.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
          clearInvalid(fType); emit();
        });
        seg.appendChild(b);
      });
      var fType = field(cfg.type.label, true, seg, null, 'Choose one.');

      /* --- Links (as many as configured) --- */
      var linkFields = cfg.links.map(function (def, i) {
        var input = el('input', { type: 'url', id: 'f-link' + i, placeholder: def.placeholder });
        var f = field(def.label, def.required, input, null, 'Paste a valid link (https://…).');
        input.addEventListener('input', function () { clearInvalid(f); emit(); });
        return { def: def, input: input, field: f };
      });

      /* --- Notes + files --- */
      var notes = el('textarea', { id: 'f-notes', placeholder: cfg.notes.placeholder });
      var thumbs = el('div', { class: 'thumbs' });
      var fileIn = el('input', { type: 'file', accept: 'image/*,.pdf,.mov,.mp4,.zip', multiple: 'multiple' });
      var pick = el('span', { class: 'pick', text: 'browse files' });
      pick.addEventListener('click', function () { fileIn.click(); });
      var drop = el('div', { class: 'dropzone' }, ['Paste images into the text, drag files here, or ', pick, '. They are attached to the card and images are shown inline.', fileIn, thumbs]);
      fileIn.addEventListener('change', function () { addFiles(fileIn.files); fileIn.value = ''; });
      notes.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.files) || [];
        if (items.length) { e.preventDefault(); addFiles(items); }
      });
      notes.addEventListener('input', function () { clearInvalid(fNotes); emit(); });
      ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
      drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
      var fNotes = field(cfg.notes.label, cfg.notes.required, el('div', {}, [notes, drop]), null, 'This field is required.');

      function addFiles(list) {
        Array.prototype.forEach.call(list, function (f) {
          if (f.size > 10 * 1024 * 1024) { toast('"' + f.name + '" is over 10 MB and was skipped.'); return; }
          if (/^image\//.test(f.type)) f.__url = URL.createObjectURL(f);
          state.files.push(f);
        });
        drawThumbs(); emit();
      }
      function drawThumbs() {
        thumbs.innerHTML = '';
        state.files.forEach(function (f, i) {
          var th = el('div', { class: 'thumb', title: f.name });
          if (f.__url) { var img = el('img', { alt: f.name }); img.src = f.__url; th.appendChild(img); }
          else th.appendChild(el('span', { text: f.name }));
          var x = el('button', { type: 'button', class: 'x', text: '×', 'aria-label': 'Remove ' + f.name });
          x.addEventListener('click', function () { state.files.splice(i, 1); drawThumbs(); emit(); });
          th.appendChild(x); thumbs.appendChild(th);
        });
      }

      /* --- Actions --- */
      var errBox = el('div', { class: 'notice warn', style: 'display:none' });
      var submit = el('button', { type: 'button', class: 'btn primary', id: 'f-submit', text: 'Create' });
      var cancel = el('button', { type: 'button', class: 'btn link', text: 'Cancel' });
      cancel.addEventListener('click', function () { t.closeModal(); });
      submit.addEventListener('click', onSubmit);

      wrap.appendChild(el('h1', { text: cfg.title }));
      wrap.appendChild(el('p', { class: 'lede', text: 'Creates a card in “' + (destList ? destList.name : '?') + '” with the right labels and the next free ID.' }));
      [fCover, twoCol, fType].concat(linkFields.map(function (f) { return f.field; })).concat([fNotes]).forEach(function (f) { wrap.appendChild(f); });
      wrap.appendChild(el('div', { class: 'actions' }, [errBox, el('span', { class: 'spacer' }), cancel, submit]));
      root.innerHTML = ''; root.appendChild(wrap); emit();

      function onSubmit() {
        var bad = [];
        if (!nameIn.value.trim()) bad.push(fName);
        if (state.category < 0) bad.push(fCategory);
        if (state.type < 0) bad.push(fType);
        var links = linkValues();
        linkFields.forEach(function (f, i) { var v = links[i].value; if ((f.def.required && !v) || (v && !R.isUrl(v))) bad.push(f.field); });
        if (cfg.notes.required && !notes.value.trim() && !state.files.length) bad.push(fNotes);
        bad.forEach(function (f) { f.classList.add('invalid'); });
        if (bad.length) { bad[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

        submit.disabled = true; submit.innerHTML = '<span class="spin"></span>Creating…'; errBox.style.display = 'none';
        var cat = cats[state.category], ty = types[state.type], card, finalId, finalName, coverUrl = null;

        R.ensureAuth(t)
          .then(function () { return R.ops.cardNames(t); })            // fresh scan right before creating
          .then(function (names) {
            finalId = R.nextIdFor(R.baseOf(cat, state.category), names);
            finalName = R.buildName(cfg.pattern, { id: finalId, name: nameIn.value.trim(), category: cat.name, type: ty.name });
            var idLabels = [cat.label, ty.label].filter(function (id) { return id && labelById[id]; });
            return R.ops.createCard(t, { idList: destList.id, name: finalName, idLabels: idLabels,
              desc: R.buildDesc(cfg, { category: cat.name, type: ty.name, links: links, notes: notes.value.trim() }) });
          })
          .then(function (c) {
            card = c;
            var chain = Promise.resolve();
            if (state.cover) chain = chain.then(function () { return R.ops.attachFile(t, card, state.cover); })
              .then(function (a) { coverUrl = a && a.url; return R.ops.setCover(t, card, a); });
            links.forEach(function (l) { if (l.value) chain = chain.then(function () { return R.ops.attachUrl(t, card, l.value, l.label); }); });
            var imgs = [];
            state.files.forEach(function (f) {
              chain = chain.then(function () { return R.ops.attachFile(t, card, f); })
                .then(function (a) { if (a && a.url && /^image\//.test(f.type)) imgs.push('![' + f.name + '](' + a.url + ')'); });
            });
            return chain.then(function () {
              if (imgs.length) return R.ops.updateDesc(t, card, card.desc + '\n\n### Attached images\n' + imgs.join('\n'));
            });
          })
          .then(function () {
            showDone(root, t, { name: finalName, url: card.url || card.shortUrl, cover: coverUrl && coverUrl !== '#' ? coverUrl : (state.cover ? URL.createObjectURL(state.cover) : null),
              labels: [cat.label, ty.label].map(function (id) { return labelById[id]; }).filter(Boolean), list: destList.name }, opts);
            if (opts.onChange) opts.onChange(null);
            if (opts.onCreated) opts.onCreated(card);
          })
          .catch(function (e) {
            console.error(e);
            submit.disabled = false; submit.textContent = 'Create';
            errBox.textContent = 'Could not create the card. ' + (e && e.message ? e.message : 'Please try again.');
            errBox.style.display = 'block';
          });
      }

      function toast(msg) { t.alert({ message: msg, duration: 5, display: 'warning' }); }
    }).catch(function (e) {
      console.error(e);
      root.innerHTML = ''; root.appendChild(el('div', { class: 'pu' }, [el('div', { class: 'notice warn', text: 'Could not load the form: ' + e.message })]));
    });
  }

  function field(label, required, control, hint, errText) {
    return el('div', { class: 'field' }, [
      el('span', { class: 'lbl' }, [label, required ? el('span', { class: 'req', text: '*', title: 'Required' }) : null]),
      control,
      hint ? el('p', { class: 'hint', text: hint }) : null,
      el('span', { class: 'err', text: errText || 'This field is required.' })
    ]);
  }
  function clearInvalid(f) { f.classList.remove('invalid'); }

  function showDone(root, t, d, opts) {
    var chips = el('div', { class: 'chips' });
    d.labels.forEach(function (l) { chips.appendChild(el('span', { class: 'chip', text: l.name, style: 'background:' + R.labelHex(l.color) + ';color:' + R.labelInk(l.color) })); });
    var again = el('button', { type: 'button', class: 'btn', text: 'Create another' });
    again.addEventListener('click', function () { render(root, t, opts); });
    var close = el('button', { type: 'button', class: 'btn primary', text: 'Done' });
    close.addEventListener('click', function () { t.closeModal(); });
    var open = d.url && d.url !== '#' ? el('a', { class: 'btn link', href: d.url, target: '_blank', rel: 'noopener', text: 'Open card' }) : null;
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'pu done' }, [
      el('div', { class: 'big', text: '✓' }),
      el('h1', { text: 'Card created' }),
      el('div', { class: 'card-name', text: d.name }),
      d.cover ? el('div', { class: 'cover-done' }, [el('img', { src: d.cover, alt: 'Thumbnail' })]) : null,
      chips,
      el('p', { class: 'muted', text: 'Added to the top of “' + d.list + '”.' }),
      el('div', { class: 'actions', style: 'justify-content:center' }, [open, again, close])
    ]));
  }

  global.RFForm = { render: render };
})(window);
