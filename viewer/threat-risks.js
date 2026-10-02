    Archify.threatRisks = (function () {
      var dataEl = document.getElementById('archify-crossings-data');
      var CROSSINGS = dataEl ? JSON.parse(dataEl.textContent) : [];

      var panel = document.getElementById('threat-risks-panel');
      var toggle = document.getElementById('threat-risks-toggle');
      var drawer = document.getElementById('threat-risks-drawer');
      var list = document.getElementById('threat-risks-list');
      if (!panel || !toggle || !drawer || !list || CROSSINGS.length === 0) {
        return { open: function () {}, close: function () {}, isOpen: function () { return false; } };
      }

      function rankRows(crossings) {
        var flattened = [];
        for (var i = 0; i < crossings.length; i += 1) {
          var crossing = crossings[i];
          var rows = crossing.rows || [];
          for (var j = 0; j < rows.length; j += 1) {
            var row = rows[j];
            if (row.rating === undefined || row.rating === null) continue;
            flattened.push({
              crossingId: crossing.id,
              crossingLabel: crossing.label,
              category: row.category,
              status: row.status,
              severity: row.severity,
              rating: row.rating,
            });
          }
        }
        flattened.sort(function (a, b) { return b.rating - a.rating; });
        return flattened;
      }

      function escHtml(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function categoryLabel(category) {
        return String(category).split('-').map(function (word) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
      }

      function renderRow(entry, index) {
        var div = document.createElement('div');
        div.className = 'threat-risks-item';
        div.setAttribute('role', 'button');
        div.setAttribute('tabindex', '0');
        // The category is the row's bold/prominent text, not the crossing
        // label: when several ranked rows share one crossing (the common
        // case — most edges cross exactly one named boundary), the crossing
        // label is identical across all of them, so making it the dominant
        // text makes every row look the same at a glance. The STRIDE
        // category is what actually differs row to row.
        div.innerHTML = '' +
          '<div class="threat-risks-top">' +
          '<span class="threat-risks-rank">#' + (index + 1) + '</span>' +
          '<span class="threat-risks-category">' + escHtml(categoryLabel(entry.category)) + '</span>' +
          '<span class="threat-risks-rating">' + entry.rating + '</span>' +
          '</div>' +
          '<div class="threat-risks-meta">' + escHtml(entry.crossingLabel) + ' · ' + escHtml(entry.status) + '</div>';
        div.addEventListener('click', function () { focusCrossing(entry.crossingId); });
        div.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            focusCrossing(entry.crossingId);
          }
        });
        return div;
      }

      function focusCrossing(crossingId) {
        var crossing = CROSSINGS.filter(function (c) { return c.id === crossingId; })[0];
        if (!crossing) return;
        var nodeIds = (crossing.members && crossing.members.nodes) || [];
        var edgeIds = [];
        var edgePairs = (crossing.members && crossing.members.edges) || [];
        for (var i = 0; i < edgePairs.length; i += 1) {
          edgeIds.push(edgePairs[i][0]);
          edgeIds.push(edgePairs[i][1]);
        }
        var allIds = nodeIds.concat(edgeIds);
        if (allIds.length && window.Archify && window.Archify.focus && window.Archify.focus.setMany) {
          window.Archify.focus.setMany(allIds, { toggle: false });
        }
        if (allIds.length && window.Archify && window.Archify.view && window.Archify.view.reveal) {
          window.Archify.view.reveal(allIds, { includeNeighbors: true, reason: 'threat-risks' });
        }
        if (window.Archify && window.Archify.threatPassport) window.Archify.threatPassport.open(crossingId);
      }

      function render() {
        var ranked = rankRows(CROSSINGS);
        list.innerHTML = '';
        for (var i = 0; i < ranked.length; i += 1) list.appendChild(renderRow(ranked[i], i));
      }

      function open() {
        if (window.Archify && window.Archify.configView) window.Archify.configView.close();
        toggle.setAttribute('aria-expanded', 'true');
        drawer.hidden = false;
        document.body.setAttribute('data-threat-risks-open', 'true');
      }

      function close() {
        if (toggle.getAttribute('aria-expanded') !== 'true') return;
        toggle.setAttribute('aria-expanded', 'false');
        drawer.hidden = true;
        document.body.setAttribute('data-threat-risks-open', 'false');
      }

      function isOpen() {
        return toggle.getAttribute('aria-expanded') === 'true';
      }

      toggle.addEventListener('click', function () {
        if (isOpen()) close(); else open();
      });

      render();
      panel.hidden = false;

      return { open: open, close: close, isOpen: isOpen };
    })();
