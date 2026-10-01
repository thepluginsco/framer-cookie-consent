(function () {
  var doc = document.documentElement
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  doc.classList.add('js')

  // Headline: stagger words in (the ticker stays one unit).
  var h1 = document.querySelector('.h1')
  if (h1 && !reduce) {
    var i = 0
    Array.prototype.slice.call(h1.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = document.createDocumentFragment()
        n.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return }
          var s = document.createElement('span')
          s.className = 'w'; s.textContent = part; s.style.animationDelay = (i++ * 0.06) + 's'
          frag.appendChild(s)
        })
        h1.replaceChild(frag, n)
      } else if (n.nodeType === 1) {
        // The ticker keeps its block layout; fade it in as one unit.
        n.animate([{ opacity: 0 }, { opacity: 1 }],
          { duration: 900, delay: i++ * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' })
      }
    })
  }

  // Scroll reveals: section heads, cards, tiles, plans, steps.
  var groups = ['.sec-head', '.ucard', '.tile', '.plan', '.step', '.hl', '.faq-i', '.panel', '.est', '.ltd', '.cta', '.editor', '.hub']
  var els = []
  groups.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el, idx) {
      el.classList.add('rv', 'd-' + Math.min(idx % 4 + 1, 4)); els.push(el)
    })
  })
  var meter = document.querySelector('.meter i')
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return
        e.target.classList.add('in'); io.unobserve(e.target)
        if (meter && e.target.classList.contains('ltd')) meter.style.width = '38%'
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    els.forEach(function (el) { io.observe(el) })
  } else {
    els.forEach(function (el) { el.classList.add('in') })
    if (meter) meter.style.width = '38%'
  }

  // Sticky nav shadow.
  var nav = document.querySelector('.nav')
  var onScroll = function () { nav.classList.toggle('stuck', window.scrollY > 8) }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll()

  // Hero scene: gentle pointer parallax on desktop.
  var scene = document.querySelector('.hero .scene')
  if (scene && !reduce && window.matchMedia('(pointer: fine)').matches) {
    document.querySelector('.hero').addEventListener('mousemove', function (e) {
      var r = scene.getBoundingClientRect()
      var x = (e.clientX - (r.left + r.width / 2)) / r.width
      var y = (e.clientY - (r.top + r.height / 2)) / r.height
      scene.style.transform = 'perspective(1400px) rotateY(' + (x * 5).toFixed(2) + 'deg) rotateX(' + (-y * 5).toFixed(2) + 'deg)'
    })
    document.querySelector('.hero').addEventListener('mouseleave', function () { scene.style.transform = '' })
  }

  // Pricing: monthly / yearly.
  var pricing = document.querySelector('.pricing')
  var bm = pricing.querySelector('.bm'), by = pricing.querySelector('.by')
  function setBill(yearly) {
    pricing.classList.toggle('bill-y', yearly); pricing.classList.toggle('bill-m', !yearly)
    bm.setAttribute('aria-pressed', String(!yearly)); by.setAttribute('aria-pressed', String(yearly))
  }
  bm.addEventListener('click', function () { setBill(false) })
  by.addEventListener('click', function () { setBill(true) })
  setBill(false)

  // FAQ accordion (one open at a time).
  var items = document.querySelectorAll('.faq-i')
  items.forEach(function (item) {
    var q = item.querySelector('.faq-q')
    q.setAttribute('aria-expanded', String(item.classList.contains('open')))
    q.addEventListener('click', function () {
      var wasOpen = item.classList.contains('open')
      items.forEach(function (o) { o.classList.remove('open'); o.querySelector('.faq-q').setAttribute('aria-expanded', 'false') })
      if (!wasOpen) { item.classList.add('open'); q.setAttribute('aria-expanded', 'true') }
    })
  })
})()
