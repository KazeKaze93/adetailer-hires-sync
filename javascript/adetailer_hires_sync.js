var autoEnabledByScript = false;
var interruptObserver = null;

function disconnectInterruptObserver() {
    if (interruptObserver) {
        interruptObserver.disconnect();
        interruptObserver = null;
    }
}

function handleGenerationComplete() {
    if (autoEnabledByScript) {
        var root = gradioApp();
        if (!root) {
            autoEnabledByScript = false;
            disconnectInterruptObserver();
            return;
        }

        var checkbox = root.querySelector('[id*="adetailer"] input[type="checkbox"]');
        if (checkbox && checkbox.checked) {
            checkbox.click();
        }
    }

    autoEnabledByScript = false;
    disconnectInterruptObserver();
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
    var root = gradioApp();
    if (!root) {
        return;
    }

    var hiresButton = root.querySelector("#txt2img_upscale");
    if (!hiresButton) {
        return;
    }

    hiresButton.addEventListener("click", function () {
        var currentRoot = gradioApp();
        if (!currentRoot) {
            return;
        }

        var checkbox = currentRoot.querySelector('[id*="adetailer"] input[type="checkbox"]');
        autoEnabledByScript = false;

        if (checkbox && !checkbox.checked) {
            checkbox.click();
            autoEnabledByScript = true;
        }

        armInterruptObserver();
    });
});
