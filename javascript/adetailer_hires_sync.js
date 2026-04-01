var autoEnabledByScript = false;
var generateObserver = null;
var generationStarted = false;

function getGenerateState(button) {
    if (!button) {
        return "";
    }
    var valueText = typeof button.value === "string" ? button.value : "";
    var contentText = button.textContent || "";
    return String(valueText || contentText).replace(/^\s+|\s+$/g, "").toLowerCase();
}

function disconnectGenerateObserver() {
    if (generateObserver) {
        generateObserver.disconnect();
        generateObserver = null;
    }
}

function handleGenerationComplete() {
    if (autoEnabledByScript) {
        var root = gradioApp();
        if (!root) {
            autoEnabledByScript = false;
            disconnectGenerateObserver();
            return;
        }

        var checkbox = root.querySelector('[id*="adetailer"] input[type="checkbox"]');
        if (checkbox && checkbox.checked) {
            checkbox.click();
        }
    }

    autoEnabledByScript = false;
    generationStarted = false;
    disconnectGenerateObserver();
}

function armGenerateObserver() {
    var root = gradioApp();
    if (!root) {
        return;
    }

    var generateButton = root.querySelector("#txt2img_generate");
    if (!generateButton) {
        return;
    }

    generationStarted = false;
    disconnectGenerateObserver();

    generateObserver = new MutationObserver(function () {
        var state = getGenerateState(generateButton);
        if (state === "stop" || state === "interrupt") {
            generationStarted = true;
            return;
        }
        if (state === "generate" && generationStarted && autoEnabledByScript) {
            handleGenerationComplete();
        }
    });

    generateObserver.observe(generateButton, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
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

        armGenerateObserver();
    });
});
