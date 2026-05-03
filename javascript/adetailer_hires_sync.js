var autoEnabledByScript = false;
var interruptObserver = null;
var galleryObserver = null;
var galleryDebounceTimer = null;
var galleryInjecting = false;
var selectedIndices = [];
var processingQueue = [];
var isProcessingQueue = false;

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
                "}\n"
        )
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

    // Target only the thumbnail strip container, not the main viewer
    var strip = gallery.querySelector(".thumbnails");
    if (!strip) {
        strip = gallery.querySelector("[class*='thumbnails']");
    }
    if (!strip) {
        strip = gallery; // fallback
    }

    var nodes = strip.querySelectorAll("button");
    // Filter: only buttons that contain an img element
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
        // не трогать DOM пока идёт генерация
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

function processNextInQueue() {
    var root = gradioApp();
    var gallery = root ? root.querySelector("#txt2img_gallery") : null;
    var clears;
    var c;

    if (processingQueue.length === 0) {
        isProcessingQueue = false;
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
        return;
    }

    var idx = processingQueue.shift();
    var thumbs = getGalleryThumbnails(root);

    if (!thumbs || !thumbs[idx]) {
        setTimeout(function () {
            processNextInQueue();
        }, 0);
        return;
    }

    thumbs[idx].click();

    setTimeout(function () {
        var currentRoot = gradioApp();
        if (!currentRoot) {
            processingQueue = [];
            isProcessingQueue = false;
            return;
        }

        var checkbox = currentRoot.querySelector('[id*="adetailer"] input[type="checkbox"]');
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
        if (!root) {
            autoEnabledByScript = false;
            disconnectInterruptObserver();
            if (isProcessingQueue) {
                setTimeout(function () {
                    processNextInQueue();
                }, 600);
            }
            return;
        }

        var checkbox = root.querySelector('[id*="adetailer"] input[type="checkbox"]');
        if (checkbox && checkbox.checked) {
            checkbox.click();
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

    interruptObserver = new MutationObserver(function () {
        if (interruptBtn.style.display === "block") {
            return;
        }
        if (interruptBtn.style.display === "none" && autoEnabledByScript) {
            handleGenerationComplete();
        }
    });

    interruptObserver.observe(interruptBtn, {
        attributes: true,
        attributeFilter: ["style"]
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
            var checkbox = currentRoot.querySelector('[id*="adetailer"] input[type="checkbox"]');
            autoEnabledByScript = false;

            if (checkbox && !checkbox.checked) {
                checkbox.click();
                autoEnabledByScript = true;
            }

            armInterruptObserver();
            return;
        }

        var sorted = selectedIndices.slice().sort(function (a, b) {
            return a - b;
        });
        processingQueue = sorted.slice();
        isProcessingQueue = true;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        processNextInQueue();
    });
});
