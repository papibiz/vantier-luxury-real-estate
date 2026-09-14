/**
 * Hero Canvas GPU Image Sequence Scrubbing Engine
 * Instant Load, Zero Preloader Screen, Offscreen GPU ImageBitmap Decoding
 * Centered Text Flow, Disappearing Header, and Dynamic Left-Bottom Scene Beats
 */
(function () {
  'use strict';

  // Configuration
  const TOTAL_FRAMES = 270;
  const FRAME_BASE_PATH = './assets/images/hero-frames-hd/frame_';
  const FRAME_EXT = '.webp';
  const CONCURRENCY = 8;
  const LERP_FACTOR = 0.25;

  // 6 Scene Beats mapped across the 270 HD Frames
  const SCENE_BEATS = [
    {
      index: '01 / THE GROUNDS',
      title: 'Arrival Promontory & Grounds',
      desc: 'Perimeter architectural walls framed by mature olive groves and limestone motor court.'
    },
    {
      index: '02 / STRUCTURAL CRAFT',
      title: 'Cantilevered Volumes & Envelopes',
      desc: 'Board-formed concrete architecture paired with triple-glazed Swiss thermal panoramic glazing.'
    },
    {
      index: '03 / THE THRESHOLD',
      title: 'Grand Entrance Portal',
      desc: 'Monolithic pivot entry door engineered with acoustic drop-seals and Roman travertine surrounds.'
    },
    {
      index: '04 / CULINARY ATELIER',
      title: 'Bespoke Atelier & Marble Joinery',
      desc: 'Integrated Gaggenau appliances, monolithic waterfall marble island, and custom French walnut cabinetry.'
    },
    {
      index: '05 / RESIDENTIAL WING',
      title: 'Upper Gallery & Private Suites',
      desc: 'Acoustically decoupled ceiling bays, recessed circadian halo lighting, and custom dressing suites.'
    },
    {
      index: '06 / MASTER SANCTUARY',
      title: 'Primary Sanctuary & Horizon Balcony',
      desc: 'Panoramic oceanfront master wing with private horizon terrace and carved ensuite spa.'
    }
  ];

  function getBeatForFrame(frameIndex) {
    if (frameIndex < 30) return 0;
    if (frameIndex < 68) return 1;
    if (frameIndex < 105) return 2;
    if (frameIndex < 162) return 3;
    if (frameIndex < 216) return 4;
    return 5;
  }

  // State
  const frames = new Array(TOTAL_FRAMES);
  let currentFrame = 0;
  let targetFrame = 0;
  let lastDrawnFrame = -1;
  let activeBeatIndex = -1;
  let animFrameId = null;
  let lenisInstance = null;

  // Cached layout metrics to completely eliminate layout thrashing in render loop
  let cachedTrackTop = 0;
  let cachedTrackHeight = 1;
  let cachedCanvasWidth = 0;
  let cachedCanvasHeight = 0;

  // DOM Elements
  let trackSection;
  let canvas;
  let ctx;
  let heroContent;
  let fallbackPoster;
  let siteHeader;
  let heroLeftScrim;
  let heroSceneBeat;
  let sceneBeatIndex;
  let sceneBeatTitle;
  let sceneBeatDesc;

  function pad(num, size) {
    let s = num + '';
    while (s.length < size) s = '0' + s;
    return s;
  }

  function getFrameUrl(index) {
    return `${FRAME_BASE_PATH}${pad(index + 1, 3)}${FRAME_EXT}`;
  }

  // GPU ImageBitmap / Image Decoder
  function loadFrame(index) {
    if (frames[index]) return Promise.resolve(frames[index]);

    const url = getFrameUrl(index);

    if (window.createImageBitmap && window.fetch) {
      return fetch(url, { cache: 'force-cache' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => createImageBitmap(blob))
        .then((bitmap) => {
          frames[index] = bitmap;
          if (index === 0 && lastDrawnFrame === -1) {
            drawFrame(0);
          }
          return bitmap;
        })
        .catch(() => fallbackImageLoad(index, url));
    }

    return fallbackImageLoad(index, url);
  }

  function fallbackImageLoad(index, url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        frames[index] = img;
        if (index === 0 && lastDrawnFrame === -1) {
          drawFrame(0);
        }
        resolve(img);
      };
      img.onerror = () => {
        resolve(null);
      };
      img.src = url;
    });
  }

  // Adaptive background queue: loads keyframes first, then fills in remaining
  let preloadStarted = false;

  async function startAdaptivePreload() {
    if (preloadStarted) return;
    preloadStarted = true;

    await loadFrame(0);

    const keyframes = [];
    for (let i = 5; i < TOTAL_FRAMES; i += 5) {
      keyframes.push(i);
    }

    const remaining = [];
    for (let i = 1; i < TOTAL_FRAMES; i++) {
      if (i % 5 !== 0) {
        remaining.push(i);
      }
    }

    const queue = [...keyframes, ...remaining];
    let activeWorkers = 0;

    function next() {
      if (queue.length === 0) return;
      while (activeWorkers < CONCURRENCY && queue.length > 0) {
        const nextIndex = queue.shift();
        activeWorkers++;
        loadFrame(nextIndex).finally(() => {
          activeWorkers--;
          next();
        });
      }
    }

    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => next(), { timeout: 1000 });
    } else {
      setTimeout(next, 50);
    }
  }

  // Update layout and canvas dimensions
  function updateMetrics() {
    if (!trackSection || !canvas) return;

    cachedTrackTop = trackSection.offsetTop;
    cachedTrackHeight = Math.max(1, trackSection.offsetHeight - window.innerHeight);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    cachedCanvasWidth = Math.round(rect.width * dpr);
    cachedCanvasHeight = Math.round(rect.height * dpr);

    if (canvas.width !== cachedCanvasWidth || canvas.height !== cachedCanvasHeight) {
      canvas.width = cachedCanvasWidth;
      canvas.height = cachedCanvasHeight;
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
    }

    if (lastDrawnFrame >= 0) {
      drawFrame(lastDrawnFrame);
    }
  }

  // Instant canvas drawing with nearest-frame fallback
  function drawFrame(index) {
    if (!ctx || !canvas) return;

    let frameToDraw = frames[index];

    if (!frameToDraw) {
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        if (index - offset >= 0 && frames[index - offset]) {
          frameToDraw = frames[index - offset];
          break;
        }
        if (index + offset < TOTAL_FRAMES && frames[index + offset]) {
          frameToDraw = frames[index + offset];
          break;
        }
      }
    }

    if (!frameToDraw) {
      if (fallbackPoster && fallbackPoster.complete && fallbackPoster.naturalWidth > 0) {
        frameToDraw = fallbackPoster;
      } else {
        return;
      }
    }

    const w = cachedCanvasWidth || canvas.width;
    const h = cachedCanvasHeight || canvas.height;
    const imgW = frameToDraw.naturalWidth || frameToDraw.width;
    const imgH = frameToDraw.naturalHeight || frameToDraw.height;
    const ratio = Math.max(w / imgW, h / imgH);

    const drawW = imgW * ratio;
    const drawH = imgH * ratio;
    const shiftX = (w - drawW) * 0.5;
    const shiftY = (h - drawH) * 0.5;

    ctx.drawImage(frameToDraw, 0, 0, imgW, imgH, shiftX, shiftY, drawW, drawH);
    lastDrawnFrame = index;

    if (fallbackPoster && fallbackPoster.style.opacity !== '0') {
      fallbackPoster.style.opacity = '0';
      fallbackPoster.style.pointerEvents = 'none';
    }
  }

  // UI state: Smooth typography flow-out & bottom-left scene beats
  function updateUI(progress, currentFrameIdx) {
    // 1. Centered Hero Typography: Smooth flow-out animation on scroll
    if (heroContent) {
      if (progress < 0.003) {
        heroContent.style.opacity = '1';
        heroContent.style.transform = 'translateY(0px) scale(1)';
        heroContent.style.filter = 'blur(0px)';
        heroContent.style.pointerEvents = 'auto';
      } else if (progress < 0.04) {
        const fade = Math.max(0, 1 - ((progress - 0.003) / 0.035));
        heroContent.style.opacity = fade.toFixed(3);
        heroContent.style.transform = `translateY(-${((1 - fade) * 36).toFixed(1)}px) scale(${(1 - (1 - fade) * 0.04).toFixed(3)})`;
        heroContent.style.filter = `blur(${((1 - fade) * 4).toFixed(1)}px)`;
        heroContent.style.pointerEvents = 'none';
      } else {
        heroContent.style.opacity = '0';
        heroContent.style.transform = 'translateY(-40px) scale(0.96)';
        heroContent.style.filter = 'blur(5px)';
        heroContent.style.pointerEvents = 'none';
      }
    }

    // 2. Bottom-Left Scene Beats & Localized Scrim
    const showBeats = progress >= 0.015 && progress <= 0.985;

    if (heroLeftScrim) {
      if (showBeats) {
        heroLeftScrim.classList.add('is-visible');
      } else {
        heroLeftScrim.classList.remove('is-visible');
      }
    }

    if (heroSceneBeat) {
      if (showBeats) {
        const beatIdx = getBeatForFrame(currentFrameIdx);
        if (beatIdx !== activeBeatIndex) {
          activeBeatIndex = beatIdx;
          const beat = SCENE_BEATS[beatIdx];

          // Micro cross-fade transition on beat change
          heroSceneBeat.style.opacity = '0.4';
          heroSceneBeat.style.transform = 'translateY(6px)';

          setTimeout(() => {
            if (sceneBeatIndex) sceneBeatIndex.textContent = beat.index;
            if (sceneBeatTitle) sceneBeatTitle.textContent = beat.title;
            if (sceneBeatDesc) sceneBeatDesc.textContent = beat.desc;

            heroSceneBeat.style.opacity = '';
            heroSceneBeat.style.transform = '';
          }, 120);
        }
        heroSceneBeat.classList.add('is-active');
      } else {
        heroSceneBeat.classList.remove('is-active');
      }
    }
  }

  // Render Loop (60/120Hz native RAF, zero forced reflow)
  function renderLoop() {
    const scrollY = lenisInstance ? lenisInstance.scroll : window.scrollY;
    const scrollOffset = scrollY - cachedTrackTop;
    const progress = Math.max(0, Math.min(1, scrollOffset / cachedTrackHeight));

    targetFrame = progress * (TOTAL_FRAMES - 1);

    // Smooth Lerp tracking
    const diff = targetFrame - currentFrame;
    if (Math.abs(diff) > 0.001) {
      currentFrame += diff * LERP_FACTOR;
      const targetIndex = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(currentFrame)));
      if (targetIndex !== lastDrawnFrame) {
        drawFrame(targetIndex);
      }
    }

    const currentFrameIdx = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(currentFrame)));
    updateUI(progress, currentFrameIdx);

    // Header State Management:
    // - At page top (scrollY < 20): visible transparent header
    // - Scrolling inside hero (scrollY >= 20 && scrollY < threshold): completely hidden to focus 100% on visuals
    // - Past hero section (scrollY >= threshold): sleek obsidian scrolled header
    if (siteHeader) {
      const threshold = cachedTrackTop + cachedTrackHeight - 80;
      if (scrollY < 20) {
        siteHeader.classList.remove('is-hero-hidden', 'is-scrolled-header');
        siteHeader.classList.add('is-hero-transparent');
      } else if (scrollY >= 20 && scrollY < threshold) {
        siteHeader.classList.remove('is-hero-transparent', 'is-scrolled-header');
        siteHeader.classList.add('is-hero-hidden');
      } else {
        siteHeader.classList.remove('is-hero-hidden', 'is-hero-transparent');
        siteHeader.classList.add('is-scrolled-header');
      }
    }

    animFrameId = requestAnimationFrame(renderLoop);
  }

  // Initialize Lenis with controlled, luxurious smoothness
  function initLenis() {
    if (typeof window.Lenis !== 'undefined') {
      try {
        lenisInstance = new window.Lenis({
          duration: 1.2,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          orientation: 'vertical',
          gestureOrientation: 'vertical',
          smoothWheel: true,
          wheelMultiplier: 0.45,
          touchMultiplier: 0.9,
          infinite: false
        });

        function lenisRaf(time) {
          lenisInstance.raf(time);
          requestAnimationFrame(lenisRaf);
        }
        requestAnimationFrame(lenisRaf);

        // Smooth scroll for internal hash anchor links
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
          anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId && targetId.length > 1) {
              const targetElem = document.querySelector(targetId);
              if (targetElem) {
                e.preventDefault();
                if (lenisInstance) {
                  lenisInstance.scrollTo(targetElem, { offset: -50, duration: 1.4 });
                } else {
                  targetElem.scrollIntoView({ behavior: 'smooth' });
                }
              }
            }
          });
        });

        console.log('[HeroScrubber] High-performance GPU sequence & Lenis scroll active');
      } catch (e) {
        console.warn('[HeroScrubber] Error initializing Lenis:', e);
      }
    }
  }

  function triggerDeferredPreload() {
    if (preloadStarted) return;
    const events = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'];
    events.forEach((evt) => {
      window.removeEventListener(evt, triggerDeferredPreload);
    });
    startAdaptivePreload();
  }

  // Immediate Initialization: Paints first frame instantly, defers rest
  function init() {
    trackSection = document.querySelector('.section-hero.scrub-track');
    canvas = document.getElementById('heroScrubCanvas');
    if (!trackSection || !canvas) return;

    ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    heroContent = document.querySelector('.hero-content-layer');
    fallbackPoster = document.querySelector('.hero-fallback-poster');
    siteHeader = document.getElementById('siteHeader');
    heroLeftScrim = document.getElementById('heroLeftScrim');
    heroSceneBeat = document.getElementById('heroSceneBeat');
    sceneBeatIndex = document.getElementById('sceneBeatIndex');
    sceneBeatTitle = document.getElementById('sceneBeatTitle');
    sceneBeatDesc = document.getElementById('sceneBeatDesc');

    updateMetrics();

    // Immediately render frame 0 so hero visual is crisp without waiting
    if (fallbackPoster && fallbackPoster.complete && fallbackPoster.naturalWidth > 0) {
      drawFrame(0);
    } else if (fallbackPoster) {
      fallbackPoster.addEventListener('load', () => {
        if (lastDrawnFrame === -1) drawFrame(0);
      }, { once: true });
    }
    loadFrame(0);

    window.addEventListener('resize', updateMetrics, { passive: true });

    initLenis();
    renderLoop();

    // Defer heavy sequence loading until user starts scrolling/interacting
    const events = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'];
    events.forEach((evt) => {
      window.addEventListener(evt, triggerDeferredPreload, { once: true, passive: true });
    });

    // Fallback: If user stays idle without scrolling for 3.5 seconds, start quietly in background
    if ('requestIdleCallback' in window) {
      setTimeout(() => {
        window.requestIdleCallback(triggerDeferredPreload, { timeout: 2000 });
      }, 3500);
    } else {
      setTimeout(triggerDeferredPreload, 3500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
