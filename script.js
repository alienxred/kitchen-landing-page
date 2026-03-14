(() => {
  "use strict";

  // ============================================================
  // LENIS SMOOTH SCROLL
  // ============================================================
  let lenis = null;

  function initLenis() {
    if (typeof Lenis === "undefined") return;

    lenis = new Lenis({
      duration: 0.95,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 2,
    });

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    // Wire nav links to use Lenis
    document.querySelectorAll('.nav-links a, .footer-links a').forEach(a => {
      const href = a.getAttribute("href");
      if (href && href.startsWith("#")) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const target = document.querySelector(href);
          if (target) lenis.scrollTo(target, { duration: 1.2 });
        });
      }
    });
  }

  // ============================================================
  // LOADER — Two-Part: Letter Animation + Page Reveal
  // ============================================================
  const loader = document.getElementById("loader");
  const loaderProgress = document.getElementById("loader-progress");
  const loaderBrand = document.getElementById("loader-brand");
  const pageWrapper = document.getElementById("page-wrapper");
  let loaderExited = false;

  function initLoader() {
    if (!loader) return;

    // Skip on return visits
    if (sessionStorage.getItem("forma-visited")) {
      loader.remove();
      if (pageWrapper) pageWrapper.classList.add("no-anim", "revealed");
      loaderExited = true;
      initScrollAnimations();
      return;
    }

    // Part A: Letters stagger in on dark bg
    setTimeout(() => {
      if (loaderBrand) loaderBrand.classList.add("visible");
    }, 150);

    // Track asset loading
    const assets = [
      { type: "image", src: "assets/hero.webp" },
    ];
    const heroVid = document.getElementById("hero-bg-video");
    if (heroVid) {
      assets.push({ type: "video", el: heroVid });
    }

    let loaded = 0;
    const total = assets.length;
    const startTime = Date.now();

    function onAssetLoaded() {
      loaded++;
      const pct = Math.round((loaded / total) * 100);
      if (loaderProgress) loaderProgress.style.width = (pct * 0.8) + "px"; // max ~80px
      if (loaded >= total) checkReady();
    }

    function checkReady() {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1400 - elapsed);
      setTimeout(exitLoader, remaining);
    }

    assets.forEach(asset => {
      if (asset.type === "image") {
        const img = new Image();
        img.onload = onAssetLoaded;
        img.onerror = onAssetLoaded;
        img.src = asset.src;
      } else if (asset.type === "video" && asset.el) {
        if (asset.el.readyState >= 3) {
          onAssetLoaded();
        } else {
          asset.el.addEventListener("canplaythrough", onAssetLoaded, { once: true });
        }
      }
    });

    // Timeout fallback
    setTimeout(() => {
      if (!loaderExited) exitLoader();
    }, 5000);
  }

  function exitLoader() {
    if (loaderExited || !loader) return;
    loaderExited = true;
    sessionStorage.setItem("forma-visited", "1");

    // Part B: Fade out loader, reveal page with border-radius animation
    loader.classList.add("fade-out");

    // Simultaneously start the page-wrapper border-radius transition
    if (pageWrapper) {
      // Force a reflow so the initial border-radius is painted
      pageWrapper.offsetHeight;
      pageWrapper.classList.add("revealed");
    }

    // Remove loader after transition
    setTimeout(() => {
      loader.remove();
    }, 800);
  }

  // ============================================================
  // VIDEO SCROLL ENGINE
  // (Preserved from scroll-video-hero reference project)
  // ============================================================
  const video = document.getElementById("hero-video");
  const videoSection = document.querySelector(".section-video");
  const moments = document.querySelectorAll(".video-moment");
  const timelineDashes = document.querySelectorAll(".timeline-dash");
  const timelineProgress = document.getElementById("timeline-progress");

  const FADE = 0.04;
  const DRIFT_IN = 24;
  const DRIFT_OUT = -14;

  let FRAME_DUR = 1 / 30;
  let targetTime = 0;
  let currentTime = 0;
  let lastTimestamp = 0;
  let lastSetTime = -1;
  let videoReady = false;
  let videoST = null;

  // Preload video as blob for instant seeking
  function preloadVideo() {
    fetch(video.src)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        video.src = url;
        video.addEventListener("loadedmetadata", () => {
          onVideoScroll();
          currentTime = targetTime;
          video.currentTime = currentTime;
          lastSetTime = currentTime;
        }, { once: true });
      })
      .catch(err => console.warn('Blob preload failed, falling back to streaming:', err));
  }

  function initVideo() {
    if (!video || !videoSection) {
      initScrollAnimations();
      return;
    }

    video.addEventListener("loadedmetadata", onVideoReady);
    if (video.readyState >= 1 && isFinite(video.duration)) {
      onVideoReady();
    }

    setTimeout(() => {
      if (!videoReady) {
        initScrollAnimations();
      }
    }, 4000);
  }

  function onVideoReady() {
    if (videoReady) return;
    if (!isFinite(video.duration)) return;

    FRAME_DUR = 1 / 30;
    videoReady = true;

    initScrollAnimations();
    initVideoScrollTrigger();

    if (document.readyState === "complete") {
      preloadVideo();
    } else {
      window.addEventListener("load", preloadVideo, { once: true });
    }
  }

  // ============================================================
  // VIDEO: GSAP ScrollTrigger PIN-ONLY + NATIVE SCROLL SEEKING
  // ============================================================
  function initVideoScrollTrigger() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
    if (!videoSection) return;

    gsap.registerPlugin(ScrollTrigger);

    videoST = ScrollTrigger.create({
      trigger: videoSection,
      start: "top top",
      end: "+=400%",
      pin: true
    });

    window.addEventListener("scroll", onVideoScroll, { passive: true });
    onVideoScroll();

    lastTimestamp = performance.now();
    requestAnimationFrame(videoTick);
  }

  // ============================================================
  // VIDEO: NATIVE SCROLL -> TARGET TIME
  // ============================================================
  function onVideoScroll() {
    if (!videoST || !videoReady || !isFinite(video.duration)) return;
    const scrollY = window.scrollY;
    const progress = Math.max(0, Math.min(1,
      (scrollY - videoST.start) / (videoST.end - videoST.start)
    ));
    targetTime = progress * (video.duration - 0.1);
    updateMoments(progress);
    updateTimeline(progress);
  }

  // ============================================================
  // VIDEO: VARIABLE-SPEED EXPONENTIAL SMOOTHING (rAF loop)
  // ============================================================
  function videoTick(now) {
    if (!videoReady || !isFinite(video.duration)) {
      lastTimestamp = now;
      requestAnimationFrame(videoTick);
      return;
    }

    const dt = Math.min((now - lastTimestamp) / 1000, 0.05);
    lastTimestamp = now;

    if (!isFinite(currentTime)) {
      currentTime = isFinite(targetTime) ? targetTime : 0;
    }

    const diff = targetTime - currentTime;

    if (Math.abs(diff) > FRAME_DUR * 2) {
      const speed = 8 + 4 * Math.min(1, Math.abs(diff) / 0.5);
      const factor = 1 - Math.exp(-speed * dt);
      currentTime += diff * factor;
    } else {
      currentTime = targetTime;
    }

    const quantized = Math.round(currentTime / FRAME_DUR) * FRAME_DUR;
    const clamped = Math.max(0, Math.min(quantized, video.duration - 0.01));

    if (clamped !== lastSetTime && isFinite(clamped)) {
      lastSetTime = clamped;
      video.currentTime = clamped;
    }

    requestAnimationFrame(videoTick);
  }

  // ============================================================
  // VIDEO MOMENTS: FADE + DRIFT
  // ============================================================
  function updateMoments(progress) {
    moments.forEach(el => {
      const start = parseFloat(el.dataset.start);
      const end = parseFloat(el.dataset.end);
      let opacity = 0;
      let drift = 0;

      if (progress >= start && progress <= end) {
        if (progress < start + FADE) {
          opacity = (progress - start) / FADE;
          drift = (1 - opacity) * DRIFT_IN;
        } else if (progress > end - FADE) {
          opacity = (end - progress) / FADE;
          drift = (1 - opacity) * DRIFT_OUT;
        } else {
          opacity = 1;
          drift = 0;
        }
      }

      el.style.opacity = Math.max(0, Math.min(1, opacity));
      el.style.transform = `translateY(${drift}px)`;
    });
  }

  // ============================================================
  // TIMELINE UI
  // ============================================================
  function updateTimeline(progress) {
    if (timelineProgress) {
      timelineProgress.style.height = (progress * 100) + "%";
    }

    const stepRanges = Array.from(moments).map(m => [
      parseFloat(m.dataset.start),
      parseFloat(m.dataset.end)
    ]);

    timelineDashes.forEach((dash, i) => {
      if (!stepRanges[i]) return;
      const [start, end] = stepRanges[i];
      if (progress >= start && progress <= end) {
        dash.classList.add("active");
      } else {
        dash.classList.remove("active");
      }
    });
  }

  // ============================================================
  // ANIMATED COUNTERS
  // ============================================================
  function initCounters() {
    const counters = document.querySelectorAll(".numero-value");
    if (!counters.length) return;

    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(c => counterObserver.observe(c));
  }

  function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    const suffix = el.dataset.suffix || "";
    const duration = 2000;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      el.textContent = current + suffix;

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = target + suffix;
      }
    }

    requestAnimationFrame(tick);
  }

  // ============================================================
  // SCROLL REVEAL ANIMATIONS (IntersectionObserver)
  // ============================================================
  function initScrollAnimations() {
    // Stagger groups — add class to elements that need it
    document.querySelectorAll(".manifesto-inner").forEach(el => {
      // Manifesto gets special word-reveal treatment
      el.classList.add("reveal-stagger");
    });

    // Word-line reveals for manifesto headline
    document.querySelectorAll(".manifesto-headline").forEach(el => {
      el.classList.add("word-reveal");
    });

    // Standard stagger reveals
    const staggerTargets = [
      ".enfoque-content",
      ".proyectos-header",
      ".contacto-inner",
      ".principio-inner",
      ".materiales-content",
    ];
    staggerTargets.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!el.classList.contains("reveal-stagger")) {
          el.classList.add("reveal-stagger");
        }
      });
    });

    // Clip reveals for editorial images
    document.querySelectorAll(".enfoque-image").forEach(el => el.classList.add("clip-reveal"));

    // Standard reveals for manifesto photos
    document.querySelectorAll(".manifesto-photo").forEach(el => {
      if (!el.classList.contains("reveal")) el.classList.add("reveal");
    });

    // Observe all
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px"
    });

    document.querySelectorAll(".reveal, .reveal-stagger, .clip-reveal, .word-reveal").forEach(el => {
      observer.observe(el);
    });

    // Init counters after scroll animations are set up
    initCounters();
  }

  // ============================================================
  // SCROLL HINT FADE
  // ============================================================
  function initScrollHint() {
    const hint = document.querySelector(".scroll-hint");
    if (!hint) return;

    window.addEventListener("scroll", () => {
      const scrollY = window.scrollY;
      const opacity = scrollY < 50 ? 1 : Math.max(0, 1 - (scrollY - 50) / 150);
      hint.style.opacity = opacity;
    }, { passive: true });
  }

  // ============================================================
  // GSAP: PARALLAX EFFECTS
  // ============================================================
  function initGSAP() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

    gsap.registerPlugin(ScrollTrigger);
    initLenis();
    initSectionIndicator();

    // Hero video parallax (scale on scroll)
    const heroVidBg = document.querySelector(".hero-video-bg");
    if (heroVidBg) {
      gsap.to(heroVidBg, {
        scale: 1.08,
        ease: "none",
        scrollTrigger: {
          trigger: ".section-hero",
          start: "top top",
          end: "bottom top",
          scrub: true
        }
      });
    }

    // Hero head fade out on scroll
    const heroHead = document.querySelector(".hero-head");
    if (heroHead) {
      gsap.to(heroHead, {
        opacity: 0,
        y: -30,
        ease: "none",
        scrollTrigger: {
          trigger: ".section-hero",
          start: "top top",
          end: "40% top",
          scrub: true
        }
      });
    }

    // ONTO-style hero → manifesto transition: clip-path window reveal
    const manifestoSection = document.querySelector(".section-manifesto");
    const heroSection = document.querySelector(".section-hero");
    if (manifestoSection && heroSection) {
      const isMobileTrans = window.matchMedia("(max-width: 640px)").matches;

      if (!isMobileTrans) {
        // Manifesto reveals through expanding clip-path window
        gsap.fromTo(manifestoSection,
          { clipPath: "inset(12% 12% 12% 12% round 12px)" },
          {
            clipPath: "inset(0% 0% 0% 0% round 0px)",
            ease: "none",
            scrollTrigger: {
              trigger: manifestoSection,
              start: "top 80%",
              end: "top 10%",
              scrub: true,
            },
          }
        );
      }
    }

    // Materiales image parallax
    const materialesImg = document.querySelector(".materiales-image");
    if (materialesImg) {
      gsap.to(materialesImg, {
        yPercent: -8,
        ease: "none",
        scrollTrigger: {
          trigger: ".section-materiales",
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      });
    }

    // Detail break image parallax
    const detailBreakImg = document.querySelector(".detail-break-image");
    if (detailBreakImg) {
      gsap.fromTo(detailBreakImg,
        { yPercent: -5 },
        {
          yPercent: 5,
          ease: "none",
          scrollTrigger: {
            trigger: ".section-detail-break",
            start: "top bottom",
            end: "bottom top",
            scrub: true
          }
        }
      );
    }

    // Contacto background parallax
    const contactoBgImg = document.querySelector(".contacto-bg-image");
    if (contactoBgImg) {
      gsap.to(contactoBgImg, {
        yPercent: -6,
        ease: "none",
        scrollTrigger: {
          trigger: ".section-contacto",
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      });
    }

    // Manifesto floating photos — staggered reveal on scroll
    gsap.utils.toArray(".manifesto-photo").forEach((photo, i) => {
      gsap.fromTo(photo,
        { opacity: 0, y: 40 + i * 20 },
        {
          opacity: 1, y: 0,
          duration: 1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".section-manifesto",
            start: `${15 + i * 20}% bottom`,
            toggleActions: "play none none reverse"
          }
        }
      );
    });

    // Gallery items — enhanced parallax depth layers + depth-of-field
    const depthClassMap = {
      "0.8": "depth-far",
      "0.9": "depth-mid-far",
      "1":   "depth-mid",
      "1.0": "depth-mid",
      "1.1": "depth-near",
      "1.2": "depth-closest",
    };
    const isMobileGallery = window.matchMedia("(max-width: 640px)").matches;

    gsap.utils.toArray(".gallery-item").forEach((item) => {
      const speed = parseFloat(item.dataset.speed) || 1.0;

      // Assign depth class for CSS blur/scale/opacity
      const depthClass = depthClassMap[item.dataset.speed] || "depth-mid";
      item.classList.add(depthClass);

      // Parallax depth movement — amplified, disabled on mobile
      if (!isMobileGallery) {
        const multiplier = 250;
        const yOff = (speed - 1.0) * multiplier;

        gsap.fromTo(item,
          { y: yOff },
          {
            y: -yOff,
            ease: "none",
            scrollTrigger: {
              trigger: item,
              start: "top bottom",
              end: "bottom top",
              scrub: 1.5,
            }
          }
        );
      }

      // Fade-in reveal with scale
      gsap.from(item, {
        opacity: 0,
        y: 30,
        scale: 0.97,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: item,
          start: "top 92%",
          toggleActions: "play none none reverse",
        }
      });
    });

    // Projects heading parallax reveal
    const proyectosHeading = document.querySelector(".proyectos-header .heading-display");
    if (proyectosHeading) {
      gsap.from(proyectosHeading, {
        y: 60,
        opacity: 0,
        duration: 1.2,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".proyectos-header",
          start: "top 80%",
          toggleActions: "play none none reverse",
        }
      });
    }

    // Principio quote lines — staggered reveal
    gsap.utils.toArray(".quote-line").forEach((line, i) => {
      gsap.from(line, {
        y: 40,
        opacity: 0,
        duration: 1,
        delay: i * 0.12,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".section-principio",
          start: "top 70%",
          toggleActions: "play none none reverse"
        }
      });
    });

    // Projects section — clip-path window reveal
    const proyectosSection = document.querySelector(".section-proyectos");
    if (proyectosSection) {
      const isMobile = window.matchMedia("(max-width: 640px)").matches;

      if (!isMobile) {
        gsap.fromTo(proyectosSection,
          { clipPath: "inset(8% 12% 8% 12% round 12px)" },
          {
            clipPath: "inset(0% 0% 0% 0% round 0px)",
            ease: "none",
            scrollTrigger: {
              trigger: proyectosSection,
              start: "top 80%",
              end: "top 20%",
              scrub: 1,
            },
          }
        );

        // Dim the section above (detail-break)
        const detailBreak = document.querySelector(".section-detail-break");
        if (detailBreak) {
          gsap.to(detailBreak, {
            opacity: 0.4,
            scale: 0.97,
            ease: "none",
            scrollTrigger: {
              trigger: proyectosSection,
              start: "top 85%",
              end: "top 40%",
              scrub: 1,
            },
          });
        }
      } else {
        // Mobile: simple opacity fade
        gsap.from(proyectosSection, {
          opacity: 0,
          y: 30,
          ease: "none",
          scrollTrigger: {
            trigger: proyectosSection,
            start: "top 90%",
            end: "top 55%",
            scrub: 1,
          },
        });
      }
    }

    // Numero values — scale up
    gsap.utils.toArray(".numero-value").forEach((val, i) => {
      gsap.from(val, {
        scale: 0.5,
        opacity: 0,
        duration: 0.8,
        delay: i * 0.15,
        ease: "back.out(1.4)",
        scrollTrigger: {
          trigger: ".section-numeros",
          start: "top 75%",
          toggleActions: "play none none reverse"
        }
      });
    });
  }

  // ============================================================
  // PROJECT DETAIL OVERLAY — Click-to-expand
  // ============================================================
  const projectData = [
    {
      name: "Residencia San \u00c1ngel",
      category: "Residencial",
      year: "2025",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n \u2022 Instalaci\u00f3n",
      image: "assets/kitchen-wide-2.webp",
      description: "Una cocina que dialoga con la arquitectura brutalista de esta residencia en San \u00c1ngel. Superficies de cuarzo Calacatta, isla central de 3.2 metros y un sistema de iluminaci\u00f3n integrado que transforma el espacio seg\u00fan la hora del d\u00eda. Cada detalle fue pensado para complementar los techos dobles y los ventanales que enmarcan el jard\u00edn.",
      gallery: ["assets/detail-marble.jpg", "assets/kitchen-pendant.jpg", "assets/lifestyle-2.jpg", "assets/kitchen-wide-2.webp"]
    },
    {
      name: "Loft Condesa",
      category: "Loft",
      year: "2024",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n",
      image: "assets/gallery-1.webp",
      description: "Cocina abierta para un loft de doble altura en la Condesa. El reto: integrar cocina, comedor y sala en un solo gesto arquitect\u00f3nico. Resolvimos con una barra perimetral en roble ahumado y una isla flotante que funciona como punto de reuni\u00f3n. Herrajes Blum de cierre suave en cada caj\u00f3n.",
      gallery: ["assets/kitchen-dark.jpg", "assets/lifestyle-1.jpg", "assets/kitchen-wide-1.webp", "assets/gallery-2.webp"]
    },
    {
      name: "Casa Pedregal",
      category: "Residencial",
      year: "2024",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n \u2022 Instalaci\u00f3n",
      image: "assets/gallery-2.webp",
      description: "Minimalismo c\u00e1lido para una familia que vive su cocina. Frentes en laca mate grafito, encimera de Dekton ultracompacto y un sistema de almacenamiento oculto que mantiene todo a la vista limpio y organizado. La isla integra zona de cocci\u00f3n, fregadero y barra de desayuno.",
      gallery: ["assets/kitchen-portrait-1.webp", "assets/kitchen-portrait-2.webp", "assets/detail-marble.jpg", "assets/kitchen-wide-2.webp"]
    },
    {
      name: "Departamento Polanco",
      category: "Departamento",
      year: "2025",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n",
      image: "assets/gallery-3.webp",
      description: "Elegancia contenida en 18 metros cuadrados. Para este departamento en Polanco, dise\u00f1amos una cocina en L que maximiza cada cent\u00edmetro. Acabados en madera de nogal con detalles en lat\u00f3n cepillado. El muro de fondo en porcel\u00e1nico simula m\u00e1rmol Statuario sin las complicaciones del mantenimiento.",
      gallery: ["assets/lifestyle-2.jpg", "assets/kitchen-pendant.jpg", "assets/gallery-1.webp", "assets/kitchen-dark.jpg"]
    },
    {
      name: "Residencia Bosques",
      category: "Residencial",
      year: "2023",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n \u2022 Instalaci\u00f3n",
      image: "assets/kitchen-square.webp",
      description: "Una cocina de autor para una familia que ama cocinar junta. Dos islas paralelas crean un flujo de trabajo profesional en un entorno dom\u00e9stico. Superficies de granito negro Zimbabwe, frentes de roble natural y campana integrada en el techo. El resultado: un espacio que inspira.",
      gallery: ["assets/kitchen-wide-2.webp", "assets/lifestyle-1.jpg", "assets/kitchen-wide-1.webp", "assets/kitchen-portrait-1.webp"]
    },
    {
      name: "Interiores Integrales",
      category: "Comercial",
      year: "2024",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n \u2022 Instalaci\u00f3n",
      image: "assets/interiors-media.jpg",
      description: "Proyecto integral para un showroom gastron\u00f3mico en Santa Fe. Tres cocinas de demostraci\u00f3n con especificaciones comerciales: acero inoxidable grado alimenticio, ventilaci\u00f3n industrial y acabados premium que combinan funcionalidad profesional con est\u00e9tica residencial.",
      gallery: ["assets/kitchen-wide-2.webp", "assets/detail-marble.jpg", "assets/gallery-3.webp", "assets/kitchen-portrait-2.webp"]
    },
    {
      name: "Penthouse Reforma",
      category: "Penthouse",
      year: "2025",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n \u2022 Instalaci\u00f3n",
      image: "assets/kitchen-dark.jpg",
      description: "Cocina oscura de alto contraste para un penthouse en Paseo de la Reforma. Frentes en laca negra mate con tirador integrado, isla en piedra natural y un sistema de iluminaci\u00f3n perimetral que define cada volumen. El dise\u00f1o responde a la vista panor\u00e1mica del espacio.",
      gallery: ["assets/detail-marble.jpg", "assets/kitchen-pendant.jpg", "assets/gallery-1.webp", "assets/lifestyle-2.jpg"]
    },
    {
      name: "Villa Coyoac\u00e1n",
      category: "Residencial",
      year: "2024",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n",
      image: "assets/kitchen-pendant.jpg",
      description: "Una cocina que rinde homenaje al contexto hist\u00f3rico de Coyoac\u00e1n. Madera de parota recuperada, encimeras de concreto pulido y detalles artesanales en cer\u00e1mica. La luminaria central de lat\u00f3n fue dise\u00f1ada a medida para este proyecto.",
      gallery: ["assets/lifestyle-1.jpg", "assets/kitchen-wide-1.webp", "assets/kitchen-wide-2.webp", "assets/gallery-2.webp"]
    },
    {
      name: "Estudio Narvarte",
      category: "Estudio",
      year: "2024",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n \u2022 Instalaci\u00f3n",
      image: "assets/kitchen-portrait-1.webp",
      description: "M\u00e1xima funcionalidad en 9 metros cuadrados. Dise\u00f1amos una cocina en U con almacenamiento vertical hasta el techo, frentes en melamina texturizada roble y tiradores ocultos. Cada cent\u00edmetro optimizado sin sacrificar est\u00e9tica.",
      gallery: ["assets/gallery-3.webp", "assets/kitchen-square.webp", "assets/kitchen-dark.jpg", "assets/kitchen-portrait-2.webp"]
    },
    {
      name: "Casa de Campo",
      category: "Residencial",
      year: "2023",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n \u2022 Instalaci\u00f3n",
      image: "assets/outdoor-kitchen.jpg",
      description: "Cocina exterior e interior integradas para una casa de campo en Valle de Bravo. La cocina exterior usa acero corten y piedra volc\u00e1nica, mientras que la interior complementa con madera de tzalam y cuarzo blanco. Ambas conectadas por una barra pasaplatos.",
      gallery: ["assets/lifestyle-1.jpg", "assets/kitchen-wide-2.webp", "assets/detail-marble.jpg", "assets/interiors-media.jpg"]
    },
    {
      name: "Suite Santa Fe",
      category: "Departamento",
      year: "2025",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n",
      image: "assets/kitchen-portrait-2.webp",
      description: "Cocina compacta de lujo para un departamento en Santa Fe. Superficies en Silestone blanco, frentes en alto brillo gris perla y una isla multifunci\u00f3n con almacenamiento oculto. Iluminaci\u00f3n LED integrada en cada m\u00f3dulo superior.",
      gallery: ["assets/gallery-1.webp", "assets/kitchen-pendant.jpg", "assets/kitchen-wide-1.webp", "assets/gallery-3.webp"]
    },
    {
      name: "Terraza Lomas",
      category: "Terraza",
      year: "2024",
      scope: "Dise\u00f1o \u2022 Fabricaci\u00f3n \u2022 Instalaci\u00f3n",
      image: "assets/kitchen-wide-1.webp",
      description: "Proyecto integral de cocina y terraza para una residencia en Lomas de Chapultepec. La cocina principal conecta visualmente con la terraza a trav\u00e9s de un ventanal plegable. Materiales resistentes a la intemperie en la zona exterior, acabados premium en el interior.",
      gallery: ["assets/outdoor-kitchen.jpg", "assets/kitchen-wide-2.webp", "assets/lifestyle-2.jpg", "assets/kitchen-square.webp"]
    }
  ];

  function initProjectOverlay() {
    const overlay = document.getElementById("project-detail");
    const overlayInner = document.getElementById("project-detail-inner");
    const closeBtn = document.getElementById("project-close");
    if (!overlay || !overlayInner) return;

    // State for reverse close animation
    let lastOpenedCard = null;
    let lastOpenedData = null;
    let lastTargetTitleH = null;

    // Click handlers on gallery items
    document.querySelectorAll(".gallery-item[data-project]").forEach(item => {
      item.addEventListener("click", () => {
        const idx = parseInt(item.dataset.project, 10);
        const data = projectData[idx];
        if (!data) return;
        openProject(item, data);
      });
    });

    function openProject(card, data) {
      // Store state for reverse close animation
      lastOpenedCard = card;
      lastOpenedData = data;

      const cardImg = card.querySelector("img");
      const rect = (cardImg || card).getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (lenis) lenis.stop();
      document.body.style.overflow = "hidden";

      const targetTitleH = Math.round(vh * 0.52);
      const targetImgH = vh - targetTitleH;
      lastTargetTitleH = targetTitleH;

      // === 1. ONTO-STYLE: Create expanding container (title area + image) ===
      // This single div expands from the card rect → full viewport
      // with the white title area growing INSIDE it during expansion
      const expandBox = document.createElement("div");
      expandBox.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        z-index: 200;
        pointer-events: none;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      `;

      // White title area inside the box — starts at 0 height
      const boxTitle = document.createElement("div");
      boxTitle.style.cssText = `
        width: 100%; height: 0; flex-shrink: 0;
        background: #F2EDE8; overflow: hidden;
        display: flex; flex-direction: column; justify-content: flex-end;
        padding: 0 clamp(1.5rem, 5vw, 6rem);
      `;
      const boxTitleH2 = document.createElement("h2");
      boxTitleH2.textContent = data.name;
      boxTitleH2.style.cssText = `
        font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
        font-size: clamp(3rem, 7vw, 6.5rem);
        font-weight: 300; color: #1a1917; line-height: 1.0;
        letter-spacing: -0.03em;
        padding-bottom: 1.5rem;
        white-space: nowrap;
      `;
      boxTitle.appendChild(boxTitleH2);

      // Image inside the box — fills remaining space
      const boxImg = document.createElement("img");
      boxImg.src = data.image;
      boxImg.alt = data.name;
      boxImg.style.cssText = `
        width: 100%; flex: 1; min-height: 0;
        object-fit: cover; display: block;
      `;

      expandBox.appendChild(boxTitle);
      expandBox.appendChild(boxImg);
      document.body.appendChild(expandBox);

      // Hide original card
      card.style.visibility = "hidden";

      // === 2. Dark scrim ===
      const scrim = document.createElement("div");
      scrim.className = "project-scrim";
      document.body.appendChild(scrim);

      // === EXTERIOR EFFECT: push siblings outward ===
      const allCards = document.querySelectorAll('.gallery-item[data-project]');
      const clickedCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      const siblings = Array.from(allCards).filter(c => c !== card);
      const push = 100;
      siblings.forEach(sib => {
        const sibRect = sib.getBoundingClientRect();
        const sibCenter = {
          x: sibRect.left + sibRect.width / 2,
          y: sibRect.top + sibRect.height / 2
        };
        let dx = sibCenter.x - clickedCenter.x;
        let dy = sibCenter.y - clickedCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        sib._pushDx = (dx / dist) * push;
        sib._pushDy = (dy / dist) * push;
      });
      const nav = document.querySelector('nav, header, .site-nav');

      // === 3. Populate the real overlay (hidden, will swap in at end) ===
      overlayInner.innerHTML = "";
      const heroArea = document.createElement("div");
      heroArea.className = "project-detail-hero-area";
      heroArea.innerHTML = `
        <div class="project-detail-title-area">
          <h2 class="project-detail-title">${data.name}</h2>
        </div>
        <img class="project-detail-hero" src="${data.image}" alt="${data.name}">
      `;

      const contentArea = document.createElement("div");
      contentArea.className = "project-detail-inner";
      contentArea.innerHTML = `
        <span class="project-detail-label">${data.category} &mdash; ${data.year}</span>
        <div class="project-detail-meta">
          <span class="project-detail-meta-item">${data.scope}</span>
        </div>
        <div class="project-detail-rule"></div>
        <p class="project-detail-desc">${data.description}</p>
        <div class="project-detail-gallery">
          ${data.gallery.map(src => `<img src="${src}" alt="${data.name}" loading="lazy">`).join("")}
        </div>
      `;

      overlay.querySelector(".project-detail-inner").remove();
      overlay.querySelector(".project-close").insertAdjacentElement("afterend", heroArea);
      overlay.appendChild(contentArea);

      const titleArea = heroArea.querySelector(".project-detail-title-area");
      const heroImg = heroArea.querySelector(".project-detail-hero");
      const titleH2 = heroArea.querySelector(".project-detail-title");
      const contentEls = contentArea.querySelectorAll(".project-detail-label, .project-detail-meta, .project-detail-rule, .project-detail-desc, .project-detail-gallery");

      // Set final overlay layout
      titleArea.style.height = targetTitleH + "px";
      titleArea.style.overflow = "hidden";
      heroImg.style.height = targetImgH + "px";

      gsap.set(overlay, { opacity: 0, clipPath: "none" });
      gsap.set(contentEls, { opacity: 0, y: 24 });
      gsap.set(titleH2, { y: "0%", opacity: 1 });

      overlay.classList.add("active");
      overlay.scrollTop = 0;

      // === 4. ONTO-STYLE SINGLE-BEAT: box expands + title grows — one gesture ===
      const dur = 1.8;
      const tl = gsap.timeline();

      // Scrim darkens background
      tl.to(scrim, { opacity: 1, duration: dur * 0.5, ease: "sine.out" }, 0)

      // Box expands from card → full viewport — buttery smooth
      .to(expandBox, {
        top: 0, left: 0, width: vw, height: vh,
        duration: dur, ease: "sine.inOut",
      }, 0)

      // Title area grows INSIDE the box — same easing, text revealed by overflow:hidden
      .to(boxTitle, {
        height: targetTitleH, duration: dur * 0.75, ease: "sine.inOut",
      }, dur * 0.15)

      // Siblings push outward + fade — unified with expansion
      siblings.forEach((sib, i) => {
        tl.to(sib, {
          x: sib._pushDx,
          y: sib._pushDy,
          opacity: 0,
          duration: dur * 0.6,
          ease: "sine.inOut",
        }, i * 0.02);
      });

      // Nav fades out
      if (nav) tl.to(nav, { opacity: 0, y: -30, duration: dur * 0.4, ease: "sine.in" }, 0);

      // At the end, swap: hide expandBox, show real overlay
      tl.call(() => {
        gsap.set(overlay, { opacity: 1 });
        expandBox.remove();
        scrim.remove();
        card.style.visibility = "";
        // Reset sibling styles (they're behind the overlay now)
        siblings.forEach(sib => gsap.set(sib, { x: 0, y: 0, opacity: 1, clearProps: "transform,opacity" }));
        if (nav) gsap.set(nav, { clearProps: "all" });
      }, null, dur + 0.05)

      // Content staggers in
      .to(contentEls, {
        opacity: 1, y: 0, duration: 0.5, ease: "power1.out", stagger: 0.05,
      }, dur + 0.05);
    }

    function closeProject() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Fallback: simple fade if we lost track of the source card
      if (!lastOpenedCard || !lastOpenedData) {
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.4,
          onComplete: () => cleanupOverlay(null, null),
        });
        return;
      }

      // === 1. Get card rect BEFORE any DOM changes ===
      const cardImg = lastOpenedCard.querySelector("img");
      const targetRect = (cardImg || lastOpenedCard).getBoundingClientRect();
      lastOpenedCard.style.visibility = "hidden";

      // === 2. Create shrink box (ONTO-style container: title + image) ===
      const titleArea = overlay.querySelector(".project-detail-title-area");
      const heroImg = overlay.querySelector(".project-detail-hero");
      const titleH2 = overlay.querySelector(".project-detail-title");
      const contentEls = overlay.querySelectorAll(
        ".project-detail-label, .project-detail-meta, .project-detail-rule, .project-detail-desc, .project-detail-gallery"
      );

      // Get current title area height
      const currentTitleH = titleArea ? parseFloat(getComputedStyle(titleArea).height) : lastTargetTitleH || Math.round(vh * 0.52);

      const shrinkBox = document.createElement("div");
      shrinkBox.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: ${vw}px; height: ${vh}px;
        z-index: 200; pointer-events: none;
        overflow: hidden; display: flex; flex-direction: column;
        opacity: 0;
      `;

      // White title area
      const boxTitle = document.createElement("div");
      boxTitle.style.cssText = `
        width: 100%; height: ${currentTitleH}px; flex-shrink: 0;
        background: #F2EDE8; overflow: hidden;
        display: flex; flex-direction: column; justify-content: flex-end;
        padding: 0 clamp(1.5rem, 5vw, 6rem);
      `;
      const boxTitleH2 = document.createElement("h2");
      boxTitleH2.textContent = lastOpenedData.name;
      boxTitleH2.style.cssText = `
        font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
        font-size: clamp(3rem, 7vw, 6.5rem);
        font-weight: 300; color: #1a1917; line-height: 1.0;
        letter-spacing: -0.03em;
        padding-bottom: 1.5rem;
        white-space: nowrap;
      `;
      boxTitle.appendChild(boxTitleH2);

      // Image
      const boxImg = document.createElement("img");
      boxImg.src = lastOpenedData.image;
      boxImg.alt = lastOpenedData.name;
      boxImg.style.cssText = `
        width: 100%; flex: 1; min-height: 0;
        object-fit: cover; display: block;
      `;

      shrinkBox.appendChild(boxTitle);
      shrinkBox.appendChild(boxImg);
      document.body.appendChild(shrinkBox);

      // === 3. Scrim ===
      const scrim = document.createElement("div");
      scrim.className = "project-scrim";
      scrim.style.opacity = "1";
      document.body.appendChild(scrim);

      // === EXTERIOR EFFECT: set siblings in pushed-out state ===
      const allCards = document.querySelectorAll('.gallery-item[data-project]');
      const clickedCenter = {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2
      };
      const closeSiblings = Array.from(allCards).filter(c => c !== lastOpenedCard);
      const push = 100;
      closeSiblings.forEach(sib => {
        const sibRect = sib.getBoundingClientRect();
        const sibCenter = {
          x: sibRect.left + sibRect.width / 2,
          y: sibRect.top + sibRect.height / 2
        };
        let dx = sibCenter.x - clickedCenter.x;
        let dy = sibCenter.y - clickedCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const pushX = (dx / dist) * push;
        const pushY = (dy / dist) * push;
        gsap.set(sib, { x: pushX, y: pushY, opacity: 0 });
      });
      const closeNav = document.querySelector('nav, header, .site-nav');
      if (closeNav) gsap.set(closeNav, { opacity: 0, y: -30 });

      // === 4. ONTO-STYLE SINGLE-BEAT close ===
      const dur = 1.6;
      const tl = gsap.timeline({
        defaults: { ease: "sine.inOut" },
        onComplete: () => cleanupOverlay(scrim, shrinkBox),
      });

      // Content fades out fast
      tl.to(contentEls, {
        opacity: 0, y: 16, duration: 0.2, ease: "sine.in", stagger: 0.01,
      }, 0);

      // Instant swap: overlay → shrinkBox (no crossfade = no flash)
      tl.call(() => {
        gsap.set(shrinkBox, { opacity: 1 });
        gsap.set(overlay, { opacity: 0 });
        overlay.scrollTop = 0;
      }, null, 0.2);

      // NO separate boxTitleH2 animation — text hidden naturally by overflow:hidden

      // Title area collapses WHILE box shrinks — single beat
      tl.to(boxTitle, { height: 0, duration: dur * 0.6, ease: "sine.inOut" }, 0.2);

      // Box shrinks from full viewport → card rect — smooth single gesture
      tl.to(shrinkBox, {
        top: targetRect.top, left: targetRect.left,
        width: targetRect.width, height: targetRect.height,
        duration: dur, ease: "sine.inOut",
      }, 0.25);

      // Siblings glide back in — unified with shrink
      tl.to(closeSiblings, {
        x: 0, y: 0, opacity: 1,
        duration: dur * 0.7,
        ease: "sine.inOut",
        stagger: 0.02,
      }, 0.25);

      // Nav fades back in
      if (closeNav) tl.to(closeNav, { opacity: 1, y: 0, duration: dur * 0.5, ease: "sine.out" }, dur * 0.3);

      // Scrim fades
      tl.to(scrim, { opacity: 0, duration: dur * 0.5, ease: "sine.out" }, dur * 0.45);

      function cleanupOverlay(scrimEl, boxEl) {
        if (scrimEl) scrimEl.remove();
        if (boxEl) boxEl.remove();

        // Reset overlay
        overlay.classList.remove("active");
        gsap.set(overlay, { opacity: 0, clipPath: "none" });

        // Rebuild overlay inner DOM
        const oldHero = overlay.querySelector(".project-detail-hero-area");
        const oldContent = overlay.querySelector(".project-detail-inner");
        if (oldHero) oldHero.remove();
        if (oldContent) oldContent.remove();
        const newInner = document.createElement("div");
        newInner.className = "project-detail-inner";
        newInner.id = "project-detail-inner";
        overlay.appendChild(newInner);

        // Clear sibling exterior effect styles
        document.querySelectorAll('.gallery-item[data-project]').forEach(c => {
          gsap.set(c, { clearProps: "transform,opacity" });
        });
        // Clear nav styles
        const navEl = document.querySelector('nav, header, .site-nav');
        if (navEl) gsap.set(navEl, { clearProps: "all" });

        // Restore gallery card visibility
        if (lastOpenedCard) lastOpenedCard.style.visibility = "";

        // Reset body
        document.body.style.overflow = "";

        // Clear state
        lastOpenedCard = null;
        lastOpenedData = null;
        lastTargetTitleH = null;

        // Restart smooth scroll
        if (lenis) lenis.start();
      }
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closeProject);
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("active")) {
        closeProject();
      }
    });
  }

  // ============================================================
  // SECTION INDICATOR — Centered pill (ONTO-style)
  // ============================================================
  function initSectionIndicator() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

    const indicator = document.getElementById("section-indicator");
    const indicatorText = document.getElementById("indicator-text");
    if (!indicator || !indicatorText) return;

    const sectionDefs = [
      { sel: "#hero", label: "Proyectos", dir: "down" },
      { sel: "#manifesto", label: "Proyectos", dir: "down" },
      { sel: ".section-numeros", label: "Proceso", dir: "down" },
      { sel: "#proceso", label: "Proyectos", dir: "down" },
      { sel: ".section-materiales", label: "Proyectos", dir: "down" },
      { sel: ".section-principio", label: "Proyectos", dir: "down" },
      { sel: ".section-enfoque", label: "Proyectos", dir: "down" },
      { sel: ".section-detail-break", label: "Proyectos", dir: "down" },
      { sel: "#proyectos", label: "Contacto", dir: "down" },
      { sel: "#contacto", label: "Inicio", dir: "up" },
    ];

    const sections = sectionDefs.map((d, i) => {
      const el = document.querySelector(d.sel);
      return { ...d, el };
    }).filter(d => d.el);

    let currentDef = null;

    // Use a single scroll callback to find which section the viewport
    // center falls inside — uses getBoundingClientRect for accuracy
    // with ScrollTrigger-pinned sections
    function onScroll() {
      const halfVH = window.innerHeight / 2;
      let match = null;
      for (let i = sections.length - 1; i >= 0; i--) {
        const s = sections[i];
        const rect = s.el.getBoundingClientRect();
        if (rect.top <= halfVH && rect.bottom >= halfVH) {
          match = s;
          break;
        }
      }
      // If no section matched (gap between sections), find the nearest above
      if (!match) {
        let best = null;
        let bestDist = Infinity;
        for (const s of sections) {
          const rect = s.el.getBoundingClientRect();
          const dist = Math.abs(rect.bottom - halfVH);
          if (rect.bottom <= halfVH && dist < bestDist) {
            best = s;
            bestDist = dist;
          }
        }
        match = best || sections[0];
      }
      updateIndicator(match);
    }

    ScrollTrigger.create({
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      onUpdate: onScroll,
    });
    // Fallback for programmatic scrolls that bypass Lenis/GSAP
    window.addEventListener("scroll", onScroll, { passive: true });
    // Also run once on init
    onScroll();

    function updateIndicator(s) {
      if (s === currentDef) return; // no change
      // Hide during hero
      if (s.sel === "#hero") {
        indicator.classList.remove("visible");
        currentDef = s;
        return;
      }
      currentDef = s;
      indicatorText.textContent = s.label;
      indicator.classList.toggle("indicator-up", s.dir === "up");
      indicator.classList.add("visible");
    }

    // Click to scroll
    indicator.addEventListener("click", () => {
      if (!currentDef) return;

      if (currentDef.dir === "up") {
        // Scroll to top
        if (lenis) lenis.scrollTo(0, { duration: 1.5 });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        // Find the target section by label
        const targetMap = {
          "Proyectos": "#proyectos",
          "Contacto": "#contacto",
          "Proceso": "#proceso",
        };
        const targetSel = targetMap[currentDef.label];
        const targetEl = targetSel ? document.querySelector(targetSel) : null;
        if (targetEl) {
          if (lenis) lenis.scrollTo(targetEl, { duration: 1.2 });
          else targetEl.scrollIntoView({ behavior: "smooth" });
        }
      }
    });
  }

  // ============================================================
  // HERO VIDEO — ONTO-style Expand (+) and Fullscreen
  // ============================================================
  function initHeroExpand() {
    const expandBtn = document.getElementById("hero-expand");
    const fullscreenBtn = document.getElementById("hero-fullscreen");
    const vid = document.getElementById("hero-bg-video");
    const videoWrap = document.getElementById("hero-video-wrap");
    const heroHead = document.querySelector(".hero-head");
    const header = document.querySelector(".site-header");
    if (!expandBtn || !vid || !videoWrap) return;

    let isExpanded = false;
    let expandTl = null;

    // "+" button — expand video to fullscreen viewport
    expandBtn.addEventListener("click", () => {
      if (isExpanded) {
        collapseVideo();
      } else {
        expandVideo();
      }
    });

    function expandVideo() {
      if (typeof gsap === "undefined") return;
      isExpanded = true;
      vid.muted = false;

      expandTl = gsap.timeline({ defaults: { ease: "power3.inOut", duration: 0.7 } });

      expandTl
        .to(videoWrap, {
          width: "100vw",
          height: "100vh",
          bottom: 0,
        })
        .to(heroHead, {
          opacity: 0,
          visibility: "hidden",
        }, "<")
        .to(fullscreenBtn, {
          opacity: 0,
        }, "<")
        .to(header, {
          opacity: 0,
          visibility: "hidden",
        }, "<")
        .to(expandBtn, {
          rotation: -45,
          scale: 1.5,
          borderRadius: "50%",
          backgroundColor: "#fff",
          color: "#111",
          right: "1rem",
          bottom: "28vh",
          duration: 0.5,
        }, "<0.1");
    }

    function collapseVideo() {
      if (typeof gsap === "undefined") return;
      isExpanded = false;
      vid.muted = true;

      gsap.timeline({ defaults: { ease: "power3.inOut", duration: 0.6 } })
        .to(expandBtn, {
          rotation: 0,
          scale: 1,
          borderRadius: "0%",
          backgroundColor: "transparent",
          color: "",
          clearProps: "right,bottom",
          duration: 0.4,
        })
        .to(videoWrap, {
          clearProps: "width,height",
        }, "<0.1")
        .to(heroHead, {
          opacity: 1,
          visibility: "visible",
        }, "<")
        .to(fullscreenBtn, {
          opacity: 1,
        }, "<")
        .to(header, {
          opacity: 1,
          visibility: "visible",
        }, "<");
    }

    // Escape key closes expanded state
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isExpanded) {
        collapseVideo();
      }
    });

    // "Fullscreen" text button — native fullscreen with audio
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener("click", () => {
        vid.muted = false;
        vid.currentTime = 0;
        if (vid.requestFullscreen) vid.requestFullscreen();
        else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
        else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
      });
    }

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) vid.muted = true;
    });
    document.addEventListener("webkitfullscreenchange", () => {
      if (!document.webkitFullscreenElement) vid.muted = true;
    });
  }

  // ============================================================
  // CUSTOM CURSOR — Smooth follow with hover text
  // ============================================================
  function initCursor() {
    // Only on hover-capable devices
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const cursor = document.getElementById("custom-cursor");
    const cursorText = document.getElementById("cursor-text");
    if (!cursor) return;

    document.body.classList.add("cursor-active");

    let mouseX = 0, mouseY = 0;
    let cursorX = 0, cursorY = 0;
    const lerp = 0.08;

    document.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!cursor.classList.contains("visible")) {
        cursor.classList.add("visible");
        cursorX = mouseX;
        cursorY = mouseY;
      }
    });

    document.addEventListener("mouseleave", () => {
      cursor.classList.remove("visible");
    });

    function tick() {
      cursorX += (mouseX - cursorX) * lerp;
      cursorY += (mouseY - cursorY) * lerp;
      cursor.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // Hover detection
    const hoverTargets = [
      { sel: ".gallery-item", text: "ver proyecto", cls: "hovering-gallery" },
      { sel: ".cta-button", text: "" },
    ];

    hoverTargets.forEach(({ sel, text, cls }) => {
      document.querySelectorAll(sel).forEach(el => {
        el.addEventListener("mouseenter", () => {
          cursor.classList.add("hovering");
          if (cls) cursor.classList.add(cls);
          if (cursorText && text) cursorText.textContent = text;
        });
        el.addEventListener("mouseleave", () => {
          cursor.classList.remove("hovering");
          if (cls) cursor.classList.remove(cls);
          if (cursorText) cursorText.textContent = "";
        });
      });
    });
  }

  // ============================================================
  // HERO VIDEO TRIM — JS playback range (skip logo intro/outro)
  // ============================================================
  function initHeroVideoTrim() {
    const vid = document.getElementById("hero-bg-video");
    if (!vid) return;

    const TRIM_START = 4.5;  // safely past white logo intro
    const TRIM_END = 12.5;   // before black face/logo outro

    // Hide video until we've seeked past the logo
    vid.style.opacity = "0";
    vid.pause();

    function seekAndReveal() {
      vid.currentTime = TRIM_START;
      vid.play();
      // Reveal after a short delay to ensure the seek has taken effect
      setTimeout(() => { vid.style.opacity = ""; }, 150);
    }

    if (vid.readyState >= 1) {
      seekAndReveal();
    } else {
      vid.addEventListener("loadedmetadata", seekAndReveal, { once: true });
    }

    // Use rAF polling for precise boundary control (~16ms vs timeupdate's ~250ms)
    function checkBounds() {
      if (vid.currentTime >= TRIM_END || vid.currentTime < TRIM_START - 0.5) {
        vid.currentTime = TRIM_START;
      }
      requestAnimationFrame(checkBounds);
    }
    requestAnimationFrame(checkBounds);
  }

  // ============================================================
  // BOOT
  // ============================================================
  initLoader();
  initHeroExpand();
  initHeroVideoTrim();
  initProjectOverlay();
  initCursor();
  initVideo();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGSAP);
  } else {
    initGSAP();
  }
})();
