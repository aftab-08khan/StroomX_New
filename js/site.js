/* StroomX homepage prototype.
   Part 1 (navigation, forms, stud grids) is plain JS and always runs.
   Part 2 (the scroll story) needs GSAP + ScrollTrigger + SplitText from vendor/gsap and only
   runs when the visitor has not asked for reduced motion. Without it the page stays static and readable. */
(function () {
  'use strict';

  var root = document.documentElement;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var header = $('.site-header');
  var motionOK = window.matchMedia('(prefers-reduced-motion: no-preference)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ---------- Navigation ---------- */
  var navToggle = $('.nav-toggle');
  var nav = $('#site-nav');

  function solidHeader() {
    header.classList.toggle('is-solid', window.scrollY > 20 || nav.classList.contains('is-open'));
  }
  function setNav(open) {
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    $('.nav-toggle__label', navToggle).textContent = open ? 'Close' : 'Menu';
    solidHeader();
  }
  navToggle.addEventListener('click', function () {
    setNav(navToggle.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') { setNav(false); navToggle.focus(); }
  });
  window.addEventListener('scroll', solidHeader, { passive: true });
  solidHeader();

  // In-page links land at the top of their section (one pixel inside a pinned scene, not before it).
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1);
      var target = id === 'top' ? document.body : document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      setNav(false);
      var y = id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY + 1;
      window.scrollTo({ top: y, behavior: motionOK.matches ? 'smooth' : 'auto' });
      if (id !== 'top') { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    });
  });

  /* ---------- Forms: this prototype has no backend, so nothing is sent ---------- */
  $$('form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = $('.form__status', form);
      if (!form.checkValidity()) {
        status.textContent = 'Please complete the required fields.';
        var bad = $(':invalid', form);
        if (bad) bad.focus();
        return;
      }
      status.textContent = 'Thank you. This prototype does not send messages yet.';
    });
  });

  /* ---------- Stud grid: a field of studs that swell under the pointer ----------
     Drawn on a canvas behind the text at 30% strength or less. */
  function StudGrid(canvas) {
    var ctx = canvas.getContext('2d');
    var host = canvas.parentNode;
    var hot = canvas.getAttribute('data-hot') || '255,64,0';
    var w = 0, h = 0, gap = 30, x = 0, y = 0, tx = 0, ty = 0, s = 0, ts = 0, time = 0, live = false;

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (var gy = gap / 2; gy < h; gy += gap) {
        for (var gx = gap / 2; gx < w; gx += gap) {
          var dx = gx - x, dy = gy - y;
          var k = s * Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 190);
          var wave = live ? (Math.sin((gx + gy) * 0.011 - time * 1.3) + 1) / 2 : 0;
          ctx.fillStyle = k > 0.04 ? 'rgba(' + hot + ',' + (0.12 + 0.18 * k).toFixed(3) + ')' : 'rgba(21,23,28,0.16)';
          ctx.beginPath();
          ctx.arc(gx, gy, 1.6 + wave * 1.1 + k * k * 7, 0, 6.2832);
          ctx.fill();
        }
      }
    }
    function size() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      w = host.clientWidth; h = host.clientHeight;
      gap = w < 600 ? 24 : 30;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function tick(t, dt) {
      time += dt / 1000;
      x += (tx - x) * 0.16; y += (ty - y) * 0.16; s += (ts - s) * 0.1;
      draw();
    }
    host.addEventListener('pointermove', function (e) {
      var b = canvas.getBoundingClientRect();
      tx = e.clientX - b.left; ty = e.clientY - b.top; ts = 1;
      if (s < 0.02) { x = tx; y = ty; }
    });
    host.addEventListener('pointerleave', function () { ts = 0; });
    size();
    return {
      size: size,
      start: function () { if (!live) { live = true; gsap.ticker.add(tick); } },
      stop: function () { if (live) { live = false; gsap.ticker.remove(tick); s = ts = 0; draw(); } }
    };
  }
  var grids = $$('.studgrid').map(StudGrid);
  window.addEventListener('resize', function () { grids.forEach(function (g) { g.size(); }); });

  /* =====================================================================
     The scroll story
     ===================================================================== */
  if (!window.gsap || !window.ScrollTrigger || !window.SplitText) { root.classList.add('ready'); return; }

  gsap.registerPlugin(ScrollTrigger, SplitText);
  ScrollTrigger.config({ ignoreMobileResize: true });

  /* ---------- The thread ----------
     Each [data-thread] element gets one SVG path. It runs down a side gutter and switches sides
     through every .lane spacer inside the element. Its drawn length follows the scroll, and the
     stud rides its tip. Consecutive segments join up, so it reads as one line down the page. */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var READ_LINE = 0.62;   // the tip stays about this far down the screen
  var CORNER = 30;
  var threads = [];
  var dirty = false;
  var lastScroll = -1;

  function makeThreads() {
    threads = $$('[data-thread]').map(function (unit) {
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'thread');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.innerHTML = '<path class="thread__meas"/><path class="thread__line"/><g class="thread__head"><circle class="thread__stud" r="9"/></g>';
      unit.appendChild(svg);
      return {
        unit: unit, svg: svg, meas: svg.children[0], line: svg.children[1], head: svg.children[2], stud: $('circle', svg),
        lanes: $$('.lane', unit), startSel: unit.getAttribute('data-thread-start'), endSel: unit.getAttribute('data-thread-end'),
        pin: null, top: 0, L: 0, map: [[0, 0], [1, 0]], cur: 0, target: 0, drawn: null
      };
    });
  }

  function toward(c, p, r) {
    var dx = p[0] - c[0], dy = p[1] - c[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
    return [(c[0] + dx / d * r).toFixed(1), (c[1] + dy / d * r).toFixed(1)];
  }
  function pathD(nodes, radii) {
    var d = 'M' + nodes[0].join(' ');
    for (var k = 1; k < nodes.length - 1; k++) {
      if (radii[k] > 0.5) d += ' L' + toward(nodes[k], nodes[k - 1], radii[k]).join(' ') + ' Q' + nodes[k].join(' ') + ' ' + toward(nodes[k], nodes[k + 1], radii[k]).join(' ');
      else d += ' L' + nodes[k].join(' ');
    }
    return d + ' L' + nodes[nodes.length - 1].join(' ');
  }
  // Scroll position (px down the element) -> drawn length. Lanes are crossed quickly, gutters 1:1.
  function lenAt(t, y) {
    var m = t.map;
    if (y <= m[0][0]) return 0;
    for (var i = 1; i < m.length; i++) {
      if (y <= m[i][0]) return m[i - 1][1] + (m[i][1] - m[i - 1][1]) * (y - m[i - 1][0]) / ((m[i][0] - m[i - 1][0]) || 1);
    }
    return t.L;
  }

  function buildThreads() {
    var vh = window.innerHeight;
    var side = 0;   // 0 = left gutter, 1 = right gutter; carried from one segment to the next
    threads.forEach(function (t) {
      var u = t.unit, r = u.getBoundingClientRect(), H = u.offsetHeight;
      var wrap = $$('.wrap', u).filter(function (el) { return el.offsetWidth > 0; })[0];
      var wr = wrap.getBoundingClientRect();
      var pad = parseFloat(getComputedStyle(wrap).paddingLeft) || 20;
      var inset = Math.min(26, pad / 2);
      var X = [wr.left - r.left + pad - inset, wr.right - r.left - pad + inset];
      var small = pad < 30, studR = small ? 7 : 10;
      var mid = function (el) { var b = el.getBoundingClientRect(); return b.top - r.top + b.height / 2; };
      var startEl = t.startSel && $(t.startSel, u), endEl = t.endSel && $(t.endSel, u);
      var startY = startEl ? mid(startEl) : 0;
      var laneY = t.lanes.map(mid);
      var endX = 0, endY = H;
      if (endEl) {
        var eb = endEl.getBoundingClientRect();
        endX = eb.left - r.left + eb.width / 2;
        endY = eb.top - r.top - studR - 1;
      }
      var stops = [startY].concat(laneY, [endY]);
      var nodes = [[X[side], startY]], radii = [0];
      var keys = [[startY, null, null]];
      var lastD = 0;

      laneY.forEach(function (y, i) {
        var last = endEl && i === laneY.length - 1;
        var d = Math.max(6, Math.min(vh * 0.16, (y - stops[i]) * 0.45, (stops[i + 2] - y) * (last ? 1 : 0.45)));
        var nx = last ? endX : X[1 - side];
        var rad = Math.max(0, Math.min(CORNER, d, Math.abs(nx - X[side]) / 2));
        keys.push([y - d, nodes.concat([[X[side], y - d]]), radii.concat([0])]);
        nodes.push([X[side], y], [nx, y]);
        radii.push(rad, rad);
        if (!last) {
          side = 1 - side;
          keys.push([y + d, nodes.concat([[nx, y + d]]), radii.concat([0])]);
        }
        lastD = d;
      });
      nodes.push(endEl ? [endX, endY] : [X[side], H]);
      radii.push(0);

      t.stud.setAttribute('r', studR);
      t.line.style.strokeWidth = small ? 3 : 4;
      t.line.setAttribute('d', pathD(nodes, radii));
      t.L = t.line.getTotalLength();
      t.line.style.strokeDasharray = t.L;
      t.map = keys.map(function (k) {
        if (!k[1]) return [k[0], 0];
        t.meas.setAttribute('d', pathD(k[1], k[2]));
        return [k[0], t.meas.getTotalLength()];
      });
      t.map.push([endEl && laneY.length ? laneY[laneY.length - 1] + lastD : endY, t.L]);

      t.pin = u._pin || null;
      t.top = r.top + window.scrollY;
      if (t.pin) {
        t.y0 = vh * READ_LINE;   // where the tip is when the scene locks at the top of the screen
        t.len0 = lenAt(t, t.y0);
      }
      t.endEl = endEl || null;
      t.drawn = null;
    });
    aimThreads(true);
  }

  function aimThreads(snap) {
    var y = window.scrollY, line = window.innerHeight * READ_LINE;
    threads.forEach(function (t) {
      if (t.pin) {
        var p = Math.min(1, Math.max(0, (y - t.pin.start) / ((t.pin.end - t.pin.start) || 1)));
        t.target = y < t.pin.start ? lenAt(t, t.y0 + y - t.pin.start) : t.len0 + (t.L - t.len0) * p;
      } else {
        t.target = lenAt(t, line - (t.top - y));
      }
      if (snap) t.cur = t.target;
    });
    dirty = true;
  }

  function drawThreads() {
    if (!dirty) return;
    var moving = false, active = 0;
    threads.forEach(function (t, i) {
      var prev = threads[i - 1], next = threads[i + 1], aim = t.target;
      // one tip only: a segment waits for the one above to finish, and for the one below to rewind
      if (prev && prev.cur < prev.L - 1) aim = 0;
      else if (next && next.cur > 1) aim = t.L;
      var diff = aim - t.cur;
      if (Math.abs(diff) > 0.5) { t.cur += diff * 0.2; moving = true; } else { t.cur = aim; }
      if (t.cur !== t.drawn) {
        t.drawn = t.cur;
        t.line.style.strokeDashoffset = t.L - t.cur;
        t.line.style.visibility = t.cur > 0.5 ? 'visible' : 'hidden';
        var pt = t.line.getPointAtLength(t.cur);
        t.head.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
      }
      if (t.cur > 0.5) active = i;
    });
    threads.forEach(function (t, i) { t.head.style.display = i === active ? '' : 'none'; });

    // The story ends with the stud landing on the last button.
    var end = threads[threads.length - 1];
    if (end && end.endEl) {
      var docked = end.cur >= end.L - 1;
      if (docked !== end.docked) {
        end.docked = docked;
        if (docked) gsap.fromTo(end.endEl, { scale: 1 }, { scale: 1.12, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, clearProps: 'transform' });
      }
    }
    dirty = moving;
  }

  /* ---------- Scenes ---------- */
  function story(ctx) {
    var c = ctx.conditions;
    if (!c.motion) { root.classList.add('ready'); return; }

    var pins = c.tall, track = c.tall && c.wide, reactive = finePointer.matches;
    var listeners = new AbortController();
    var on = function (el, type, fn) { el.addEventListener(type, fn, { signal: listeners.signal }); };
    var tickers = [];
    var addTick = function (fn) { tickers.push(fn); gsap.ticker.add(fn); };

    root.classList.add('has-story');
    root.classList.toggle('has-pins', pins);
    root.classList.toggle('has-track', track);
    makeThreads();
    grids.forEach(function (g) { g.size(); });

    function edge(section) {
      var studs = $('.studs', section);
      if (studs) gsap.from(studs, { yPercent: 100, duration: 0.5, ease: 'back.out(3)', scrollTrigger: { trigger: section, start: 'top 98%', toggleActions: 'play none none reverse' } });
      var h = $('h2[data-split]', section);
      if (h) SplitText.create(h, { type: 'lines', mask: 'lines', linesClass: 'line', autoSplit: true, onSplit: function (self) {
        return gsap.from(self.lines, { yPercent: 110, duration: 0.9, stagger: 0.1, ease: 'power4.out', scrollTrigger: { trigger: h, start: 'top 90%', toggleActions: 'play none none reverse' } });
      } });
    }
    function gridScene(section, grid) {
      ScrollTrigger.create({ trigger: section, start: 'top bottom', end: 'bottom top', onToggle: function (self) { if (self.isActive) grid.start(); else grid.stop(); } });
    }

    /* Page chrome: progress bar; the header slides away on the way down and returns on the way up */
    gsap.to('.progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.2 } });
    var hidden = false;
    var showHeader = function (show) {
      if (hidden === !show) return;
      hidden = !show;
      gsap.to(header, { yPercent: show ? 0 : -100, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
    };
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: function (self) {
      showHeader(!(self.direction > 0 && self.scroll() > 400 && !nav.classList.contains('is-open')));
    } });
    on(header, 'focusin', function () { showHeader(true); });

    /* Hero: intro on load, shapes follow the pointer, everything drifts apart on scroll */
    var hero = $('.hero');
    SplitText.create('#hero-title', { type: 'lines', mask: 'lines', linesClass: 'line', autoSplit: true, onSplit: function (self) {
      return gsap.from(self.lines, { yPercent: 110, duration: 1, stagger: 0.12, ease: 'power4.out', delay: 0.15 });
    } });
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from('.hero .brick', { y: -260, autoAlpha: 0, duration: 0.7, stagger: 0.14, ease: 'back.out(1.4)' }, 0.2)
      .from('.hero [data-intro]', { y: 26, autoAlpha: 0, duration: 0.6, stagger: 0.12 }, 0.5)
      .from('.hero__float, .hero__dot', { scale: 0, autoAlpha: 0, duration: 0.5, stagger: 0.08, ease: 'back.out(2.2)' }, 0.8)
      .from('.hero__hint', { autoAlpha: 0, duration: 0.5 }, 1.2)
      .from(threads[0].stud, { scale: 0, transformOrigin: '50% 50%', duration: 0.5, ease: 'back.out(3)' }, 1.2);
    var pulse = gsap.to(threads[0].stud, { scale: 1.4, transformOrigin: '50% 50%', duration: 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.9 });

    gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: hero, start: 0, end: function () { return hero.offsetHeight; }, scrub: 0.6, invalidateOnRefresh: true } })
      .to('.hero__bricks', { yPercent: 12 }, 0)
      .to('.hero__float--a', { yPercent: -120, rotation: 50 }, 0)
      .to('.hero__float--b', { yPercent: -200, rotation: -40 }, 0)
      .to('.hero__dot', { yPercent: function (i) { return -260 - i * 200; } }, 0)
      .to('.hero__hint span', { autoAlpha: 0, duration: 0.12 }, 0);

    if (reactive) {
      var layers = $$('.hero [data-depth]').map(function (el) {
        return { d: parseFloat(el.getAttribute('data-depth')), x: gsap.quickTo(el, 'x', { duration: 0.7, ease: 'power3' }), y: gsap.quickTo(el, 'y', { duration: 0.7, ease: 'power3' }) };
      });
      on(hero, 'pointermove', function (e) {
        var nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
        layers.forEach(function (l) { l.x(-nx * 34 * l.d); l.y(-ny * 26 * l.d); });
      });
      on(hero, 'pointerleave', function () { layers.forEach(function (l) { l.x(0); l.y(0); }); });

      // Magnetic buttons lean toward the pointer
      $$('.magnetic').forEach(function (el) {
        var mx = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3' }), my = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3' });
        on(el, 'pointermove', function (e) {
          var b = el.getBoundingClientRect();
          mx((e.clientX - (b.left + b.width / 2)) * 0.28);
          my((e.clientY - (b.top + b.height / 2)) * 0.4);
        });
        on(el, 'pointerleave', function () { mx(0); my(0); });
      });
    }
    gridScene(hero, grids[0]);

    /* Band: runs on its own, and scroll speed and direction push it */
    var row = $('.band__row'), setRow = gsap.quickSetter(row, 'x', 'px');
    var bandX = 0, bandDir = 1, bandVel = 0;
    var period = function () { var cs = getComputedStyle(row); return (row.scrollWidth - parseFloat(cs.paddingLeft) + parseFloat(cs.columnGap)) / 3; };
    var bandTick = function (t, dt) {
      bandVel *= 0.92;
      bandX -= bandDir * (70 + Math.min(1600, Math.abs(bandVel)) * 0.35) * dt / 1000;
      setRow(gsap.utils.wrap(-period(), 0, bandX));
    };
    var bandLive = false;
    ScrollTrigger.create({ trigger: '.band', start: 'top bottom', end: 'bottom top',
      onToggle: function (self) {
        if (self.isActive === bandLive) return;
        bandLive = self.isActive;
        if (bandLive) gsap.ticker.add(bandTick); else gsap.ticker.remove(bandTick);
      },
      onUpdate: function (self) { bandVel = self.getVelocity(); if (Math.abs(bandVel) > 5) bandDir = bandVel > 0 ? 1 : -1; }
    });
    tickers.push(bandTick);

    /* What we do: four chapters; the orange stud changes form and its satellites swap */
    var whatStage = $('.what__stage'), chaps = $$('.chap'), sats = $$('.sat'), fig = $('.what__figure'), proto = $('.proto');
    var protoN = $('.proto__n'), whatCount = $('.what .count b'), whatIdx = 0;
    gsap.from(fig, { scale: 0.7, autoAlpha: 0, duration: 0.7, ease: 'back.out(1.6)', scrollTrigger: { trigger: fig, start: 'top 85%', toggleActions: 'play none none reverse' } });
    if (pins) {
      var forms = [{ w: 0.46, h: 0.46, r: 0.23, rot: 0 }, { w: 0.5, h: 0.5, r: 0.07, rot: 90 }, { w: 0.74, h: 0.34, r: 0.17, rot: 180 }, { w: 0.64, h: 0.46, r: 0.05, rot: 360 }];
      var form = function (i, extra) {
        var f = forms[i], v = {
          width: function () { return fig.offsetWidth * f.w; }, height: function () { return fig.offsetWidth * f.h; },
          borderRadius: function () { return fig.offsetWidth * f.r; }, rotation: f.rot
        };
        for (var key in extra) v[key] = extra[key];
        return v;
      };
      gsap.set(chaps.slice(1), { autoAlpha: 0 });
      sats.slice(1).forEach(function (s) { gsap.set(s.children, { scale: 0 }); });
      var whatTl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: {
        trigger: whatStage, pin: true, start: 'top top', end: '+=340%', scrub: 0.6, invalidateOnRefresh: true,
        onUpdate: function (self) {
          var i = Math.min(3, Math.floor(self.progress * 4));
          if (i !== whatIdx) { whatIdx = i; protoN.textContent = whatCount.textContent = '0' + (i + 1); }
        }
      } });
      $$('.what__bars b').forEach(function (b, i) { whatTl.to(b, { scaleX: 1, duration: 1 }, i); });
      for (var n = 1; n < 4; n++) {
        whatTl
          .to(chaps[n - 1], { autoAlpha: 0, y: -40, duration: 0.14, ease: 'power2.in' }, n - 0.2)
          .to(sats[n - 1].children, { scale: 0, rotation: -60, duration: 0.14, stagger: 0.01, ease: 'power2.in' }, n - 0.2)
          .fromTo(proto, form(n - 1), form(n, { duration: 0.34, ease: 'power2.inOut', immediateRender: n === 1 }), n - 0.17)
          .fromTo(chaps[n], { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.16, ease: 'power2.out', immediateRender: false }, n + 0.03)
          .fromTo(sats[n].children, { scale: 0, rotation: 60 }, { scale: 1, rotation: 0, duration: 0.18, stagger: 0.02, ease: 'back.out(2)', immediateRender: false }, n + 0.03);
      }
      whatStage._pin = whatTl.scrollTrigger;
    } else {
      chaps.forEach(function (ch) {
        gsap.from(ch.children, { y: 36, autoAlpha: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: ch, start: 'top 85%', toggleActions: 'play none none reverse' } });
      });
    }

    /* Brands: a horizontal track on roomy screens, a stack of cards elsewhere */
    var brandsStage = $('.brands__stage'), onBrandFocus = null;
    edge($('.brands'));
    if (track) {
      var rail = $('.track'), view = $('.brands__viewport'), brandCount = $('.brands .count b');
      var dist = function () { return Math.max(0, rail.scrollWidth - view.clientWidth); };
      var slide = gsap.to(rail, { x: function () { return -dist(); }, ease: 'none', scrollTrigger: {
        trigger: brandsStage, pin: true, start: 'top top', end: function () { return '+=' + Math.max(dist(), window.innerHeight * 0.9); },
        scrub: 0.5, invalidateOnRefresh: true,
        onUpdate: function (self) { brandCount.textContent = '0' + Math.min(6, 1 + Math.round(self.progress * 5)); }
      } });
      brandsStage._pin = slide.scrollTrigger;
      $$('.brand').forEach(function (card) {
        gsap.from($('.brand__art', card).firstElementChild, { scale: 0.2, rotation: -50, duration: 0.6, ease: 'back.out(2)',
          scrollTrigger: { containerAnimation: slide, trigger: card, start: 'left 92%', toggleActions: 'play none none reverse' } });
      });
      // Keyboard users: bring the focused card into view by moving the page scroll.
      onBrandFocus = function (e) {
        var li = e.target.closest('li'), d = dist();
        if (!li || !d || !e.target.matches(':focus-visible')) return;
        var st = slide.scrollTrigger;
        var want = Math.min(d, Math.max(0, li.offsetLeft - parseFloat(getComputedStyle(rail).paddingLeft)));
        window.scrollTo(0, st.start + (st.end - st.start) * (want / d));
      };
      on(rail, 'focusin', onBrandFocus);
    } else {
      $$('.track > li').forEach(function (li, i) {
        gsap.from(li, { x: i % 2 ? 60 : -60, autoAlpha: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: li, start: 'top 88%', toggleActions: 'play none none reverse' } });
      });
    }
    if (reactive) {
      $$('.brand').forEach(function (card) {
        var art = $('.brand__art', card);
        var ax = gsap.quickTo(art, 'x', { duration: 0.5, ease: 'power3' }), ay = gsap.quickTo(art, 'y', { duration: 0.5, ease: 'power3' });
        on(card, 'pointermove', function (e) {
          var b = card.getBoundingClientRect();
          ax(((e.clientX - b.left) / b.width - 0.5) * 26);
          ay(((e.clientY - b.top) / b.height - 0.5) * 20);
        });
        on(card, 'pointerleave', function () { ax(0); ay(0); });
      });
    }

    /* Team: the quote fills in as it is read */
    var team = $('.team');
    edge(team);
    var words = SplitText.create('.team__quote p', { type: 'words', wordsClass: 'w' }).words;
    gsap.fromTo(words, { color: '#5E626C' }, {
      color: function (i, el) { return el.closest('[data-hl]') ? '#C73200' : '#15171C'; },
      duration: 0.3, stagger: 0.1, ease: 'none',
      scrollTrigger: { trigger: '.team__quote', start: 'top 80%', end: 'bottom 50%', scrub: true }
    });
    gsap.from('.team__bio', { x: -30, autoAlpha: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: '.team__bio', start: 'top 90%', toggleActions: 'play none none reverse' } });
    gsap.from('.people li', { y: 40, autoAlpha: 0, duration: 0.6, stagger: 0.05, ease: 'power3.out', scrollTrigger: { trigger: '.people', start: 'top 88%', toggleActions: 'play none none reverse' } });

    /* Contact: the thread ends on the Submit button */
    var contact = $('.contact');
    edge(contact);
    gsap.from('.contact .lede, .contact__facts > div', { y: 30, autoAlpha: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '.contact .lede', start: 'top 90%', toggleActions: 'play none none reverse' } });
    gsap.from('.form > label, .form__row', { y: 30, autoAlpha: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out', scrollTrigger: { trigger: '.form', start: 'top 85%', toggleActions: 'play none none reverse' } });
    gridScene(contact, grids[1]);

    edge($('.site-footer'));

    /* Thread upkeep */
    var atStart = true;
    addTick(function () {
      var y = window.scrollY;
      if (y !== lastScroll) {
        lastScroll = y;
        aimThreads(false);
        if ((y < 40) !== atStart) { atStart = y < 40; if (atStart) pulse.play(); else pulse.pause(0); }
      }
      drawThreads();
    });
    ScrollTrigger.addEventListener('refresh', buildThreads);
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
    root.classList.add('ready');

    return function () {
      ScrollTrigger.removeEventListener('refresh', buildThreads);
      tickers.forEach(function (fn) { gsap.ticker.remove(fn); });
      listeners.abort();
      grids.forEach(function (g) { g.stop(); });
      threads.forEach(function (t) { t.svg.remove(); delete t.unit._pin; });
      threads = [];
      lastScroll = -1;
      protoN.textContent = whatCount.textContent = '01';
      root.classList.remove('has-story', 'has-pins', 'has-track');
    };
  }

  var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fonts.then(function () {
    gsap.matchMedia().add({
      motion: '(prefers-reduced-motion: no-preference)',
      tall: '(min-height: 660px)',
      wide: '(min-width: 760px)',
      desk: '(min-width: 900px)'
    }, story);
  });
})();
