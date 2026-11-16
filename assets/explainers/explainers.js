/* Animated paper explainers.
   Each story builds an SVG once and returns frame(scene, p), which draws scene `scene`
   at progress p in [0, 1] from scratch. The player only advances time, so pausing,
   seeking and replaying are always consistent. Mount with <div data-explainer="poe">. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var W = 640, H = 300;

  // ---------- helpers ----------
  function mk(parent, tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  }
  function set(e, attrs) {
    for (var k in attrs) {
      var v = attrs[k];
      e.setAttribute(k, typeof v === 'number' ? Math.round(v * 100) / 100 : v);
    }
  }
  function show(e, v) {
    v = v < 0.002 ? 0 : v;
    e.style.opacity = v;
    e.style.visibility = v === 0 ? 'hidden' : 'visible';
  }
  function clamp(x, a, b) { return Math.max(a == null ? 0 : a, Math.min(b == null ? 1 : b, x)); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function win(p, a, b) { return ease(clamp((p - a) / (b - a))); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function move(e, x, y, s) { e.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' + (s != null ? ' scale(' + s.toFixed(3) + ')' : '')); }
  function hideAll(list) { list.forEach(function (e) { show(e, 0); }); }
  function pill(parent, x, y, w, h, cls, label, tcls, fs) {
    var g = mk(parent, 'g', {});
    var r = mk(g, 'rect', { x: x, y: y, width: w, height: h, rx: 8, 'class': cls });
    var t = mk(g, 'text', { x: x + w / 2, y: y + h / 2 + (fs || 14) * 0.36, 'text-anchor': 'middle', 'font-size': fs || 14, 'class': tcls || '' }, label);
    g.rect = r; g.text = t;
    return g;
  }
  var CHECK = 'M-6 0 L-2 4 L6 -5';

  // ======================================================================
  // 1. PoE steering of a frozen policy (NeurIPS 2026)
  // ======================================================================
  var poe = {
    tag: 'Explainer · NeurIPS 2026',
    link: '/poe-steering/',
    scenes: [
      { h: 'A trained controller, locked in place', d: 10000,
        p: 'An AI controller for a robot was trained on logged data, tested and approved. The curve shows which actions it prefers. Retraining it would mean new data, new compute and a new safety review, so it stays <b>frozen</b>.' },
      { h: 'Then the goal changes', d: 9000,
        p: 'After deployment the objective moves, for example "run faster". We can train a small, separate <b>guide</b> that prefers actions suited to the new goal, but we may not touch the frozen controller.' },
      { h: 'Multiply the two preferences', d: 11000,
        p: 'We deploy the <b>product</b> of the two curves: actions that both like survive. One knob, &alpha;, sets how much to trust each. We show this is exactly the standard "stay close to the old policy" update (KL regularization), so two methods that were studied separately are one.' },
      { h: 'When the guide is wrong, it is ignored', d: 11000,
        p: 'If the guide becomes vague or broken, the product barely moves, because a flat curve has almost no say. A simple <b>average</b> of the two still drags the robot halfway toward the bad guide. The paper calls this graceful degradation.' },
      { h: 'The honest limit', d: 11000,
        p: 'Across 12 robot benchmark settings, each run with 10 random seeds, steering <b>helped in 4</b>, changed nothing in 4 and <b>hurt in 4</b>. It cannot rescue a weak controller and can hurt one already at its best, so the paper also reports how to tell in advance.' }
    ],
    build: function (svg) {
      var X = function (a) { return 320 + a * 78; }, B = 232;
      function pk(sd) { return Math.min(170, 150 * 0.6 / sd); }
      function curve(mu, sd, fill) {
        var d = '', pts = 140, peak = pk(sd);
        for (var i = 0; i <= pts; i++) {
          var a = -3.6 + 7.2 * i / pts;
          var y = B - peak * Math.exp(-0.5 * Math.pow((a - mu) / sd, 2));
          d += (i ? 'L' : 'M') + X(a).toFixed(1) + ' ' + y.toFixed(1);
        }
        return fill ? d + 'L' + X(3.6) + ' ' + B + 'L' + X(-3.6) + ' ' + B + 'Z' : d;
      }
      function prod(alpha, m1, s1, m2, s2) {
        var l = alpha / (s1 * s1) + (1 - alpha) / (s2 * s2);
        return { mu: (alpha * m1 / (s1 * s1) + (1 - alpha) * m2 / (s2 * s2)) / l, sd: Math.sqrt(1 / l) };
      }
      var AM = -1, AS = 0.6;
      mk(svg, 'line', { x1: 34, y1: B, x2: 606, y2: B, 'class': 's-line', 'stroke-width': 2 });
      mk(svg, 'text', { x: 606, y: B + 24, 'text-anchor': 'end', 'font-size': 13, 'class': 't-mute' }, 'possible actions, e.g. how hard to drive a joint →');
      var postF = mk(svg, 'path', { 'class': 'f-acc', opacity: 0.22 });
      var postL = mk(svg, 'path', { fill: 'none', 'class': 's-acc', 'stroke-width': 3.2 });
      var prior = mk(svg, 'path', { fill: 'none', 'class': 's-soft', 'stroke-width': 2.2, 'stroke-dasharray': '7 6' });
      var actor = mk(svg, 'path', { fill: 'none', 'class': 's-ink', 'stroke-width': 2.6, pathLength: 1, 'stroke-dasharray': 1 });
      actor.setAttribute('d', curve(AM, AS));

      var aLbl = mk(svg, 'g', {});
      var lock = mk(aLbl, 'g', {});
      mk(lock, 'rect', { x: -9, y: -6, width: 18, height: 14, rx: 3, 'class': 'f-ink' });
      mk(lock, 'path', { d: 'M-5 -6 V-10 A5 5 0 0 1 5 -10 V-6', fill: 'none', 'class': 's-ink', 'stroke-width': 2.2 });
      move(lock, X(AM) - 74, 27);
      mk(aLbl, 'text', { x: X(AM) - 58, y: 32, 'font-size': 16, 'font-weight': 600 }, 'Frozen controller');
      var pLbl = mk(svg, 'text', { x: 0, y: 0, 'font-size': 15, 'class': 't-soft' }, 'Guide for the new goal');
      var qLbl = mk(svg, 'text', { x: 0, y: 0, 'font-size': 15, 'font-weight': 700, 'class': 't-acc', 'text-anchor': 'middle' }, 'deployed: product');
      var alphaT = mk(svg, 'text', { x: 40, y: 284, 'font-size': 15, 'class': 't-mono t-acc' }, '');

      var dot = mk(svg, 'circle', { r: 7, cy: B, 'class': 'f-acc' });
      var dotT = mk(svg, 'text', { y: B + 46, 'font-size': 14, 'font-weight': 700, 'text-anchor': 'middle', 'class': 't-acc' }, 'product');
      var tri = mk(svg, 'path', { d: 'M0 0 L-8 13 L8 13 Z', 'class': 'f-r' });
      var triT = mk(svg, 'text', { y: B + 46, 'font-size': 14, 'font-weight': 700, 'text-anchor': 'middle', 'class': 't-r' }, 'average');

      var grid = mk(svg, 'g', {});
      mk(grid, 'text', { x: 320, y: 64, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 600 }, '12 benchmark settings × 10 seeds each');
      var cells = [];
      var groups = [['f-g', 'helps', 't-g'], ['f-line', 'no change', 't-mute'], ['f-r', 'hurts', 't-r']];
      for (var k = 0; k < 12; k++) {
        var gi = Math.floor(k / 4), x0 = 70 + k * 40 + gi * 18;
        cells.push(mk(grid, 'rect', { x: x0, y: 100, width: 32, height: 32, rx: 6, 'class': groups[gi][0] }));
      }
      var glabels = groups.map(function (g, gi) {
        return mk(grid, 'text', { x: 70 + gi * 178 + 76, y: 166, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, 'class': g[2] }, g[1] + ' · 4');
      });
      mk(grid, 'text', { x: 320, y: 214, 'text-anchor': 'middle', 'font-size': 15, 'class': 't-soft' }, 'Steering is bounded by how good the frozen controller already is.');
      var curves = [postF, postL, prior, actor, aLbl, pLbl, qLbl, alphaT, dot, dotT, tri, triT];

      return function (s, p) {
        hideAll(curves); show(grid, 0);
        var pm = 1.5, ps = 0.5, alpha = 0.5;
        if (s === 0) {
          show(actor, 1); actor.style.strokeDashoffset = 1 - win(p, 0, 0.45);
          show(aLbl, win(p, 0.35, 0.6));
          return;
        }
        actor.style.strokeDashoffset = 0;
        if (s <= 3) { show(actor, 1); show(aLbl, 1); }
        if (s === 1) {
          prior.setAttribute('d', curve(pm, ps));
          show(prior, win(p, 0, 0.35));
          set(pLbl, { x: Math.min(X(pm) - 20, 430), y: B - pk(ps) - 14 }); show(pLbl, win(p, 0.25, 0.5));
          return;
        }
        if (s === 2) {
          var u = clamp((p - 0.15) / 0.85);
          alpha = 0.5 + 0.36 * Math.sin(2 * Math.PI * u);
        }
        if (s === 3) {
          var m = win(p, 0.05, 0.5);
          pm = lerp(1.5, 2.6, m); ps = lerp(0.5, 3.2, m);
        }
        if (s === 4) {
          var f = 1 - win(p, 0, 0.18);
          show(actor, f); show(aLbl, f);
          prior.setAttribute('d', curve(2.6, 3.2)); show(prior, f);
          show(grid, win(p, 0.12, 0.3));
          cells.forEach(function (c, k) { show(c, win(p, 0.15 + k * 0.035, 0.22 + k * 0.035)); });
          glabels.forEach(function (t, gi) { show(t, win(p, 0.3 + gi * 0.14, 0.4 + gi * 0.14)); });
          return;
        }
        prior.setAttribute('d', curve(pm, ps)); show(prior, 1);
        set(pLbl, { x: Math.min(X(pm) - 20, 430), y: B - pk(ps) - 14 }); show(pLbl, 1);
        var q = prod(alpha, AM, AS, pm, ps);
        postF.setAttribute('d', curve(q.mu, q.sd, true));
        postL.setAttribute('d', curve(q.mu, q.sd));
        var pin = s === 2 ? win(p, 0, 0.15) : 1;
        show(postF, 0.22 * pin); show(postL, pin);
        set(qLbl, { x: X(q.mu), y: B - pk(q.sd) - 12 }); show(qLbl, pin);
        alphaT.textContent = 'α = ' + alpha.toFixed(2) + '   trust in frozen controller';
        show(alphaT, s === 2 ? pin : 0);
        if (s === 3) {
          set(dot, { cx: X(q.mu) }); show(dot, 1);
          set(dotT, { x: X(q.mu) }); show(dotT, win(p, 0.1, 0.3));
          var avg = (AM + pm) / 2;
          tri.setAttribute('transform', 'translate(' + X(avg).toFixed(1) + ' ' + (B + 4) + ')');
          set(triT, { x: X(avg) });
          show(tri, win(p, 0.5, 0.65)); show(triT, win(p, 0.55, 0.7));
        }
      };
    }
  };

  // ======================================================================
  // 2. UAT-LITE (EACL 2027)
  // ======================================================================
  var uat = {
    tag: 'Explainer · EACL 2027 · illustrative example',
    link: '/uat-lite/',
    scenes: [
      { h: 'Confident, and wrong', d: 10000,
        p: 'Language models often give wrong answers with high confidence. In medicine that is worse than saying "I am not sure". The model here is already trained, and we want a fix that does <b>not</b> require retraining it.' },
      { h: 'Ask the same model ten times', d: 11000,
        p: 'We run the same model about ten times, each time randomly switching off a small fraction of its internal units (<b>Monte Carlo dropout</b>). A model that really understands the sentence gives nearly the same answer every time; this one does not.' },
      { h: 'Disagreement marks the shaky words', d: 10000,
        p: 'Where the runs disagree, the model is unsure. Measuring that spread for every word gives a <b>map of uncertainty</b>: here the model cannot reliably process the negation "not".' },
      { h: 'Listen less to shaky words', d: 11000,
        p: 'Inside a transformer, every word "attends" to the others to build the answer. UAT-LITE turns down the attention paid to uncertain words, so shaky evidence counts for less. No weights of the model change.' },
      { h: 'Know when to hand over', d: 13000,
        p: 'Averaging the runs gives a more honest confidence; below a threshold the model abstains and a person decides. Across three benchmarks, average calibration error falls from 0.107 to 0.096 without retraining. Plain temperature scaling still calibrates overall scores better; what it cannot do is say <b>which words</b> caused the doubt.' }
    ],
    build: function (svg) {
      var words = ['The', 'drug', 'did', 'not', 'reduce', 'deaths'];
      var U = [0.05, 0.18, 0.12, 0.92, 0.55, 0.22];
      var ATT = [0.08, 0.22, 0.08, 0.26, 0.22, 0.14];
      var widths = words.map(function (w) { return w.length * 11 + 26; });
      var total = widths.reduce(function (a, b) { return a + b; }, 0) + 12 * (words.length - 1);
      var x = (W - total) / 2, TY = 122, TH = 40;
      var toks = words.map(function (w, j) {
        var g = mk(svg, 'g', {});
        var r = mk(g, 'rect', { x: x, y: TY, width: widths[j], height: TH, rx: 8, 'class': 'f-elev s-line', 'stroke-width': 1.5 });
        mk(g, 'text', { x: x + widths[j] / 2, y: TY + 27, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 500 }, w);
        var ub = mk(svg, 'rect', { x: x + 8, y: TY + TH + 8, width: widths[j] - 16, height: 0, rx: 3, 'class': 'f-a' });
        g.cx = x + widths[j] / 2; g.r = r; g.ub = ub; g.w = widths[j];
        x += widths[j] + 12;
        return g;
      });
      var uLbl = mk(svg, 'text', { x: (W - total) / 2 - 10, y: TY + TH + 24, 'text-anchor': 'end', 'font-size': 13, 'class': 't-a', 'font-weight': 600 }, 'uncertainty');
      var ans = mk(svg, 'g', {});
      mk(ans, 'rect', { x: 170, y: 22, width: 300, height: 44, rx: 10, 'class': 'f-accs s-acc', 'stroke-width': 1.5 });
      var ansT = mk(ans, 'text', { x: 320, y: 50, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 600 }, 'Model: “the drug worked”');
      var wrong = mk(svg, 'text', { x: 482, y: 50, 'font-size': 16, 'font-weight': 700, 'class': 't-r' }, '✗ wrong');
      var arcs = toks.map(function (t) {
        return mk(svg, 'path', { d: 'M320 66 Q ' + ((320 + t.cx) / 2).toFixed(1) + ' 92 ' + t.cx.toFixed(1) + ' ' + TY, fill: 'none', 'class': 's-acc', 'stroke-linecap': 'round', opacity: 0.7 });
      });
      var form = mk(svg, 'text', { x: 320, y: 238, 'text-anchor': 'middle', 'font-size': 15, 'class': 't-mono t-soft' }, 'attention × e^(−λ · uncertainty)');
      // confidence bar
      var BX = 150, BW = 340, BY = 250;
      var cb = mk(svg, 'g', {});
      mk(cb, 'text', { x: BX - 12, y: BY + 14, 'text-anchor': 'end', 'font-size': 14, 'class': 't-soft' }, 'confidence');
      mk(cb, 'rect', { x: BX, y: BY, width: BW, height: 18, rx: 9, 'class': 'f-line' });
      var cfill = mk(cb, 'rect', { x: BX, y: BY, width: 0, height: 18, rx: 9, 'class': 'f-acc' });
      var cval = mk(cb, 'text', { x: BX + BW + 12, y: BY + 14, 'font-size': 15, 'font-weight': 700, 'class': 't-mono' }, '');
      var thr = mk(svg, 'g', {});
      mk(thr, 'line', { x1: BX + BW * 0.7, x2: BX + BW * 0.7, y1: BY - 8, y2: BY + 26, 'class': 's-ink', 'stroke-width': 2, 'stroke-dasharray': '3 3' });
      mk(thr, 'text', { x: BX + BW * 0.7, y: BY + 40, 'text-anchor': 'middle', 'font-size': 12, 'class': 't-soft' }, 'hand over below 70%');
      var handT = mk(svg, 'text', { x: 320, y: 238, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700, 'class': 't-a' }, 'Not sure → a clinician reviews this case');
      var passT = mk(svg, 'text', { x: 320, y: 100, 'text-anchor': 'middle', 'font-size': 14, 'class': 't-mono t-acc' }, '');
      var CONF = [0.96, 0.41, 0.88, 0.35, 0.62, 0.93, 0.30, 0.71, 0.45, 0.85];
      var hist = mk(svg, 'g', {});
      var hb = CONF.map(function (c, k) { return mk(hist, 'rect', { x: 262 + k * 12, y: 228 - c * 34, width: 8, height: c * 34, rx: 2, 'class': 'f-acc' }); });
      mk(hist, 'text', { x: 250, y: 222, 'text-anchor': 'end', 'font-size': 12, 'class': 't-mute' }, 'each run');
      var mean = CONF.reduce(function (a, b) { return a + b; }, 0) / CONF.length;

      function conf(v) { set(cfill, { width: BW * v }); cval.textContent = Math.round(v * 100) + '%'; }

      return function (s, p) {
        hideAll([wrong, form, thr, handT, passT, hist, uLbl].concat(arcs));
        toks.forEach(function (t) { t.removeAttribute('transform'); show(t, 1); show(t.ub, 0); t.r.setAttribute('class', 'f-elev s-line'); });
        show(ans, 1); show(cb, 1);
        ansT.textContent = 'Model: “the drug worked”';
        if (s === 0) {
          toks.forEach(function (t, j) { show(t, win(p, 0.02 + j * 0.05, 0.1 + j * 0.05)); });
          show(ans, win(p, 0.35, 0.45)); show(cb, win(p, 0.4, 0.5));
          conf(0.96 * win(p, 0.45, 0.6)); show(wrong, win(p, 0.65, 0.75));
          return;
        }
        if (s === 1) {
          var tt = clamp(p / 0.92) * 10, k = Math.min(9, Math.floor(tt)), f = tt - k;
          passT.textContent = 'run ' + (k + 1) + ' of 10 · random units switched off'; show(passT, 1);
          toks.forEach(function (t, j) {
            var off = ((k * 7 + j * 3) % 5 === 0);
            var jit = Math.sin((k + 1) * (j + 2) * 1.7) * U[j] * 12;
            move(t, 0, jit * Math.sin(Math.PI * clamp(f * 1.6)));
            show(t, off ? 0.35 : 1);
          });
          var prev = k ? CONF[k - 1] : 0.96;
          conf(lerp(prev, CONF[k], win(f, 0, 0.35)));
          show(hist, 1); hb.forEach(function (b, i) { show(b, i <= k ? 1 : 0.0); });
          return;
        }
        conf(s === 4 ? lerp(0.96, mean, win(p, 0.05, 0.35)) : 0.96);
        show(uLbl, s === 2 ? win(p, 0.1, 0.3) : 1);
        toks.forEach(function (t, j) {
          var g = s === 2 ? win(p, 0.1 + j * 0.06, 0.3 + j * 0.06) : 1;
          set(t.ub, { height: U[j] * 44 * g }); show(t.ub, 1);
          if (U[j] > 0.5 && g > 0.5) t.r.setAttribute('class', 'f-elev s-a');
        });
        if (s === 3) {
          var m = win(p, 0.35, 0.7);
          arcs.forEach(function (a, j) {
            show(a, 0.7 * win(p, 0.05, 0.2));
            a.setAttribute('stroke-width', (2 + 26 * ATT[j] * lerp(1, Math.exp(-2.2 * U[j]), m)).toFixed(2));
          });
          show(form, win(p, 0.3, 0.45));
        }
        if (s === 4) {
          ansT.textContent = 'Model: “the drug worked” (unsure)';
          show(thr, win(p, 0.3, 0.45)); show(handT, win(p, 0.45, 0.6));
        }
      };
    }
  };

  // ======================================================================
  // 3. Agreement Overstates Evidence (judge correlation)
  // ======================================================================
  var ajc = {
    tag: 'Explainer · preprint, under review',
    link: '/Automatic-Jury-Consensus/',
    scenes: [
      { h: 'AI grades AI', d: 10000,
        p: 'To evaluate chatbots, researchers increasingly ask other AI models to act as <b>judges</b>: which of two answers is better? When ten judges agree, it feels like overwhelming evidence.' },
      { h: 'But the judges share blind spots', d: 11000,
        p: 'The judges learned from overlapping internet data with similar training recipes, so they tend to make the <b>same mistakes</b> on the same questions. Across ten open-weight judges the average error correlation is 0.21.' },
      { h: 'Ten votes, three and a half opinions', d: 11000,
        p: 'Correlated votes overlap. With that much shared error, ten judges carry about as much independent evidence as <b>3.5</b>. Judges from three different frontier AI companies were even more alike, with an error correlation of 0.56.' },
      { h: 'It changes scientific conclusions', d: 11000,
        p: 'When two AI systems are compared, counting every vote as independent declares a significant winner in 79% of resampled comparisons; counting each question once does so in 52%. In <b>28%</b> the verdict depends on that choice alone.' },
      { h: 'Fix the statistics, not the vote', d: 11000,
        p: 'Report how correlated the judges are next to how accurate they are, and run tests on questions rather than votes. In our experiments a cleverer voting rule was not a reliable fix. The project page has an interactive version where you set the correlation yourself.' }
    ],
    build: function (svg) {
      var card = mk(svg, 'g', {});
      mk(card, 'text', { x: 40, y: 64, 'font-size': 16, 'font-weight': 600 }, 'Which answer is better?');
      pill(card, 40, 82, 190, 54, 'f-accs s-acc', 'Answer A', 't-acc', 17).rect.setAttribute('stroke-width', 1.5);
      pill(card, 40, 150, 190, 54, 'f-elev s-line', 'Answer B', 't-soft', 17).rect.setAttribute('stroke-width', 1.5);
      var home = [], clus = [0, 0, 1, 1, 2, 0, 0, 1, 2, 2];
      var CC = [[372, 150, 4], [500, 92, 3], [520, 212, 3]];
      var idx = [0, 0, 0];
      var tgt = [];
      for (var k = 0; k < 10; k++) {
        home.push([330 + (k % 5) * 62, k < 5 ? 110 : 185]);
        var c = CC[clus[k]], n = c[2], a = 2 * Math.PI * idx[clus[k]]++ / n - Math.PI / 2;
        tgt.push([c[0] + Math.cos(a) * 30, c[1] + Math.sin(a) * 30]);
      }
      var hulls = CC.map(function (c, i) {
        var g = mk(svg, 'g', {});
        mk(g, 'circle', { cx: c[0], cy: c[1], r: 58, 'class': 'f-accs' });
        mk(g, 'text', { x: c[0], y: c[1] + (i === 1 ? -66 : 76), 'text-anchor': 'middle', 'font-size': 13, 'class': 't-acc', 'font-weight': 600 },
          ['shared training data', 'same company', 'same prompt style'][i]);
        return g;
      });
      var links = [];
      for (var i = 0; i < 10; i++) for (var j = i + 1; j < 10; j++) if (clus[i] === clus[j]) links.push([i, j, mk(svg, 'line', { 'class': 's-acc', 'stroke-width': 2, opacity: 0.5 })]);
      var judges = home.map(function (h, k) {
        var g = mk(svg, 'g', {});
        g.c = mk(g, 'circle', { r: 21, 'class': 'f-elev s-soft', 'stroke-width': 1.8 });
        g.t = mk(g, 'text', { y: 6, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700 }, 'J' + (k + 1));
        return g;
      });
      var count = mk(svg, 'text', { x: 485, y: 262, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 600 }, '');
      var dotsG = mk(svg, 'g', {});
      var dots = [];
      for (k = 0; k < 10; k++) {
        var cx = 92 + k * 50;
        mk(dotsG, 'circle', { cx: cx, cy: 150, r: 18, 'class': 'f-elev s-acc', 'stroke-width': 2 });
        dots.push(mk(dotsG, 'rect', { x: cx - 18, y: 132, width: 0, height: 36, 'class': 'f-acc', 'clip-path': 'url(#xplclip' + k + ')' }));
        var cp = mk(dotsG, 'clipPath', { id: 'xplclip' + k });
        mk(cp, 'circle', { cx: cx, cy: 150, r: 17 });
      }
      var effT = mk(dotsG, 'text', { x: 320, y: 230, 'text-anchor': 'middle', 'font-size': 22, 'class': 't-serif' }, '');
      mk(dotsG, 'text', { x: 320, y: 98, 'text-anchor': 'middle', 'font-size': 16, 'class': 't-soft' }, 'independent opinions carried by the ten votes');
      var bars = mk(svg, 'g', {});
      var rows = [['Every vote counted as independent', 0.79], ['Each question counted once', 0.52]];
      var bfill = rows.map(function (r, i) {
        var y = 80 + i * 72;
        mk(bars, 'text', { x: 40, y: y - 10, 'font-size': 15, 'font-weight': 600 }, r[0]);
        mk(bars, 'rect', { x: 40, y: y, width: 470, height: 28, rx: 6, 'class': 'f-line' });
        var f = mk(bars, 'rect', { x: 40, y: y, width: 0, height: 28, rx: 6, 'class': i ? 'f-soft' : 'f-acc' });
        f.v = r[1]; f.t = mk(bars, 'text', { x: 0, y: y + 20, 'font-size': 15, 'font-weight': 700, 'class': 't-mono' }, Math.round(r[1] * 100) + '%');
        return f;
      });
      mk(bars, 'text', { x: 40, y: 34, 'font-size': 13, 'class': 't-mute' }, 'share of comparisons declared "significant"');
      var flipT = mk(bars, 'text', { x: 40, y: 254, 'font-size': 19, 'font-weight': 700, 'class': 't-a' }, '28% of verdicts flip on this choice alone');
      var list = mk(svg, 'g', {});
      var items = [['✓', 'Report how correlated the judges are', 't-g'], ['✓', 'Test on questions, not on votes', 't-g'], ['✗', 'A cleverer voting rule is not a reliable fix', 't-r']];
      var itemsG = items.map(function (it, i) {
        var g = mk(list, 'g', {});
        mk(g, 'text', { x: 90, y: 100 + i * 56, 'font-size': 26, 'font-weight': 700, 'class': it[2] }, it[0]);
        mk(g, 'text', { x: 130, y: 98 + i * 56, 'font-size': 19 }, it[1]);
        return g;
      });

      function place(t) {
        judges.forEach(function (g, k) {
          var x = lerp(home[k][0], tgt[k][0], t), y = lerp(home[k][1], tgt[k][1], t);
          g.x = x; g.y = y; move(g, x, y);
        });
        links.forEach(function (l) { set(l[2], { x1: judges[l[0]].x, y1: judges[l[0]].y, x2: judges[l[1]].x, y2: judges[l[1]].y }); });
      }
      return function (s, p) {
        hideAll([card, dotsG, bars, list, count].concat(hulls, judges, links.map(function (l) { return l[2]; })));
        if (s <= 1) {
          show(card, s === 0 ? win(p, 0, 0.12) : 1 - 0.6 * win(p, 0, 0.2));
          var t = s === 1 ? win(p, 0.15, 0.5) : 0;
          place(t);
          judges.forEach(function (g, k) {
            show(g, s === 0 ? win(p, 0.1 + k * 0.03, 0.16 + k * 0.03) : 1);
            var voted = s === 1 || p > 0.32 + k * 0.045;
            g.c.setAttribute('class', voted ? 'f-acc s-acc' : 'f-elev s-soft');
            g.t.textContent = voted ? 'A' : 'J' + (k + 1);
            g.t.setAttribute('class', voted ? 'f-elev' : '');
          });
          if (s === 0) { count.textContent = '10 of 10 judges prefer A'; show(count, win(p, 0.8, 0.9)); }
          if (s === 1) {
            hulls.forEach(function (h, i) { show(h, win(p, 0.4 + i * 0.08, 0.55 + i * 0.08)); });
            links.forEach(function (l) { show(l[2], 0.5 * win(p, 0.5, 0.65)); });
          }
          return;
        }
        if (s === 2) {
          show(dotsG, 1);
          var eff = lerp(10, 10 / (1 + 9 * 0.21), win(p, 0.15, 0.7));
          dots.forEach(function (d, k) { set(d, { width: 36 * clamp(eff - k) }); });
          effT.textContent = '10 votes  ≈  ' + eff.toFixed(1) + ' independent judges';
          return;
        }
        if (s === 3) {
          show(bars, 1);
          bfill.forEach(function (f, i) {
            var g = win(p, 0.08 + i * 0.22, 0.3 + i * 0.22);
            set(f, { width: 470 * f.v * g }); set(f.t, { x: 40 + 470 * f.v * g + 8 }); show(f.t, g);
          });
          show(flipT, win(p, 0.6, 0.72));
          return;
        }
        show(list, 1);
        itemsG.forEach(function (g, i) { show(g, win(p, 0.06 + i * 0.16, 0.18 + i * 0.16)); });
      };
    }
  };

  // ======================================================================
  // 4. NEXUS runtime safety for tool-using agents (AACL 2026)
  // ======================================================================
  var nexus = {
    tag: 'Explainer · AACL 2026 · illustrative example',
    link: '/nexus/',
    scenes: [
      { h: 'Agents act, not just talk', d: 10000,
        p: 'AI agents now take actions: reading files, sending emails, editing databases. A wrong <i>answer</i> can be corrected; a wrong <i>action</i>, such as deleting a system file, often cannot.' },
      { h: 'Check the plan before anything runs', d: 11000,
        p: 'NEXUS reads the agent\'s plan (which tool, which arguments, which permissions) <b>before</b> any tool runs. Fixed safety rules, a scan of the arguments for secrets and sensitive paths, and a calibrated risk score each weigh in.' },
      { h: 'Four answers, not two', d: 12000,
        p: 'Instead of a yes/no filter, each step gets one of four responses: <b>allow</b>, <b>ask the user</b>, <b>ask the agent to revise</b>, or <b>block</b>. Picking the right severity is where the learned risk score helps most: +27 percentage points over rules alone.' },
      { h: 'Small steps that add up', d: 11000,
        p: 'Some attacks hide in a series of harmless-looking steps. NEXUS remembers the session; on a 120-session test it caught <b>all 95</b> critical unsafe turns with no false alarms on legitimate sessions.' },
      { h: 'Fast enough to stay switched on', d: 10000,
        p: 'A check that slows the agent down gets turned off. NEXUS decides in about <b>0.2 milliseconds</b> on one CPU core, under 0.1% of a typical agent turn, and spots unsafe plans with an F1 score of 0.949.' }
    ],
    build: function (svg) {
      var agent = mk(svg, 'g', {});
      mk(agent, 'rect', { x: 18, y: 112, width: 108, height: 76, rx: 12, 'class': 'f-accs s-acc', 'stroke-width': 1.5 });
      mk(agent, 'circle', { cx: 52, cy: 140, r: 5, 'class': 'f-acc' });
      mk(agent, 'circle', { cx: 92, cy: 140, r: 5, 'class': 'f-acc' });
      mk(agent, 'path', { d: 'M56 160 Q72 170 88 160', fill: 'none', 'class': 's-acc', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
      mk(agent, 'text', { x: 72, y: 212, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 600 }, 'AI agent');
      var steps = [['read report.pdf', 0], ['email file to unknown address', 1], ['update “all records”', 2], ['delete /etc/passwd', 3]];
      var BINS = [['Allow', 'f-g', 't-g'], ['Ask the user', 'f-a', 't-a'], ['Revise the plan', 'f-acc', 't-acc'], ['Block', 'f-r', 't-r']];
      var CY = function (k) { return 52 + k * 54; };
      var cards = steps.map(function (st, k) {
        var g = mk(svg, 'g', {});
        mk(g, 'rect', { x: 0, y: 0, width: 214, height: 38, rx: 8, 'class': 'f-elev s-line', 'stroke-width': 1.5 });
        mk(g, 'text', { x: 12, y: 25, 'font-size': 14, 'class': 't-mono' }, st[0]);
        return g;
      });
      var gate = mk(svg, 'g', {});
      mk(gate, 'rect', { x: 376, y: 38, width: 74, height: 226, rx: 12, 'class': 'f-ink' });
      mk(gate, 'text', { x: 413, y: 66, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, 'class': 'f-elev' }, 'NEXUS');
      ['rules', 'args', 'risk', 'memory'].forEach(function (t, i) {
        mk(gate, 'rect', { x: 384, y: 84 + i * 42, width: 58, height: 30, rx: 6, 'class': 'f-soft', opacity: 0.55 });
        mk(gate, 'text', { x: 413, y: 104 + i * 42, 'text-anchor': 'middle', 'font-size': 12, 'class': 'f-elev t-mono' }, t);
      });
      var scan = mk(svg, 'rect', { x: 376, y: 38, width: 74, height: 6, 'class': 'f-acc', opacity: 0.8 });
      var bins = BINS.map(function (b, k) {
        var g = mk(svg, 'g', {});
        g.r = mk(g, 'rect', { x: 470, y: CY(k), width: 156, height: 38, rx: 8, 'class': 'f-elev s-line', 'stroke-width': 1.5 });
        g.t = mk(g, 'text', { x: 548, y: CY(k) + 25, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, 'class': b[2] }, b[0]);
        return g;
      });
      var sess = mk(svg, 'g', {});
      var chain = ['list users', 'read user table', 'copy emails', 'zip the file', 'upload outside'];
      var chips = chain.map(function (c, i) {
        var g = mk(sess, 'g', {});
        g.r = mk(g, 'rect', { x: 22 + i * 122, y: 84, width: 110, height: 40, rx: 8, 'class': 'f-elev s-line', 'stroke-width': 1.5 });
        mk(g, 'text', { x: 77 + i * 122, y: 109, 'text-anchor': 'middle', 'font-size': 13, 'class': 't-mono' }, c);
        g.m = mk(g, 'text', { x: 77 + i * 122, y: 70, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, 'class': i === 4 ? 't-r' : 't-g' }, i === 4 ? '✗ blocked' : '✓');
        return g;
      });
      mk(sess, 'text', { x: 22, y: 166, 'font-size': 14, 'class': 't-soft' }, 'risk remembered across the session');
      mk(sess, 'rect', { x: 22, y: 176, width: 596, height: 16, rx: 8, 'class': 'f-line' });
      var meter = mk(sess, 'rect', { x: 22, y: 176, width: 0, height: 16, rx: 8, 'class': 'f-a' });
      var sessT = mk(sess, 'text', { x: 320, y: 240, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 600 }, 'Each step looks fine alone; together they leak data.');
      var nums = mk(svg, 'g', {});
      var bigs = [['0.2 ms', 'per decision, one CPU core'], ['0.949', 'F1 at spotting unsafe plans'], ['< 0.1%', 'of a typical agent turn']].map(function (b, i) {
        var g = mk(nums, 'g', {});
        mk(g, 'text', { x: 110 + i * 210, y: 150, 'text-anchor': 'middle', 'font-size': 40, 'class': 't-serif t-acc', 'font-weight': 600 }, b[0]);
        mk(g, 'text', { x: 110 + i * 210, y: 182, 'text-anchor': 'middle', 'font-size': 14, 'class': 't-soft' }, b[1]);
        return g;
      });

      return function (s, p) {
        hideAll([agent, gate, scan, sess, nums].concat(cards, bins));
        bins.forEach(function (b, k) { b.r.setAttribute('class', 'f-elev s-line'); b.t.setAttribute('class', BINS[k][2]); });
        if (s <= 2) {
          show(agent, s === 0 ? win(p, 0, 0.1) : 1);
          cards.forEach(function (c, k) {
            var a = s === 0 ? win(p, 0.12 + k * 0.12, 0.26 + k * 0.12) : 1;
            var x = lerp(70, 146, a), y = CY(k), o = a;
            if (s === 2) {
              var m = win(p, 0.08 + k * 0.2, 0.24 + k * 0.2);
              x = lerp(146, 330, m); o = 1 - win(m, 0.55, 1);
              if (m >= 0.98) {
                bins[k].r.setAttribute('class', BINS[k][1]);
                bins[k].t.setAttribute('class', 'f-elev');
              }
            }
            move(c, x, y); show(c, o);
          });
        }
        if (s >= 1 && s <= 2) {
          show(gate, s === 1 ? win(p, 0, 0.15) : 1);
          bins.forEach(function (b, k) { show(b, s === 1 ? win(p, 0.5 + k * 0.06, 0.6 + k * 0.06) : 1); });
          if (s === 1) { var sp = (p * 2.2) % 1; set(scan, { y: 38 + sp * 220 }); show(scan, 0.8 * win(p, 0.15, 0.25)); }
        }
        if (s === 3) {
          show(sess, 1);
          var steps5 = clamp(p / 0.75) * 5;
          chips.forEach(function (c, i) {
            show(c, win(steps5, i, i + 0.4));
            show(c.m, win(steps5, i + 0.4, i + 0.8));
            c.r.setAttribute('class', i === 4 && steps5 > 4.4 ? 'f-elev s-r' : 'f-elev s-line');
          });
          set(meter, { width: 596 * clamp(steps5 / 5) });
          meter.setAttribute('class', steps5 > 4.4 ? 'f-r' : 'f-a');
          show(sessT, win(p, 0.8, 0.92));
        }
        if (s === 4) {
          show(nums, 1);
          bigs.forEach(function (g, i) { show(g, win(p, 0.05 + i * 0.15, 0.18 + i * 0.15)); });
        }
      };
    }
  };

  var STORIES = { poe: poe, uat: uat, ajc: ajc, nexus: nexus };

  // ---------- player ----------
  var IC = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
    replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v5h5"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 5v14L8 12zM6 5h2v14H6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v14l10-7zM16 5h2v14h-2z"/></svg>',
    sndOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    sndOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>'
  };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmt(ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  // ---------- narration (the browser's built-in text-to-speech) ----------
  var TTS = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  var voice = null;
  function pickVoice() {
    if (!TTS) return;
    var vs = window.speechSynthesis.getVoices() || [];
    var en = vs.filter(function (v) { return /^en(-|_|$)/i.test(v.lang); });
    var prefs = [/Google US English/i, /Natural/i, /Samantha/i, /Google UK English Female/i, /Aria|Jenny|Zira/i, /en-US/i];
    for (var i = 0; i < prefs.length; i++) {
      for (var j = 0; j < en.length; j++) if (prefs[i].test(en[j].name) || prefs[i].test(en[j].lang)) { voice = en[j]; return; }
    }
    voice = en[0] || null;
  }
  if (TTS) {
    pickVoice();
    if (window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    else window.speechSynthesis.onvoiceschanged = pickVoice;
  }
  function plain(html) {
    var d = document.createElement('div'); d.innerHTML = html;
    var txt = d.textContent;
    // Spoken forms, shared by the browser voice and the pre-generated audio.
    [[/α/g, 'alpha'], [/yes\/no/g, 'yes-or-no'], [/UAT-LITE/g, 'U-A-T Lite'], [/\bNEXUS\b/g, 'Nexus'],
     [/\bKL\b/g, 'K-L'], [/\bF1\b/g, 'F-one'], [/\+(\d)/g, 'plus $1'], [/(\d)%/g, '$1 percent']
    ].forEach(function (r) { txt = txt.replace(r[0], r[1]); });
    return txt.replace(/\s+/g, ' ').trim();
  }
  // Pre-generated natural narration (Kokoro TTS): one MP3 per scene, listed in manifest.json.
  var AUDIO_BASE = '/assets/explainers/audio/', manifest = null, manifestP = null;
  function loadManifest() {
    if (!manifestP) manifestP = (window.fetch ? fetch(AUDIO_BASE + 'manifest.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; }) : Promise.resolve(null))
      .catch(function () { return null; }).then(function (m) { manifest = m; return m; });
    return manifestP;
  }
  function clip(key, i) { return manifest && manifest[key] && manifest[key][i] ? manifest[key][i] : null; }
  // Short utterances: Chrome silently stops long ones after about 15 seconds.
  function sentences(text) { return text.split(/(?<=[.!?;])\s+/).filter(Boolean); }
  function narrationText(sc) { return sc.h + '. ' + plain(sc.p); }
  function estMs(sc) { return narrationText(sc).split(' ').length * 390 + 900; }
  function getPref() { try { return localStorage.getItem('xplNarration'); } catch (e) { return null; } }
  function setPref(v) { try { localStorage.setItem('xplNarration', v); } catch (e) { /* storage unavailable */ } }

  function Player(host) {
    host.classList.add('xpl');
    host.innerHTML =
      '<div class="xpl-stage"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img"></svg>' +
      '<span class="xpl-tag"></span>' +
      '<button type="button" class="xpl-big-play" aria-label="Play the explainer with narration">' + IC.play + '</button>' +
      '<button type="button" class="xpl-narr" hidden>' + IC.sndOn + '<span>Play with narration</span></button></div>' +
      '<div class="xpl-cap" aria-live="polite"><div class="xpl-step"></div><h4></h4><p></p></div>' +
      '<div class="xpl-ctl"><button type="button" class="xpl-btn xpl-pp" aria-label="Play">' + IC.play + '</button>' +
      '<button type="button" class="xpl-btn xpl-prev" aria-label="Previous scene">' + IC.prev + '</button>' +
      '<button type="button" class="xpl-btn xpl-next" aria-label="Next scene">' + IC.next + '</button>' +
      '<div class="xpl-segs"></div><span class="xpl-time"></span>' +
      '<button type="button" class="xpl-btn xpl-snd" aria-label="Narration" aria-pressed="false">' + IC.sndOff + '</button></div>';
    var q = function (c) { return host.querySelector(c); };
    var svg = q('svg'), big = q('.xpl-big-play'), pp = q('.xpl-pp'), segsEl = q('.xpl-segs');
    var snd = q('.xpl-snd'), narrBtn = q('.xpl-narr');
    var story, frame, scene = 0, t = 0, playing = false, ended = false, last = 0, raf = 0, started = false, segs = [];
    var narr = false, speechDone = true, token = 0, auto = false, storyKey = '', resumeAudio = false, audioFailed = false;
    var audio = new Audio(); audio.preload = 'auto';

    function dur(k) {
      var sc = story.scenes[k], c = clip(storyKey, k);
      return narr ? Math.max(sc.d, (c && !audioFailed ? c.ms : estMs(sc)) + 600) : sc.d;
    }
    function totalBefore(k) { var s = 0; for (var i = 0; i < k; i++) s += dur(i); return s; }
    function total() { return totalBefore(story.scenes.length); }
    function caption() {
      var sc = story.scenes[scene];
      q('.xpl-step').textContent = 'Scene ' + (scene + 1) + ' of ' + story.scenes.length;
      q('.xpl-cap h4').textContent = sc.h;
      q('.xpl-cap p').innerHTML = sc.p;
    }
    function draw() {
      var d = dur(scene);
      frame(scene, clamp(t / d));
      segs.forEach(function (sg, i) { sg.firstChild.firstChild.style.width = (i < scene ? 100 : i > scene ? 0 : clamp(t / d) * 100) + '%'; });
      q('.xpl-time').textContent = fmt(totalBefore(scene) + Math.min(t, d)) + ' / ' + fmt(total());
    }
    function setIcon() {
      pp.innerHTML = playing ? IC.pause : ended ? IC.replay : IC.play;
      pp.setAttribute('aria-label', playing ? 'Pause' : ended ? 'Replay' : 'Play');
      big.hidden = started;
      snd.innerHTML = narr ? IC.sndOn : IC.sndOff;
      snd.setAttribute('aria-pressed', narr ? 'true' : 'false');
      snd.setAttribute('aria-label', narr ? 'Turn narration off' : 'Turn narration on');
      snd.classList.toggle('on', narr);
      narrBtn.hidden = narr || !started || ended;
    }

    function stopSpeech() {
      token++; speechDone = true; resumeAudio = false;
      if (!audio.paused) audio.pause();
      if (TTS) window.speechSynthesis.cancel();
    }
    function speakScene() {
      stopSpeech();
      if (!narr) return;
      var my = token; speechDone = false;
      var c = clip(storyKey, scene);
      if (c && !audioFailed) {
        audio.onended = function () { if (my === token) speechDone = true; };
        audio.onerror = function () { if (my === token) { audioFailed = true; speakTTS(my); } };
        audio.src = AUDIO_BASE + c.file + '?v=' + manifest.v;
        var pr = audio.play();
        if (pr && pr.catch) pr.catch(function (e) { if (my === token && e && e.name !== 'AbortError') speakTTS(my); });
        var nx = clip(storyKey, scene + 1);
        if (nx) { var pre = new Audio(); pre.preload = 'auto'; pre.src = AUDIO_BASE + nx.file + '?v=' + manifest.v; }
        return;
      }
      speakTTS(my);
    }
    function speakTTS(my) {
      if (!TTS) { speechDone = true; return; }
      var parts = sentences(narrationText(story.scenes[scene]));
      // A short delay after cancel(): Chrome can drop an utterance queued in the same tick.
      setTimeout(function () {
        if (my !== token) return;
        parts.forEach(function (s, i) {
          var u = new window.SpeechSynthesisUtterance(s);
          if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
          u.rate = 1; u.pitch = 1;
          if (i === parts.length - 1) u.onend = u.onerror = function () { if (my === token) speechDone = true; };
          window.speechSynthesis.speak(u);
        });
      }, 80);
    }

    function tick(now) {
      if (!playing) return;
      t += Math.min(100, now - last); last = now;
      var d = dur(scene);
      if (t >= d && !speechDone) {
        // Hold the finished scene until the voice ends; give up if the engine never reports it.
        var idle = (audio.paused || audio.ended) && (!TTS || (!window.speechSynthesis.speaking && !window.speechSynthesis.pending));
        if ((idle && t > d + 1500) || t > d + 20000) speechDone = true;
      }
      if (t >= d && speechDone) {
        if (scene < story.scenes.length - 1) { scene++; t = 0; caption(); speakScene(); }
        else { t = d; playing = false; ended = true; setIcon(); }
      }
      draw();
      if (playing) raf = requestAnimationFrame(tick);
    }
    function play() {
      if (ended) { scene = 0; t = 0; ended = false; caption(); }
      started = true; playing = true; last = performance.now();
      if (narr) {
        if (resumeAudio) { resumeAudio = false; var pr = audio.play(); if (pr && pr.catch) pr.catch(function () {}); }
        else { if (t > 0) t = 0; speakScene(); }
      }
      setIcon(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    }
    // A click is the only moment a browser allows speech to start.
    function userPlay() { auto = false; narr = TTS && getPref() !== 'off'; play(); }
    function pause() {
      playing = false; cancelAnimationFrame(raf);
      // Recorded narration can resume where it stopped; the browser voice restarts the scene.
      if (!audio.paused && !audio.ended) { audio.pause(); resumeAudio = true; } else stopSpeech();
      setIcon();
    }
    function go(k) {
      stopSpeech();
      scene = clamp(k, 0, story.scenes.length - 1); t = 0; ended = false; caption();
      if (reduce && !playing) t = dur(scene); // reduced motion: show the finished scene
      draw();
      if (playing) speakScene(); else userPlay();
    }
    function setNarr(on) {
      narr = on && TTS; setPref(on ? 'on' : 'off'); auto = false;
      if (narr) { if (playing) { t = 0; speakScene(); } else play(); }
      else stopSpeech();
      setIcon(); draw();
    }
    function load(key) {
      pause();
      stopSpeech(); story = STORIES[key]; storyKey = key;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute('aria-label', 'Animated explainer: ' + story.scenes.map(function (s) { return s.h; }).join('; '));
      frame = story.build(svg);
      q('.xpl-tag').textContent = story.tag;
      segsEl.innerHTML = '';
      segs = story.scenes.map(function (sc, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'xpl-seg'; b.setAttribute('aria-label', 'Scene ' + (i + 1) + ': ' + sc.h);
        b.innerHTML = '<span><i></i></span>';
        b.addEventListener('click', function () { go(i); });
        segsEl.appendChild(b);
        return b;
      });
      scene = 0; ended = false; started = false;
      t = 0; caption(); draw();
      frame(0, 1); // poster frame: the first scene, fully drawn
      setIcon();
      q('.xpl-time').textContent = '0:00 / ' + fmt(total());
    }
    big.addEventListener('click', userPlay);
    pp.addEventListener('click', function () { playing ? pause() : userPlay(); });
    q('.xpl-prev').addEventListener('click', function () { go(t > 1500 ? scene : scene - 1); });
    q('.xpl-next').addEventListener('click', function () { go(scene + 1); });
    snd.addEventListener('click', function () { setNarr(!narr); });
    narrBtn.addEventListener('click', function () { setNarr(true); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && playing) pause(); });
    // Leaving the page (link, Back button, closing the tab): stop the animation and the voice.
    // Chrome keeps the speech queue per tab, so without this narration outlives the page.
    window.addEventListener('pagehide', function () { pause(); auto = false; });
    // Back/Forward restores the page from the cache: show it paused, not mid-play.
    window.addEventListener('pageshow', function (e) { if (e.persisted) { stopSpeech(); if (playing) pause(); } });

    // Autoplay once, silently, when the player is mostly in view; pause when it scrolls away.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            if (!started && !reduce) { auto = true; narr = false; play(); }
          } else if (playing && (auto || !e.isIntersecting)) { pause(); auto = false; }
        });
      }, { threshold: [0, 0.6] }).observe(host);
    }
    load(host.getAttribute('data-explainer'));
    return { refresh: function () { if (!playing) { setIcon(); q('.xpl-time').textContent = fmt(totalBefore(scene) + t) + ' / ' + fmt(total()); } },
             load: function (k) { load(k); }, play: userPlay, pause: pause, link: function () { return story.link; } };
  }

  function init() {
    // Silence anything still queued from a previous page in this tab.
    if (TTS) window.speechSynthesis.cancel();
    loadManifest().then(function () {
      document.querySelectorAll('.xpl').forEach(function (h) { if (h._xpl) h._xpl.refresh(); });
    });
    var players = {};
    document.querySelectorAll('[data-explainer]').forEach(function (h) {
      if (STORIES[h.getAttribute('data-explainer')]) players[h.id || Math.random()] = h._xpl = Player(h);
    });
    // Tabbed theatre: <div class="xpl-tabs" data-for="playerId"> with buttons [data-key]
    document.querySelectorAll('.xpl-tabs[data-for]').forEach(function (bar) {
      var host = document.getElementById(bar.getAttribute('data-for'));
      if (!host || !host._xpl) return;
      var link = document.querySelector('[data-xpl-link="' + host.id + '"]');
      var tabs = bar.querySelectorAll('[data-key]');
      function select(key, autoplay) {
        tabs.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-key') === key ? 'true' : 'false'); });
        host._xpl.load(key);
        if (link) link.setAttribute('href', host._xpl.link());
        if (autoplay) host._xpl.play();
      }
      tabs.forEach(function (b) { b.addEventListener('click', function () { select(b.getAttribute('data-key'), true); }); });
      // Links elsewhere on the page can open a given explainer: <a href="#..." data-xpl-open="poe">
      document.querySelectorAll('[data-xpl-open]').forEach(function (a) {
        a.addEventListener('click', function () { select(a.getAttribute('data-xpl-open'), true); });
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
