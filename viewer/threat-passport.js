    Archify.threatPassport = (function () {
      var dataEl = document.getElementById('archify-crossings-data');
      var CROSSINGS = dataEl ? JSON.parse(dataEl.textContent) : [];

      var panel = document.getElementById('threat-passport-panel');
      var body = document.getElementById('threat-passport-body');
      var closeButton = document.getElementById('threat-passport-close');

      function findCrossingsByIds(crossings, idString) {
        var ids = String(idString).trim().split(/\s+/).filter(Boolean);
        var byId = {};
        for (var i = 0; i < crossings.length; i += 1) byId[crossings[i].id] = crossings[i];
        var result = [];
        for (var j = 0; j < ids.length; j += 1) {
          if (byId[ids[j]]) result.push(byId[ids[j]]);
        }
        return result;
      }

      function escHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function renderFactorsTable(factors) {
        if (!factors || Object.keys(factors).length === 0) return '';
        var cells = Object.keys(factors).map(function (key) {
          return '<th>' + escHtml(key.toUpperCase()) + '</th>';
        }).join('');
        var values = Object.keys(factors).map(function (key) {
          return '<td>' + escHtml(factors[key]) + '</td>';
        }).join('');
        return '<table class="threat-passport-factors"><tr>' + cells + '</tr><tr>' + values + '</tr></table>';
      }

      function renderRow(row, index) {
        var severityClass = row.severity ? ' threat-passport-row--' + row.severity : '';
        return '' +
          '<div class="threat-passport-row' + severityClass + '" data-row-index="' + index + '">' +
          '<div class="threat-passport-row-head">' +
          '<span class="threat-passport-category">' + escHtml(row.category) + '</span>' +
          '<span class="threat-passport-status">' + escHtml(row.status) + '</span>' +
          (row.rating !== undefined ? '<span class="threat-passport-rating">' + escHtml(row.rating) + '</span>' : '') +
          '</div>' +
          (row.threat ? '<p class="threat-passport-field"><strong>Threat:</strong> ' + escHtml(row.threat) + '</p>' : '') +
          (row.vulnerability ? '<p class="threat-passport-field"><strong>Vulnerability:</strong> ' + escHtml(row.vulnerability) + '</p>' : '') +
          (row.comment ? '<p class="threat-passport-field"><strong>Comment:</strong> ' + escHtml(row.comment) + '</p>' : '') +
          (row.mitigation ? '<p class="threat-passport-field"><strong>Mitigation:</strong> ' + escHtml(row.mitigation) + '</p>' : '') +
          renderFactorsTable(row.factors) +
          '</div>';
      }

      function renderCrossing(crossing) {
        return '' +
          '<section class="threat-passport-crossing" data-crossing-id="' + escHtml(crossing.id) + '">' +
          '<h3>' + escHtml(crossing.label) + '</h3>' +
          (crossing.carried_over ? '<span class="threat-passport-tag">carried over</span>' : '') +
          (crossing.evidence ? '<p class="threat-passport-field"><strong>Evidence:</strong> ' + escHtml(crossing.evidence) + '</p>' : '') +
          (crossing.conditional ? '<p class="threat-passport-field"><strong>Conditional:</strong> ' + escHtml(crossing.conditional) + '</p>' : '') +
          (crossing.rows || []).map(renderRow).join('') +
          '</section>';
      }

      // A crossing commonly groups several STRIDE rows under one physical
      // boundary (the whole premise of this feature: most edges cross
      // exactly one named boundary). Opening the passport always renders
      // every row in that crossing — that's correct, the passport is the
      // crossing's full table — but without `highlight`, every entry point
      // into the same crossing (any of its member edges, or any Top Risks
      // row that belongs to it) looks identical: same content, same scroll
      // position. `highlight: { crossingId, rowIndex }` scrolls to and marks
      // the specific row the reader actually clicked through, so distinct
      // entry points into a shared crossing are visibly distinguishable.
      function applyHighlight(highlight) {
        var previous = body.querySelector('.threat-passport-row--highlighted');
        if (previous) previous.classList.remove('threat-passport-row--highlighted');
        if (!highlight) {
          body.scrollTop = 0;
          return;
        }
        var section = body.querySelector('[data-crossing-id="' + highlight.crossingId + '"]');
        var target = section && highlight.rowIndex !== undefined
          ? section.querySelector('[data-row-index="' + highlight.rowIndex + '"]')
          : null;
        if (!target) {
          body.scrollTop = 0;
          return;
        }
        target.classList.add('threat-passport-row--highlighted');
        target.scrollIntoView({ block: 'nearest' });
      }

      function open(ids, options) {
        if (!panel || !body) return;
        var idString = Array.isArray(ids) ? ids.join(' ') : ids;
        var matched = findCrossingsByIds(CROSSINGS, idString);
        if (matched.length === 0) return;
        body.innerHTML = matched.map(renderCrossing).join('');
        panel.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
        applyHighlight(options && options.highlight);
      }

      function close() {
        if (!panel) return;
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
      }

      function isOpen() {
        return !!panel && !panel.hidden;
      }

      if (closeButton) closeButton.addEventListener('click', close);

      // Capture phase, deliberately: Focus's own Direct Relationship Pin
      // feature overlays an invisible, wider hit-target clone on every edge
      // (viewer/focus.js's relationshipHitOverlay) and calls stopPropagation()
      // on click once it reaches that overlay during the bubble phase. A
      // bubble-phase listener here would never fire for a real mouse click,
      // since the browser's own hit-test — not element order in markup —
      // decides event.target, and that overlay sits on top. A capture-phase
      // listener runs on the way down, before Focus's bubble-phase handler
      // gets a chance to stop propagation, so it still sees the click. The
      // clone itself keeps data-crossing-id (Focus's own attribute-removal
      // list only strips its own edge-identity attributes), so this still
      // resolves correctly even when event.target is the clone, not the
      // real edge path.
      document.addEventListener('click', function (event) {
        var target = event.target.closest && event.target.closest('[data-crossing-id]');
        if (!target) return;
        open(target.getAttribute('data-crossing-id'));
      }, true);

      return { open: open, close: close, isOpen: isOpen };
    })();
