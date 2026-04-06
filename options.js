// options.js — APHELION settings

document.addEventListener("DOMContentLoaded", () => {
  const glyphSelect = document.getElementById("censorGlyph");
  const customInput = document.getElementById("customGlyph");
  const imageBlockMode = document.getElementById("imageBlockMode");
  const replacementImageUrl = document.getElementById("replacementImageUrl");
  const imageDropzone = document.getElementById("imageDropzone");
  const replacementImageFile = document.getElementById("replacementImageFile");
  const filePickerBtn = document.getElementById("filePickerBtn");
  const resetReplacementBtn = document.getElementById("resetReplacementBtn");
  const replacementPreview = document.getElementById("replacementPreview");
  const saveBtn = document.getElementById("saveBtn");

  const DEFAULT_REPLACEMENT_IMAGE_URL = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23111111'/%3E%3Ctext x='50%25' y='48%25' dominant-baseline='middle' text-anchor='middle' fill='%23c7b3ff' font-family='Arial,sans-serif' font-size='30'%3EAPHELION%3C/text%3E%3Ctext x='50%25' y='60%25' dominant-baseline='middle' text-anchor='middle' fill='%239a94c9' font-family='Arial,sans-serif' font-size='18'%3EBONKED%3C/text%3E%3C/svg%3E";

  const status = document.getElementById("status");
  if (!glyphSelect || !customInput || !imageBlockMode || !replacementImageUrl || !imageDropzone || !replacementImageFile || !filePickerBtn || !resetReplacementBtn || !replacementPreview || !saveBtn || !status) {
    console.warn("APHELION options page is missing expected elements.", { glyphSelect, customInput, imageBlockMode, replacementImageUrl, imageDropzone, replacementImageFile, filePickerBtn, resetReplacementBtn, replacementPreview, saveBtn, status });
    return;
  }

  if (!chrome || !chrome.storage || !chrome.storage.local) {
    const message = "Extension storage unavailable. Open this page from the extension options only.";
    console.warn(message);
    status.textContent = message;
    return;
  }

  function setPreview(src) {
    if (typeof src === "string" && src.trim()) {
      replacementPreview.src = src;
      replacementPreview.style.display = "block";
      return;
    }
    replacementPreview.removeAttribute("src");
    replacementPreview.style.display = "none";
  }

  function setStatus(msg) {
    status.textContent = msg;
    if (!msg) return;
    setTimeout(() => {
      if (status.textContent === msg) status.textContent = "";
    }, 4000);
  }

  function handleImageFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      setStatus("Please select an image file.");
      return;
    }
    // Keep file size conservative so storage.local quota errors are less likely.
    if (file.size > 1_500_000) {
      setStatus("Image is too large. Use an image under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:image/")) {
        setStatus("Could not read image. Try another file.");
        return;
      }
      replacementImageUrl.value = dataUrl;
      imageBlockMode.value = "replace";
      setPreview(dataUrl);
      setStatus("Image loaded. Click Save Settings to apply.");
    };
    reader.onerror = () => setStatus("Failed to read image file.");
    reader.readAsDataURL(file);
  }

  // Load current settings
  chrome.storage.local.get(["censorGlyph", "imageBlockMode", "replacementImageUrl"], (res) => {
    const current = res.censorGlyph || "✦✦✦";
    const options = Array.from(glyphSelect.options);
    const preset = options.find(opt => opt.value === current);
    if (preset) {
      glyphSelect.value = current;
      customInput.value = "";
    } else {
      glyphSelect.value = "";
      customInput.value = current;
    }

    imageBlockMode.value = ["blur", "hide", "replace"].includes(res.imageBlockMode) ? res.imageBlockMode : "blur";
    replacementImageUrl.value = typeof res.replacementImageUrl === "string" ? res.replacementImageUrl : "";
    if (imageBlockMode.value === "replace") {
      setPreview(replacementImageUrl.value || DEFAULT_REPLACEMENT_IMAGE_URL);
    } else {
      setPreview(replacementImageUrl.value);
    }
  });

  replacementImageUrl.addEventListener("input", () => {
    const v = replacementImageUrl.value.trim();
    if (v) setPreview(v);
    else if (imageBlockMode.value === "replace") setPreview(DEFAULT_REPLACEMENT_IMAGE_URL);
    else setPreview("");
  });

  imageBlockMode.addEventListener("change", () => {
    const v = replacementImageUrl.value.trim();
    if (imageBlockMode.value === "replace") {
      setPreview(v || DEFAULT_REPLACEMENT_IMAGE_URL);
    } else if (v) {
      setPreview(v);
    } else {
      setPreview("");
    }
  });

  ["dragenter", "dragover"].forEach(evt => {
    imageDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      imageDropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    imageDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      imageDropzone.classList.remove("dragover");
    });
  });

  imageDropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0]) handleImageFile(files[0]);
  });

  imageDropzone.addEventListener("click", () => replacementImageFile.click());
  filePickerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    replacementImageFile.click();
  });
  resetReplacementBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    replacementImageUrl.value = "";
    if (imageBlockMode.value === "replace") setPreview(DEFAULT_REPLACEMENT_IMAGE_URL);
    else setPreview("");
    setStatus("Custom replacement cleared. Default APHELION image will be used in replace mode.");
  });
  imageDropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      replacementImageFile.click();
    }
  });
  replacementImageFile.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImageFile(file);
    replacementImageFile.value = "";
  });

  // Save settings
  saveBtn.addEventListener("click", () => {
    const selected = glyphSelect.value;
    const custom = customInput.value.trim();
    const glyph = custom || selected || "✦✦✦";
    const mode = ["blur", "hide", "replace"].includes(imageBlockMode.value) ? imageBlockMode.value : "blur";
    const replacement = replacementImageUrl.value.trim();
    const safeReplacement = (/^https?:\/\//i.test(replacement) || /^data:image\//i.test(replacement)) ? replacement : "";

    chrome.storage.local.set({
      censorGlyph: glyph,
      imageBlockMode: mode,
      replacementImageUrl: safeReplacement
    }, () => {
      setStatus("Settings saved! Reload pages to apply.");
    });
  });
});