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
    if (sessionStorage.getItem("adentro-visited")) {
      loader.remove();
      if (pageWrapper) pageWrapper.classList.add("no-anim", "revealed");
      loaderExited = true;
      initHeroRotation();
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
    sessionStorage.setItem("adentro-visited", "1");

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

    // Start hero rotating words after loader exits
    setTimeout(initHeroRotation, 600);
  }

  // ============================================================
  // HERO ROTATING WORDS
  // ============================================================
  function initHeroRotation() {
    const divider = document.querySelector(".hero-divider");
    const words = document.querySelectorAll(".hero-rotating-word");
    const wrap = document.querySelector(".hero-rotating-wrap");
    if (!words.length || !wrap) return;

    // Reveal the divider
    if (divider) divider.classList.add("visible");

    // Set initial width to match active word
    wrap.style.width = words[0].scrollWidth + "px";

    let current = 0;
    setInterval(() => {
      words[current].classList.remove("active");
      current = (current + 1) % words.length;
      words[current].classList.add("active");
      wrap.style.width = words[current].scrollWidth + "px";
    }, 2500);
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
  let videoTickId = null;

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

    videoST = ScrollTrigger.create({
      trigger: videoSection,
      start: "top top",
      end: "+=400%",
      pin: true,
      onEnter: startVideoTick,
      onEnterBack: startVideoTick,
      onLeave: stopVideoTick,
      onLeaveBack: stopVideoTick,
    });

    window.addEventListener("scroll", onVideoScroll, { passive: true });
    onVideoScroll();
  }

  function startVideoTick() {
    if (videoTickId) return;
    lastTimestamp = performance.now();
    videoTickId = requestAnimationFrame(videoTick);
  }

  function stopVideoTick() {
    if (videoTickId) {
      cancelAnimationFrame(videoTickId);
      videoTickId = null;
    }
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

    videoTickId = requestAnimationFrame(videoTick);
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
          { clipPath: "inset(4% 4% 4% 4% round 8px)" },
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

      // Assign depth class for CSS scale/opacity (skip on mobile)
      if (!isMobileGallery) {
        const depthClass = depthClassMap[item.dataset.speed] || "depth-mid";
        item.classList.add(depthClass);
      }

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

    });

    // Batched fade-in reveal for all gallery items (single ScrollTrigger)
    // Start hidden, animate to visible on enter/re-enter
    gsap.set(".gallery-item", { opacity: 0, scale: 0.97 });
    ScrollTrigger.batch(".gallery-item", {
      start: "top 92%",
      onEnter: batch => gsap.to(batch, {
        opacity: 1, scale: 1,
        duration: 0.8, ease: "power2.out", stagger: 0.1,
      }),
      onEnterBack: batch => gsap.to(batch, {
        opacity: 1, scale: 1,
        duration: 0.8, ease: "power2.out", stagger: 0.1,
      }),
      onLeaveBack: batch => gsap.to(batch, { opacity: 0, scale: 0.97, duration: 0.4 }),
    });

    // Projects heading parallax reveal
    const proyectosHeading = document.querySelector(".proyectos-header .heading-display");
    if (proyectosHeading) {
      gsap.fromTo(proyectosHeading,
        { y: 60, opacity: 0 },
        {
        y: 0,
        opacity: 1,
        duration: 1.2,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".proyectos-header",
          start: "top 80%",
          toggleActions: "play none play reverse",
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
          { clipPath: "inset(3% 4% 3% 4% round 8px)" },
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
      name: "Residencia San \Ángel",
      category: "Residencial",
      year: "2025",
      scope: "Dise\ño \• Fabricaci\ón \• Instalaci\ón",
      image: "assets/kitchen-wide-2.webp",
      description: "Una cocina que dialoga con la arquitectura brutalista de esta residencia en San \Ángel. Superficies de cuarzo Calacatta, isla central de 3.2 metros y un sistema de iluminaci\ón integrado que transforma el espacio seg\ún la hora del d\ía. Cada detalle fue pensado para complementar los techos dobles y los ventanales que enmarcan el jard\ín.",
      gallery: ["assets/detail-marble.webp", "assets/kitchen-pendant.webp", "assets/lifestyle-2.webp", "assets/kitchen-wide-2.webp"]
    },
    {
      name: "Loft Condesa",
      category: "Loft",
      year: "2024",
      scope: "Dise\ño \• Fabricaci\ón",
      image: "assets/gallery-1.webp",
      description: "Cocina abierta para un loft de doble altura en la Condesa. El reto: integrar cocina, comedor y sala en un solo gesto arquitect\ónico. Resolvimos con una barra perimetral en roble ahumado y una isla flotante que funciona como punto de reuni\ón. Herrajes Blum de cierre suave en cada caj\ón.",
      gallery: ["assets/kitchen-dark.webp", "assets/lifestyle-1.webp", "assets/kitchen-wide-1.webp", "assets/gallery-2.webp"]
    },
    {
      name: "Casa Pedregal",
      category: "Residencial",
      year: "2024",
      scope: "Dise\ño \• Fabricaci\ón \• Instalaci\ón",
      image: "assets/gallery-2.webp",
      description: "Minimalismo c\álido para una familia que vive su cocina. Frentes en laca mate grafito, encimera de Dekton ultracompacto y un sistema de almacenamiento oculto que mantiene todo a la vista limpio y organizado. La isla integra zona de cocci\ón, fregadero y barra de desayuno.",
      gallery: ["assets/kitchen-portrait-1.webp", "assets/kitchen-portrait-2.webp", "assets/detail-marble.webp", "assets/kitchen-wide-2.webp"]
    },
    {
      name: "Departamento Polanco",
      category: "Departamento",
      year: "2025",
      scope: "Dise\ño \• Fabricaci\ón",
      image: "assets/gallery-3.webp",
      description: "Elegancia contenida en 18 metros cuadrados. Para este departamento en Polanco, dise\ñamos una cocina en L que maximiza cada cent\ímetro. Acabados en madera de nogal con detalles en lat\ón cepillado. El muro de fondo en porcel\ánico simula m\ármol Statuario sin las complicaciones del mantenimiento.",
      gallery: ["assets/lifestyle-2.webp", "assets/kitchen-pendant.webp", "assets/gallery-1.webp", "assets/kitchen-dark.webp"]
    },
    {
      name: "Residencia Bosques",
      category: "Residencial",
      year: "2023",
      scope: "Dise\ño \• Fabricaci\ón \• Instalaci\ón",
      image: "assets/kitchen-square.webp",
      description: "Una cocina de autor para una familia que ama cocinar junta. Dos islas paralelas crean un flujo de trabajo profesional en un entorno dom\éstico. Superficies de granito negro Zimbabwe, frentes de roble natural y campana integrada en el techo. El resultado: un espacio que inspira.",
      gallery: ["assets/kitchen-wide-2.webp", "assets/lifestyle-1.webp", "assets/kitchen-wide-1.webp", "assets/kitchen-portrait-1.webp"]
    },
    {
      name: "Interiores Integrales",
      category: "Comercial",
      year: "2024",
      scope: "Dise\ño \• Fabricaci\ón \• Instalaci\ón",
      image: "assets/interiors-media.webp",
      description: "Proyecto integral para un showroom gastron\ómico en Santa Fe. Tres cocinas de demostraci\ón con especificaciones comerciales: acero inoxidable grado alimenticio, ventilaci\ón industrial y acabados premium que combinan funcionalidad profesional con est\ética residencial.",
      gallery: ["assets/kitchen-wide-2.webp", "assets/detail-marble.webp", "assets/gallery-3.webp", "assets/kitchen-portrait-2.webp"]
    },
    {
      name: "Penthouse Reforma",
      category: "Penthouse",
      year: "2025",
      scope: "Dise\ño \• Fabricaci\ón \• Instalaci\ón",
      image: "assets/kitchen-dark.webp",
      description: "Cocina oscura de alto contraste para un penthouse en Paseo de la Reforma. Frentes en laca negra mate con tirador integrado, isla en piedra natural y un sistema de iluminaci\ón perimetral que define cada volumen. El dise\ño responde a la vista panor\ámica del espacio.",
      gallery: ["assets/detail-marble.webp", "assets/kitchen-pendant.webp", "assets/gallery-1.webp", "assets/lifestyle-2.webp"]
    },
    {
      name: "Villa Coyoac\án",
      category: "Residencial",
      year: "2024",
      scope: "Dise\ño \• Fabricaci\ón",
      image: "assets/kitchen-pendant.webp",
      description: "Una cocina que rinde homenaje al contexto hist\órico de Coyoac\án. Madera de parota recuperada, encimeras de concreto pulido y detalles artesanales en cer\ámica. La luminaria central de lat\ón fue dise\ñada a medida para este proyecto.",
      gallery: ["assets/lifestyle-1.webp", "assets/kitchen-wide-1.webp", "assets/kitchen-wide-2.webp", "assets/gallery-2.webp"]
    },
    {
      name: "Estudio Narvarte",
      category: "Estudio",
      year: "2024",
      scope: "Dise\ño \• Fabricaci\ón \• Instalaci\ón",
      image: "assets/kitchen-portrait-1.webp",
      description: "M\áxima funcionalidad en 9 metros cuadrados. Dise\ñamos una cocina en U con almacenamiento vertical hasta el techo, frentes en melamina texturizada roble y tiradores ocultos. Cada cent\ímetro optimizado sin sacrificar est\ética.",
      gallery: ["assets/gallery-3.webp", "assets/kitchen-square.webp", "assets/kitchen-dark.webp", "assets/kitchen-portrait-2.webp"]
    },
    {
      name: "Casa de Campo",
      category: "Residencial",
      year: "2023",
      scope: "Dise\ño \• Fabricaci\ón \• Instalaci\ón",
      image: "assets/outdoor-kitchen.webp",
      description: "Cocina exterior e interior integradas para una casa de campo en Valle de Bravo. La cocina exterior usa acero corten y piedra volc\ánica, mientras que la interior complementa con madera de tzalam y cuarzo blanco. Ambas conectadas por una barra pasaplatos.",
      gallery: ["assets/lifestyle-1.webp", "assets/kitchen-wide-2.webp", "assets/detail-marble.webp", "assets/interiors-media.webp"]
    },
    {
      name: "Suite Santa Fe",
      category: "Departamento",
      year: "2025",
      scope: "Dise\ño \• Fabricaci\ón",
      image: "assets/kitchen-portrait-2.webp",
      description: "Cocina compacta de lujo para un departamento en Santa Fe. Superficies en Silestone blanco, frentes en alto brillo gris perla y una isla multifunci\ón con almacenamiento oculto. Iluminaci\ón LED integrada en cada m\ódulo superior.",
      gallery: ["assets/gallery-1.webp", "assets/kitchen-pendant.webp", "assets/kitchen-wide-1.webp", "assets/gallery-3.webp"]
    },
    {
      name: "Terraza Lomas",
      category: "Terraza",
      year: "2024",
      scope: "Dise\ño \• Fabricaci\ón \• Instalaci\ón",
      image: "assets/kitchen-wide-1.webp",
      description: "Proyecto integral de cocina y terraza para una residencia en Lomas de Chapultepec. La cocina principal conecta visualmente con la terraza a trav\és de un ventanal plegable. Materiales resistentes a la intemperie en la zona exterior, acabados premium en el interior.",
      gallery: ["assets/outdoor-kitchen.webp", "assets/kitchen-wide-2.webp", "assets/lifestyle-2.webp", "assets/kitchen-square.webp"]
    },
    {
      name: "Family Room Caoba",
      category: "Family Room",
      year: "2025",
      scope: "Diseño • Decorado Virtual",
      image: "assets/family-room-caoba-principal.webp",
      description: "Transformación integral de un family room en la zona del Bajío. Tres propuestas de decorado virtual sobre el espacio real, mostrando el potencial de cada ambiente. Materiales cálidos en caoba y texturas naturales que conectan el interior con el entorno.",
      gallery: [
        "assets/family-room-caoba-principal.webp",
        "assets/family-room-caoba-tv.webp",
        "assets/family-room-caoba-tv2.webp",
        "assets/family-room-caoba-closeup.webp"
      ],
      canvasElements: [
        { type: "beforeAfter", before: "assets/family-room-caoba-principal-before.webp", after: "assets/family-room-caoba-principal.webp", beforeLabel: "REAL", afterLabel: "DECORADO", x: 420, y: -80, depth: 3, width: 700 },
        { type: "beforeAfter", before: "assets/family-room-caoba-tv-before.webp", after: "assets/family-room-caoba-tv.webp", beforeLabel: "REAL", afterLabel: "DECORADO", x: -480, y: 320, depth: 2, width: 580 },
        { type: "beforeAfter", before: "assets/family-room-caoba-tv2-before.webp", after: "assets/family-room-caoba-tv2.webp", beforeLabel: "REAL", afterLabel: "DECORADO", x: 200, y: 700, depth: 4, width: 640 },
        { type: "image", src: "assets/family-room-caoba-closeup.webp", x: -650, y: -200, depth: 1, width: 420 },
        { type: "plano", src: "assets/family-room-caoba-plano.pdf", x: 750, y: 550, depth: 1, width: 350 }
      ]
    }
  ];

  // Generate canvasElements for projects that don't have them (existing projects)
  projectData.forEach(p => {
    if (p.canvasElements) return;
    const imgs = p.gallery || [];
    const positions = [
      { x: -350, y: -180, depth: 2, width: 550 },
      { x: 380, y: -60, depth: 3, width: 480 },
      { x: -200, y: 350, depth: 1, width: 420 },
      { x: 450, y: 420, depth: 4, width: 520 },
    ];
    p.canvasElements = imgs.map((src, i) => ({
      type: "image",
      src,
      ...positions[i % positions.length],
    }));
  });

  // ============================================================
  // CANVAS VIEW — Infinite 2D Pan with Parallax Depth
  // ============================================================
  const PARALLAX_FACTORS = { 1: 0.85, 2: 0.92, 3: 1.0, 4: 1.15 };
  const ZOOM_PARALLAX    = { 1: 0.92, 2: 0.96, 3: 1.0, 4: 1.06 };
  const DEPTH_SCALES     = { 1: 0.88, 2: 1.0, 3: 1.1, 4: 1.28 };
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3.0;
  const ZOOM_SPEED = 0.0015;
  let canvasController = null;

  // Scroll sequence: hero → specs sheet → canvas
  function initCanvasScrollSequence(overlay, data) {
    const sentinel = overlay.querySelector(".canvas-sentinel");
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          observer.disconnect();
          transitionToCanvas(overlay, data);
        }
      });
    }, { root: overlay, threshold: 0.1 });

    observer.observe(sentinel);
  }

  function transitionToCanvas(overlay, data) {
    const heroArea = overlay.querySelector(".project-detail-hero-area");
    const specsSheet = overlay.querySelector(".project-specs-sheet");
    const sentinel = overlay.querySelector(".canvas-sentinel");

    gsap.to([heroArea, specsSheet].filter(Boolean), {
      opacity: 0, y: -40, duration: 0.6, ease: "power2.inOut",
      onComplete: () => {
        if (heroArea) heroArea.remove();
        if (specsSheet) specsSheet.remove();
        if (sentinel) sentinel.remove();
        overlay.style.overflow = "hidden";
        renderCanvasView(overlay, data);
      }
    });
  }

  function renderCanvasView(overlay, data) {
    // Create canvas viewport directly (no intro screen — specs sheet replaced it)
    const viewport = document.createElement("div");
    viewport.className = "canvas-viewport active"; // immediately active
    const gridBg = document.createElement("div");
    gridBg.className = "canvas-grid-bg";
    viewport.appendChild(gridBg);
    const world = document.createElement("div");
    world.className = "canvas-world";
    viewport.appendChild(world);

    overlay.appendChild(viewport);

    // Show back button
    const backBtn = document.getElementById("project-back");
    if (backBtn) backBtn.classList.add("visible");

    // Render canvas elements
    const elements = renderCanvasElements(world, data.canvasElements || [], data);

    // Start canvas controller immediately
    canvasController = initCanvasController(viewport, world, elements);
  }

  // Lazy-load pdf.js and render first page to a canvas element
  async function loadPdfFirstPage(url, canvasEl, targetWidth) {
    try {
      if (!window.pdfjsLib) {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        document.head.appendChild(script);
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      }
      const pdf = await pdfjsLib.getDocument(url).promise;
      const page = await pdf.getPage(1);
      const baseVp = page.getViewport({ scale: 1 });
      const scale = (targetWidth / baseVp.width) * 2; // 2x for retina
      const vp = page.getViewport({ scale });
      canvasEl.width = vp.width;
      canvasEl.height = vp.height;
      canvasEl.style.width = targetWidth + "px";
      canvasEl.style.height = Math.round(targetWidth * (baseVp.height / baseVp.width)) + "px";
      await page.render({ canvasContext: canvasEl.getContext("2d"), viewport: vp }).promise;
    } catch (err) {
      console.warn("PDF render failed, showing placeholder", err);
      const parent = canvasEl.parentElement;
      if (parent) {
        canvasEl.remove();
        parent.innerHTML = `
          <div style="width:${targetWidth}px;height:${Math.round(targetWidth * 1.4)}px;background:var(--bg-warm-white);display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--accent-line);">
            <div style="font-family:var(--font-sans);font-size:0.7rem;font-weight:500;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-secondary);">Plano</div>
          </div>
          <div class="canvas-plano-badge">Ver plano</div>
        `;
      }
    }
  }

  function renderCanvasElements(world, elemConfigs, data) {
    const elements = [];
    elemConfigs.forEach((cfg, i) => {
      const el = document.createElement("div");
      el.className = "canvas-element";
      el.dataset.depth = cfg.depth || 2;
      el._baseX = cfg.x || 0;
      el._baseY = cfg.y || 0;
      el._depth = cfg.depth || 2;

      const w = cfg.width || 500;
      el._width = w;
      el.style.width = w + "px";
      el.style.left = -w / 2 + "px";
      el.style.top = "0px";

      if (cfg.type === "beforeAfter") {
        el.innerHTML = `
          <div class="ba-slider" style="width:${w}px">
            <img class="ba-before" src="${cfg.before}" alt="Real">
            <div class="ba-after-wrap">
              <img class="ba-after" src="${cfg.after}" alt="Decorado">
            </div>
            <div class="ba-handle"></div>
            <span class="ba-label ba-label-before">${cfg.beforeLabel || "REAL"}</span>
            <span class="ba-label ba-label-after">${cfg.afterLabel || "DECORADO"}</span>
          </div>
        `;
        initBeforeAfterSlider(el.querySelector(".ba-slider"));
      } else if (cfg.type === "plano") {
        el.classList.add("canvas-plano");
        const isPdf = cfg.src && cfg.src.endsWith(".pdf");
        if (isPdf) {
          const pdfCanvas = document.createElement("canvas");
          pdfCanvas.style.cssText = `width:${w}px;height:${Math.round(w * 1.4)}px;display:block;background:var(--bg-warm-white);border:1px solid var(--accent-line);`;
          el.appendChild(pdfCanvas);
          const badge = document.createElement("div");
          badge.className = "canvas-plano-badge";
          badge.textContent = "Ver plano";
          el.appendChild(badge);
          loadPdfFirstPage(cfg.src, pdfCanvas, w);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            window.open(cfg.src, "_blank");
          });
        } else {
          el.innerHTML = `<img src="${cfg.src}" alt="Plano"><div class="canvas-plano-badge">Ver plano</div>`;
          el.querySelector("img").addEventListener("click", (e) => {
            e.stopPropagation();
            openLightbox(cfg.src, "Plano", cfg.pdfSrc);
          });
        }
      } else {
        el.innerHTML = `<img src="${cfg.src}" alt="${data.name}">`;
        el.querySelector("img").addEventListener("click", (e) => {
          e.stopPropagation();
          openLightbox(cfg.src, data.name);
        });
      }

      world.appendChild(el);
      elements.push(el);
    });
    return elements;
  }

  function initCanvasController(viewport, world, elements) {
    // --- Camera state (target + smoothed current) ---
    let camX = 0, camY = 0, camZoom = 1;
    let curX = 0, curY = 0, curZoom = 1;

    // --- Drag state ---
    let isDragging = false;
    let lastPointerX = 0, lastPointerY = 0;
    let velocityX = 0, velocityY = 0;
    let lastPointerTime = 0;
    let isInertia = false;

    // --- Pinch state (mobile) ---
    const activeTouches = new Map();
    let pinchStartDist = 0, pinchStartZoom = 1;
    let pinchCenterX = 0, pinchCenterY = 0;

    // --- Grid bg reference ---
    const gridEl = viewport.querySelector(".canvas-grid-bg");

    // --- Fit-all: calculate initial zoom to show all elements ---
    function calculateFitAllZoom() {
      let minElX = Infinity, maxElX = -Infinity;
      let minElY = Infinity, maxElY = -Infinity;
      elements.forEach(el => {
        const w = el._width || 500;
        const h = w * 0.67;
        minElX = Math.min(minElX, el._baseX - w / 2);
        maxElX = Math.max(maxElX, el._baseX + w / 2);
        minElY = Math.min(minElY, el._baseY - h / 2);
        maxElY = Math.max(maxElY, el._baseY + h / 2);
      });
      const contentW = maxElX - minElX || 1000;
      const contentH = maxElY - minElY || 800;
      const vpRect = viewport.getBoundingClientRect();
      const pad = 0.82;
      camZoom = Math.min(
        (vpRect.width * pad) / contentW,
        (vpRect.height * pad) / contentH,
        1.0
      );
      curZoom = camZoom;
      camX = -(minElX + maxElX) / 2;
      camY = -(minElY + maxElY) / 2;
      curX = camX;
      curY = camY;
    }
    calculateFitAllZoom();

    // --- Cinematic zoom entrance: start zoomed in on hero, pull back to fit-all ---
    const fitX = camX, fitY = camY, fitZoom = camZoom;
    const mainEl = elements.find(el => el._depth === 3) || elements[0];
    if (mainEl) {
      camX = -mainEl._baseX;
      camY = -mainEl._baseY;
      camZoom = 1.2;
      curX = camX; curY = camY; curZoom = camZoom;
    }
    setTimeout(() => {
      camX = fitX;
      camY = fitY;
      camZoom = fitZoom;
    }, 200);

    // --- Clamp helper ---
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    // --- Update zoom-level data attribute for CSS shadow tiers ---
    function updateZoomLevel() {
      const level = curZoom < 0.5 ? "far" : curZoom > 1.5 ? "close" : "mid";
      if (viewport.dataset.zoomLevel !== level) viewport.dataset.zoomLevel = level;
    }

    // --- Per-frame transform application ---
    function applyTransforms() {
      elements.forEach(el => {
        const d = el._depth;
        const pf = PARALLAX_FACTORS[d] || 1;
        const zf = ZOOM_PARALLAX[d] || 1;
        const effectiveZoom = Math.pow(curZoom, zf);
        const px = (el._baseX + curX * pf) * curZoom;
        const py = (el._baseY + curY * pf) * curZoom;
        const scale = DEPTH_SCALES[d] * effectiveZoom;
        el.style.transform = `translate(${px}px, ${py}px) scale(${scale})`;
      });
      // Grid background parallax (slowest layer)
      if (gridEl) {
        const bgZoom = Math.pow(curZoom, 0.5);
        const bgSize = 40 * bgZoom;
        gridEl.style.backgroundSize = `${bgSize}px ${bgSize}px`;
        gridEl.style.backgroundPosition = `${curX * 0.2 * curZoom}px ${curY * 0.2 * curZoom}px`;
      }
      updateZoomLevel();
    }

    // --- rAF animation loop ---
    let rafId = null;
    function tick() {
      // Smooth interpolation
      curX += (camX - curX) * 0.12;
      curY += (camY - curY) * 0.12;
      curZoom += (camZoom - curZoom) * 0.1;

      // Inertia decay
      if (isInertia) {
        camX += velocityX;
        camY += velocityY;
        velocityX *= 0.92;
        velocityY *= 0.92;
        if (Math.abs(velocityX) + Math.abs(velocityY) < 0.2) {
          isInertia = false;
        }
      }

      applyTransforms();
      rafId = requestAnimationFrame(tick);
    }

    // Initial render + start loop
    applyTransforms();
    rafId = requestAnimationFrame(tick);

    // --- ZOOM: scroll wheel centered on cursor ---
    function onWheel(e) {
      e.preventDefault();
      // Skip if slider is active
      if (viewport.classList.contains("slider-active")) return;

      // Detect trackpad pan vs wheel zoom
      const isTrackpadPan = !e.ctrlKey &&
        Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5 &&
        Math.abs(e.deltaX) > 2;

      if (e.ctrlKey || !isTrackpadPan) {
        // ZOOM centered on cursor
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        const delta = -e.deltaY * ZOOM_SPEED;
        const newZoom = clamp(camZoom * (1 + delta), ZOOM_MIN, ZOOM_MAX);
        const zoomRatio = newZoom / camZoom;

        // Adjust camera so point under cursor stays fixed
        camX -= mouseX * (1 - 1 / zoomRatio) / camZoom;
        camY -= mouseY * (1 - 1 / zoomRatio) / camZoom;
        camZoom = newZoom;
      } else {
        // TRACKPAD PAN: two-finger gesture
        camX -= e.deltaX * 0.8 / camZoom;
        camY -= e.deltaY * 0.8 / camZoom;
      }

      isInertia = false;
    }
    viewport.addEventListener("wheel", onWheel, { passive: false });

    // --- PAN: pointer drag ---
    function onPointerDown(e) {
      if (e.target.closest(".ba-handle") || e.target.closest(".ba-slider")) return;

      if (e.pointerType === "touch") {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size === 2) {
          startPinch();
          return;
        }
      }

      isDragging = true;
      isInertia = false;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      lastPointerTime = performance.now();
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add("dragging");
    }

    function onPointerMove(e) {
      if (e.pointerType === "touch") {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size === 2) {
          updatePinch();
          return;
        }
      }

      if (!isDragging) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      const now = performance.now();
      const dt = now - lastPointerTime;

      camX += dx / camZoom;
      camY += dy / camZoom;

      // Track velocity for inertia
      if (dt > 0) {
        velocityX = (dx / camZoom) * 0.5;
        velocityY = (dy / camZoom) * 0.5;
      }

      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      lastPointerTime = now;
    }

    function onPointerUp(e) {
      if (e.pointerType === "touch") {
        activeTouches.delete(e.pointerId);
        if (activeTouches.size < 2) pinchStartDist = 0;
      }
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove("dragging");
      if (Math.abs(velocityX) + Math.abs(velocityY) > 0.5) {
        isInertia = true;
      }
    }

    // --- PINCH ZOOM (mobile) ---
    function getTouchDist() {
      const pts = Array.from(activeTouches.values());
      if (pts.length < 2) return 0;
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function getTouchCenter() {
      const pts = Array.from(activeTouches.values());
      if (pts.length < 2) return { x: 0, y: 0 };
      return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }

    function startPinch() {
      isDragging = false;
      pinchStartDist = getTouchDist();
      pinchStartZoom = camZoom;
      const center = getTouchCenter();
      const rect = viewport.getBoundingClientRect();
      pinchCenterX = center.x - rect.left - rect.width / 2;
      pinchCenterY = center.y - rect.top - rect.height / 2;
    }

    function updatePinch() {
      if (pinchStartDist === 0) return;
      const dist = getTouchDist();
      const ratio = dist / pinchStartDist;
      const newZoom = clamp(pinchStartZoom * ratio, ZOOM_MIN, ZOOM_MAX);
      const zoomRatio = newZoom / camZoom;

      // Pan to keep pinch center fixed
      camX -= pinchCenterX * (1 - 1 / zoomRatio) / camZoom;
      camY -= pinchCenterY * (1 - 1 / zoomRatio) / camZoom;
      camZoom = newZoom;
    }

    // --- Event binding ---
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerUp);

    return {
      destroy() {
        if (rafId) cancelAnimationFrame(rafId);
        viewport.removeEventListener("wheel", onWheel);
        viewport.removeEventListener("pointerdown", onPointerDown);
        viewport.removeEventListener("pointermove", onPointerMove);
        viewport.removeEventListener("pointerup", onPointerUp);
        viewport.removeEventListener("pointercancel", onPointerUp);
      }
    };
  }

  // Before/After Slider
  function initBeforeAfterSlider(container) {
    const handle = container.querySelector(".ba-handle");
    const afterWrap = container.querySelector(".ba-after-wrap");
    if (!handle || !afterWrap) return;

    let dragging = false;
    afterWrap.style.clipPath = "inset(0 50% 0 0)";
    handle.style.left = "50%";

    function updateSlider(clientX) {
      const rect = container.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(2, Math.min(98, pct));
      afterWrap.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      handle.style.left = pct + "%";
    }

    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      e.stopPropagation();
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      // Signal canvas controller to ignore zoom while slider active
      const vp = container.closest(".canvas-viewport");
      if (vp) vp.classList.add("slider-active");
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      e.stopPropagation();
      updateSlider(e.clientX);
    });
    handle.addEventListener("pointerup", (e) => {
      dragging = false;
      e.stopPropagation();
      const vp = container.closest(".canvas-viewport");
      if (vp) vp.classList.remove("slider-active");
    });
    handle.addEventListener("pointercancel", () => {
      dragging = false;
      const vp = container.closest(".canvas-viewport");
      if (vp) vp.classList.remove("slider-active");
    });
  }

  // Lightbox
  function openLightbox(src, alt, pdfSrc) {
    const lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML = `
      <button class="lightbox-close">&times;</button>
      <img src="${src}" alt="${alt || ''}">
      ${pdfSrc ? `<a class="lightbox-download" href="${pdfSrc}" target="_blank" rel="noopener">Descargar PDF</a>` : ""}
    `;
    document.body.appendChild(lb);

    requestAnimationFrame(() => lb.classList.add("active"));

    function close() {
      lb.classList.remove("active");
      setTimeout(() => lb.remove(), 300);
    }
    lb.querySelector(".lightbox-close").addEventListener("click", close);
    lb.addEventListener("click", (e) => {
      if (e.target === lb) close();
    });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onEsc);
      }
    });
  }

  function initProjectOverlay() {
    const overlay = document.getElementById("project-detail");
    const overlayInner = document.getElementById("project-detail-inner");
    const closeBtn = document.getElementById("project-close");
    const backBtn = document.getElementById("project-back");
    if (!overlay || !overlayInner) return;

    // State for reverse close animation
    let lastOpenedCard = null;
    let lastOpenedData = null;
    let lastTargetTitleH = null;

    // Back button: return from canvas to hero+specs
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        if (!lastOpenedData) return;
        // Destroy canvas controller
        if (canvasController) { canvasController.destroy(); canvasController = null; }
        // Remove canvas viewport
        const vp = overlay.querySelector(".canvas-viewport");
        if (vp) vp.remove();
        // Hide back button
        backBtn.classList.remove("visible");
        // Restore overlay scrollability
        overlay.style.overflow = "";
        // Rebuild hero + specs sheet
        rebuildHeroAndSpecs(overlay, lastOpenedData);
      });
    }

    function rebuildHeroAndSpecs(overlay, data) {
      const vh = window.innerHeight;
      const targetTitleH = Math.round(vh * 0.52);
      const targetImgH = vh - targetTitleH;

      const heroArea = document.createElement("div");
      heroArea.className = "project-detail-hero-area";
      heroArea.innerHTML = `
        <div class="project-detail-title-area" style="height:${targetTitleH}px;overflow:hidden">
          <h2 class="project-detail-title">${data.name}</h2>
        </div>
        <img class="project-detail-hero" src="${data.image}" alt="${data.name}" style="height:${targetImgH}px">
      `;

      const specsSheet = document.createElement("div");
      specsSheet.className = "project-specs-sheet";
      specsSheet.innerHTML = `
        <span class="project-detail-label">${data.category} &mdash; ${data.year}</span>
        <div class="project-detail-meta"><span class="project-detail-meta-item">${data.scope}</span></div>
        <div class="project-detail-rule"></div>
        <p class="project-detail-desc">${data.description}</p>
        <div class="canvas-enter-hint">Scroll para explorar</div>
      `;

      const sentinel = document.createElement("div");
      sentinel.className = "canvas-sentinel";

      const closeBtnEl = overlay.querySelector(".project-close");
      closeBtnEl.insertAdjacentElement("afterend", heroArea);
      overlay.appendChild(specsSheet);
      overlay.appendChild(sentinel);

      // Fade in
      gsap.from([heroArea, specsSheet], { opacity: 0, y: 30, duration: 0.5, ease: "power2.out", stagger: 0.1 });

      // Scroll to top
      overlay.scrollTop = 0;

      // Re-init scroll sequence
      initCanvasScrollSequence(overlay, data);
    }

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
        background: #EDE6DB; overflow: hidden;
        display: flex; flex-direction: column; justify-content: flex-end;
        padding: 0 clamp(1.5rem, 5vw, 6rem);
      `;
      const boxTitleH2 = document.createElement("h2");
      boxTitleH2.textContent = data.name;
      boxTitleH2.style.cssText = `
        font-family: 'Playfair Display', Georgia, serif;
        font-size: clamp(3rem, 7vw, 6.5rem);
        font-weight: 300; color: #1a1917; line-height: 1.0;
        letter-spacing: -0.03em;
        padding-bottom: 1.5rem;
        white-space: nowrap;
      `;
      boxTitleH2.style.opacity = "0";
      boxTitleH2.style.transform = "translateY(20px)";
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
      const isCanvasMode = !!(data.canvasElements && data.canvasElements.length);
      overlayInner.innerHTML = "";

      // ALL projects get hero area (title + image) — seamless match with expandBox
      const heroArea = document.createElement("div");
      heroArea.className = "project-detail-hero-area";
      heroArea.innerHTML = `
        <div class="project-detail-title-area">
          <h2 class="project-detail-title">${data.name}</h2>
        </div>
        <img class="project-detail-hero" src="${data.image}" alt="${data.name}">
      `;

      let contentEls = [];

      if (isCanvasMode) {
        // Canvas mode: hero + specs sheet + sentinel → then canvas
        const specsSheet = document.createElement("div");
        specsSheet.className = "project-specs-sheet";
        specsSheet.innerHTML = `
          <span class="project-detail-label">${data.category} &mdash; ${data.year}</span>
          <div class="project-detail-meta">
            <span class="project-detail-meta-item">${data.scope}</span>
          </div>
          <div class="project-detail-rule"></div>
          <p class="project-detail-desc">${data.description}</p>
          <div class="canvas-enter-hint">Scroll para explorar</div>
        `;
        const sentinel = document.createElement("div");
        sentinel.className = "canvas-sentinel";

        overlay.querySelector(".project-detail-inner").remove();
        overlay.querySelector(".project-close").insertAdjacentElement("afterend", heroArea);
        overlay.appendChild(specsSheet);
        overlay.appendChild(sentinel);

        const titleArea = heroArea.querySelector(".project-detail-title-area");
        const heroImg = heroArea.querySelector(".project-detail-hero");

        titleArea.style.height = targetTitleH + "px";
        titleArea.style.overflow = "hidden";
        heroImg.style.height = targetImgH + "px";

        contentEls = specsSheet.querySelectorAll(".project-detail-label, .project-detail-meta, .project-detail-rule, .project-detail-desc, .canvas-enter-hint");
        gsap.set(contentEls, { opacity: 0, y: 24 });
      } else {
        // Legacy scrolling layout
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
        contentEls = contentArea.querySelectorAll(".project-detail-label, .project-detail-meta, .project-detail-rule, .project-detail-desc, .project-detail-gallery");

        titleArea.style.height = targetTitleH + "px";
        titleArea.style.overflow = "hidden";
        heroImg.style.height = targetImgH + "px";
        gsap.set(contentEls, { opacity: 0, y: 24 });
        gsap.set(titleH2, { y: "0%", opacity: 1 });
      }

      gsap.set(overlay, { opacity: 0, clipPath: "none" });
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

      // Title area grows INSIDE the box — same easing
      .to(boxTitle, {
        height: targetTitleH, duration: dur * 0.75, ease: "sine.inOut",
      }, dur * 0.15)

      // Title text fades in smoothly after container mostly expanded — no "jump"
      .to(boxTitleH2, {
        opacity: 1, y: 0, duration: dur * 0.4, ease: "power2.out",
      }, dur * 0.55)

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
        siblings.forEach(sib => gsap.set(sib, { x: 0, y: 0, opacity: 1, clearProps: "transform,opacity" }));
        if (nav) gsap.set(nav, { clearProps: "all" });

        // Canvas mode: animate specs sheet sliding up + set up scroll sequence
        if (isCanvasMode) {
          const specsSheet = overlay.querySelector(".project-specs-sheet");
          if (specsSheet) {
            gsap.set(specsSheet, { y: 120, opacity: 0 });
            gsap.to(specsSheet, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", delay: 0.15 });
          }
          initCanvasScrollSequence(overlay, data);
        }
      }, null, dur + 0.05);

      // Content staggers in (both modes have content to reveal)
      tl.to(contentEls, {
        opacity: 1, y: 0, duration: 0.5, ease: "power1.out", stagger: 0.05,
      }, dur + 0.05);
    }

    function closeProject() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Destroy canvas panning if active
      if (canvasController) {
        canvasController.destroy();
        canvasController = null;
      }

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
      const isCanvas = !!overlay.querySelector(".canvas-viewport") || !!overlay.querySelector(".project-specs-sheet");
      const titleArea = overlay.querySelector(".project-detail-title-area");
      const contentEls = isCanvas
        ? overlay.querySelectorAll(".canvas-viewport, .project-specs-sheet, .canvas-sentinel")
        : overlay.querySelectorAll(".project-detail-label, .project-detail-meta, .project-detail-rule, .project-detail-desc, .project-detail-gallery");

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
        background: #EDE6DB; overflow: hidden;
        display: flex; flex-direction: column; justify-content: flex-end;
        padding: 0 clamp(1.5rem, 5vw, 6rem);
      `;
      const boxTitleH2 = document.createElement("h2");
      boxTitleH2.textContent = lastOpenedData.name;
      boxTitleH2.style.cssText = `
        font-family: 'Playfair Display', Georgia, serif;
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

        // Hide back button
        const backBtn = document.getElementById("project-back");
        if (backBtn) backBtn.classList.remove("visible");

        // Rebuild overlay inner DOM — remove all content (legacy + canvas)
        const oldHero = overlay.querySelector(".project-detail-hero-area");
        const oldContent = overlay.querySelector(".project-detail-inner");
        const oldCanvasViewport = overlay.querySelector(".canvas-viewport");
        const oldSpecsSheet = overlay.querySelector(".project-specs-sheet");
        const oldSentinel = overlay.querySelector(".canvas-sentinel");
        if (oldHero) oldHero.remove();
        if (oldContent) oldContent.remove();
        if (oldCanvasViewport) oldCanvasViewport.remove();
        if (oldSpecsSheet) oldSpecsSheet.remove();
        if (oldSentinel) oldSentinel.remove();
        overlay.style.overflow = ""; // restore scrollability
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
      { sel: "#hero", label: "Manifiesto", dir: "down" },
      { sel: "#manifesto", label: "Proceso", dir: "down" },
      { sel: ".section-numeros", label: "Proceso", dir: "down" },
      { sel: "#proceso", label: "Materiales", dir: "down" },
      { sel: ".section-materiales", label: "Enfoque", dir: "down" },
      { sel: ".section-principio", label: "Materiales", dir: "down" },
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
    // Run once on init
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
    let cursorTickId = null;
    let cursorIdleTimer = null;

    function startCursorTick() {
      if (cursorTickId) return;
      cursorTickId = requestAnimationFrame(cursorTick);
    }

    function stopCursorTick() {
      if (cursorTickId) {
        cancelAnimationFrame(cursorTickId);
        cursorTickId = null;
      }
    }

    document.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!cursor.classList.contains("visible")) {
        cursor.classList.add("visible");
        cursorX = mouseX;
        cursorY = mouseY;
      }
      startCursorTick();
      clearTimeout(cursorIdleTimer);
      cursorIdleTimer = setTimeout(stopCursorTick, 150);
    });

    document.addEventListener("mouseleave", () => {
      cursor.classList.remove("visible");
      stopCursorTick();
    });

    function cursorTick() {
      cursorX += (mouseX - cursorX) * lerp;
      cursorY += (mouseY - cursorY) * lerp;
      cursor.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
      cursorTickId = requestAnimationFrame(cursorTick);
    }

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

    // Use timeupdate event for boundary control (fires ~4x/sec, sufficient for trim)
    vid.addEventListener("timeupdate", () => {
      if (vid.currentTime >= TRIM_END || vid.currentTime < TRIM_START - 0.5) {
        vid.currentTime = TRIM_START;
      }
    });
  }

  // ============================================================
  // MOBILE CAROUSEL (project gallery → horizontal swipe)
  // ============================================================
  function initMobileCarousel() {
    const grid = document.querySelector(".proyectos-grid");
    const dotsContainer = document.getElementById("carousel-dots");
    if (!grid || !dotsContainer) return;

    const items = grid.querySelectorAll(".gallery-item");
    if (!items.length) return;

    // Create dots
    dotsContainer.innerHTML = "";
    items.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.className = "carousel-dot" + (i === 0 ? " active" : "");
      dot.setAttribute("aria-label", `Proyecto ${i + 1}`);
      dotsContainer.appendChild(dot);
    });

    const dots = dotsContainer.querySelectorAll(".carousel-dot");

    // Observe which item is most visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = Array.from(items).indexOf(entry.target);
          dots.forEach((d, i) => d.classList.toggle("active", i === idx));
        }
      });
    }, { root: grid, threshold: 0.5 });

    items.forEach(item => observer.observe(item));

    // Dot click → scroll to item
    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        items[i].scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      });
    });
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
  if (window.innerWidth <= 640) initMobileCarousel();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGSAP);
  } else {
    initGSAP();
  }
})();
