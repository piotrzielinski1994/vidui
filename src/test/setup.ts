import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom's HTMLMediaElement has no real playback engine: play/pause/load throw
// "Not implemented". Stub them so a real <video> can mount and be driven in tests.
HTMLMediaElement.prototype.play = function (
  this: HTMLMediaElement & { _paused?: boolean },
) {
  this._paused = false;
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function (
  this: HTMLMediaElement & { _paused?: boolean },
) {
  this._paused = true;
};
HTMLMediaElement.prototype.load = () => {};
Object.defineProperty(HTMLMediaElement.prototype, "paused", {
  configurable: true,
  get(this: HTMLMediaElement & { _paused?: boolean }) {
    return this._paused ?? true;
  },
});

// jsdom's currentTime setter is "Not implemented"; back it with a plain field so
// seek code (video.currentTime = sec) is observable in tests.
Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
  configurable: true,
  get(this: HTMLMediaElement & { _currentTime?: number }) {
    return this._currentTime ?? 0;
  },
  set(this: HTMLMediaElement & { _currentTime?: number }, value: number) {
    this._currentTime = value;
  },
});

// jsdom's pointer-capture methods throw "Not implemented"; the seek slider uses
// them for drag-scrub. Force no-op stubs (the `if (!...)` guard won't override
// the throwing built-ins, so assign directly).
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.hasPointerCapture = () => false;

// jsdom has no Fullscreen API. Back it with a tiny in-memory model that fires
// fullscreenchange, so the viewport's enter/exit + state-sync can be exercised.
Element.prototype.requestFullscreen = function (this: Element) {
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: this,
  });
  document.dispatchEvent(new Event("fullscreenchange"));
  return Promise.resolve();
};
Object.defineProperty(document, "exitFullscreen", {
  configurable: true,
  value: () => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  },
});
if (!("fullscreenElement" in document)) {
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
}

afterEach(() => {
  cleanup();
});
