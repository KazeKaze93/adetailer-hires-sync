var autoEnabledByScript = false;
var interruptObserver = null;
var galleryObserver = null;
var galleryDebounceTimer = null;
var galleryInjecting = false;
var selectedIndices = [];
var processingQueue = []; // Array of {src: string, idx: number}
var isProcessingQueue = false;
var adEnabledBeforeQueue = null; // boolean | null — AD state snapshot before queue starts

var ADH_SEL_CLASS = "adhc-sel";

function injectAdhcSelStylesOnce() {
  if (document.getElementById("adhc-sel-styles")) {
    return;
  }
  var styleEl = document.createElement("style");
  styleEl.id = "adhc-sel-styles";
  styleEl.type = "text/css";
  styleEl.appendChild(
    document.createTextNode(
      "#txt2img_gallery .adhc-sel {\n" +
        "    position: absolute;\n" +
        "    top: 3px;\n" +
        "    left: 3px;\n" +
        "    width: 12px;\n" +
        "    height: 12px;\n" +
        "    z-index: 50;\n" +
        "    pointer-events: all !important;\n" +
        "    cursor: pointer;\n" +
        "    appearance: none;\n" +
        "    -webkit-appearance: none;\n" +
        "    border-radius: 50%;\n" +
        "    border: 1.5px solid rgba(255,255,255,0.85);\n" +
        "    background: rgba(0,0,0,0.35);\n" +
        "    transition: background 0.15s, border-color 0.15s;\n" +
        "}\n" +
        "#txt2img_gallery .adhc-sel:checked {\n" +
        "    background: #f97316;\n" +
        "    border-color: #f97316;\n" +
        "}\n",
    ),
  );
  document.head.appendChild(styleEl);
}

function disconnectInterruptObserver() {
  if (interruptObserver) {
    interruptObserver.disconnect();
    interruptObserver = null;
  }
}

function getGalleryThumbnails(root) {
  var gallery = root.querySelector("#txt2img_gallery");
  if (!gallery) {
    return null;
  }

  var strip = gallery.querySelector(".thumbnails");
  if (!strip) {
    strip = gallery.querySelector("[class*='thumbnails']");
  }
  if (!strip) {
    strip = gallery;
  }

  var nodes = strip.querySelectorAll("button");
  var result = [];
  var i;
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].querySelector("img")) {
      result.push(nodes[i]);
    }
  }
  return result.length > 0 ? result : null;
}

function shouldSkipThumbInjection(thumb) {
  var boundary = thumb.closest && thumb.closest("#txt2img_gallery");
  var cur = thumb;
  while (cur) {
    if (cur.id) {
      var lid = String(cur.id).toLowerCase();
      if (lid.indexOf("selected") !== -1 || lid.indexOf("preview") !== -1) {
        return true;
      }
    }
    if (boundary && cur === boundary) {
      break;
    }
    cur = cur.parentElement;
  }
  return false;
}

function injectGallerySelectionCheckboxes() {
  var root = gradioApp();
  if (!root) {
    return;
  }
  var gallery = root.querySelector("#txt2img_gallery");
  if (!gallery) {
    return;
  }

  if (galleryInjecting) {
    return;
  }
  galleryInjecting = true;

  try {
    var oldBoxes = gallery.querySelectorAll("." + ADH_SEL_CLASS);
    var o;
    for (o = 0; o < oldBoxes.length; o++) {
      if (oldBoxes[o].parentNode) {
        oldBoxes[o].parentNode.removeChild(oldBoxes[o]);
      }
    }

    var thumbs = getGalleryThumbnails(root);
    if (!thumbs || thumbs.length === 0) {
      return;
    }

    var i;
    for (i = 0; i < thumbs.length; i++) {
      (function (thumb, index) {
        if (shouldSkipThumbInjection(thumb)) {
          return;
        }

        var computed = window.getComputedStyle(thumb);
        if (computed.position === "static") {
          thumb.style.position = "relative";
        }

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = ADH_SEL_CLASS;
        cb.style.cssText = "pointer-events: all !important;";
        cb.setAttribute("data-adh-idx", String(index));

        if (selectedIndices.indexOf(index) !== -1) {
          cb.checked = true;
        }

        cb.addEventListener("mousedown", function (ev) {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          cb.checked = !cb.checked;
          var idx = parseInt(cb.getAttribute("data-adh-idx"), 10);
          if (isNaN(idx)) {
            return;
          }
          if (cb.checked) {
            if (selectedIndices.indexOf(idx) === -1) {
              selectedIndices.push(idx);
            }
          } else {
            var pos = selectedIndices.indexOf(idx);
            if (pos !== -1) {
              selectedIndices.splice(pos, 1);
            }
          }
        });

        thumb.appendChild(cb);
      })(thumbs[i], i);
    }
  } finally {
    galleryInjecting = false;
  }
}

