/* "Ask my research": a small chat panel that answers questions about Elias's work.
   It runs entirely in the browser: questions are matched against the knowledge base
   below (facts taken from this site and the CV), so nothing is sent anywhere and
   answers cannot drift from what the site says. To use a language model instead,
   set window.ASKR_ENDPOINT to a server that accepts {messages} and returns {reply}. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- knowledge base
  // Each entry: keywords (lower case; phrases allowed), answer (HTML), optional links.
  var KB = [
    { id: 'overview', k: ['research', 'about', 'work on', 'focus', 'interest', 'area', 'topic', 'what does he do', 'summary', 'overview', 'agenda', 'thesis'],
      a: 'Elias works on <b>reliable AI at inference time</b>: methods that make deployed LLMs, LLM judges, and agents trustworthy <b>without retraining them</b>, and careful tests of when that reliability is real. His work has three threads: (1) whether a model knows when it is wrong (uncertainty and calibration), (2) whether agreement among AI judges is real evidence (LLM evaluation), and (3) whether an agent can be stopped before an unsafe action (agent safety). His applied area is clinical and biomedical AI.' },
    { id: 'papers', k: ['paper', 'papers', 'publication', 'publications', 'first-author', 'first author', 'recent', 'published', 'accepted', 'venue', 'conference'],
      a: 'Recent first-author papers:<br>&bull; <a href="/poe-steering/">When Policies Cannot Be Retrained</a> (<b>NeurIPS 2026</b>, Main Track)<br>&bull; <a href="/uat-lite/">UAT-LITE</a> (<b>EACL 2027</b>, Main Conference)<br>&bull; <a href="/nexus/">NEXUS</a> (Findings of AACL-IJCNLP 2026)<br>&bull; <a href="/Automatic-Jury-Consensus/">Agreement Overstates Evidence</a> (under review)<br>&bull; <a href="/channelguard/">ChannelGuard</a> (under review at TMLR) and <a href="/tas/">Right Knowledge, Wrong Answer</a> (preprint)<br>The full list is on <a href="https://scholar.google.com/citations?user=l0L1NPAAAAAJ" target="_blank" rel="noopener">Google Scholar</a>.' },
    { id: 'poe', k: ['policies cannot be retrained', 'poe', 'product of experts', 'steering', 'offline rl', 'reinforcement learning', 'frozen policy', 'frozen actor', 'kl', 'robot', 'neurips paper', 'neurips', 'nips'],
      a: '<b>When Policies Cannot Be Retrained</b> (NeurIPS 2026, Main Track) steers a frozen offline-RL policy toward a new goal at deployment, with no retraining. Composing the frozen actor with a goal-conditioned prior as a product of experts gives exactly the same policy as KL-regularized adaptation. Its value is graceful degradation: when the guidance is bad, the policy stays anchored to the original behaviour instead of collapsing. Across 12 benchmark settings it helped in 4, changed nothing in 4, and hurt in 4. <a href="/poe-steering/">Project page</a> &middot; <a href="https://neurips.cc/virtual/2026/loc/atlanta/poster/152992" target="_blank" rel="noopener">poster &amp; slides</a>' },
    { id: 'uat', k: ['uat', 'uat-lite', 'uncertainty', 'calibration', 'eacl', 'calibrated', 'confidence', 'mc dropout', 'monte carlo', 'attention', 'overconfident', 'eacl paper'],
      a: '<b>UAT-LITE</b> (EACL 2027, Main Conference) makes a pretrained transformer\'s confidence more honest at inference time. It estimates per-token uncertainty with Monte Carlo dropout and uses it to turn down attention to unstable tokens, with no weight updates. It lowers average calibration error from 0.107 to 0.096 without retraining, and gives token-level and layer-level diagnostics that output-only calibration cannot. <a href="/uat-lite/">Project page</a>' },
    { id: 'judges', k: ['judge', 'judges', 'llm-as-judge', 'llm as judge', 'agreement', 'consensus', 'evaluation', 'evaluator', 'correlated', 'correlation', 'jury', 'overstates', 'evidence'],
      a: '<b>Agreement Overstates Evidence</b> (under review) shows that LLM judges make correlated mistakes. In a ten-judge bank the mean error correlation is 0.21, so ten judges carry the evidence of only about 3.5 independent ones, and ignoring this flips up to 28% of significance conclusions. The fix belongs in the statistics, not the voting rule. You can try the effect yourself on the <a href="/Automatic-Jury-Consensus/">interactive project page</a>.' },
    { id: 'nexus', k: ['nexus', 'tool', 'tool-using', 'tool use', 'runtime', 'guardrail', 'monitor', 'agent safety', 'unsafe action', 'prompt injection', 'aacl'],
      a: '<b>NEXUS</b> (Findings of AACL-IJCNLP 2026) is a runtime safety monitor for tool-using LLM agents. Before a tool call runs, it reads the structured plan and chooses to allow, block, ask the user, or ask the agent to revise, combining rules, argument inspection, and a calibrated risk score. It reaches 0.949 F1 while adding 0.205 ms median latency, under 0.1% of a typical agent loop. <a href="/nexus/">Project page</a>' },
    { id: 'channelguard', k: ['channelguard', 'multi-agent', 'multi agent', 'pipeline', 'compose', 'borrowed safety', 'provider filter', 'handoff', 'inter-agent'],
      a: '<b>ChannelGuard</b> (under review at TMLR) shows that safe models do not compose into safe multi-agent systems. An undefended pipeline can report zero attack success while 24 of 30 blocks actually come from the cloud provider\'s filter. ChannelGuard adds training-free, application-owned gates on every inter-agent channel: they block all tested tool-poisoning attacks on three backends and halve prompt-injection success, with task accuracy unchanged. <a href="/channelguard/">Project page</a>' },
    { id: 'tas', k: ['temporal', 'right knowledge', 'wrong answer', 'outdated', 'stale', 'parametric', 'knowledge conflict', 'activation patching', 'wikidata', 'interpretability'],
      a: '<b>Right Knowledge, Wrong Answer</b> (preprint) shows that open-weight LLMs often store a newer fact yet answer with the outdated one. Adding a date cue such as "As of 2024" recovers the newer fact in 61&ndash;81% of cases, and patching a single upper layer flips the answer in 72&ndash;85%, so the preference is localized inside the model, not missing knowledge. It uses a verified benchmark of 8,746 Wikidata changes. <a href="/tas/">Project page</a>' },
    { id: 'vlm', k: ['vlm', 'vision', 'vision-language', 'multimodal', 'test-time compute', 'extra compute', 'router', 'routing', 'look', 'think', 'fixable'],
      a: '<b>When Does Extra Compute Help?</b> (under review) studies vision-language models that can look closer or reason longer. Compared fairly against handing out the same actions at random at equal cost, trained routers gain at most 2.1 points, because confidence detects wrong answers but not which errors extra compute can fix. <a href="/look-think/">Project page</a>' },
    { id: 'mpv', k: ['preference', 'rlhf', 'dpo', 'alignment', 'verification', 'corrupted', 'mpv', 'post-training', 'post training'],
      a: '<b>Fault-Tolerant Preference Alignment via Multi-Agent Verification</b> (ICLR 2026 Workshop) checks every preference pair with four verifier agents before it reaches RLHF or DPO training. On Qwen2-7B it cut the summarization refusal rate from 14.8% to 0.5% while holding win rate. He has hands-on experience with RLHF, PPO, GRPO, DPO and SFT. <a href="/mpv/">Project page</a>' },
    { id: 'clinical', k: ['clinical', 'medical', 'health', 'healthcare', 'biomedical', 'biology', 'bioinformatics', 'biogen', 'carebench', 'antimicrobial', 'medicine'],
      a: 'Clinical and biomedical AI is his applied area, because there a confident error costs patient harm. <a href="/biogen/">BIOGEN</a> (Frontiers in Bioinformatics, 2026) is a multi-agent system where every claim about antimicrobial-resistance genes must cite a checkable database entry. <a href="/carebench/">CareBench</a> is a benchmark for whether correct clinical diagnoses come from safe reasoning. He also trained <a href="https://github.com/eliashossain001/MiniHealthLM" target="_blank" rel="noopener">MiniHealthLM</a>, a ~600M-parameter model, from scratch for healthcare text.' },
    { id: 'experience', k: ['experience', 'industry', 'job', 'worked', 'work experience', 'before', 'company', 'companies', 'reve', 'timerni', 'engineer', 'background', 'career'],
      a: 'Before his Ph.D., Elias spent three years in industry ML: as a <b>Software Engineer at REVE Systems</b> (Dhaka, 2022&ndash;2023) he cut speech-recognition word error rate by 20% for a production e-governance voice interface, and as an <b>AI/ML Researcher at Time Research &amp; Innovation</b> (2020&ndash;2022) he built medical-imaging models and ML for a telemedicine platform. He was then a Graduate Research Assistant at Mississippi State\'s PATENT Lab and is now at UCF\'s Complex Adaptive Systems Lab.' },
    { id: 'education', k: ['education', 'phd', 'ph.d', 'degree', 'university', 'ucf', 'masters', 'master', 'mississippi', 'advisor', 'graduate', 'graduation', 'school', 'gpa', 'thesis', 'study', 'studied', 'studies'],
      a: 'Elias is a <b>Ph.D. candidate at the University of Central Florida</b> (Industrial Engineering, Computer Science concentration; expected May 2028), advised by Dr. Niloofar Yousefi, and has passed his qualifying exam. He holds an <b>M.S. in Computer Science</b> from Mississippi State University (thesis: TopNet R1, on topic discovery in scientific abstracts).' },
    { id: 'skills', k: ['skill', 'skills', 'tools', 'stack', 'pytorch', 'python', 'framework', 'gpu', 'train', 'training', 'vllm', 'lora', 'technical', 'grpo', 'ppo', 'know', 'experience with', 'familiar'],
      a: 'Core skills: <b>post-training and RL</b> (RLHF, PPO, GRPO, DPO, SFT, offline RL), <b>LLM systems</b> (PyTorch, Hugging Face Transformers, vLLM, LoRA/QLoRA, multi-GPU training), <b>agents and safety</b> (tool-using and multi-agent pipelines, prompt-injection defense, runtime guardrails), <b>interpretability</b> (activation patching and steering), and <b>evaluation</b> (LLM-as-judge, statistical testing, calibration). He has trained and evaluated Qwen, Llama, and Mistral models from 1.5B to 8B parameters.' },
    { id: 'hire', k: ['hire', 'why', 'strength', 'strengths', 'stand out', 'good fit', 'recommend', 'should someone', 'value', 'impact'],
      a: 'In short: first-author papers at <b>NeurIPS 2026</b> and <b>EACL 2027</b>, three years of production ML before the Ph.D., and a consistent focus on a problem every deployed AI team has, making models they cannot retrain behave reliably. His work is careful about what it does not show: papers report where methods help, do nothing, or hurt, and each comes with code, a project page, and a one-minute video.' },
    { id: 'contact', k: ['contact', 'email', 'reach', 'internship', 'intern', 'hiring', 'available', 'opening', 'job', 'collaborate', 'meet', 'schedule', 'cv', 'resume'],
      a: 'Elias is <b>seeking Summer 2027 research internships</b> in reliable LLMs, LLM evaluation, and agent safety. Email: <a href="mailto:mdelias.hossain@ucf.edu">mdelias.hossain@ucf.edu</a>. His resume is <a href="/cv/resume.pdf?v=20261116b" target="_blank" rel="noopener">here</a>, and he will be at <b>NeurIPS 2026 in Atlanta (Dec 9&ndash;13)</b>, happy to meet.' },
    { id: 'talks', k: ['talk', 'talks', 'present', 'presentation', 'video', 'poster', 'slides', 'mit', 'amazon', 'symposium', 'conference talk'],
      a: 'Recent presentations: the <b>NeurIPS 2026</b> poster (<a href="https://neurips.cc/virtual/2026/loc/atlanta/poster/152992" target="_blank" rel="noopener">poster &amp; slides</a>), multi-agent alignment verification at the <b>Amazon Trusted AI Symposium</b> in New York (2026), and CITE at <b>MIT\'s Molecular Machine Learning Conference</b> (2025). Every paper on the homepage also has a one-minute narrated video.' },
    { id: 'awards', k: ['award', 'awards', 'honor', 'honors', 'prize', 'won', 'competition', 'fellowship', 'nasa', 'ieee', 'hackathon'],
      a: 'Honors include a <b>Graduate Presentation Fellowship</b> at UCF (2025), <b>divisional champion and global nominee at the NASA Space Apps Challenge</b> (2017), <b>winner of the IEEE SS12 Innovation Challenge</b> (2018), and <b>finalist for the Dr. Pradeep P. Thevannoor Innovation Awards</b> (2019).' },
    { id: 'mentoring', k: ['mentor', 'mentoring', 'mentorship', 'students', 'supervise', 'review', 'reviewer', 'service'],
      a: 'He mentors early-career researchers, several of whom co-authored his papers or went on to graduate study, and he reviews for the NeurIPS 2026 AI4GOOD and ICML 2026 GenBio workshops and for journals including Scientific Reports and PLOS ONE.' }
  ];
  var CHIPS = [
    ['What\'s his research about?', 'overview'],
    ['Recent first-author papers?', 'papers'],
    ['What did he do before his Ph.D.?', 'experience'],
    ['Why should someone hire him?', 'hire']
  ];
  var FALLBACK = 'I can only answer from what is on this site, and I could not match that question. Try asking about his research, a specific paper (for example NEXUS or UAT-LITE), his experience, or how to reach him. For anything else, email <a href="mailto:mdelias.hossain@ucf.edu">mdelias.hossain@ucf.edu</a>.';
  var GREET = 'Hi! Ask me anything about <b>Elias Hossain</b>: his research, papers, experience, and background.';

  // ---------------------------------------------------------------- matching
  var STOP = /\b(the|a|an|is|are|was|were|of|on|in|to|for|and|or|his|he|him|elias|hossain|me|tell|about|what|whats|which|does|do|did|can|you|your|please|how|any|some|with|it|this|that)\b/g;
  function norm(t) { return (' ' + t.toLowerCase().replace(/[^a-z0-9\-\.\s']/g, ' ').replace(/'s\b/g, '') + ' ').replace(/\s+/g, ' '); }
  function score(q, e) {
    var s = 0, qq = norm(q), bare = qq.replace(STOP, ' ');
    e.k.forEach(function (kw) {
      if (kw.indexOf(' ') > -1) { if (qq.indexOf(' ' + kw + ' ') > -1 || qq.indexOf(kw) > -1) s += 3; }
      else if (bare.indexOf(' ' + kw + ' ') > -1) s += 2;
      else if (kw.length > 4 && bare.indexOf(kw) > -1) s += 1;
    });
    return s;
  }
  function answer(q) {
    var ranked = KB.map(function (e) { return { e: e, s: score(q, e) }; }).filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; });
    if (!ranked.length) return FALLBACK;
    var out = ranked[0].e.a;
    if (ranked[1] && ranked[1].s >= ranked[0].s && ranked[1].e.id !== ranked[0].e.id) out += '<br><br>' + ranked[1].e.a;
    return out;
  }
  function byId(id) { for (var i = 0; i < KB.length; i++) if (KB[i].id === id) return KB[i].a; return FALLBACK; }

  // ---------------------------------------------------------------- styles
  var css = '' +
    '.askr{position:fixed;bottom:22px;right:22px;z-index:150;font-family:"Roboto","Helvetica","Arial",sans-serif}' +
    '.askr-launch{display:inline-flex;align-items:center;gap:.45rem;padding:.5rem .9rem;border-radius:999px;cursor:pointer;background:var(--bg-elev,#fff);color:var(--ink,#212529);border:1px solid var(--line,rgba(0,0,0,.15));box-shadow:0 3px 14px rgba(0,0,0,.10);font:500 .82rem/1 "Roboto",sans-serif;transition:transform .15s,box-shadow .15s,border-color .15s}' +
    '.askr-launch:hover{transform:translateY(-1px);box-shadow:0 5px 18px rgba(0,0,0,.14);border-color:var(--accent,#2560B1)}' +
    '.askr-launch svg{color:var(--accent,#2560B1);flex-shrink:0}' +
    '@media (max-width:1439.98px){.askr-launch{gap:0;padding:0;width:44px;height:44px;justify-content:center;border-radius:50%}.askr-launch span{display:none}.askr-launch svg{width:19px;height:19px}}' +
    '.askr.open .askr-launch{display:none}' +
    '.askr-panel{position:absolute;bottom:0;right:0;width:clamp(340px,35vw,600px);height:min(76vh,680px);display:none;flex-direction:column;overflow:hidden;background:var(--bg,#f8f9fa);border:1px solid var(--line,rgba(0,0,0,.15));border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);animation:askrIn .22s ease}' +
    '.askr.open .askr-panel{display:flex}' +
    '@keyframes askrIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
    '.askr-head{display:flex;align-items:center;justify-content:space-between;padding:.8rem .95rem;border-bottom:1px solid var(--line,rgba(0,0,0,.15))}' +
    '.askr-title{font:600 .92rem "Lora",Georgia,serif;color:var(--ink,#212529)}' +
    '.askr-sub{font-size:.7rem;color:var(--ink-muted,#6b6b6b);margin-top:2px}' +
    '.askr-acts{display:flex;align-items:center;gap:.4rem}' +
    '.askr-new{display:inline-flex;align-items:center;gap:.28rem;cursor:pointer;font:500 .7rem/1 inherit;padding:.32rem .6rem;border-radius:999px;background:transparent;color:var(--ink-muted,#6b6b6b);border:1px solid var(--line,rgba(0,0,0,.15))}' +
    '.askr-new:hover{border-color:var(--accent,#2560B1);color:var(--accent,#2560B1)}' +
    '.askr-x{background:none;border:none;cursor:pointer;padding:.2rem;color:var(--ink-muted,#6b6b6b);display:flex}' +
    '.askr-x:hover{color:var(--ink,#212529)}' +
    '.askr-msgs{flex:1;overflow-y:auto;padding:.9rem;display:flex;flex-direction:column;gap:.6rem}' +
    '.askr-msg{display:flex;max-width:88%}.askr-msg.u{align-self:flex-end}.askr-msg.b{align-self:flex-start}' +
    '.askr-bub{padding:.55rem .8rem;border-radius:13px;font:.85rem/1.55 "Lora",Georgia,serif;word-wrap:break-word}' +
    '.askr-msg.u .askr-bub{background:var(--accent,#2560B1);color:#fff;border-bottom-right-radius:4px}' +
    '.askr-msg.b .askr-bub{background:var(--bg-elev,#fff);color:var(--ink,#212529);border:1px solid var(--line,rgba(0,0,0,.15));border-bottom-left-radius:4px}' +
    '.askr-msg.b .askr-bub a{color:var(--accent,#2560B1);text-decoration:underline}' +
    '.askr-chips{display:flex;flex-wrap:wrap;gap:.4rem}' +
    '.askr-chip{font:.76rem "Lora",Georgia,serif;padding:.35rem .7rem;border-radius:999px;cursor:pointer;background:var(--bg-elev,#fff);color:var(--ink,#212529);border:1px solid var(--line,rgba(0,0,0,.15))}' +
    '.askr-chip:hover{border-color:var(--accent,#2560B1);color:var(--accent,#2560B1)}' +
    '.askr-foot{border-top:1px solid var(--line,rgba(0,0,0,.15));padding:.7rem .9rem .55rem}' +
    '.askr-form{display:flex;gap:.5rem;align-items:center}' +
    '.askr-in{flex:1;font:.88rem "Lora",Georgia,serif;padding:.6rem .85rem;border-radius:999px;border:1px solid var(--line,rgba(0,0,0,.15));background:var(--bg-elev,#fff);color:var(--ink,#212529);outline:none}' +
    '.askr-in:focus{border-color:var(--accent,#2560B1)}' +
    '.askr-send{width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;background:var(--accent,#2560B1);color:#fff;display:grid;place-items:center;flex-shrink:0}' +
    '.askr-note{font-size:.66rem;color:var(--ink-muted,#6b6b6b);margin-top:.45rem}' +
    '.askr-note a{color:inherit;text-decoration:underline}' +
    '@media (max-width:560px){.askr{right:12px;bottom:12px}.askr-panel{width:calc(100vw - 24px);height:min(80vh,620px)}}';

  // ---------------------------------------------------------------- UI
  var ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function mount() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var root = el('div', 'askr'); root.id = 'askr';
    root.innerHTML =
      '<button type="button" class="askr-launch" aria-label="Ask about my research" aria-expanded="false">' + ICON + '<span>Ask my research</span></button>' +
      '<div class="askr-panel" role="dialog" aria-label="Ask my research">' +
        '<div class="askr-head"><div><div class="askr-title">Ask my research</div><div class="askr-sub">Answers about my work &amp; background, from this site</div></div>' +
          '<div class="askr-acts"><button type="button" class="askr-new">&#8635; New chat</button>' +
          '<button type="button" class="askr-x" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>' +
        '<div class="askr-msgs" aria-live="polite"></div>' +
        '<div class="askr-foot"><form class="askr-form"><input class="askr-in" type="text" placeholder="Ask a question..." aria-label="Your question" maxlength="300" />' +
          '<button class="askr-send" type="submit" aria-label="Send"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form>' +
          '<div class="askr-note">Answers come from this site&rsquo;s content. Email <a href="mailto:mdelias.hossain@ucf.edu">mdelias.hossain@ucf.edu</a> for anything important.</div></div>' +
      '</div>';
    document.body.appendChild(root);
    var launch = root.querySelector('.askr-launch'), msgs = root.querySelector('.askr-msgs'),
        form = root.querySelector('.askr-form'), input = root.querySelector('.askr-in'), history = [];

    function add(who, html) {
      var m = el('div', 'askr-msg ' + who), b = el('div', 'askr-bub');
      if (who === 'u') b.textContent = html; else b.innerHTML = html;
      m.appendChild(b); msgs.appendChild(m); msgs.scrollTop = msgs.scrollHeight;
      return b;
    }
    function chips() {
      var c = el('div', 'askr-chips');
      CHIPS.forEach(function (ch) {
        var b = el('button', 'askr-chip'); b.type = 'button'; b.textContent = ch[0];
        b.addEventListener('click', function () { c.remove(); ask(ch[0], ch[1]); });
        c.appendChild(b);
      });
      msgs.appendChild(c);
    }
    function reset() { msgs.innerHTML = ''; history = []; add('b', GREET); chips(); }
    function ask(q, forcedId) {
      add('u', q); history.push({ role: 'user', content: q });
      var ep = window.ASKR_ENDPOINT;
      if (ep && !forcedId) {
        var pending = add('b', '&hellip;');
        fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
          .then(function (d) { pending.innerHTML = d.reply; history.push({ role: 'assistant', content: d.reply }); })
          .catch(function () { pending.innerHTML = answer(q); });
        return;
      }
      var a = forcedId ? byId(forcedId) : answer(q);
      setTimeout(function () { add('b', a); history.push({ role: 'assistant', content: a }); }, 220);
    }
    function open(v) {
      root.classList.toggle('open', v); launch.setAttribute('aria-expanded', String(v));
      if (v) { if (!msgs.children.length) reset(); setTimeout(function () { input.focus(); }, 50); }
    }
    launch.addEventListener('click', function () { open(true); });
    root.querySelector('.askr-x').addEventListener('click', function () { open(false); launch.focus(); });
    root.querySelector('.askr-new').addEventListener('click', reset);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('open')) open(false); });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var q = input.value.trim(); if (!q) return; input.value = ''; ask(q);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
