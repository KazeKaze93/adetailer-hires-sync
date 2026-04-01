/*
Selectors to verify in DevTools for your Forge/reForge build:
1) Hires button selector in txt2img image viewer toolbar:
   "#txt2img_gallery_container button[title*='hires fix' i]"
2) ADetailer enabled checkbox selector (top accordion toggle):
   "#adetailer input[type='checkbox']"
3) txt2img Generate button selector:
   "#txt2img_generate"
*/

var adetailerHiresSyncAutoEnabled = false;
var adetailerHiresSyncGenerateObserver = null;

function adetailerHiresSyncGetRoot() {
    return gradioApp();
}

function adetailerHiresSyncGetHiresButton() {
    var root = adetailerHiresSyncGetRoot();
    if (!root) {
        return null;
    }
    return root.querySelector("#txt2img_gallery_container button[title*='hires fix' i]");
}

function adetailerHiresSyncGetAdetailerCheckbox() {
    var root = adetailerHiresSyncGetRoot();
    if (!root) {
        return null;
    }
    return root.querySelector("#adetailer input[type='checkbox']");
}

function adetailerHiresSyncGetGenerateButton() {
    var root = adetailerHiresSyncGetRoot();
    if (!root) {
        return null;
    }
    return root.querySelector("#txt2img_generate");
}

function adetailerHiresSyncGetButtonText(button) {
    if (!button) {
        return "";
    }
    var text = "";
    if (typeof button.value === "string" && button.value !== "") {
        text = button.value;
    } else {
        text = button.textContent || "";
    }
    return String(text).replace(/^\s+|\s+$/g, "");
}

function adetailerHiresSyncDisconnectObserver() {
    if (adetailerHiresSyncGenerateObserver) {
        adetailerHiresSyncGenerateObserver.disconnect();
        adetailerHiresSyncGenerateObserver = null;
    }
}

function adetailerHiresSyncOnGenerationComplete() {
    if (adetailerHiresSyncAutoEnabled) {
        var checkbox = adetailerHiresSyncGetAdetailerCheckbox();
        if (checkbox && checkbox.checked) {
            checkbox.click();
        }
    }
    adetailerHiresSyncAutoEnabled = false;
    adetailerHiresSyncDisconnectObserver();
}

function adetailerHiresSyncArmGenerateObserver() {
    var generateButton = adetailerHiresSyncGetGenerateButton();
    if (!generateButton) {
        return;
    }

    adetailerHiresSyncDisconnectObserver();

    adetailerHiresSyncGenerateObserver = new MutationObserver(function () {
        var state = adetailerHiresSyncGetButtonText(generateButton).toLowerCase();
        if (state === "generate") {
            adetailerHiresSyncOnGenerationComplete();
        }
    });

    adetailerHiresSyncGenerateObserver.observe(generateButton, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["value"]
    });
}

function adetailerHiresSyncOnHiresClick() {
    var checkbox = adetailerHiresSyncGetAdetailerCheckbox();
    if (!checkbox) {
        adetailerHiresSyncAutoEnabled = false;
        return;
    }

    adetailerHiresSyncAutoEnabled = false;
    if (!checkbox.checked) {
        checkbox.click();
        adetailerHiresSyncAutoEnabled = true;
    }

    adetailerHiresSyncArmGenerateObserver();
}

function adetailerHiresSyncSetup() {
    var root = adetailerHiresSyncGetRoot();
    if (!root) {
        return;
    }

    root.addEventListener("click", function (event) {
        var hiresButton = adetailerHiresSyncGetHiresButton();
        if (!hiresButton) {
            return;
        }

        var target = event.target;
        if (target === hiresButton || (target && hiresButton.contains(target))) {
            adetailerHiresSyncOnHiresClick();
        }
    }, true);
}

onUiLoaded(function () {
    adetailerHiresSyncSetup();
});