function setupGalleryObserver(gallery) {
  if (!gallery) return;
  if (galleryObserver) {
    galleryObserver.disconnect();
    galleryObserver = null;
  }

  galleryObserver = new MutationObserver(function () {
    // Skip entirely while queue is running — generation is complete between
    // items but isProcessingQueue is still true, and touching the DOM here
    // removes overlay checkboxes and reassigns data-adh-idx offsets mid-flight.
    if (isProcessingQueue) {
      return;
    }

    var root = gradioApp();
    if (root) {
      var interruptBtn = root.querySelector("#txt2img_interrupt");
      if (interruptBtn && interruptBtn.style.display === "block") {
        return;
      }
    }

    if (galleryDebounceTimer) {
      clearTimeout(galleryDebounceTimer);
    }
    galleryDebounceTimer = setTimeout(function () {
      galleryDebounceTimer = null;
      injectGallerySelectionCheckboxes();
    }, 400);
  });

  galleryObserver.observe(gallery, { childList: true, subtree: true });
}

// Find thumbnail button by its image src URL inside an already-resolved thumbs array.
// Accepts the array from getGalleryThumbnails() so the caller can reuse it for
// the index fallback without a second DOM traversal.
function findThumbBySrc(thumbs, src) {
  if (!thumbs) return null;
  var i;
  for (i = 0; i < thumbs.length; i++) {
    var img = thumbs[i].querySelector("img");
    if (img && img.src === src) {
      return thumbs[i];
    }
  }
  return null;
}

// Restore AD checkbox to the state it had before the queue started.
// Called once when the queue drains (processingQueue.length === 0).
function restoreAdStateAfterQueue(root) {
  if (adEnabledBeforeQueue === null) return;
  if (!root) return;
  var adCb = root.querySelector('[id*="adetailer"] input[type="checkbox"]');
  if (adCb && adCb.checked !== adEnabledBeforeQueue) {
    adCb.click();
  }
  adEnabledBeforeQueue = null;
}

function processNextInQueue() {
  var root = gradioApp();
  var gallery = root ? root.querySelector("#txt2img_gallery") : null;
  var clears, c;

  if (processingQueue.length === 0) {
    isProcessingQueue = false;

    // Restore AD to the exact state it had before the queue was built.
    // This is the authoritative reset — per-item autoEnabledByScript
    // handles mid-queue toggling, this catches any leftover mismatch.
    restoreAdStateAfterQueue(root);
    autoEnabledByScript = false;

    if (gallery) {
      clears = gallery.querySelectorAll("." + ADH_SEL_CLASS);
      for (c = 0; c < clears.length; c++) {
        if (clears[c].parentNode) {
          clears[c].parentNode.removeChild(clears[c]);
        }
      }
    }
    selectedIndices = [];
    return;
  }

  if (!root) {
    processingQueue = [];
    isProcessingQueue = false;
    adEnabledBeforeQueue = null;
    autoEnabledByScript = false;
    selectedIndices = []; // Bug 2 fix: was missing, leaving stale selection
    return;
  }

  var item = processingQueue.shift();

  // Single DOM query — reused for both src match and index fallback.
  var thumbs = getGalleryThumbnails(root);

  // Primary lookup: match by image src so index drift after gallery expansion
  // doesn't send us to the wrong thumbnail.
  var thumb = findThumbBySrc(thumbs, item.src);

  // Fallback: original index, in case the src changed (e.g. Gradio blob refresh).
  // Safe because Forge appends new images to the end of the gallery strip,
  // so original indices remain valid for the images we queued.
  if (!thumb) {
    thumb = thumbs && thumbs[item.idx] ? thumbs[item.idx] : null;
  }

  if (!thumb) {
    // Image gone from gallery — skip without breaking the rest of the queue.
    setTimeout(function () {
      processNextInQueue();
    }, 0);
    return;
  }

  thumb.click();

  setTimeout(function () {
    var currentRoot = gradioApp();
    if (!currentRoot) {
      processingQueue = [];
      isProcessingQueue = false;
      adEnabledBeforeQueue = null;
      return;
    }

    var checkbox = currentRoot.querySelector(
      '[id*="adetailer"] input[type="checkbox"]',
    );
    autoEnabledByScript = false;

    if (checkbox && !checkbox.checked) {
      checkbox.click();
      autoEnabledByScript = true;
    }

    armInterruptObserver();

    var upscaleBtn = currentRoot.querySelector("#txt2img_upscale");
    if (upscaleBtn) {
      upscaleBtn.click();
    }
  }, 250);
}

