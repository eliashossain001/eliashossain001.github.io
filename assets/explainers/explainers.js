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

  // ======================================================================
  // 5. When does extra compute help? (adaptive LOOK/THINK for VLMs)
  // ======================================================================
  var vlm = {
    tag: 'Explainer · Preprint · examples from the paper',
    link: '/look-think/',
    scenes: [
      { h: 'Four ways to answer', d: 11000,
        p: 'A vision-language model can answer directly, <b>look</b> closer by encoding the image with five times more visual tokens, <b>think</b> step by step before answering, or do both. Each extra step costs compute. Adaptive methods try to pick the right one for every question.' },
      { h: 'The best choice depends on the question', d: 12000,
        p: 'One question is easy and only needs a direct answer. Another needs fine detail, so looking closer fixes it. A third needs reasoning, so thinking fixes it. And some questions stay wrong <b>whatever</b> the model does. An oracle that knew the right action per question would gain 5 to 10 accuracy points.' },
      { h: 'The fair test: a random mix at equal cost', d: 12000,
        p: 'To see whether a router really chooses well, compare it with the same actions handed out <b>at random</b>, at the same average cost. No prior paper we audited reports this. Against it, trained routers gain at most 2.1 points, under one fifth of what the oracle shows is possible.' },
      { h: 'Wrong is not the same as fixable', d: 12000,
        p: 'Why? A router sees the model\'s confidence. Confidence spots <b>wrong</b> answers fairly well. But it barely tells which wrong answers looking or thinking would actually <b>fix</b>, its signal is barely above chance. Many errors stay wrong under every action, and thinking can even break right answers.' },
      { h: 'Predict fixability, not error', d: 13000,
        p: 'At one and a half times the baseline compute, perfectly detecting wrong answers adds only 2.6 to 4.3 points over confidence. Knowing which errors an action fixes adds <b>8 to 9.5 more</b>. So: test adaptive compute against an equal-cost random mix, and train routers to predict what extra compute can fix.' }
    ],
    build: function (svg) {
      // ---- scene 1: question + four actions ----
      var s1 = mk(svg, 'g', {});
      var qc = mk(s1, 'g', {});
      mk(qc, 'rect', { x: 150, y: 22, width: 340, height: 48, rx: 10, 'class': 'f-elev s-ink', 'stroke-width': 1.5 });
      mk(qc, 'text', { x: 320, y: 52, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 600 }, 'Q: What colour is the motorcycle?');
      var ACT = [['B', 'answer directly', '1×'], ['LOOK', 'more visual tokens', '2.7×'], ['THINK', 'reason first', '1.3×'], ['LOOK+THINK', 'both', '3.1×']];
      var AX = [40, 190, 340, 490];
      var acts = ACT.map(function (a, i) {
        var g = mk(s1, 'g', {});
        mk(g, 'path', { d: 'M320 70 Q ' + ((320 + AX[i] + 55) / 2) + ' 100 ' + (AX[i] + 55) + ' 120', fill: 'none', 'class': 's-soft', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' });
        var pl = pill(g, AX[i], 122, 110, 44, i === 0 ? 'f-line' : 'f-accs', a[0], '', 15);
        pl.text.setAttribute('font-weight', 700);
        mk(g, 'text', { x: AX[i] + 55, y: 190, 'text-anchor': 'middle', 'font-size': 13, 'class': 't-soft' }, a[1]);
        g.cost = mk(g, 'text', { x: AX[i] + 55, y: 214, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, 'class': 't-mono t-acc' }, a[2] + ' compute');
        return g;
      });
      var s1q = mk(s1, 'text', { x: 320, y: 262, 'text-anchor': 'middle', 'font-size': 16, 'font-style': 'italic', 'class': 't-serif t-soft' }, 'Which one should each question get?');

      // ---- scene 2: per-question outcome grid ----
      var s2 = mk(svg, 'g', {});
      var CX = [300, 380, 460, 550];
      ['B', 'LOOK', 'THINK', 'LOOK+THINK'].forEach(function (h, i) {
        mk(s2, 'text', { x: CX[i], y: 34, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, 'class': i === 0 ? '' : 't-acc' }, h);
      });
      var ROWS = [['Easy', 'colour of the dog?', 't-g', [1, 1, 0, 0], 0], ['Needs fine detail', 'colour of the motorcycle?', 't-acc', [0, 1, 0, 1], 1],
                  ['Needs reasoning', 'truck left or right of trams?', 't-a', [0, 0, 1, 0], 2], ['Out of reach', 'arrows on the black sign?', 't-r', [0, 0, 0, 0], -1]];
      var grid = ROWS.map(function (r, k) {
        var y = 70 + k * 56, g = mk(s2, 'g', {});
        mk(g, 'line', { x1: 30, x2: 610, y1: y - 26, y2: y - 26, 'class': 's-line', 'stroke-width': 1 });
        mk(g, 'text', { x: 34, y: y - 3, 'font-size': 14, 'font-weight': 700, 'class': r[2] }, r[0]);
        mk(g, 'text', { x: 34, y: y + 15, 'font-size': 12.5, 'class': 't-soft' }, r[1]);
        g.marks = r[3].map(function (ok, i) {
          var m = mk(g, 'g', { transform: 'translate(' + CX[i] + ' ' + (y + 2) + ')' });
          mk(m, 'circle', { r: 13, 'class': ok ? 'f-g' : 'f-r' });
          if (ok) mk(m, 'path', { d: CHECK, fill: 'none', stroke: '#fff', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
          else mk(m, 'path', { d: 'M-5 -5 L5 5 M5 -5 L-5 5', stroke: '#fff', 'stroke-width': 2.6, 'stroke-linecap': 'round' });
          return m;
        });
        g.box = r[4] >= 0 ? mk(g, 'rect', { x: CX[r[4]] - 24, y: y - 22, width: 48, height: 48, rx: 8, fill: 'none', 'class': 's-g', 'stroke-width': 2, 'stroke-dasharray': '4 3' }) : null;
        return g;
      });
      var s2n = mk(s2, 'text', { x: 320, y: 290, 'text-anchor': 'middle', 'font-size': 12.5, 'class': 't-mute' }, 'Qwen2.5-VL-3B · HR-Bench 4K · dashed box = cheapest action that fixes it');

      // ---- scene 3: gain over the equal-cost random mix ----
      var s3 = mk(svg, 'g', {});
      var BASE = 236, SC = 11.5;
      mk(s3, 'text', { x: 320, y: 30, 'text-anchor': 'middle', 'font-size': 14, 'class': 't-soft' }, 'Accuracy gain over the equal-cost random mix (points)');
      mk(s3, 'line', { x1: 90, x2: 560, y1: BASE, y2: BASE, 'class': 's-ink', 'stroke-width': 1.5 });
      var BARS = [['random mix', 'of fixed actions', 0, 0, 'f-line'], ['trained', 'routers', 2.1, 2.1, 'f-ink'], ['oracle', '(upper bound)', 7.6, 14.9, 'f-a']];
      var bars = BARS.map(function (b, i) {
        var x = 120 + i * 150, g = mk(s3, 'g', {});
        g.lo = mk(g, 'rect', { x: x, y: BASE, width: 90, height: 0, 'class': b[4] });
        g.hi = mk(g, 'rect', { x: x, y: BASE, width: 90, height: 0, 'class': b[4], opacity: 0.4 });
        g.val = mk(g, 'text', { x: x + 45, y: BASE - 8, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, 'class': 't-mono' }, '');
        mk(g, 'text', { x: x + 45, y: BASE + 20, 'text-anchor': 'middle', 'font-size': 13.5, 'font-weight': 600 }, b[0]);
        mk(g, 'text', { x: x + 45, y: BASE + 37, 'text-anchor': 'middle', 'font-size': 12, 'class': i === 2 ? 't-r' : 't-soft' }, b[1]);
        g.d = b; g.x = x;
        return g;
      });
      var s3n = mk(s3, 'text', { x: 168, y: 110, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, 'class': 't-r' }, 'under one fifth');
      var s3n2 = mk(s3, 'text', { x: 168, y: 128, 'text-anchor': 'middle', 'font-size': 12.5, 'class': 't-soft' }, 'of the oracle’s gain');

      // ---- scene 4: detect error vs detect fixable ----
      var s4 = mk(svg, 'g', {});
      var hdr = mk(s4, 'g', {});
      mk(hdr, 'rect', { x: 180, y: 18, width: 280, height: 40, rx: 8, 'class': 'f-line' });
      mk(hdr, 'text', { x: 320, y: 44, 'text-anchor': 'middle', 'font-size': 15 }, 'Direct answer: “Yellow” ✗');
      var RX = 230, RW = 340;
      function ax(v) { return RX + (v - 0.5) / 0.5 * RW; }
      var DET = [['Is this answer wrong?', 'confidence: yes', 0.77, 0.84, 'f-g', 't-g'], ['Will LOOK or THINK fix it?', 'barely above chance', 0.55, 0.64, 'f-r', 't-r']];
      var det = DET.map(function (d, k) {
        var y = 110 + k * 82, g = mk(s4, 'g', {});
        mk(g, 'text', { x: 30, y: y + 6, 'font-size': 14.5, 'font-weight': 600 }, d[0]);
        mk(g, 'rect', { x: RX, y: y - 12, width: RW, height: 24, rx: 5, 'class': 'f-line' });
        g.lo = mk(g, 'rect', { x: RX, y: y - 12, width: 0, height: 24, rx: 5, 'class': d[4] });
        g.hi = mk(g, 'rect', { x: RX, y: y - 12, width: 0, height: 24, 'class': d[4], opacity: 0.4 });
        g.lab = mk(g, 'text', { x: RX + 6, y: y + 34, 'font-size': 13.5, 'font-weight': 700, 'class': d[5] }, d[1] + ' · AUROC ' + d[2].toFixed(2) + '–' + d[3].toFixed(2));
        g.d = d;
        return g;
      });
      var chance = mk(s4, 'g', {});
      mk(chance, 'line', { x1: RX, x2: RX, y1: 84, y2: 220, 'class': 's-ink', 'stroke-width': 1.5, 'stroke-dasharray': '3 3' });
      mk(chance, 'text', { x: RX, y: 80, 'text-anchor': 'middle', 'font-size': 11.5, 'class': 't-mute' }, 'chance 0.5');
      mk(chance, 'text', { x: RX + RW, y: 80, 'text-anchor': 'end', 'font-size': 11.5, 'class': 't-mute' }, 'perfect 1.0');
      var s4n = mk(s4, 'text', { x: 320, y: 276, 'text-anchor': 'middle', 'font-size': 14.5, 'font-style': 'italic', 'class': 't-serif t-soft' }, 'A wrong answer is not necessarily a fixable one.');

      // ---- scene 5: escalation ladder ----
      var s5 = mk(svg, 'g', {});
      var LB = 210, LS = 10;
      mk(s5, 'text', { x: 320, y: 28, 'text-anchor': 'middle', 'font-size': 13.5, 'class': 't-soft' }, 'Same extra compute (1.5×), different choice of which answers to escalate');
      mk(s5, 'line', { x1: 80, x2: 560, y1: LB, y2: LB, 'class': 's-ink', 'stroke-width': 1.5 });
      var STEPS = [['least confident', 'what routers do', 0, 1.2, 'f-ink', ''], ['every wrong answer', 'perfect error detection', 1.2, 4.6, 'f-acc', '+2.6 to +4.3'], ['only fixable errors', 'perfect fixability', 4.6, 13.4, 'f-a', '+8.0 to +9.5']];
      var steps = STEPS.map(function (st, i) {
        var x = 110 + i * 150, g = mk(s5, 'g', {});
        g.base = mk(g, 'rect', { x: x, y: LB, width: 100, height: 0, 'class': 'f-line' });
        g.add = mk(g, 'rect', { x: x, y: LB, width: 100, height: 0, 'class': st[4] });
        g.val = mk(g, 'text', { x: x + 50, y: LB, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, 'class': 't-mono' }, st[5]);
        mk(g, 'text', { x: x + 50, y: LB + 20, 'text-anchor': 'middle', 'font-size': 13.5, 'font-weight': 600 }, st[0]);
        mk(g, 'text', { x: x + 50, y: LB + 37, 'text-anchor': 'middle', 'font-size': 12, 'class': 't-soft' }, st[1]);
        g.d = st;
        return g;
      });
      var take = pill(s5, 130, 258, 380, 34, 'f-accs s-acc', 'Routers should predict fixability, not error', 't-acc', 14.5);
      take.text.setAttribute('font-weight', 700);

      return function (s, p) {
        hideAll([s1, s2, s3, s4, s5]);
        if (s === 0) {
          show(s1, 1); show(qc, win(p, 0, 0.1));
          acts.forEach(function (a, i) { show(a, win(p, 0.12 + i * 0.1, 0.22 + i * 0.1)); show(a.cost, win(p, 0.5 + i * 0.05, 0.6 + i * 0.05)); });
          show(s1q, win(p, 0.75, 0.85));
          return;
        }
        if (s === 1) {
          show(s2, 1); show(s2n, win(p, 0.05, 0.15));
          grid.forEach(function (g, k) {
            show(g, win(p, 0.04 + k * 0.17, 0.12 + k * 0.17));
            g.marks.forEach(function (m, i) { show(m, win(p, 0.08 + k * 0.17 + i * 0.025, 0.12 + k * 0.17 + i * 0.025)); });
            if (g.box) show(g.box, win(p, 0.16 + k * 0.17, 0.2 + k * 0.17));
          });
          return;
        }
        if (s === 2) {
          show(s3, 1);
          bars.forEach(function (b, i) {
            var g = win(p, 0.1 + i * 0.2, 0.3 + i * 0.2), lo = b.d[2] * SC * g, hi = (b.d[3] - b.d[2]) * SC * g;
            set(b.lo, { y: BASE - lo, height: lo }); set(b.hi, { y: BASE - lo - hi, height: hi });
            set(b.val, { y: BASE - lo - hi - 8 }); show(b.val, g);
            b.val.textContent = i === 0 ? '0' : i === 1 ? '≤ +2.1' : '+7.6 to +14.9';
          });
          show(s3n, win(p, 0.75, 0.85)); show(s3n2, win(p, 0.78, 0.88));
          return;
        }
        if (s === 3) {
          show(s4, 1); show(hdr, win(p, 0, 0.1)); show(chance, win(p, 0.1, 0.2));
          det.forEach(function (d, k) {
            var g = win(p, 0.2 + k * 0.25, 0.4 + k * 0.25);
            show(d, win(p, 0.12 + k * 0.25, 0.2 + k * 0.25));
            set(d.lo, { width: (ax(d.d[2]) - RX) * g }); set(d.hi, { x: ax(d.d[2]), width: (ax(d.d[3]) - ax(d.d[2])) * g });
            show(d.hi, g); show(d.lab, win(p, 0.35 + k * 0.25, 0.45 + k * 0.25));
          });
          show(s4n, win(p, 0.8, 0.9));
          return;
        }
        show(s5, 1);
        steps.forEach(function (st, i) {
          var g = win(p, 0.08 + i * 0.22, 0.28 + i * 0.22), b = st.d[2] * LS, a = (st.d[3] - st.d[2]) * LS * g;
          show(st, win(p, 0.04 + i * 0.22, 0.12 + i * 0.22));
          set(st.base, { y: LB - b, height: b }); set(st.add, { y: LB - b - a, height: a });
          set(st.val, { y: LB - b - a - 8 }); show(st.val, g);
        });
        show(take, win(p, 0.75, 0.85));
      };
    }
  };

  // ======================================================================
  // 6. Right Knowledge, Wrong Answer (parametric temporal conflict)
  // ======================================================================
  var tas = {
    tag: 'Explainer · Preprint · illustrative example',
    link: '/tas/',
    scenes: [
      { h: 'The model knows, but answers wrong', d: 10000,
        p: 'Ask an open-weight language model who runs a company today, and it often names the <b>former</b> chief executive. The natural guess is that it never learned about the change. Often that guess is wrong.' },
      { h: 'Add a date, and the right answer appears', d: 11000,
        p: 'Ask the same question starting with "As of 2024", and the model names the <b>new</b> chief executive. On cases like this, a date cue recovers the newer fact 61 to 81 percent of the time. The knowledge was there all along; the default answer simply prefers the older one.' },
      { h: 'Separating conflict from ignorance', d: 11000,
        p: 'We built a verified benchmark of 8,746 real changes from Wikidata: heads of state and government, chief executives, head coaches, and chairs. A recovery check keeps only cases where the model is shown to hold both facts, so a conflict is never confused with missing knowledge.' },
      { h: 'Finding where the old answer wins', d: 12000,
        p: 'Copying the internal state from the dated question into a <b>single upper layer</b> of the plain question flips the answer in 72 to 85 percent of verified cases. The preference for the outdated fact is localized, and the layer differs from model to model.' },
      { h: 'Bigger models, more conflict', d: 12000,
        p: 'Across four open-weight models, the rate of this conflict rises with size, from 4.1 to 10.3 percent of questions. Scaling up does not remove outdated answers. They are a <b>preference inside the model</b> that can be measured, located, and corrected at inference time.' }
    ],
    build: function (svg) {
      // ---- scenes 1-2: question + two candidate answers ----
      var qa = mk(svg, 'g', {});
      var qbox = mk(qa, 'rect', { x: 90, y: 26, width: 460, height: 48, rx: 10, 'class': 'f-elev s-ink', 'stroke-width': 1.5 });
      var qPre = mk(qa, 'text', { x: 320, y: 56, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 600 }, '');
      var CX = 150, CW = 340;
      function cand(y, label, sub) {
        var g = mk(qa, 'g', {});
        mk(g, 'text', { x: CX - 14, y: y + 16, 'text-anchor': 'end', 'font-size': 15, 'font-weight': 600 }, label);
        mk(g, 'text', { x: CX - 14, y: y + 33, 'text-anchor': 'end', 'font-size': 11.5, 'class': 't-mute' }, sub);
        mk(g, 'rect', { x: CX, y: y, width: CW, height: 26, rx: 6, 'class': 'f-line' });
        g.bar = mk(g, 'rect', { x: CX, y: y, width: 0, height: 26, rx: 6, 'class': 'f-a' });
        g.mark = mk(g, 'text', { x: CX + CW + 14, y: y + 19, 'font-size': 17, 'font-weight': 700 }, '');
        return g;
      }
      var oldC = cand(110, 'Former CEO', 'held the role until 2022');
      var newC = cand(166, 'Current CEO', 'in the role since 2023');
      var prefT = mk(qa, 'text', { x: CX + CW / 2, y: 100, 'text-anchor': 'middle', 'font-size': 12, 'class': 't-mute' }, 'how strongly the model prefers each answer');
      var verdict = mk(qa, 'text', { x: 320, y: 248, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700 }, '');
      var stat = mk(qa, 'text', { x: 320, y: 276, 'text-anchor': 'middle', 'font-size': 14, 'class': 't-mono t-acc' }, '');

      // ---- scene 3: benchmark funnel ----
      var bench = mk(svg, 'g', {});
      var tiles = [['8,746', 'verified changes'], ['5', 'kinds of role'], ['4', 'open-weight models']].map(function (t, i) {
        var g = mk(bench, 'g', {}), x = 70 + i * 175;
        mk(g, 'rect', { x: x, y: 30, width: 150, height: 86, rx: 12, 'class': 'f-elev s-line', 'stroke-width': 1.5 });
        mk(g, 'text', { x: x + 75, y: 76, 'text-anchor': 'middle', 'font-size': 30, 'font-weight': 600, 'class': 't-serif t-acc' }, t[0]);
        mk(g, 'text', { x: x + 75, y: 100, 'text-anchor': 'middle', 'font-size': 13, 'class': 't-soft' }, t[1]);
        return g;
      });
      var roles = mk(bench, 'text', { x: 320, y: 146, 'text-anchor': 'middle', 'font-size': 13.5, 'class': 't-soft' }, 'head of state · head of government · CEO · head coach · chair');
      var fil = mk(bench, 'g', {});
      pill(fil, 70, 176, 210, 40, 'f-line', 'old answer by default', '', 14);
      mk(fil, 'path', { d: 'M286 196 L346 196', 'class': 's-ink', 'stroke-width': 2, 'marker-end': '' });
      mk(fil, 'path', { d: 'M338 189 L348 196 L338 203', fill: 'none', 'class': 's-ink', 'stroke-width': 2 });
      var keep = pill(fil, 356, 176, 214, 40, 'f-accs s-acc', 'new answer recoverable?', 't-acc', 14);
      keep.text.setAttribute('font-weight', 700);
      var filT = mk(bench, 'text', { x: 320, y: 254, 'text-anchor': 'middle', 'font-size': 14.5, 'font-weight': 600 }, 'Kept only if the model holds both facts');

      // ---- scene 4: layer patching ----
      var lay = mk(svg, 'g', {});
      var NL = 28, LX = 70, LW = 500, LB = 220;
      var AFR = []; for (var k = 0; k < NL; k++) { var x = k / (NL - 1); AFR.push(0.05 + 0.75 * Math.exp(-Math.pow((x - 0.83) / 0.1, 2)) + 0.04 * Math.sin(k * 1.7)); }
      var PEAK = AFR.indexOf(Math.max.apply(null, AFR));
      var lbars = AFR.map(function (v, k) {
        return mk(lay, 'rect', { x: LX + k * (LW / NL) + 2, y: LB, width: LW / NL - 4, height: 0, rx: 2, 'class': 'f-line' });
      });
      mk(lay, 'line', { x1: LX, x2: LX + LW, y1: LB, y2: LB, 'class': 's-ink', 'stroke-width': 1.5 });
      mk(lay, 'text', { x: LX, y: LB + 20, 'font-size': 12, 'class': 't-mute' }, 'first layer');
      mk(lay, 'text', { x: LX + LW, y: LB + 20, 'text-anchor': 'end', 'font-size': 12, 'class': 't-mute' }, 'last layer');
      mk(lay, 'text', { x: 320, y: 34, 'text-anchor': 'middle', 'font-size': 13.5, 'class': 't-soft' }, 'answers flipped by patching one layer from the dated question');
      var peakT = mk(lay, 'text', { x: LX + LW * 0.83, y: 62, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, 'class': 't-a' }, '72–85% flipped');
      var layN = mk(lay, 'text', { x: 320, y: 268, 'text-anchor': 'middle', 'font-size': 14.5, 'font-style': 'italic', 'class': 't-serif t-soft' }, 'One upper layer decides between the old and the new fact.');

      // ---- scene 5: scaling ----
      var sc = mk(svg, 'g', {});
      var MODS = [['Qwen 1.5B', 0.041], ['Qwen 7B', 0.071], ['Mistral 7B', 0.085], ['Llama 8B', 0.103]];
      var SB = 214;
      mk(sc, 'text', { x: 320, y: 30, 'text-anchor': 'middle', 'font-size': 13.5, 'class': 't-soft' }, 'share of questions with a verified conflict');
      mk(sc, 'line', { x1: 90, x2: 550, y1: SB, y2: SB, 'class': 's-ink', 'stroke-width': 1.5 });
      var sbars = MODS.map(function (m, i) {
        var g = mk(sc, 'g', {}), x = 110 + i * 112;
        g.b = mk(g, 'rect', { x: x, y: SB, width: 76, height: 0, rx: 4, 'class': 'f-acc' });
        g.v = mk(g, 'text', { x: x + 38, y: SB, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, 'class': 't-mono' }, (m[1] * 100).toFixed(1) + '%');
        mk(g, 'text', { x: x + 38, y: SB + 20, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600 }, m[0]);
        g.val = m[1];
        return g;
      });
      var scN = pill(sc, 150, 252, 340, 34, 'f-accs s-acc', 'A preference inside the model, not a gap', 't-acc', 14.5);
      scN.text.setAttribute('font-weight', 700);

      function setBars(oldV, newV) {
        set(oldC.bar, { width: CW * oldV }); set(newC.bar, { width: CW * newV });
        oldC.bar.setAttribute('class', oldV >= newV ? 'f-a' : 'f-soft');
        newC.bar.setAttribute('class', newV > oldV ? 'f-g' : 'f-soft');
      }

      return function (s, p) {
        hideAll([qa, bench, lay, sc]);
        if (s <= 1) {
          show(qa, 1);
          var dated = s === 1;
          qPre.textContent = dated ? '“As of 2024, who is the CEO of the company?”' : '“Who is the CEO of the company?”';
          qbox.setAttribute('class', dated ? 'f-accs s-acc' : 'f-elev s-ink');
          show(prefT, win(p, 0.1, 0.2));
          var g = dated ? win(p, 0.15, 0.45) : 0;
          var grow = dated ? 1 : win(p, 0.15, 0.45);
          setBars(lerp(0.78, 0.3, g) * grow, lerp(0.42, 0.82, g) * grow);
          oldC.mark.textContent = dated ? '' : '← answered';
          newC.mark.textContent = dated ? '← answered' : '';
          oldC.mark.setAttribute('class', 't-r'); newC.mark.setAttribute('class', 't-g');
          show(oldC.mark, dated ? 0 : win(p, 0.45, 0.55)); show(newC.mark, dated ? win(p, 0.45, 0.55) : 0);
          verdict.textContent = dated ? '✓ The newer fact was stored all along' : '✗ Outdated answer, yet the new one is stored';
          verdict.setAttribute('class', dated ? 't-g' : 't-r');
          show(verdict, win(p, 0.6, 0.72));
          stat.textContent = dated ? 'a date cue recovers it in 61–81% of cases' : '';
          show(stat, dated ? win(p, 0.72, 0.84) : 0);
          return;
        }
        if (s === 2) {
          show(bench, 1);
          tiles.forEach(function (t, i) { show(t, win(p, 0.04 + i * 0.1, 0.14 + i * 0.1)); });
          show(roles, win(p, 0.35, 0.45)); show(fil, win(p, 0.5, 0.62)); show(filT, win(p, 0.68, 0.78));
          return;
        }
        if (s === 3) {
          show(lay, 1);
          lbars.forEach(function (b, k) {
            var g = win(p, 0.05 + k * 0.012, 0.25 + k * 0.012), h = AFR[k] * 150 * g;
            set(b, { y: LB - h, height: h });
            b.setAttribute('class', k === PEAK ? 'f-a' : 'f-line');
          });
          show(peakT, win(p, 0.6, 0.7)); show(layN, win(p, 0.75, 0.85));
          return;
        }
        show(sc, 1);
        sbars.forEach(function (b, i) {
          var g = win(p, 0.06 + i * 0.12, 0.26 + i * 0.12), h = b.val * 1500 * g;
          set(b.b, { y: SB - h, height: h }); set(b.v, { y: SB - h - 8 }); show(b.v, g);
        });
        show(scN, win(p, 0.72, 0.84));
      };
    }
  };

  // ======================================================================
  // 7. ChannelGuard: safe models do not compose into safe multi-agent systems
  // ======================================================================
  var cg = {
    tag: 'Explainer · Preprint',
    link: '/channelguard/',
    scenes: [
      { h: 'Every hop is a channel', d: 10000,
        p: 'A multi-agent system chains a planner, workers, a verifier, and a synthesizer, with tools and memory in between. Existing defenses check only the user\'s input. Every hop after that is an <b>unguarded channel</b> an attacker can use.' },
      { h: 'Perfectly safe, but whose safety?', d: 11000,
        p: 'Poison a tool\'s output, and the undefended pipeline still reports zero attack success. Tracing who stopped each attack tells a different story: on Azure GPT-5, <b>24 of 30</b> attacks were stopped by the cloud provider\'s own filter, not by the system.' },
      { h: 'Same zero, different source', d: 11000,
        p: 'Move the identical pipeline to a backend without that filter, and the score is still zero, but now every block comes from the model\'s own alignment. The number never moves while the protection changes completely. <b>Outcome-only reporting cannot see this.</b>' },
      { h: 'Gates the application owns', d: 11000,
        p: 'ChannelGuard puts a lightweight gate on all six channels. Each gate compares incoming sentences with known attack phrases and passes, compresses, or blocks them, in about 5 milliseconds and with <b>no extra model call</b>.' },
      { h: 'What it buys, and what it does not', d: 13000,
        p: 'Its own gate now blocks <b>every</b> tool-poisoning attack on all three backends, prompt-injection success halves from 33 to 17 percent, and math accuracy stays exactly the same. An attacker who paraphrases adaptively still gets through, which the paper reports as an open limit.' }
    ],
    build: function (svg) {
      // ---- pipeline (scenes 1 and 4) ----
      var pipe = mk(svg, 'g', {});
      var NODES = [['User', 26], ['Planner', 140], ['Workers', 268], ['Verifier', 396], ['Synthesizer', 516]];
      var NY = 70, NW = 100, NH = 40;
      NODES.forEach(function (n, i) {
        var w = i === 4 ? 112 : NW;
        pill(pipe, n[1], NY, w, NH, i === 0 ? 'f-line' : 'f-elev s-ink', n[0], '', 14).text.setAttribute('font-weight', 600);
        if (i === 2) { mk(pipe, 'rect', { x: n[1] + 5, y: NY - 6, width: NW, height: NH, rx: 8, fill: 'none', 'class': 's-soft', 'stroke-width': 1 }); }
      });
      var tool = pill(pipe, 210, 176, 90, 36, 'f-line', 'Tool', '', 13.5);
      var mem = pill(pipe, 336, 176, 96, 36, 'f-line', 'Memory', '', 13.5);
      // channels: [x1,y1,x2,y2, labelX, labelY]
      var CH = [[126, 90, 140, 90], [240, 90, 268, 90], [368, 90, 396, 90], [496, 90, 516, 90], [255, 176, 290, 110], [384, 176, 340, 110]];
      var chans = CH.map(function (c) {
        return mk(pipe, 'line', { x1: c[0], y1: c[1], x2: c[2], y2: c[3], 'class': 's-ink', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
      });
      var MID = CH.map(function (c) { return [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2]; });
      var holes = MID.map(function (m, i) {
        var g = mk(pipe, 'g', { transform: 'translate(' + m[0] + ' ' + (m[1] - (i < 4 ? 22 : 0)) + ')' });
        mk(g, 'circle', { r: 10, 'class': i === 0 ? 'f-g' : 'f-r' });
        mk(g, 'text', { y: 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#fff' }, i === 0 ? '✓' : '!');
        return g;
      });
      var gates = MID.map(function (m, i) {
        var g = mk(pipe, 'g', { transform: 'translate(' + m[0] + ' ' + (m[1] - (i < 4 ? 22 : 0)) + ')' });
        mk(g, 'path', { d: 'M0 -12 L10 -7 L10 2 Q10 10 0 14 Q-10 10 -10 2 L-10 -7 Z', 'class': 'f-acc' });
        mk(g, 'path', { d: 'M-4 1 L-1 4 L5 -3', fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round' });
        return g;
      });
      var p1n = mk(pipe, 'text', { x: 320, y: 254, 'text-anchor': 'middle', 'font-size': 14.5, 'font-style': 'italic', 'class': 't-serif t-soft' }, 'Prior defenses guard only the first hop.');
      var gateBox = mk(pipe, 'g', {});
      var steps = ['sentence', 'similar to an attack phrase?', 'pass · compress · block'];
      var sx = [70, 220, 420];
      steps.forEach(function (t, i) {
        pill(gateBox, sx[i], 236, i === 1 ? 180 : (i === 2 ? 170 : 120), 34, i === 2 ? 'f-accs s-acc' : 'f-elev s-line', t, i === 2 ? 't-acc' : '', 13);
        if (i < 2) mk(gateBox, 'path', { d: 'M' + (sx[i] + (i === 0 ? 124 : 184)) + ' 253 l12 0 m-5 -5 l5 5 l-5 5', fill: 'none', 'class': 's-ink', 'stroke-width': 1.8 });
      });
      var gateT = mk(pipe, 'text', { x: 320, y: 290, 'text-anchor': 'middle', 'font-size': 13, 'class': 't-mono t-acc' }, '~5 ms per gate · no extra model call');

      // ---- attribution bars (scenes 2, 3, 5) ----
      var att = mk(svg, 'g', {});
      var head = mk(att, 'text', { x: 320, y: 30, 'text-anchor': 'middle', 'font-size': 14, 'class': 't-soft' }, '');
      var BX = 190, BW = 330;
      var ROWS = ['Azure GPT-5', 'Claude Sonnet 4.5', 'Claude Haiku 4.5'].map(function (name, k) {
        var y = 64 + k * 62, g = mk(att, 'g', {});
        mk(g, 'text', { x: BX - 14, y: y + 19, 'text-anchor': 'end', 'font-size': 14, 'font-weight': 600 }, name);
        mk(g, 'rect', { x: BX, y: y, width: BW, height: 28, rx: 6, 'class': 'f-line' });
        g.segs = [mk(g, 'rect', { x: BX, y: y, width: 0, height: 28, 'class': 'f-a' }),
                  mk(g, 'rect', { x: BX, y: y, width: 0, height: 28, fill: '#6b6e68' }),
                  mk(g, 'rect', { x: BX, y: y, width: 0, height: 28, 'class': 'f-acc' })];
        g.asr = mk(g, 'text', { x: BX + BW + 14, y: y + 19, 'font-size': 13.5, 'font-weight': 700, 'class': 't-mono' }, 'ASR 0.000');
        g.lab = mk(g, 'text', { x: BX + 8, y: y + 19, 'font-size': 12.5, 'font-weight': 700, fill: '#fff' }, '');
        g.y = y;
        return g;
      });
      var legend = mk(att, 'g', {});
      [['f-a', 'cloud provider filter'], ['', 'model’s own alignment'], ['f-acc', 'ChannelGuard gate']].forEach(function (l, i) {
        var LX = [92, 262, 452][i], sw = mk(legend, 'rect', { x: LX, y: 262, width: 12, height: 12, rx: 2 });
        if (l[0]) sw.setAttribute('class', l[0]); else sw.setAttribute('fill', '#6b6e68');
        mk(legend, 'text', { x: LX + 18, y: 272, 'font-size': 12.5, 'class': 't-soft' }, l[1]);
      });
      var callout = mk(att, 'text', { x: 320, y: 254, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, 'class': 't-r' }, '');
      var chips = mk(att, 'g', {});
      var c1 = pill(chips, 70, 250, 240, 34, 'f-accs s-acc', 'prompt injection 33% → 17%', 't-acc', 13.5);
      var c2 = pill(chips, 330, 250, 240, 34, 'f-accs s-acc', 'math accuracy 0.867 → 0.867', 't-acc', 13.5);

      function bars(k, prov, model, gate, g) {
        var r = ROWS[k], u = BW / 30 * g;
        set(r.segs[0], { x: BX, width: prov * u });
        set(r.segs[1], { x: BX + prov * u, width: model * u });
        set(r.segs[2], { x: BX + (prov + model) * u, width: gate * u });
        r.lab.textContent = gate ? '30 / 30 own gate' : (prov ? prov + ' / 30 provider' : '30 / 30 model');
        show(r.lab, g > 0.6 ? 1 : 0);
      }

      return function (s, p) {
        hideAll([pipe, att, p1n, gateBox, gateT, callout, legend, chips].concat(holes, gates, ROWS));
        if (s === 0 || s === 3) {
          show(pipe, 1);
          chans.forEach(function (c, i) { show(c, win(p, 0.04 + i * 0.05, 0.12 + i * 0.05)); });
          if (s === 0) {
            holes.forEach(function (h, i) { show(h, win(p, 0.35 + i * 0.07, 0.42 + i * 0.07)); });
            show(p1n, win(p, 0.8, 0.9));
          } else {
            gates.forEach(function (g, i) { show(g, win(p, 0.15 + i * 0.06, 0.22 + i * 0.06)); });
            show(gateBox, win(p, 0.6, 0.72)); show(gateT, win(p, 0.75, 0.85));
          }
          return;
        }
        show(att, 1); show(legend, 1);
        if (s === 1) {
          head.textContent = 'Undefended pipeline · tool poisoning · who stopped each attack';
          show(ROWS[0], 1); bars(0, 24, 6, 0, win(p, 0.15, 0.5));
          callout.textContent = '24 of 30 blocks borrowed from the provider'; show(callout, win(p, 0.65, 0.78));
          hideAll([legend]); show(legend, win(p, 0.5, 0.6));
          return;
        }
        if (s === 2) {
          head.textContent = 'Same undefended pipeline on three backends';
          bars(0, 24, 6, 0, 1); show(ROWS[0], 1);
          show(ROWS[1], win(p, 0.1, 0.2)); bars(1, 0, 30, 0, win(p, 0.15, 0.4));
          show(ROWS[2], win(p, 0.3, 0.4)); bars(2, 0, 30, 0, win(p, 0.35, 0.6));
          callout.textContent = 'Same score, completely different protection'; show(callout, win(p, 0.7, 0.82));
          hideAll([legend]);
          return;
        }
        head.textContent = 'With ChannelGuard · tool poisoning · who stopped each attack';
        ROWS.forEach(function (r, k) { show(r, 1); bars(k, 0, 0, 30, win(p, 0.06 + k * 0.1, 0.3 + k * 0.1)); });
        hideAll([legend]); show(chips, 1); show(c1, win(p, 0.55, 0.65)); show(c2, win(p, 0.68, 0.78));
      };
    }
  };

  // ======================================================================
  // 8. MedBayes-Lite: clinical uncertainty governance (Frontiers in Digital Health)
  // ======================================================================
  var mbl = {
    tag: 'Explainer · Frontiers 2026 · illustrative example',
    link: '/medbayes-lite/',
    scenes: [
      { h: 'Confident, and wrong, where it matters most', d: 10000,
        p: 'Clinical language models often give wrong answers with high confidence, and those confident mistakes cluster in <b>high-severity</b> questions about diagnosis, treatment and medication. The model is already trained; MedBayes-Lite adds a safety layer around it instead of retraining it.' },
      { h: 'Ask several times, then recalibrate', d: 11000,
        p: 'The layer runs the same model fifteen times with small random changes (<b>Monte Carlo dropout</b>), averages the answers, and recalibrates the confidence so that 70 percent means right about 70 percent of the time. No weights change and no parameters are added.' },
      { h: 'Answer, or hand it to a clinician', d: 12000,
        p: 'A gate answers only when the calibrated confidence clears a threshold, and sends every other case to a person. On MedMCQA, accepted answers are right <b>82 percent</b> of the time instead of 57, but the model now answers about 1 question in 10 instead of more than half. The safety is paid for in coverage.' },
      { h: 'Strongest when the data shifts', d: 11000,
        p: 'The biggest gain appears when a model trained on one exam is tested on another, here the US medical licensing exam. Unprotected, it is confidently wrong on about <b>21 percent</b> of high-severity questions; with the layer, that falls to near zero.' },
      { h: 'What it does not do', d: 12000,
        p: 'The paper reports its limits openly. Temperature scaling alone gets most of the calibration gain at lower cost, deep ensembles rank risky cases better, and a model that is already well calibrated gains nothing. The value is <b>governance</b>: fewer confident high-severity errors, with uncertain cases escalated to clinicians.' }
    ],
    build: function (svg) {
      // ---- scene 1: an overconfident answer (illustrative) ----
      var q = mk(svg, 'g', {});
      mk(q, 'rect', { x: 26, y: 42, width: 300, height: 170, rx: 12, 'class': 'f-elev s-line', 'stroke-width': 1.5 });
      mk(q, 'text', { x: 44, y: 70, 'font-size': 12, 'class': 't-mono t-mute' }, 'CLINICAL EXAM QUESTION');
      ['A patient on warfarin starts a new', 'antibiotic. Which lab value should', 'be monitored most closely?'].forEach(function (l, i) {
        mk(q, 'text', { x: 44, y: 102 + i * 26, 'font-size': 16 }, l);
      });
      var ans = mk(svg, 'g', {});
      mk(ans, 'rect', { x: 356, y: 52, width: 258, height: 46, rx: 10, 'class': 'f-accs s-acc', 'stroke-width': 1.5 });
      mk(ans, 'text', { x: 485, y: 81, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 600 }, 'Model: “platelet count”');
      var cbar = mk(svg, 'g', {});
      mk(cbar, 'text', { x: 356, y: 128, 'font-size': 13, 'class': 't-soft' }, 'confidence');
      mk(cbar, 'rect', { x: 356, y: 136, width: 200, height: 16, rx: 8, 'class': 'f-line' });
      var cfill = mk(cbar, 'rect', { x: 356, y: 136, width: 0, height: 16, rx: 8, 'class': 'f-acc' });
      var cval = mk(cbar, 'text', { x: 566, y: 149, 'font-size': 15, 'font-weight': 700, 'class': 't-mono' }, '');
      var wrong = mk(svg, 'text', { x: 356, y: 186, 'font-size': 16, 'font-weight': 700, 'class': 't-r' }, '✗ wrong · the answer is INR');
      var sev = pill(svg, 356, 204, 230, 32, 'f-r', 'high severity · medication', '', 14);
      sev.text.setAttribute('fill', '#fff'); sev.text.setAttribute('font-weight', 700);
      var s1note = mk(svg, 'text', { x: 26, y: 256, 'font-size': 14.5, 'font-style': 'italic', 'class': 't-serif t-soft' }, 'The most confident mistakes are often the most dangerous ones.');

      // ---- scene 2: the governance pipeline ----
      var pipe = mk(svg, 'g', {});
      var NODES = [['Question', 18, 92], ['Model × 15', 136, 116], ['Calibrate', 278, 104], ['Gate ≥ 0.70', 408, 108]];
      var nodes = NODES.map(function (n) {
        var g = pill(pipe, n[1], 120, n[2], 44, 'f-elev s-ink', n[0], '', 15);
        g.text.setAttribute('font-weight', 600); g.rect.setAttribute('stroke-width', 1.5);
        return g;
      });
      var arrows = [[110, 136], [252, 278], [382, 408]].map(function (a) {
        return mk(pipe, 'path', { d: 'M' + a[0] + ' 142 L' + (a[1] - 4) + ' 142 m-6 -6 l6 6 l-6 6', fill: 'none', 'class': 's-ink', 'stroke-width': 1.8 });
      });
      var outA = pill(pipe, 540, 82, 88, 38, 'f-elev s-line', 'Answer', 't-g', 15);
      var outC = pill(pipe, 540, 166, 88, 38, 'f-elev s-line', 'Clinician', 't-a', 15);
      outA.text.setAttribute('font-weight', 700); outC.text.setAttribute('font-weight', 700);
      var fork = mk(pipe, 'path', { d: 'M516 142 L528 142 L528 101 L540 101 M528 142 L528 185 L540 185', fill: 'none', 'class': 's-ink', 'stroke-width': 1.8 });
      var fan = mk(pipe, 'g', {});
      var FB = [];
      for (var k = 0; k < 15; k++) FB.push(mk(fan, 'rect', { x: 140 + k * 7.4, y: 110, width: 5, height: 0, rx: 1.5, 'class': 'f-acc' }));
      var r1 = mk(pipe, 'text', { x: 194, y: 190, 'text-anchor': 'middle', 'font-size': 13, 'class': 't-mono t-soft' }, 'average 0.92');
      var r2 = mk(pipe, 'text', { x: 330, y: 190, 'text-anchor': 'middle', 'font-size': 13, 'class': 't-mono t-acc' }, '0.92 → 0.58');
      var r3 = mk(pipe, 'text', { x: 462, y: 190, 'text-anchor': 'middle', 'font-size': 13, 'class': 't-mono t-a' }, '0.58 < 0.70');
      var p2note = mk(pipe, 'text', { x: 320, y: 262, 'text-anchor': 'middle', 'font-size': 14, 'class': 't-mono t-acc' }, 'no retraining · no new parameters');

      // ---- scene 3: answered vs deferred, per 100 questions ----
      var waf = mk(svg, 'g', {});
      mk(waf, 'text', { x: 24, y: 42, 'font-size': 13.5, 'class': 't-soft' }, 'MedMCQA · PubMedBERT · threshold 0.70 · per 100 questions');
      var PANELS = [{ x: 130, title: 'Base model', ok: 31, bad: 23, line1: 'answers 54 of 100', line2: '57% of those are right' },
                    { x: 420, title: 'With MedBayes-Lite', ok: 8, bad: 2, line1: 'answers 10 of 100', line2: '82% of those are right' }];
      var C = 15, G = 3;
      PANELS.forEach(function (P) {
        P.g = mk(waf, 'g', {});
        mk(P.g, 'text', { x: P.x + 88, y: 68, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700 }, P.title);
        P.cells = [];
        for (var i = 0; i < 100; i++) {
          var cx = P.x + (i % 10) * (C + G), cy = 76 + Math.floor(i / 10) * (C + G);
          P.cells.push(mk(P.g, 'rect', { x: cx, y: cy, width: C, height: C, rx: 3, 'class': 'f-line' }));
        }
        P.t1 = mk(P.g, 'text', { x: P.x + 88, y: 271, 'text-anchor': 'middle', 'font-size': 14.5, 'font-weight': 600 }, P.line1);
        P.t2 = mk(P.g, 'text', { x: P.x + 88, y: 290, 'text-anchor': 'middle', 'font-size': 14, 'class': 't-acc', 'font-weight': 600 }, P.line2);
      });
      var leg = mk(waf, 'g', {});
      [['f-g', 'right'], ['f-r', 'wrong'], ['f-line', 'deferred']].forEach(function (l, i) {
        mk(leg, 'rect', { x: 326, y: 134 + i * 28, width: 12, height: 12, rx: 2, 'class': l[0] });
        mk(leg, 'text', { x: 343, y: 144 + i * 28, 'font-size': 12, 'class': 't-soft' }, l[1]);
      });

      // ---- scene 4: domain shift ----
      var sh = mk(svg, 'g', {});
      mk(sh, 'text', { x: 24, y: 42, 'font-size': 14, 'class': 't-soft' }, 'Trained on MedMCQA, tested on the US licensing exam (MedQA-USMLE)');
      mk(sh, 'text', { x: 24, y: 64, 'font-size': 14, 'font-weight': 600 }, 'Share of high-severity questions answered confidently and wrongly');
      var BX = 250, BW = 300, MAXV = 25;
      var SROWS = [['PubMedBERT', 'base model', 21.3, 'f-r'], ['', 'MedBayes-Lite', 0.2, 'f-acc'], ['BioBERT', 'base model', 21.7, 'f-r'], ['', 'MedBayes-Lite', 0.0, 'f-acc']];
      var sbars = SROWS.map(function (r, i) {
        var y = 84 + i * 44 + (i >= 2 ? 22 : 0), g = mk(sh, 'g', {});
        if (r[0]) mk(g, 'text', { x: 24, y: y + 37, 'font-size': 15, 'font-weight': 700 }, r[0]);
        mk(g, 'text', { x: BX - 12, y: y + 19, 'text-anchor': 'end', 'font-size': 13.5, 'class': 't-soft' }, r[1]);
        mk(g, 'rect', { x: BX, y: y + 4, width: BW, height: 22, rx: 5, 'class': 'f-line' });
        g.f = mk(g, 'rect', { x: BX, y: y + 4, width: 0, height: 22, rx: 5, 'class': r[3] });
        g.t = mk(g, 'text', { x: BX + 8, y: y + 20, 'font-size': 14, 'font-weight': 700, 'class': 't-mono' }, r[2].toFixed(1) + '%');
        g.v = r[2];
        return g;
      });

      // ---- scene 5: honest scorecard ----
      var card = mk(svg, 'g', {});
      var ITEMS = [['✓', 't-g', 'Calibration error falls by 0.23 to 0.33'],
                   ['✓', 't-g', 'Confident high-severity errors drop to near zero'],
                   ['≈', 't-a', 'Temperature scaling alone gets most of that calibration'],
                   ['✗', 't-r', 'Does not rank risky cases better; deep ensembles do'],
                   ['✗', 't-r', 'No benefit when a model is already well calibrated']];
      var items = ITEMS.map(function (it, i) {
        var g = mk(card, 'g', {});
        mk(g, 'text', { x: 64, y: 62 + i * 48, 'font-size': 24, 'font-weight': 700, 'class': it[1] }, it[0]);
        mk(g, 'text', { x: 104, y: 60 + i * 48, 'font-size': 17.5 }, it[2]);
        return g;
      });

      var ALL = [q, ans, cbar, wrong, sev, s1note, pipe, waf, sh, card];
      return function (s, p) {
        hideAll(ALL);
        if (s === 0) {
          show(q, win(p, 0, 0.12)); show(ans, win(p, 0.22, 0.32)); show(cbar, win(p, 0.3, 0.38));
          var c = 0.92 * win(p, 0.32, 0.5);
          set(cfill, { width: 200 * c }); cval.textContent = Math.round(c * 100) + '%';
          show(wrong, win(p, 0.55, 0.64)); show(sev, win(p, 0.66, 0.75)); show(s1note, win(p, 0.82, 0.92));
          return;
        }
        if (s === 1) {
          show(pipe, 1);
          nodes.forEach(function (n, i) { show(n, win(p, 0.02 + i * 0.12, 0.1 + i * 0.12)); });
          arrows.forEach(function (a, i) { show(a, win(p, 0.08 + i * 0.12, 0.14 + i * 0.12)); });
          show(fork, win(p, 0.46, 0.52)); show(outA, win(p, 0.48, 0.55)); show(outC, win(p, 0.5, 0.57));
          show(fan, win(p, 0.14, 0.2));
          FB.forEach(function (b, k) {
            var h = 10 + 9 * (1 + Math.sin(p * 40 + k * 1.9)) * (p < 0.6 ? 1 : 0.2);
            set(b, { y: 114 - h, height: h });
          });
          show(r1, win(p, 0.3, 0.38)); show(r2, win(p, 0.4, 0.48)); show(r3, win(p, 0.56, 0.64));
          var route = win(p, 0.66, 0.74);
          outC.rect.setAttribute('class', route > 0.5 ? 'f-a' : 'f-elev s-line');
          outC.text.setAttribute('class', route > 0.5 ? 'f-elev' : 't-a');
          show(p2note, win(p, 0.8, 0.9));
          return;
        }
        if (s === 2) {
          show(waf, 1); show(leg, win(p, 0.05, 0.15));
          PANELS.forEach(function (P, pi) {
            var g = win(p, 0.08 + pi * 0.32, 0.38 + pi * 0.32), n = Math.round(g * 100);
            P.cells.forEach(function (cell, i) {
              var cls = 'f-line';
              if (i < n) cls = i < P.ok ? 'f-g' : (i < P.ok + P.bad ? 'f-r' : 'f-line');
              cell.setAttribute('class', cls);
              show(cell, i < n ? 1 : 0.35);
            });
            show(P.t1, win(p, 0.3 + pi * 0.32, 0.38 + pi * 0.32)); show(P.t2, win(p, 0.34 + pi * 0.32, 0.42 + pi * 0.32));
          });
          return;
        }
        if (s === 3) {
          show(sh, 1);
          sbars.forEach(function (b, i) {
            var g = win(p, 0.08 + i * 0.12, 0.3 + i * 0.12), w = BW * b.v / MAXV * g;
            set(b.f, { width: w }); set(b.t, { x: BX + Math.max(w, 0) + 8 });
            show(b, win(p, 0.04 + i * 0.12, 0.1 + i * 0.12));
          });
          return;
        }
        show(card, 1);
        items.forEach(function (g, i) { show(g, win(p, 0.04 + i * 0.13, 0.14 + i * 0.13)); });
      };
    }
  };

  var STORIES = { poe: poe, uat: uat, ajc: ajc, nexus: nexus, vlm: vlm, tas: tas, cg: cg, mbl: mbl };

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
     [/\bKL\b/g, 'K-L'], [/MedBayes-Lite/g, 'Med-Bayes Lite'], [/\bMedMCQA\b/g, 'Med M-C-Q-A'], [/\bMedQA-USMLE\b/g, 'Med Q-A U-S-M-L-E'], [/\bAUROC\b/g, 'A-U-ROC'], [/\bVLMs?\b/g, function (m) { return m === 'VLM' ? 'V-L-M' : 'V-L-Ms'; }], [/\bF1\b/g, 'F-one'], [/\+(\d)/g, 'plus $1'], [/(\d)%/g, '$1 percent']
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
