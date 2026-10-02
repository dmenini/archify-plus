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

      function renderRow(row) {
        var severityClass = row.severity ? ' threat-passport-row--' + row.severity : '';
        return '' +
          '<div class="threat-passport-row' + severityClass + '">' +
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
          '<section class="threat-passport-crossing">' +
          '<h3>' + escHtml(crossing.label) + '</h3>' +
          (crossing.carried_over ? '<span class="threat-passport-tag">carried over</span>' : '') +
          (crossing.evidence ? '<p class="threat-passport-field"><strong>Evidence:</strong> ' + escHtml(crossing.evidence) + '</p>' : '') +
          (crossing.conditional ? '<p class="threat-passport-field"><strong>Conditional:</strong> ' + escHtml(crossing.conditional) + '</p>' : '') +
          (crossing.rows || []).map(renderRow).join('') +
          '</section>';
      }

      function open(ids) {
        if (!panel || !body) return;
        var idString = Array.isArray(ids) ? ids.join(' ') : ids;
        var matched = findCrossingsByIds(CROSSINGS, idString);
        if (matched.length === 0) return;
        body.innerHTML = matched.map(renderCrossing).join('');
        panel.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
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

      document.addEventListener('click', function (event) {
        var target = event.target.closest && event.target.closest('[data-crossing-id]');
        if (!target) return;
        open(target.getAttribute('data-crossing-id'));
      });

      return { open: open, close: close, isOpen: isOpen };
    })();