function handleGenerationComplete() {
  if (autoEnabledByScript) {
    var root = gradioApp();
    if (root) {
      var checkbox = root.querySelector(
        '[id*="adetailer"] input[type="checkbox"]',
      );
      if (checkbox && checkbox.checked) {
        checkbox.click();
      }
    }
  }

  autoEnabledByScript = false;
  disconnectInterruptObserver();

  if (isProcessingQueue) {
    setTimeout(function () {
      processNextInQueue();
    }, 600);
  }
}

function armInterruptObserver() {
  var root = gradioApp();
  if (!root) {
    return;
  }

  var interruptBtn = root.querySelector("#txt2img_interrupt");
  if (!interruptBtn) {
    return;
  }

  disconnectInterruptObserver();

  var generationStarted = false;
  var fired = false;

  interruptObserver = new MutationObserver(function () {
    if (interruptBtn.style.display === "block") {
      generationStarted = true;
      return;
    }
    if (interruptBtn.style.display === "none" && generationStarted && !fired) {
      if (autoEnabledByScript || isProcessingQueue) {
        fired = true;
        handleGenerationComplete();
      }
    }
  });

  interruptObserver.observe(interruptBtn, {
    attributes: true,
    attributeFilter: ["style"],
  });
}

onUiLoaded(function () {
  injectAdhcSelStylesOnce();

  var root = gradioApp();
  if (!root) {
    return;
  }

  var hiresButton = root.querySelector("#txt2img_upscale");
  if (!hiresButton) {
    return;
  }

  var gallery = root.querySelector("#txt2img_gallery");
  setupGalleryObserver(gallery);
  injectGallerySelectionCheckboxes();

  hiresButton.addEventListener("click", function (ev) {
    if (isProcessingQueue) {
      return;
    }

    var currentRoot = gradioApp();
    if (!currentRoot) {
      return;
    }

    var thumbs = getGalleryThumbnails(currentRoot);
    var thumbCount = thumbs ? thumbs.length : 0;

    if (selectedIndices.length === 0 || thumbCount <= 1) {
      // Single-image mode: same as before, no queue.
      var checkbox = currentRoot.querySelector(
        '[id*="adetailer"] input[type="checkbox"]',
      );
      autoEnabledByScript = false;

      if (checkbox && !checkbox.checked) {
        checkbox.click();
        autoEnabledByScript = true;
      }

      armInterruptObserver();
      return;
    }

    // Queue mode: snapshot {src, idx} for every selected thumbnail NOW,
    // before any hires run has a chance to append new images and shift indices.
    var sorted = selectedIndices.slice().sort(function (a, b) {
      return a - b;
    });
    var queueItems = [];
    var i, t, img;
    for (i = 0; i < sorted.length; i++) {
      t = thumbs[sorted[i]];
      img = t ? t.querySelector("img") : null;
      if (img && img.src) {
        queueItems.push({ src: img.src, idx: sorted[i] });
      }
    }

    if (queueItems.length === 0) {
      return;
    }

    // Snapshot AD state before touching anything — restored after queue drains.
    var adCb = currentRoot.querySelector(
      '[id*="adetailer"] input[type="checkbox"]',
    );
    adEnabledBeforeQueue = adCb ? adCb.checked : false;

    processingQueue = queueItems;
    isProcessingQueue = true;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    selectedIndices = [];
    processNextInQueue();
  });
});
