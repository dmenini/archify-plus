    Archify.configView = (function () {
      var JS_KEYWORDS = Object.create(null);
      JS_KEYWORDS['true'] = true;
      JS_KEYWORDS['false'] = true;
      JS_KEYWORDS['null'] = true;
      JS_KEYWORDS['undefined'] = true;
      var STRING_LITERAL_RE = /'[^']*'|"[^"]*"/g;

      function extractIdentifiers(expr) {
        var withoutStringLiterals = expr.replace(STRING_LITERAL_RE, ' ');
        var matches = withoutStringLiterals.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [];
        var seen = Object.create(null);
        var result = [];
        for (var i = 0; i < matches.length; i += 1) {
          var m = matches[i];
          if (!JS_KEYWORDS[m] && !seen[m]) { seen[m] = true; result.push(m); }
        }
        return result;
      }

      function compileExpr(expr, knownIds) {
        var ids = extractIdentifiers(expr);
        var unknown = [];
        for (var i = 0; i < ids.length; i += 1) {
          if (!knownIds[ids[i]]) unknown.push(ids[i]);
        }
        if (unknown.length > 0) {
          throw new Error('Unknown identifier(s) in expression "' + expr + '": ' + unknown.join(', '));
        }
        // eslint-disable-next-line no-new-func
        return new Function('state', 'with (state) { return (' + expr + '); }');
      }

      function evaluateSpec(spec, fieldValues) {
        var declaredIds = Object.create(null);
        var i;
        for (i = 0; i < spec.fields.length; i += 1) declaredIds[spec.fields[i].id] = true;
        var derived = spec.derived || [];
        for (i = 0; i < derived.length; i += 1) declaredIds[derived[i].id] = true;

        var state = {};
        for (var key in fieldValues) { if (Object.prototype.hasOwnProperty.call(fieldValues, key)) state[key] = fieldValues[key]; }
        for (i = 0; i < derived.length; i += 1) {
          var fn = compileExpr(derived[i].expr, declaredIds);
          state[derived[i].id] = !!fn(state);
        }

        var hiddenNodes = Object.create(null);
        var attnNodes = Object.create(null);
        var hiddenEdges = Object.create(null);
        var attnEdges = Object.create(null);
        var setText = Object.create(null);
        var hiddenNodesList = [];
        var attnNodesList = [];
        var hiddenEdgesList = [];
        var attnEdgesList = [];

        function addNode(set, list, id) { if (!set[id]) { set[id] = true; list.push(id); } }
        function addEdge(set, list, a, b) { var key = a + '>' + b; if (!set[key]) { set[key] = true; list.push(key); } }

        var rules = spec.rules || [];
        for (i = 0; i < rules.length; i += 1) {
          var rule = rules[i];
          var ruleFn = compileExpr(rule.when, declaredIds);
          if (!ruleFn(state)) continue;
          var j;
          if (rule.hide && rule.hide.nodes) for (j = 0; j < rule.hide.nodes.length; j += 1) addNode(hiddenNodes, hiddenNodesList, rule.hide.nodes[j]);
          if (rule.hide && rule.hide.edges) for (j = 0; j < rule.hide.edges.length; j += 1) addEdge(hiddenEdges, hiddenEdgesList, rule.hide.edges[j][0], rule.hide.edges[j][1]);
          if (rule.attn && rule.attn.nodes) for (j = 0; j < rule.attn.nodes.length; j += 1) addNode(attnNodes, attnNodesList, rule.attn.nodes[j]);
          if (rule.attn && rule.attn.edges) for (j = 0; j < rule.attn.edges.length; j += 1) addEdge(attnEdges, attnEdgesList, rule.attn.edges[j][0], rule.attn.edges[j][1]);
          if (rule.setText) {
            for (var nodeId in rule.setText) {
              if (!Object.prototype.hasOwnProperty.call(rule.setText, nodeId)) continue;
              setText[nodeId] = setText[nodeId] || {};
              var patch = rule.setText[nodeId];
              for (var patchKey in patch) {
                if (Object.prototype.hasOwnProperty.call(patch, patchKey)) setText[nodeId][patchKey] = patch[patchKey];
              }
            }
          }
        }

        var warnings = [];
        var warningSpecs = spec.warnings || [];
        var order = { danger: 0, warn: 1, info: 2 };
        for (i = 0; i < warningSpecs.length; i += 1) {
          var warnFn = compileExpr(warningSpecs[i].when, declaredIds);
          if (warnFn(state)) warnings.push(warningSpecs[i]);
        }
        warnings.sort(function (a, b) { return order[a.level] - order[b.level]; });

        // Attach `has()` lookups onto the already-collected id lists so the
        // result mirrors the Node-side evaluator's Set return value (both
        // iterable, for the cross-runtime parity test, and has()-queryable,
        // for render()'s per-node/per-edge attribute toggling below).
        hiddenNodesList.has = function (id) { return !!hiddenNodes[id]; };
        attnNodesList.has = function (id) { return !!attnNodes[id]; };
        hiddenEdgesList.has = function (key) { return !!hiddenEdges[key]; };
        attnEdgesList.has = function (key) { return !!attnEdges[key]; };

        return {
          state: state,
          hiddenNodes: hiddenNodesList,
          attnNodes: attnNodesList,
          hiddenEdges: hiddenEdgesList,
          attnEdges: attnEdgesList,
          setText: setText,
          warnings: warnings
        };
      }

      var specEl = document.getElementById('archify-config-view-data');
      if (!specEl) return { render: function () {}, active: function () { return false; }, close: function () {}, __evaluateSpecForTests: evaluateSpec };
      var SPEC = JSON.parse(specEl.textContent);

      var panel = document.getElementById('config-view-panel');
      var toggle = document.getElementById('config-view-toggle');
      var body = document.getElementById('config-view-body');
      var fieldsContainer = document.getElementById('config-view-fields');
      var warningsContainer = document.getElementById('config-view-warnings');

      function renderFieldControl(field) {
        var wrap = document.createElement('div');
        wrap.className = 'config-view-field';
        if (field.type === 'checkbox') {
          var label = document.createElement('label');
          var input = document.createElement('input');
          input.type = 'checkbox';
          input.setAttribute('data-config-field', field.id);
          input.checked = !!field.default;
          label.appendChild(input);
          label.appendChild(document.createTextNode(' ' + field.label));
          wrap.appendChild(label);
        } else {
          var select = document.createElement('select');
          select.setAttribute('data-config-field', field.id);
          for (var i = 0; i < field.options.length; i += 1) {
            var opt = document.createElement('option');
            opt.value = field.options[i].value;
            opt.textContent = field.options[i].label;
            if (field.options[i].value === field.default) opt.selected = true;
            select.appendChild(opt);
          }
          var selectLabel = document.createElement('label');
          selectLabel.appendChild(document.createTextNode(field.label));
          selectLabel.appendChild(select);
          wrap.appendChild(selectLabel);
        }
        return wrap;
      }

      function readFieldValues() {
        var values = {};
        for (var i = 0; i < SPEC.fields.length; i += 1) {
          var f = SPEC.fields[i];
          var el = fieldsContainer.querySelector('[data-config-field="' + f.id + '"]');
          values[f.id] = f.type === 'checkbox' ? el.checked : el.value;
        }
        return values;
      }

      var allNodeIds = null;
      var allEdgeKeys = null;

      function collectAllNodeIds() {
        var ids = [];
        var seen = Object.create(null);
        var els = document.querySelectorAll('[data-node-id]');
        for (var i = 0; i < els.length; i += 1) {
          var id = els[i].getAttribute('data-node-id');
          if (!seen[id]) { seen[id] = true; ids.push(id); }
        }
        return ids;
      }
      function collectAllEdgeKeys() {
        var keys = [];
        var seen = Object.create(null);
        var els = document.querySelectorAll('[data-edge-from][data-edge-to]');
        for (var i = 0; i < els.length; i += 1) {
          var key = els[i].getAttribute('data-edge-from') + '>' + els[i].getAttribute('data-edge-to');
          if (!seen[key]) { seen[key] = true; keys.push(key); }
        }
        return keys;
      }
      function applyAttr(selector, attr, on) {
        var els = document.querySelectorAll(selector);
        for (var i = 0; i < els.length; i += 1) {
          if (on) els[i].setAttribute(attr, ''); else els[i].removeAttribute(attr);
        }
      }

      function render() {
        if (!allNodeIds) allNodeIds = collectAllNodeIds();
        if (!allEdgeKeys) allEdgeKeys = collectAllEdgeKeys();
        var result = evaluateSpec(SPEC, readFieldValues());

        for (var i = 0; i < allNodeIds.length; i += 1) {
          var id = allNodeIds[i];
          applyAttr('[data-node-id="' + id + '"]', 'data-config-hidden', result.hiddenNodes.has(id));
          applyAttr('[data-node-id="' + id + '"]', 'data-config-attn', result.attnNodes.has(id));
        }
        for (i = 0; i < allEdgeKeys.length; i += 1) {
          var key = allEdgeKeys[i];
          var parts = key.split('>');
          var sel = '[data-edge-from="' + parts[0] + '"][data-edge-to="' + parts[1] + '"]';
          applyAttr(sel, 'data-config-hidden', result.hiddenEdges.has(key));
          applyAttr(sel, 'data-config-attn', result.attnEdges.has(key));
        }

        for (var nodeId in result.setText) {
          if (!Object.prototype.hasOwnProperty.call(result.setText, nodeId)) continue;
          var patch = result.setText[nodeId];
          if (patch.sub !== undefined) {
            var subEl = document.querySelector('[data-node-id="' + nodeId + '"] text[data-detail="context"]');
            if (subEl) subEl.textContent = patch.sub;
          }
        }

        warningsContainer.innerHTML = '';
        for (var w = 0; w < result.warnings.length; w += 1) {
          var warning = result.warnings[w];
          var li = document.createElement('li');
          li.className = warning.level;
          var tag = document.createElement('span');
          tag.className = 'config-view-tag';
          tag.textContent = warning.level;
          li.appendChild(tag);
          li.appendChild(document.createTextNode(warning.text));
          if (warning.doc) {
            var doc = document.createElement('span');
            doc.className = 'config-view-doc';
            doc.textContent = 'See: ' + warning.doc;
            li.appendChild(doc);
          }
          warningsContainer.appendChild(li);
        }
      }

      var lastSection = null;
      for (var i = 0; i < SPEC.fields.length; i += 1) {
        var field = SPEC.fields[i];
        if (field.section && field.section !== lastSection) {
          var sectionTitle = document.createElement('div');
          sectionTitle.className = 'config-view-section-title';
          sectionTitle.textContent = field.section;
          fieldsContainer.appendChild(sectionTitle);
        }
        lastSection = field.section || null;
        fieldsContainer.appendChild(renderFieldControl(field));
      }
      toggle.textContent = 'Configuration';
      fieldsContainer.addEventListener('change', render);
      function close() {
        if (toggle.getAttribute('aria-expanded') !== 'true') return;
        toggle.setAttribute('aria-expanded', 'false');
        body.hidden = true;
        document.body.setAttribute('data-config-view-open', 'false');
      }

      toggle.addEventListener('click', function () {
        var expanded = toggle.getAttribute('aria-expanded') === 'true';
        if (expanded) {
          close();
          return;
        }
        if (window.Archify && window.Archify.threatRisks) window.Archify.threatRisks.close();
        toggle.setAttribute('aria-expanded', 'true');
        body.hidden = false;
        document.body.setAttribute('data-config-view-open', 'true');
      });
      panel.hidden = false;
      render();

      return {
        render: render,
        active: function () { return true; },
        close: close,
        __evaluateSpecForTests: evaluateSpec
      };
    })();
